import { Agent } from 'https';
import axios from 'axios';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import Functions from './functions.js';
import { ApiUrls } from './constants.js';

class MelCloud extends EventEmitter {
    constructor(user, passwd, language, accountFile, buildingsFile, devicesFile, enableDebugMode, requestConfig) {
        super();
        this.accountFile = accountFile;
        this.buildingsFile = buildingsFile;
        this.devicesFile = devicesFile;
        this.enableDebugMode = enableDebugMode;
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

    async checkDevicesList(contextKey) {
        try {
            const axiosInstanceGet = axios.create({
                method: 'GET',
                baseURL: ApiUrls.BaseURL,
                headers: { 'X-MitsContextKey': contextKey },
                ...this.axiosDefaults
            });

            if (this.enableDebugMode) this.emit('debug', `Scanning for devices`);
            const listDevicesData = await axiosInstanceGet(ApiUrls.ListDevices);
            const buildingsList = listDevicesData.data;
            if (this.enableDebugMode) this.emit('debug', `Buildings: ${JSON.stringify(buildingsList, null, 2)}`);

            if (!buildingsList) {
                this.emit('warn', `No building found`);
                return null;
            }

            await this.functions.saveData(this.buildingsFile, buildingsList);
            if (this.enableDebugMode) this.emit('debug', `Buildings list saved`);

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
                this.emit('warn', `No devices found`);
                return null;
            }

            await this.functions.saveData(this.devicesFile, devices);
            if (this.enableDebugMode) this.emit('debug', `${devicesCount} devices saved`);

            return devices;
        } catch (error) {
            throw new Error(`Check devices list error: ${error.message}`);
        }
    }

    async connect() {
        if (this.enableDebugMode) this.emit('debug', `Connecting to MELCloud`);

        try {
            const axiosInstanceLogin = axios.create({
                method: 'POST',
                baseURL: ApiUrls.BaseURL,
                ...this.axiosDefaults
            });

            const accountData = await axiosInstanceLogin(ApiUrls.ClientLogin, { data: this.loginData });
            const account = accountData.data;
            const accountInfo = account.LoginData;
            const contextKey = accountInfo.ContextKey;
            const useFahrenheit = accountInfo.UseFahrenheit ?? false;
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
            if (this.enableDebugMode) this.emit('debug', `MELCloud Info: ${JSON.stringify(debugData, null, 2)}`);

            if (!contextKey) {
                this.emit('warn', `Context key missing`);
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

            return {
                accountInfo,
                contextKey,
                useFahrenheit
            };
        } catch (error) {
            throw new Error(`Connect to MELCloud error: ${error.message}`);
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

