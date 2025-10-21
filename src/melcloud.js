import { Agent } from 'https';
import axios from 'axios';
import puppeteer from 'puppeteer';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import Functions from './functions.js';
import { ApiUrls, ApiUrlsHome } from './constants.js';

class MelCloud extends EventEmitter {
    constructor(displayType, user, passwd, language, accountFile, buildingsFile, devicesFile, logWarn, logDebug, requestConfig) {
        super();
        this.displayType = displayType;
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

        this.axiosDefaults = {
            timeout: 15000,
            maxContentLength: 100000000,
            maxBodyLength: 1000000000,
            httpsAgent: new Agent({
                keepAlive: false,
                rejectUnauthorized: false
            })
        };

        if (!requestConfig) {
            this.impulseGenerator = new ImpulseGenerator()
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
                headers: { 'X-MitsContextKey': contextKey },
                ...this.axiosDefaults
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
                ...this.axiosDefaults
            });

            const accountData = await axiosInstanceLogin(ApiUrls.ClientLogin, { data: this.loginData });
            const account = accountData.data;
            const accountInfo = account.LoginData;
            const contextKey = accountInfo?.ContextKey;
            const useFahrenheit = accountInfo?.UseFahrenheit ?? false;
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
                headers: {
                    'X-MitsContextKey': contextKey,
                    'content-type': 'application/json'
                },
                ...this.axiosDefaults
            });

            await this.functions.saveData(this.accountFile, accountInfo);

            this.emit('success', `Connect to MELCloud Success`);

            return { accountInfo, contextKey, useFahrenheit };
        } catch (error) {
            throw new Error(`Connect to MELCloud error: ${error.message}`);
        }
    }

    async checkMelcloudHomeDevicesList(cookies) {
        try {
            const c1 = cookies.c1.trim();
            const c2 = cookies.c2.trim();

            const cookie = [
                '__Secure-monitorandcontrol=chunks-2',
                `__Secure-monitorandcontrolC1=${c1}`,
                `__Secure-monitorandcontrolC2=${c2}`,
            ].join('; ');

            const axiosInstance = axios.create({
                baseURL: ApiUrlsHome.BaseURL,
                timeout: 20000,
                httpsAgent: new Agent({
                    keepAlive: false,
                    rejectUnauthorized: false
                }),
                headers: {
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cookie': cookie,
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
            const listDevicesData = await axiosInstance.get(ApiUrlsHome.GetUserContext);
            const buildingsList = listDevicesData.data.buildings;
            if (this.logDebug) this.emit('debug', `Buildings: ${JSON.stringify(buildingsList, null, 2)}`);

            if (!buildingsList) {
                if (this.logWarn) this.emit('warn', `No building found`);
                return null;
            }

            await this.functions.saveData(this.buildingsFile, buildingsList);
            if (this.logDebug) this.emit('debug', `Buildings list saved`);

            const devices = buildingsList.flatMap(building => [
                ...(building.airToAirUnits || []),
                ...(building.airToWaterUnits || [])
            ]);

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

    async connectToMelCloudHome() {
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
            await Promise.all([loginBtn.click(), page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 })]);
            await page.waitForSelector('input[name="username"]', { timeout: 15000 });
            await page.type('input[name="username"]', this.user, { delay: 50 });
            await page.type('input[name="password"]', this.passwd, { delay: 50 });

            const button1 = await page.$('input[type="submit"]');
            await Promise.all([button1.click(), page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 })]);

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

            const accountInfo = {};
            const contextKey = { c1, c2 };
            const useFahrenheit = false;
            this.contextKey = contextKey;

            this.emit('success', `Connect to MELCloud Home Success`);

            return { accountInfo, contextKey, useFahrenheit };
        } catch (error) {
            throw new Error(`Connect to MELCloud Home error: ${error.message}`);
        } finally {
            await browser.close();
        }
    }

    async connect() {
        let response = null;
        switch (this.displayType) {
            case "1":
                response = await this.connectToMelCloud();
                return response
            case "2":
                response = await this.connectToMelCloudHome();
                return response
            default:
                return null
        }
    }

    async checkDevicesList(key) {
        let devices = null;
        switch (this.displayType) {
            case "1":
                devices = await this.checkMelcloudDevicesList(key);
                return devices
            case "2":
                devices = await this.checkMelcloudHomeDevicesList(key);
                return devices
            default:
                return null;
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

