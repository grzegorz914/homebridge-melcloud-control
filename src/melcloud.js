import axios from 'axios';
import puppeteer from 'puppeteer';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import Functions from './functions.js';
import { ApiUrls, ApiUrlsHome } from './constants.js';

class MelCloud extends EventEmitter {
    constructor(accountType, user, passwd, language, accountFile, buildingsFile, devicesFile, logWarn, logDebug, requestConfig) {
        super();
        this.accountType = accountType;
        this.user = user;
        this.passwd = passwd;
        this.language = language;
        this.accountFile = accountFile;
        this.buildingsFile = buildingsFile;
        this.devicesFile = devicesFile;
        this.logWarn = logWarn;
        this.logDebug = logDebug;
        this.requestConfig = requestConfig;
        this.devicesId = [];
        this.contextKey = '';
        this.functions = new Functions();

        this.loginData = {
            Email: user,
            Password: passwd,
            Language: language,
            AppVersion: '1.34.12',
            CaptchaChallenge: '',
            CaptchaResponse: '',
            Persist: true
        };

        if (!requestConfig) {
            this.impulseGenerator = new ImpulseGenerator()
                .on('connect', async () => {
                    try {
                        await this.connect(true);
                    } catch (error) {
                        this.emit('error', `Impulse generator error: ${error}`);
                    }
                })
                .on('checkDevicesList', async () => {
                    try {
                        await this.checkDevicesList(this.contextKey);
                    } catch (error) {
                        this.emit('error', `Impulse generator error: ${error}`);
                    }
                })
                .on('state', (state) => {
                    this.emit('success', `Impulse generator ${state ? 'started' : 'stopped'}.`);
                });
        }
    }

    async checkMelcloudDevicesList(contextKey) {
        try {
            const axiosInstanceGet = axios.create({
                method: 'GET',
                baseURL: ApiUrls.BaseURL,
                timeout: 15000,
                headers: { 'X-MitsContextKey': contextKey }
            });

            if (this.logDebug) this.emit('debug', `Scanning for devices`);
            const listDevicesData = await axiosInstanceGet(ApiUrls.ListDevices);
            const buildingsList = listDevicesData.data;
            if (this.logDebug) this.emit('debug', `Buildings: ${JSON.stringify(buildingsList, null, 2)}`);

            if (!buildingsList) {
                if (this.logWarn) this.emit('warn', `No building found`);
                return null;
            }

            await this.functions.saveData(this.buildingsFile, buildingsList);
            if (this.logDebug) this.emit('debug', `Buildings list saved`);

            const devices = [];
            for (const building of buildingsList) {
                const buildingStructure = building.Structure;
                const allDevices = [
                    ...buildingStructure.Floors.flatMap(floor => [
                        ...floor.Areas.flatMap(area => area.Devices),
                        ...floor.Devices
                    ]),
                    ...buildingStructure.Areas.flatMap(area => area.Devices),
                    ...buildingStructure.Devices
                ];

                // Zamiana DeviceID na string
                allDevices.forEach(device => {
                    if (device.DeviceID !== undefined && device.DeviceID !== null) {
                        device.DeviceID = device.DeviceID.toString();
                    }
                });

                devices.push(...allDevices);
            }

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

    async connectToMelCloud() {
        if (this.logDebug) this.emit('debug', `Connecting to MELCloud`);

        try {
            const axiosInstanceLogin = axios.create({
                method: 'POST',
                baseURL: ApiUrls.BaseURL,
                timeout: 15000,
            });

            const accountData = await axiosInstanceLogin(ApiUrls.ClientLogin, { data: this.loginData });
            const account = accountData.data;
            const accountInfo = account.LoginData;
            const contextKey = accountInfo?.ContextKey;
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

            this.axiosInstancePost = axios.create({
                method: 'POST',
                baseURL: ApiUrls.BaseURL,
                timeout: 15000,
                headers: {
                    'X-MitsContextKey': contextKey,
                    'content-type': 'application/json'
                }
            });

            await this.functions.saveData(this.accountFile, accountInfo);
            this.emit('success', `Connect to MELCloud Success`);

            return accountInfo
        } catch (error) {
            throw new Error(`Connect to MELCloud error: ${error.message}`);
        }
    }

    async checkMelcloudHomeDevicesList(contextKey) {
        try {
            const axiosInstance = axios.create({
                method: 'GET',
                baseURL: ApiUrlsHome.BaseURL,
                timeout: 25000,
                headers: {
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cookie': contextKey,
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
                const createDevice = (device, type, contextKey) => {
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
                        ContextKey: contextKey,
                        Type: type,
                        DeviceID: Id,
                        DeviceName: GivenDisplayName,
                        Device: deviceObject
                    };
                };

                return [
                    ...(building.airToAirUnits || []).map(d => createDevice(capitalizeKeys(d), 0, this.contextKey)),
                    ...(building.airToWaterUnits || []).map(d => createDevice(capitalizeKeys(d), 1, this.contextKey)),
                    ...(building.airToVentilationUnits || []).map(d => createDevice(capitalizeKeys(d), 3, this.contextKey))
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
            throw new Error(`Connect to MELCloud Home error: ${error.message}`);
        }
    }

    async connectToMelCloudHome(refresh = false) {
        if (this.logDebug) this.emit('debug', `Connecting to MELCloud Home`);

        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();

        try {
            // Open MELCloud Home
            await page.goto(ApiUrlsHome.BaseURL, { waitUntil: 'networkidle2' });
            const buttons = await page.$$('button.btn--blue');
            let loginBtn = null;
            for (const btn of buttons) {
                const text = await page.evaluate(el => el.textContent, btn);
                if (text.trim() === 'Zaloguj' || text.trim() === 'Log In') {
                    loginBtn = btn;
                    break;
                }
            }

            if (!loginBtn && this.logWarn) this.emit('warn', `Login button not found`);

            // Set credentials and login
            await Promise.all([loginBtn.click(), page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 })]);
            await page.waitForSelector('input[name="username"]', { timeout: 5000 });
            await page.type('input[name="username"]', this.user, { delay: 50 });
            await page.type('input[name="password"]', this.passwd, { delay: 50 });

            const button1 = await page.$('input[type="submit"]');
            await Promise.all([button1.click(), page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 })]);

            // Get cookies C1 and C2
            let c1 = null, c2 = null;
            const start = Date.now();

            // Loop max 20s
            while ((!c1 || !c2) && Date.now() - start < 20000) {
                const cookies = await page.cookies();
                c1 = cookies.find(c => c.name === '__Secure-monitorandcontrolC1')?.value || c1;
                c2 = cookies.find(c => c.name === '__Secure-monitorandcontrolC2')?.value || c2;
                if (!c1 || !c2) await new Promise(r => setTimeout(r, 500));
            }

            if (!c1 || !c2) {
                if (this.logWarn) this.emit('warn', `Cookies C1/C2 missing`);
                return null;
            }

            const contextKey = ['__Secure-monitorandcontrol=chunks-2', `__Secure-monitorandcontrolC1=${c1}`, `__Secure-monitorandcontrolC2=${c2}`,].join('; ');
            const accountInfo = { ContextKey: contextKey, UseFahrenheit: false };
            this.contextKey = contextKey;

            await this.functions.saveData(this.accountFile, accountInfo);
            if (!refresh) this.emit('success', `Connect to MELCloud Home Success`);

            return accountInfo;
        } catch (error) {
            throw new Error(`Connect to MELCloud Home error: ${error.message}`);
        } finally {
            await browser.close();
        }
    }

    async checkDevicesList(contextKey) {
        let devices = [];
        switch (this.accountType) {
            case "melcloud":
                devices = await this.checkMelcloudDevicesList(contextKey);
                return devices
            case "melcloudhome":
                devices = await this.checkMelcloudHomeDevicesList(contextKey);
                return devices;
            default:
                return devices;
        }
    }

    async connect(refresh) {
        let response = {};
        switch (this.accountType) {
            case "melcloud":
                response = await this.connectToMelCloud();
                return response
            case "melcloudhome":
                response = await this.connectToMelCloudHome(refresh);
                return response
            default:
                return response
        }
    }

    async send(accountInfo) {
        try {
            const options = { data: accountInfo };
            await this.axiosInstancePost(ApiUrls.UpdateApplicationOptions, options);
            await this.functions.saveData(this.accountFile, accountInfo);
            return true;
        } catch (error) {
            throw new Error(`Send data error: ${error.message}`);
        }
    }
}

export default MelCloud;

