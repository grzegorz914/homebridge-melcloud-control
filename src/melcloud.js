import fs from 'fs';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import EventEmitter from 'events';
import puppeteer from 'puppeteer';
import ImpulseGenerator from './impulsegenerator.js';
import Functions from './functions.js';
import { ApiUrls, ApiUrlsHome } from './constants.js';
const execPromise = promisify(exec);

class MelCloud extends EventEmitter {
    constructor(account, accountFile, buildingsFile, devicesFile, pluginStart = false) {
        super();
        this.accountType = account.type;
        this.user = account.user;
        this.passwd = account.passwd;
        this.language = account.language;
        this.logWarn = account.log?.warn;
        this.logError = account.log?.error;
        this.logDebug = account.log?.debug;
        this.accountFile = accountFile;
        this.buildingsFile = buildingsFile;
        this.devicesFile = devicesFile;
        this.contextKey = null;
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
                    await this.connect(true);
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

    // MELCloud
    async checkMelcloudDevicesList() {
        try {
            const devicesList = { State: false, Info: null, Devices: [] }
            const headers = {
                'X-MitsContextKey': this.contextKey,
                'Content-Type': 'application/json'
            }
            const axiosInstance = axios.create({
                method: 'GET',
                baseURL: ApiUrls.BaseURL,
                timeout: 15000,
                headers: headers
            });

            if (this.logDebug) this.emit('debug', `Scanning for devices...`);

            const listDevicesData = await axiosInstance(ApiUrls.ListDevices);

            if (!listDevicesData || !listDevicesData.data) {
                if (this.logWarn) this.emit('warn', `Invalid or empty response from MELCloud API`);
                return null;
            }

            const buildingsList = listDevicesData.data;

            if (this.logDebug)
                this.emit('debug', `Buildings: ${JSON.stringify(buildingsList, null, 2)}`);

            if (!Array.isArray(buildingsList) || buildingsList.length === 0) {
                if (this.logWarn) this.emit('warn', `No buildings found in MELCloud account`);
                return null;
            }

            await this.functions.saveData(this.buildingsFile, buildingsList);
            if (this.logDebug) this.emit('debug', `Buildings list saved`);

            for (const building of buildingsList) {
                if (!building.Structure) {
                    this.emit('warn', `Building missing structure: ${building.BuildingName || 'Unnamed'}`);
                    continue;
                }

                const { Structure } = building;

                const allDevices = [
                    ...(Structure.Floors?.flatMap(floor => [
                        ...(floor.Areas?.flatMap(area => area.Devices || []) || []),
                        ...(floor.Devices || [])
                    ]) || []),
                    ...(Structure.Areas?.flatMap(area => area.Devices || []) || []),
                    ...(Structure.Devices || [])
                ].filter(d => d != null);

                // Zamiana ID na string
                allDevices.forEach(device => {
                    device.DeviceID = String(device.DeviceID);
                    device.Headers = headers;
                });

                if (this.logDebug) this.emit('debug', `Found ${allDevices.length} devices in building: ${building.Name || 'Unnamed'}`);
                devicesList.Devices.push(...allDevices);
            }

            const devicesCount = devicesList.Devices.length;
            if (devicesCount === 0) {
                devicesList.Info = 'No devices found'
                return devicesList;
            }

            await this.functions.saveData(this.devicesFile, devicesList.Devices);
            if (this.logDebug) this.emit('debug', `${devicesCount} devices saved`);

            devicesList.State = true;
            devicesList.Info = `Found ${devicesCount} devices`;
            return devicesList;
        } catch (error) {
            const msg = error.response ? `HTTP ${error.response.status}: ${error.response.statusText}` : error.message;
            throw new Error(`Check devices list error: ${msg}`);
        }
    }

    async connectToMelCloud() {
        if (this.logDebug) this.emit('debug', `Connecting to MELCloud`);

        try {
            const accountInfo = { State: false, Info: '', LoginData: null, ContextKey: null, UseFahrenheit: false }
            const axiosInstance = axios.create({
                method: 'POST',
                baseURL: ApiUrls.BaseURL,
                timeout: 15000,
            });

            const data = {
                Email: this.user,
                Password: this.passwd,
                Language: this.language,
                AppVersion: '1.34.12',
                CaptchaChallenge: '',
                CaptchaResponse: '',
                Persist: true
            };

            const accountData = await axiosInstance(ApiUrls.ClientLogin, { data: data });
            const account = accountData.data;
            const loginData = account.LoginData ?? [];
            const contextKey = loginData.ContextKey;

            const debugData = {
                ...loginData,
                ContextKey: 'removed',
                ClientId: 'removed',
                Client: 'removed',
                Name: 'removed',
                MapLongitude: 'removed',
                MapLatitude: 'removed'
            };
            if (this.logDebug) this.emit('debug', `MELCloud Info: ${JSON.stringify(debugData, null, 2)}`);

            if (!contextKey) {
                accountInfo.Info = 'Context key missing'
                return accountInfo;
            }
            this.contextKey = contextKey;

            accountInfo.State = true;
            accountInfo.Info = 'Connect to MELCloud Success';
            accountInfo.LoginData = loginData;
            accountInfo.ContextKey = contextKey;
            await this.functions.saveData(this.accountFile, accountInfo);

            return accountInfo
        } catch (error) {
            throw new Error(`Connect error: ${error.message}`);
        }
    }

    // MELCloud Home
    async checkMelcloudHomeDevicesList() {
        try {
            const devicesList = { State: false, Info: null, Devices: [] }
            const headers = {
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cookie': this.contextKey,
                'User-Agent': 'homebridge-melcloud-control/4.0.0',
                'DNT': '1',
                'Origin': 'https://melcloudhome.com',
                'Referer': 'https://melcloudhome.com/dashboard',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'X-CSRF': '1'
            };
            const axiosInstance = axios.create({
                method: 'GET',
                baseURL: ApiUrlsHome.BaseURL,
                timeout: 25000,
                headers: headers
            });

            if (this.logDebug) this.emit('debug', `Scanning for devices`);
            const listDevicesData = await axiosInstance(ApiUrlsHome.GetUserContext);
            const buildingsList = listDevicesData.data.buildings;
            if (this.logDebug) this.emit('debug', `Buildings: ${JSON.stringify(buildingsList, null, 2)}`);

            if (!buildingsList) {
                devicesList.State = false;
                devicesList.Info = 'No building found'
                return devicesList;
            }

            await this.functions.saveData(this.buildingsFile, buildingsList);
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
                            let parsedValue = value;
                            if (value === "True") parsedValue = true;
                            else if (value === "False") parsedValue = false;
                            else if (!isNaN(value) && value !== "") parsedValue = Number(value);

                            const key = name.charAt(0).toUpperCase() + name.slice(1);
                            return [key, parsedValue];
                        })
                    );

                    // Scal Capabilities + Settings + DeviceType w Device
                    const deviceObject = {
                        ...capitalizeKeys(device.Capabilities || {}),
                        ...settingsObject,
                        DeviceType: type
                    };

                    // Kapitalizacja brakujących obiektów/tablic
                    if (device.FrostProtection) device.FrostProtection = { ...capitalizeKeys(device.FrostProtection || {}) };
                    if (device.OverheatProtection) device.OverheatProtection = { ...capitalizeKeys(device.OverheatProtection || {}) };
                    if (device.HolidayMode) device.HolidayMode = { ...capitalizeKeys(device.HolidayMode || {}) };

                    if (Array.isArray(device.Schedule)) {
                        device.Schedule = device.Schedule.map(capitalizeKeysDeep);
                    }

                    // Usuń stare pola Settings i Capabilities
                    const { Settings, Capabilities, Id, GivenDisplayName, ...rest } = device;

                    return {
                        ...rest,
                        Type: type,
                        DeviceID: Id,
                        DeviceName: GivenDisplayName,
                        Device: deviceObject,
                        Headers: headers
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

            await this.functions.saveData(this.devicesFile, devices);
            if (this.logDebug) this.emit('debug', `${devicesCount} devices saved`);

            devicesList.State = true;
            devicesList.Info = `Found ${devicesCount} devices`;
            devicesList.Devices = devices;
            return devicesList;
        } catch (error) {
            throw new Error(`Check devices list error: ${error.message}`);
        }
    }

    async connectToMelCloudHome() {
        if (this.logDebug) this.emit('debug', 'Connecting to MELCloud Home');
        const GLOBAL_TIMEOUT = 90000;

        let browser;
        try {
            const accountInfo = { State: false, Info: '', ContextKey: null, UseFahrenheit: false };
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
            browser.on('disconnected', () => this.emit('debug', 'Browser disconnected'));

            const page = await browser.newPage();
            page.on('error', error => this.emit('error', `Page crashed: ${error.message}`));
            page.on('pageerror', error => this.emit('error', `Browser error: ${error.message}`));
            page.setDefaultTimeout(GLOBAL_TIMEOUT);
            page.setDefaultNavigationTimeout(GLOBAL_TIMEOUT);

            // Clear cookies before navigation
            try {
                const client = await page.createCDPSession();
                await client.send('Network.clearBrowserCookies');
            } catch (error) {
                if (this.logError) this.emit('error', `Clear cookies error: ${error.message}`);
            }

            try {
                await page.goto(ApiUrlsHome.BaseURL, { waitUntil: ['domcontentloaded', 'networkidle2'], timeout: GLOBAL_TIMEOUT });
            } catch (error) {
                accountInfo.Info = `Navigation to ${ApiUrlsHome.BaseURL} failed: ${error.message}`;
                return accountInfo;
            }

            // Wait extra to ensure UI is rendered
            await new Promise(r => setTimeout(r, 3000));
            const loginBtn = await page.waitForSelector('button.btn--blue', { timeout: GLOBAL_TIMEOUT / 4 });
            const loginText = await page.evaluate(el => el.textContent.trim(), loginBtn);

            if (!['Zaloguj', 'Sign In', 'Login'].includes(loginText)) {
                accountInfo.Info = `Login button ${loginText} not found`;
                return accountInfo;
            }
            ;
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
            await Promise.race([Promise.all([submitButton.click(), page.waitForNavigation({ waitUntil: ['domcontentloaded', 'networkidle2'], timeout: GLOBAL_TIMEOUT / 4 })]), new Promise(r => setTimeout(r, GLOBAL_TIMEOUT / 3))]);

            // Extract cookies
            let c1 = null, c2 = null;
            const start = Date.now();
            while ((!c1 || !c2) && Date.now() - start < GLOBAL_TIMEOUT / 2) {
                const cookies = await page.browserContext().cookies();
                c1 = cookies.find(c => c.name === '__Secure-monitorandcontrolC1')?.value || c1;
                c2 = cookies.find(c => c.name === '__Secure-monitorandcontrolC2')?.value || c2;
                if (!c1 || !c2) await new Promise(r => setTimeout(r, 500));
            }

            if (!c1 || !c2) {
                accountInfo.Info = 'Cookies C1/C2 missing';
                return accountInfo;
            }

            const contextKey = [
                '__Secure-monitorandcontrol=chunks-2',
                `__Secure-monitorandcontrolC1=${c1}`,
                `__Secure-monitorandcontrolC2=${c2}`
            ].join('; ');
            this.contextKey = contextKey;

            accountInfo.State = true;
            accountInfo.Info = 'Connect to MELCloud Home Success';
            accountInfo.ContextKey = contextKey;
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

    async checkDevicesList() {
        const TIMEOUT_MS = 30000; // 30 seconds timeout
        try {
            const devicesList = await Promise.race([
                (async () => {
                    switch (this.accountType) {
                        case "melcloud":
                            return await this.checkMelcloudDevicesList();
                        case "melcloudhome":
                            return await this.checkMelcloudHomeDevicesList();
                        default:
                            return [];
                    }
                })(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Device list timeout (30s)')), TIMEOUT_MS))
            ]);

            return devicesList;
        } catch (error) {
            throw new Error(error);
        }
    }

    async connect() {
        const TIMEOUT_MS = 120000;

        try {
            const response = await Promise.race([
                (async () => {
                    switch (this.accountType) {
                        case "melcloud":
                            return await this.connectToMelCloud();
                        case "melcloudhome":
                            return await this.connectToMelCloudHome();
                        default:
                            return {};
                    }
                })(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout (90s)')), TIMEOUT_MS))
            ]);

            return response;
        } catch (error) {
            throw new Error(error);
        }
    }

    async send(accountInfo) {
        try {
            const axiosInstance = axios.create({
                method: 'POST',
                baseURL: ApiUrls.BaseURL,
                timeout: 15000,
                headers: {
                    'X-MitsContextKey': accountInfo.ContextKey,
                    'content-type': 'application/json'
                }
            });

            const payload = { data: accountInfo.LoginData };
            await axiosInstance(ApiUrls.UpdateApplicationOptions, payload);
            await this.functions.saveData(this.accountFile, accountInfo);
            return true;
        } catch (error) {
            throw new Error(`Send data error: ${error.message}`);
        }
    }
}

export default MelCloud;

