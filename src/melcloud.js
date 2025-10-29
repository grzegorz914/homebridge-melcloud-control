import axios from 'axios';
import EventEmitter from 'events';
import puppeteer from 'puppeteer';
import ImpulseGenerator from './impulsegenerator.js';
import Functions from './functions.js';
import { ApiUrls, ApiUrlsHome } from './constants.js';

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
        this.devicesId = [];
        this.contextKey = '';
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
                    this.emit('success', `Impulse generator ${state ? 'started' : 'stopped'}.`);
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
            const axiosInstance = axios.create({
                method: 'GET',
                baseURL: ApiUrls.BaseURL,
                timeout: 15000,
                headers: { 'X-MitsContextKey': this.contextKey }
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

            const devices = [];

            for (const building of buildingsList) {
                if (!building.Structure) {
                    this.emit(
                        'warn',
                        `Building missing structure: ${building.BuildingName || 'Unnamed'}`
                    );
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
                    if (device.DeviceID != null) device.DeviceID = String(device.DeviceID);
                });

                if (this.logDebug) {
                    const count = allDevices.length;
                    this.emit(
                        'debug',
                        `Found ${count} devices in building: ${building.BuildingName || 'Unnamed'}`
                    );
                }

                devices.push(...allDevices);
            }

            if (devices.length === 0) {
                if (this.logWarn) this.emit('warn', `No devices found in any building`);
                return null;
            }

            await this.functions.saveData(this.devicesFile, devices);
            if (this.logDebug) this.emit('debug', `${devices.length} devices saved`);

            return devices;
        } catch (error) {
            const msg = error.response ? `HTTP ${error.response.status}: ${error.response.statusText}` : error.message;
            throw new Error(`Check devices list error: ${msg}`);
        }
    }

    async connectToMelCloud() {
        if (this.logDebug) this.emit('debug', `Connecting to MELCloud`);

        try {
            const axiosInstance = axios.create({
                method: 'POST',
                baseURL: ApiUrls.BaseURL,
                timeout: 15000,
            });

            const loginData = {
                Email: this.user,
                Password: this.passwd,
                Language: this.language,
                AppVersion: '1.34.12',
                CaptchaChallenge: '',
                CaptchaResponse: '',
                Persist: true
            };

            const accountData = await axiosInstance(ApiUrls.ClientLogin, { data: loginData });
            const account = accountData.data;
            const accountInfo = account.LoginData ?? [];
            const contextKey = accountInfo.ContextKey;
            this.contextKey = contextKey;

            const debugData = {
                ...accountInfo,
                ContextKey: 'removed',
                ClientId: 'removed',
                Client: 'removed',
                Name: 'removed',
                MapLongitude: 'removed',
                MapLatitude: 'removed'
            };
            if (this.logDebug) this.emit('debug', `MELCloud Info: ${JSON.stringify(debugData, null, 2)}`);

            if (!contextKey) {
                if (this.logWarn) this.emit('warn', `Context key missing`);
                return null;
            }

            await this.functions.saveData(this.accountFile, accountInfo);
            this.emit('success', `Connect to MELCloud Success`);

            return accountInfo
        } catch (error) {
            throw new Error(`Connect error: ${error.message}`);
        }
    }

    // MELCloud Home
    async checkMelcloudHomeDevicesList() {
        try {
            const axiosInstance = axios.create({
                method: 'GET',
                baseURL: ApiUrlsHome.BaseURL,
                timeout: 25000,
                headers: {
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
                }
            });

            if (this.logDebug) this.emit('debug', `Scanning for devices`);
            const listDevicesData = await axiosInstance(ApiUrlsHome.GetUserContext);
            const buildingsList = listDevicesData.data.buildings;
            if (this.logDebug) this.emit('debug', `Buildings: ${JSON.stringify(buildingsList, null, 2)}`);

            if (!buildingsList) {
                if (this.logWarn) this.emit('warn', `No building found`);
                return null;
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

                    // Usuń stare pola Settings i Capabilities
                    const { Settings, Capabilities, Id, GivenDisplayName, ...rest } = device;

                    return {
                        ...rest,
                        ContextKey: this.contextKey,
                        Type: type,
                        DeviceID: Id,
                        DeviceName: GivenDisplayName,
                        Device: deviceObject
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
                if (this.logWarn) this.emit('warn', `No devices found`);
                return null;
            }

            await this.functions.saveData(this.devicesFile, devices);
            if (this.logDebug) this.emit('debug', `${devicesCount} devices saved`);

            return devices;
        } catch (error) {
            throw new Error(`Check devices list error: ${error.message}`);
        }
    }

    async connectToMelCloudHome(refresh = false) {
        if (this.logDebug) this.emit('debug', 'Connecting to MELCloud Home');

        let browser;

        try {
            const chromiumPath = await this.functions.ensureChromiumInstalled();

            browser = await puppeteer.launch({
                headless: true,
                executablePath: chromiumPath || puppeteer.executablePath(),
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--single-process',
                    '--no-zygote'
                ]
            });

            // Wait for Puppeteer target to be ready (browser internal page)
            await new Promise(r => setTimeout(r, 1000));

            // Defensive check for main frame availability
            const pages = await browser.pages();
            let page = pages[0];
            if (!page) {
                if (this.logDebug) this.emit('debug', 'No initial page found, creating a new one.');
                page = await browser.newPage();
            }

            // Ensure page is ready
            await new Promise(r => setTimeout(r, 200));

            page.on('error', err => { if (this.logError) this.emit('error', `Page crashed: ${err.message}`); });
            page.on('pageerror', err => { if (this.logError) this.emit('error', `Browser error: ${err.message}`); });
            page.on('close', () => { if (this.logDebug) this.emit('debug', 'Page was closed unexpectedly'); });
            browser.on('disconnected', () => { if (this.logDebug) this.emit('debug', 'Browser disconnected unexpectedly'); });

            page.setDefaultTimeout(30000);
            page.setDefaultNavigationTimeout(30000);

            // Now safe to navigate
            await page.goto(ApiUrlsHome.BaseURL, { waitUntil: ['domcontentloaded', 'networkidle2'] });

            let loginBtn;
            try {
                loginBtn = await page.waitForFunction(() => {
                    const btns = Array.from(document.querySelectorAll('button.btn--blue'));
                    return btns.find(b => ['Zaloguj', 'Sign In', 'Login'].includes(b.textContent.trim()));
                }, { timeout: 15000 }); // max 15s czekania
            } catch {
                this.emit('warn', 'Login button not found after 15s');
                return null;
            }

            await Promise.race([
                Promise.all([
                    loginBtn.click(),
                    page.waitForNavigation({ waitUntil: ['domcontentloaded', 'networkidle2'], timeout: 15000 })
                ]),
                new Promise(r => setTimeout(r, 12000))
            ]);

            const usernameInput = await page.$('input[name="username"]');
            const passwordInput = await page.$('input[name="password"]');
            if (!usernameInput || !passwordInput) {
                this.emit('warn', 'Username or password input not found');
                return null;
            }

            await page.type('input[name="username"]', this.user, { delay: 50 });
            await page.type('input[name="password"]', this.passwd, { delay: 50 });

            const submitButton = await page.$('input[type="submit"], button[type="submit"]');
            if (!submitButton) {
                this.emit('warn', 'Submit button not found on login form');
                return null;
            }

            await Promise.race([
                Promise.all([
                    submitButton.click(),
                    page.waitForNavigation({ waitUntil: ['domcontentloaded', 'networkidle2'], timeout: 20000 })
                ]),
                new Promise(r => setTimeout(r, 15000))
            ]);

            let c1 = null, c2 = null;
            const start = Date.now();
            while ((!c1 || !c2) && Date.now() - start < 20000) {
                const cookies = await page.browserContext().cookies();
                c1 = cookies.find(c => c.name === '__Secure-monitorandcontrolC1')?.value || c1;
                c2 = cookies.find(c => c.name === '__Secure-monitorandcontrolC2')?.value || c2;
                if (!c1 || !c2) await new Promise(r => setTimeout(r, 500));
            }

            if (!c1 || !c2) {
                this.emit('warn', 'Cookies C1/C2 missing after login');
                return null;
            }

            const contextKey = [
                '__Secure-monitorandcontrol=chunks-2',
                `__Secure-monitorandcontrolC1=${c1}`,
                `__Secure-monitorandcontrolC2=${c2}`
            ].join('; ');

            const accountInfo = { ContextKey: contextKey, UseFahrenheit: false };
            this.contextKey = contextKey;

            await this.functions.saveData(this.accountFile, accountInfo);

            if (!refresh) this.emit('success', 'Connect to MELCloud Home Success');
            return accountInfo;
        } catch (error) {
            throw new Error(`Connect error: ${error.message}`);
        } finally {
            if (browser) {
                try { await browser.close(); }
                catch (closeErr) { if (this.logError) this.emit('error', `Failed to close Puppeteer browser: ${closeErr.message}`); }
            }
        }
    }

    async checkDevicesList() {
        const TIMEOUT_MS = 30000; // 30 seconds timeout
        try {
            const devices = await Promise.race([
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

            return devices;
        } catch (err) {
            if (this.logError) this.emit('error', `Device list error: ${err.message}`);
            throw new Error(`Device list error: ${err.message}`);
        }
    }

    async connect(refresh) {
        const TIMEOUT_MS = 45000;

        try {
            const result = await Promise.race([
                (async () => {
                    switch (this.accountType) {
                        case "melcloud":
                            return await this.connectToMelCloud();
                        case "melcloudhome":
                            return await this.connectToMelCloudHome(refresh);
                        default:
                            return {};
                    }
                })(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout (30s)')), TIMEOUT_MS))
            ]);

            return result;
        } catch (err) {
            if (this.logError) this.emit('error', `Connect error: ${err.message}`);
            throw new Error(`Connect error: ${err.message}`);
        }
    }

    async send(accountInfo) {
        try {
            const axiosInstance = axios.create({
                baseURL: ApiUrls.BaseURL,
                timeout: 15000,
                headers: {
                    'X-MitsContextKey': this.contextKey,
                    'content-type': 'application/json'
                }
            });

            const options = { data: accountInfo };
            await axiosInstance.post(ApiUrls.UpdateApplicationOptions, options);
            await this.functions.saveData(this.accountFile, accountInfo);
            return true;
        } catch (error) {
            throw new Error(`Send data error: ${error.message}`);
        }
    }
}

export default MelCloud;

