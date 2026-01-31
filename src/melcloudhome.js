import axios from 'axios';
import WebSocket from 'ws';
import { exec } from 'child_process';
import { promisify } from 'util';
import EventEmitter from 'events';
import puppeteer from 'puppeteer';
import ImpulseGenerator from './impulsegenerator.js';
import Functions from './functions.js';
import { ApiUrls, LanguageLocaleMap } from './constants.js';
const execPromise = promisify(exec);

class MelCloudHome extends EventEmitter {
    constructor(account, pluginStart = false) {
        super();
        this.accountType = account.type;
        this.user = account.user;
        this.passwd = account.passwd;
        this.language = account.language;
        this.logWarn = account.log?.warn;
        this.logError = account.log?.error;
        this.logDebug = account.log?.debug;

        this.client = null;
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

        this.socketConnected = false;
    }

    async checkScenesList() {
        try {
            if (this.logDebug) this.emit('debug', `Scanning for scenes`);
            const listScenesData = await this.client(ApiUrls.Home.Get.Scenes, { method: 'GET', });

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
            const melCloudDevicesData = { State: false, Status: null, Buildings: {}, Devices: [], Scenes: [] }
            if (this.logDebug) this.emit('debug', `Scanning for devices`);
            const listDevicesData = await this.client(ApiUrls.Home.Get.ListDevices, { method: 'GET' });

            const userContext = listDevicesData.data;
            const buildings = userContext.buildings ?? [];
            const guestBuildings = userContext.guestBuildings ?? [];
            const buildingsList = [...buildings, ...guestBuildings];
            if (this.logDebug) this.emit('debug', `Buildings: ${JSON.stringify(buildingsList, null, 2)}`);

            if (!buildingsList) {
                melCloudDevicesData.Status = 'No buildings found'
                return melCloudDevicesData;
            }

            const devices = buildingsList.flatMap(building => {
                // Funkcja kapitalizująca klucze obiektu
                const capitalizeKeys = obj => Object.fromEntries(Object.entries(obj).map(([key, value]) => [key.charAt(0).toUpperCase() + key.slice(1), value]));

                // Rekurencyjna kapitalizacja kluczy w obiekcie lub tablicy
                const capitalizeKeysDeep = obj => {
                    if (Array.isArray(obj)) return obj.map(capitalizeKeysDeep);
                    if (obj && typeof obj === 'object') {
                        return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key.charAt(0).toUpperCase() + key.slice(1), capitalizeKeysDeep(value)]));
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
                melCloudDevicesData.Status = 'No devices found'
                return melCloudDevicesData;
            }

            // Get scenes
            let scenes = [];
            try {
                const scenesList = await this.checkScenesList();
                if (this.logDebug) this.emit('debug', `Found ${scenesList.length} scenes`);
                if (scenesList.length > 0) {
                    scenes = scenesList;
                }
            } catch (error) {
                if (this.logError) this.emit('error', `Get scenes error: ${error}`);
            }

            melCloudDevicesData.State = true;
            melCloudDevicesData.Status = `Found ${devicesCount} devices ${scenes.length > 0 ? `and ${scenes.length} scenes` : ''}`;
            melCloudDevicesData.Buildings = userContext;
            melCloudDevicesData.Devices = devices;
            melCloudDevicesData.Scenes = scenes;

            //emit device event
            for (const deviceData of melCloudDevicesData.Devices) {
                deviceData.Scenes = melCloudDevicesData.Devices.Scenes ?? [];
                const deviceId = deviceData.DeviceID;
                this.emit(deviceId, 'request', deviceData);
            }

            return melCloudDevicesData;
        } catch (error) {
            throw new Error(`Check devices list error: ${error.message}`);
        }
    }

    async connect() {
        if (this.logDebug) this.emit('debug', 'Connecting to MELCloud Home');
        const GLOBAL_TIMEOUT = 120000;

        let browser;
        try {
            const connectInfo = { State: false, Status: '', Account: {}, UseFahrenheit: false };

            // Get Chromium path from resolver
            const chromiumInfo = await this.functions.ensureChromiumInstalled();
            let chromiumPath = chromiumInfo.path;
            const arch = chromiumInfo.arch;
            const system = chromiumInfo.system;

            // If path is found, use it
            if (chromiumPath) {
                if (this.logDebug) this.emit('debug', `Using Chromium for ${system} (${arch}) at ${chromiumPath}`);
            } else {
                if (arch === 'arm') {
                    connectInfo.Status = `No Chromium found for ${system} (${arch}). Please install it manually and try again.`;
                    return connectInfo;
                } else {
                    try {
                        chromiumPath = puppeteer.executablePath();
                        if (this.logDebug) this.emit('debug', `Using Puppeteer Chromium for ${system} (${arch}) at ${chromiumPath}`);
                    } catch (error) {
                        connectInfo.Status = `No Puppeteer Chromium for ${system} (${arch}), error: ${error.message}`;
                        return connectInfo;
                    }
                }
            }

            // Verify Chromium executable
            try {
                const { stdout } = await execPromise(`"${chromiumPath}" --version`);
                if (this.logDebug) this.emit('debug', `Chromium for ${system} (${arch}) detected: ${stdout.trim()}`);
            } catch (error) {
                connectInfo.Status = `Chromium for ${system} (${arch}) found at ${chromiumPath}, but execute error: ${error.message}. Please install it manually and try again.`;
                return connectInfo;
            }

            // Launch Chromium
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

            // CDP session
            const client = await page.createCDPSession();
            await client.send('Network.enable')
            client.on('Network.webSocketCreated', ({ url }) => {
                try {
                    if (url.startsWith(`${ApiUrls.Home.WebSocket}`)) {
                        const params = new URL(url).searchParams;
                        const hash = params.get('hash');
                        if (this.logDebug) this.emit('debug', `Web socket hash detected: ${hash}`);

                        // Web socket connection
                        if (!this.connecting && !this.socketConnected) {
                            this.connecting = true;

                            try {
                                const headers = {
                                    'Origin': ApiUrls.Home.Base,
                                    'Pragma': 'no-cache',
                                    'Cache-Control': 'no-cache'
                                };
                                const webSocket = new WebSocket(`${ApiUrls.Home.WebSocket}${hash}`, { headers: headers })
                                    .on('error', (error) => {
                                        if (this.logError) this.emit('error', `Web socket error: ${error}`);
                                        try {
                                            webSocket.close();
                                        } catch { }
                                    })
                                    .on('close', () => {
                                        if (this.logDebug) this.emit('debug', `Web socket closed`);
                                        this.cleanupSocket();
                                    })
                                    .on('open', () => {
                                        this.socketConnected = true;
                                        this.connecting = false;
                                        if (this.logDebug) this.emit('debug', `Web Socket Connected`);

                                        // heartbeat
                                        this.heartbeat = setInterval(() => {
                                            if (webSocket.readyState === webSocket.OPEN) {
                                                if (this.logDebug) this.emit('debug', `Web socket send heartbeat`);
                                                webSocket.ping();
                                            }
                                        }, 30000);
                                    })
                                    .on('pong', () => {
                                        if (this.logDebug) this.emit('debug', `Web socket received heartbeat`);
                                    })
                                    .on('message', (message) => {
                                        const parsedMessage = JSON.parse(message);
                                        if (this.logDebug) this.emit('debug', `Web socket incoming message: ${JSON.stringify(parsedMessage, null, 2)}`);
                                        const messageData = parsedMessage?.[0]?.Data;
                                        if (!messageData || parsedMessage.message === 'Forbidden') return;

                                        this.emit(messageData.id, 'ws', parsedMessage[0]);
                                    });
                            } catch (error) {
                                if (this.logError) this.emit('error', `Web socket connection failed: ${error}`);
                                this.cleanupSocket();
                            }
                        }
                    }
                } catch (error) {
                    if (this.logError) this.emit('error', `CDP web socket created handler error: ${error.message}`);
                }
            });

            try {
                await page.goto(ApiUrls.Home.Base, { waitUntil: ['domcontentloaded', 'networkidle2'], timeout: GLOBAL_TIMEOUT });
            } catch (error) {
                connectInfo.Status = `Navigation to ${ApiUrls.Home.Base} failed: ${error.message}`;
                return connectInfo;
            }

            // Wait extra to ensure UI is rendered
            await new Promise(r => setTimeout(r, 3000));
            const loginBtn = await page.waitForSelector('button.btn--blue', { timeout: GLOBAL_TIMEOUT / 3 });
            const loginText = await page.evaluate(el => el.textContent.trim(), loginBtn);

            if (!['Zaloguj', 'Sign In', 'Login'].includes(loginText)) {
                connectInfo.Status = `Login button ${loginText} not found`;
                return connectInfo;
            }

            await loginBtn.click();
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: GLOBAL_TIMEOUT / 3 });

            const usernameInput = await page.$('input[name="username"]');
            const passwordInput = await page.$('input[name="password"]');
            if (!usernameInput || !passwordInput) {
                connectInfo.Status = 'Username or password input not found';
                return connectInfo;
            }

            await page.type('input[name="username"]', this.user, { delay: 50 });
            await page.type('input[name="password"]', this.passwd, { delay: 50 });

            const submitButton = await page.$('input[type="submit"], button[type="submit"]');
            if (!submitButton) {
                connectInfo.Status = 'Submit button not found';
                return connectInfo;
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
                connectInfo.Status = 'Cookies C1/C2 missing';
                return connectInfo;
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
                'Referer': ApiUrls.Home.Dashboard,
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'User-Agent': userAgent,
                'x-csrf': '1'
            };

            this.client = axios.create({
                baseURL: ApiUrls.Home.Base,
                timeout: 30000,
                headers: headers
            });
            this.emit('client', this.client);

            connectInfo.State = true;
            connectInfo.Status = `Connect Success${this.socketConnected ? ', Web Socket Connected' : ''}`;

            return connectInfo;
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

