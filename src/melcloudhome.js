import fs from 'fs';
import axios from 'axios';
import WebSocket from 'ws';
import { exec } from 'child_process';
import { promisify } from 'util';
import EventEmitter from 'events';
import puppeteer from 'puppeteer';
import ImpulseGenerator from './impulsegenerator.js';
import Functions from './functions.js';
import { ApiUrlsHome, LanguageLocaleMap } from './constants.js';
const execPromise = promisify(exec);

class MelCloudHome extends EventEmitter {
    constructor(account, accountFile, buildingsFile, pluginStart = false) {
        super();
        this.accountType = account.type;
        this.user = account.user;
        this.passwd = account.passwd;
        this.language = account.language;
        this.logSuccess = account.log?.success;
        this.logWarn = account.log?.warn;
        this.logError = account.log?.error;
        this.logDebug = account.log?.debug;
        this.accountFile = accountFile;
        this.buildingsFile = buildingsFile;

        this.headers = {};
        this.webSocketOptions = {};
        this.socket = null;
        this.connecting = false;
        this.socketConnected = false;
        this.heartbeat = null;

        this.functions = new Functions(this.logWarn, this.logError, this.logDebug)
            .on('warn', warn => this.emit('warn', warn))
            .on('error', error => this.emit('error', error))
            .on('debug', debug => this.emit('debug', debug));

        if (pluginStart) {
            //lock flags
            this.locks = {
                connect: false,
                checkDevicesList: false
            };
            this.impulseGenerator = new ImpulseGenerator()
                .on('connect', () => this.handleWithLock('connect', async () => {
                    await this.connect();
                }))
                .on('checkDevicesList', () => this.handleWithLock('checkDevicesList', async () => {
                    await this.checkDevicesList();
                }))
                .on('state', (state) => {
                    this.emit(state ? 'success' : 'warn', `Impulse generator ${state ? 'started' : 'stopped'}`);
                });
        }
    }

    async handleWithLock(lockKey, fn) {
        if (this.locks[lockKey]) return;

        this.locks[lockKey] = true;
        try {
            await fn();
        } catch (error) {
            this.emit('error', `Inpulse generator error: ${error}`);
        } finally {
            this.locks[lockKey] = false;
        }
    }

    cleanupSocket() {
        if (this.heartbeat) {
            clearInterval(this.heartbeat);
            this.heartbeat = null;
        }

        if (this.socket) {
            try { this.socket.close(); } catch { }
            this.socket = null;
        }

        this.socketConnected = false;
    }

    async checkScenesList() {
        try {
            if (this.logDebug) this.emit('debug', `Scanning for scenes`);
            const listScenesData = await this.axiosInstance(ApiUrlsHome.GetUserScenes, { method: 'GET', });

            const scenesList = listScenesData.data;
            if (this.logDebug) this.emit('debug', `Scenes: ${JSON.stringify(scenesList, null, 2)}`);

            const capitalizeKeysDeep = obj => {
                if (Array.isArray(obj)) {
                    return obj.map(item => capitalizeKeysDeep(item));
                }

                if (obj && typeof obj === 'object') {
                    return Object.fromEntries(
                        Object.entries(obj).map(([key, value]) => [
                            key.charAt(0).toUpperCase() + key.slice(1),
                            capitalizeKeysDeep(value)
                        ])
                    );
                }

                return obj;
            };

            return capitalizeKeysDeep(scenesList);
        } catch (error) {
            throw new Error(`Check scenes list error: ${error.message}`);
        }
    }

    async checkDevicesList() {
        try {
            const devicesList = { State: false, Info: null, Devices: [], Scenes: [] }
            if (this.logDebug) this.emit('debug', `Scanning for devices`);
            const listDevicesData = await this.axiosInstance(ApiUrlsHome.GetUserContext, { method: 'GET' });

            const userContext = listDevicesData.data;
            const buildings = userContext.buildings ?? [];
            const guestBuildings = userContext.guestBuildings ?? [];
            const buildingsList = [...buildings, ...guestBuildings];
            if (this.logDebug) this.emit('debug', `Buildings: ${JSON.stringify(buildingsList, null, 2)}`);

            if (!buildingsList) {
                devicesList.Info = 'No building found'
                return devicesList;
            }

            await this.functions.saveData(this.buildingsFile, userContext);
            if (this.logDebug) this.emit('debug', `Buildings list saved`);

            const devices = buildingsList.flatMap(building => {
                // Funkcja kapitalizująca klucze obiektu
                const capitalizeKeys = obj =>
                    Object.fromEntries(
                        Object.entries(obj).map(([key, value]) => [
                            key.charAt(0).toUpperCase() + key.slice(1),
                            value
                        ])
                    );

                // Rekurencyjna kapitalizacja kluczy w obiekcie lub tablicy
                const capitalizeKeysDeep = obj => {
                    if (Array.isArray(obj)) return obj.map(capitalizeKeysDeep);
                    if (obj && typeof obj === 'object') {
                        return Object.fromEntries(
                            Object.entries(obj).map(([key, value]) => [
                                key.charAt(0).toUpperCase() + key.slice(1),
                                capitalizeKeysDeep(value)
                            ])
                        );
                    }
                    return obj;
                };

                // Funkcja tworząca finalny obiekt Device
                const createDevice = (device, type) => {
                    // Settings już kapitalizowane w nazwach
                    const settingsArray = device.Settings || [];
                    const settingsObject = Object.fromEntries(
                        settingsArray.map(({ name, value }) => {
                            let parsedValue = this.functions.convertValue(value);
                            const key = name.charAt(0).toUpperCase() + name.slice(1);
                            return [key, parsedValue];
                        })
                    );

                    // Scal Capabilities + Settings + DeviceType w Device
                    const deviceObject = {
                        ...capitalizeKeys(device.Capabilities || {}),
                        ...settingsObject,
                        DeviceType: type,
                        FirmwareAppVersion: device.ConnectedInterfaceIdentifier,
                        IsConnected: device.IsConnected
                    };

                    // Kapitalizacja brakujących obiektów/tablic
                    if (device.FrostProtection) device.FrostProtection = { ...capitalizeKeys(device.FrostProtection || {}) };
                    if (device.OverheatProtection) device.OverheatProtection = { ...capitalizeKeys(device.OverheatProtection || {}) };
                    if (device.HolidayMode) device.HolidayMode = { ...capitalizeKeys(device.HolidayMode || {}) };
                    if (Array.isArray(device.Schedule)) device.Schedule = device.Schedule.map(capitalizeKeysDeep || []);

                    // Usuń stare pola Settings i Capabilities
                    const { Settings, Capabilities, Id, GivenDisplayName, ...rest } = device;

                    return {
                        ...rest,
                        Type: type,
                        DeviceID: Id,
                        DeviceName: GivenDisplayName,
                        SerialNumber: Id,
                        Device: deviceObject,
                    };
                };

                return [
                    ...(building.airToAirUnits || []).map(d => createDevice(capitalizeKeys(d), 0)),
                    ...(building.airToWaterUnits || []).map(d => createDevice(capitalizeKeys(d), 1)),
                    ...(building.airToVentilationUnits || []).map(d => createDevice(capitalizeKeys(d), 3))
                ];
            });

            const devicesCount = devices.length;
            if (devicesCount === 0) {
                devicesList.Info = 'No devices found'
                return devicesList;
            }

            // Get scenes
            let scenes = [];
            try {
                scenes = await this.checkScenesList();
                if (this.logDebug) this.emit('debug', `Found ${scenes.length} svenes`);
            } catch (error) {
                if (this.logDebug) this.emit('debug', `Get scenes error: ${error} `);
            }

            //web cocket connection
            if (!this.connecting && !this.socketConnected) {
                this.connecting = true;

                try {
                    const url = `${ApiUrlsHome.WebSocketURL}${this.webSocketOptions.Hash}`;
                    this.socket = new WebSocket(url, { headers: this.webSocketOptions.Headers })
                        .on('error', (error) => {
                            if (this.logError) this.emit('error', `Socket error: ${error}`);
                            this.socket.close();
                        })
                        .on('close', () => {
                            if (this.logDebug) this.emit('debug', `Socket closed`);
                            this.cleanupSocket();
                        })
                        .on('open', () => {
                            this.socketConnected = true;
                            this.connecting = false;
                            if (this.logSuccess) this.emit('success', `Socket Connect Success`);

                            // heartbeat
                            this.heartbeat = setInterval(() => {
                                if (this.socket.readyState === this.socket.OPEN) {
                                    if (this.logDebug) this.emit('debug', `Socket send heartbeat`);
                                    this.socket.ping();
                                }
                            }, 30000);
                        })
                        .on('pong', () => {
                            if (this.logDebug) this.emit('debug', `Socket received heartbeat`);
                        })
                        .on('message', (message) => {
                            const parsedMessage = JSON.parse(message);
                            if (this.logDebug) this.emit('debug', `Incoming message: ${JSON.stringify(parsedMessage, null, 2)}`);
                            if (parsedMessage.message === 'Forbidden') return;

                            this.emit('webSocket', parsedMessage);
                        });
                } catch (error) {
                    if (this.logError) this.emit('error', `Socket connection failed: ${error}`);
                    this.cleanupSocket();
                }
            }

            devicesList.State = true;
            devicesList.Info = `Found ${devicesCount} devices and ${scenes.length} scenes`;
            devicesList.Devices = devices;
            devicesList.Scenes = scenes;
            devicesList.Headers = this.headers;
            this.emit('devicesList', devicesList);

            return devicesList;
        } catch (error) {
            throw new Error(`Check devices list error: ${error.message}`);
        }
    }

    async connect() {
        if (this.logDebug) this.emit('debug', 'Connecting to MELCloud Home');
        const GLOBAL_TIMEOUT = 90000;

        let browser;
        try {
            const accountInfo = { State: false, Info: '', Account: {}, UseFahrenheit: false };
            let chromiumPath = await this.functions.ensureChromiumInstalled();

            // === Fallback to Puppeteer's built-in Chromium ===
            if (!chromiumPath) {
                try {
                    const puppeteerPath = puppeteer.executablePath();
                    if (puppeteerPath && fs.existsSync(puppeteerPath)) {
                        chromiumPath = puppeteerPath;
                        if (this.logDebug) this.emit('debug', `Using puppeteer Chromium at ${chromiumPath}`);
                    }
                } catch { }
            } else {
                if (this.logDebug) this.emit('debug', `Using system Chromium at ${chromiumPath}`);
            }

            if (!chromiumPath) {
                accountInfo.Info = 'Chromium not found on Your device, please install it manually and try again';
                return accountInfo;
            }

            // Verify executable works
            try {
                const { stdout } = await execPromise(`"${chromiumPath}" --version`);
                if (this.logDebug) this.emit('debug', `Chromium detected: ${stdout.trim()}`);
            } catch (error) {
                accountInfo.Info = `Chromium found at ${chromiumPath}, but cannot be executed: ${error.message}`;
                return accountInfo;
            }

            if (this.logDebug) this.emit('debug', `Launching Chromium...`);
            browser = await puppeteer.launch({
                headless: true,
                executablePath: chromiumPath,
                timeout: GLOBAL_TIMEOUT,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--single-process',
                    '--disable-gpu',
                    '--no-zygote'
                ]
            });
            browser.on('disconnected', () => this.logDebug && this.emit('debug', 'Browser disconnected'));

            const page = await browser.newPage();
            page.on('error', error => this.logError && this.emit('error', `Page crashed: ${error.message}`));
            page.on('pageerror', error => this.logError && this.emit('error', `Browser error: ${error.message}`));
            page.setDefaultTimeout(GLOBAL_TIMEOUT);
            page.setDefaultNavigationTimeout(GLOBAL_TIMEOUT);

            // === CDP session ===
            let hash = null;
            const client = await page.createCDPSession();
            await client.send('Network.enable')
            client.on('Network.webSocketCreated', ({ url }) => {
                try {
                    if (url.startsWith('wss://ws.melcloudhome.com/?hash=')) {
                        const params = new URL(url).searchParams;
                        hash = params.get('hash');
                        if (this.logDebug) this.emit('debug', `MelCloudHome WS hash detected: ${hash}`);
                    }
                } catch (err) {
                    this.emit('error', `CDP WebSocketCreated handler error: ${err.message}`);
                }
            });

            try {
                await page.goto(ApiUrlsHome.BaseURL, { waitUntil: ['domcontentloaded', 'networkidle2'], timeout: GLOBAL_TIMEOUT });
            } catch (error) {
                accountInfo.Info = `Navigation to ${ApiUrlsHome.BaseURL} failed: ${error.message}`;
                return accountInfo;
            }

            // Wait extra to ensure UI is rendered
            await new Promise(r => setTimeout(r, 3000));
            const loginBtn = await page.waitForSelector('button.btn--blue', { timeout: GLOBAL_TIMEOUT / 3 });
            const loginText = await page.evaluate(el => el.textContent.trim(), loginBtn);

            if (!['Zaloguj', 'Sign In', 'Login'].includes(loginText)) {
                accountInfo.Info = `Login button ${loginText} not found`;
                return accountInfo;
            }

            await loginBtn.click();
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: GLOBAL_TIMEOUT / 3 });

            const usernameInput = await page.$('input[name="username"]');
            const passwordInput = await page.$('input[name="password"]');
            if (!usernameInput || !passwordInput) {
                accountInfo.Info = 'Username or password input not found';
                return accountInfo;
            }

            await page.type('input[name="username"]', this.user, { delay: 50 });
            await page.type('input[name="password"]', this.passwd, { delay: 50 });

            const submitButton = await page.$('input[type="submit"], button[type="submit"]');
            if (!submitButton) {
                accountInfo.Info = 'Submit button not found';
                return accountInfo;
            }
            await Promise.race([Promise.all([submitButton.click(), page.waitForNavigation({ waitUntil: ['domcontentloaded', 'networkidle2'], timeout: GLOBAL_TIMEOUT / 3 })]), new Promise(r => setTimeout(r, GLOBAL_TIMEOUT / 3))]);

            // Extract cookies
            let c1 = null, c2 = null;
            const start = Date.now();
            while ((!c1 || !c2) && Date.now() - start < GLOBAL_TIMEOUT / 2) {
                const cookies = await browser.cookies();
                c1 = cookies.find(c => c.name === '__Secure-monitorandcontrolC1')?.value || c1;
                c2 = cookies.find(c => c.name === '__Secure-monitorandcontrolC2')?.value || c2;
                if (!c1 || !c2) await new Promise(r => setTimeout(r, 500));
            }

            if (!c1 || !c2) {
                accountInfo.Info = 'Cookies C1/C2 missing';
                return accountInfo;
            }

            const cookies = [
                '__Secure-monitorandcontrol=chunks-2',
                `__Secure-monitorandcontrolC1=${c1}`,
                `__Secure-monitorandcontrolC2=${c2}`
            ].join('; ');


            const userAgent = await page.evaluate(() => navigator.userAgent);
            const headers = {
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept-Language': LanguageLocaleMap[this.language],
                'Cookie': cookies,
                'Priority': 'u=3, i',
                'Referer': ApiUrlsHome.Dashboard,
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'User-Agent': userAgent,
                'x-csrf': '1'
            };
            this.headers = headers;
            this.axiosInstance = axios.create({
                baseURL: ApiUrlsHome.BaseURL,
                timeout: 30000,
                headers: headers
            })

            this.webSocketOptions = {
                Hash: hash,
                Headers: {
                    'Origin': ApiUrlsHome.BaseURL,
                    'Pragma': 'no-cache',
                    'Cache-Control': 'no-cache'
                }
            };

            accountInfo.State = true;
            accountInfo.Info = 'Connect Success';
            await this.functions.saveData(this.accountFile, accountInfo);

            return accountInfo;
        } catch (error) {
            throw new Error(`Connect error: ${error.message}`);
        } finally {
            if (browser) {
                try { await browser.close(); }
                catch (closeErr) {
                    if (this.logError) this.emit('error', `Failed to close Puppeteer: ${closeErr.message}`);
                }
            }
        }
    }
}

export default MelCloudHome;

