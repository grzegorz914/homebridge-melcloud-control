"use strict";
const fs = require('fs');
const fsPromises = fs.promises;
const https = require('https');
const axios = require('axios');
const EventEmitter = require('events');
const ImpulseGenerator = require('./impulsegenerator.js');
const CONSTANTS = require('./constants.json');

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

        this.options = {
            data: {
                Email: user,
                Password: passwd,
                Language: language,
                AppVersion: '1.31.0',
                CaptchaChallenge: '',
                CaptchaResponse: '',
                Persist: true
            }
        };

        if (!requestConfig) {
            this.impulseGenerator = new ImpulseGenerator();
            this.impulseGenerator.on('checkDevicesList', async () => {
                try {
                    await this.chackDevicesList(this.contextKey);
                } catch (error) {
                    this.emit('error', `Check devices list: ${error}.`);
                };
            }).on('state', (state) => { });
        };
    };

    async connect() {
        const debug = this.enableDebugMode ? this.emit('debug', `Connecting to MELCloud.`) : false;

        try {
            const axiosInstanceLogin = axios.create({
                method: 'POST',
                baseURL: CONSTANTS.ApiUrls.BaseURL,
                timeout: 10000,
                withCredentials: true,
                maxContentLength: 100000000,
                maxBodyLength: 1000000000,
                httpsAgent: new https.Agent({
                    keepAlive: false,
                    rejectUnauthorized: false
                })
            });
            const accountData = await axiosInstanceLogin(CONSTANTS.ApiUrls.ClientLogin, this.options);
            const account = accountData.data;
            const accountInfo = account.LoginData;
            const contextKey = accountInfo.ContextKey;
            const useFahrenheit = accountInfo.UseFahrenheit ?? false;
            this.contextKey = contextKey;

            //remove sensitive data
            const debugData = {
                ...accountInfo,
                ContextKey: 'removed',
                ClientId: 'removed',
                Client: 'removed',
                Name: 'removed',
                MapLongitude: 'removed',
                MapLatitude: 'removed'
            };
            const debug1 = this.enableDebugMode ? this.emit('debug', `MELCloud Info: ${JSON.stringify(debugData, null, 2)}`) : false;

            if (contextKey === undefined || contextKey === null) {
                this.emit('warn', `Context key: ${contextKey}, missing.`)
                return;
            };

            //create axios instance post
            this.axiosInstancePost = axios.create({
                method: 'POST',
                baseURL: CONSTANTS.ApiUrls.BaseURL,
                timeout: 10000,
                headers: {
                    'X-MitsContextKey': contextKey,
                    'content-type': 'application/json'
                },
                maxContentLength: 100000000,
                maxBodyLength: 1000000000,
                withCredentials: true,
                httpsAgent: new https.Agent({
                    keepAlive: false,
                    rejectUnauthorized: false
                })
            });

            //save melcloud info to the file
            await this.saveData(this.accountFile, accountInfo);

            //emit connect success
            this.emit('success', `Connect to MELCloud Success.`)

            const obj = {
                accountInfo: accountInfo,
                contextKey: contextKey,
                useFahrenheit: useFahrenheit
            }

            return obj;
        } catch (error) {
            throw new Error(`Connect to MELCloud error: ${error.message ?? error}.`);
        };
    }

    async chackDevicesList(contextKey) {
        try {
            //create axios instance get
            const axiosInstanceGet = axios.create({
                method: 'GET',
                baseURL: CONSTANTS.ApiUrls.BaseURL,
                timeout: 10000,
                headers: {
                    'X-MitsContextKey': contextKey
                },
                maxContentLength: 100000000,
                maxBodyLength: 1000000000,
                withCredentials: true,
                httpsAgent: new https.Agent({
                    keepAlive: false,
                    rejectUnauthorized: false
                })
            });

            const debug = this.enableDebugMode ? this.emit('debug', `Scanning for devices.`) : false;
            const listDevicesData = await axiosInstanceGet(CONSTANTS.ApiUrls.ListDevices);
            const buildingsList = listDevicesData.data;
            const debug1 = this.enableDebugMode ? this.emit('debug', `Buildings: ${JSON.stringify(buildingsList, null, 2)}`) : false;

            if (!buildingsList) {
                this.emit('warn', `No building found.`);
                return;
            }

            //save buildings to the file
            await this.saveData(this.buildingsFile, buildingsList);
            const debug2 = this.enableDebugMode ? this.emit('debug', `Buildings list saved.`) : false;

            //read buildings structure and get the devices
            const devices = [];
            for (const building of buildingsList) {
                const buildingStructure = building.Structure;

                //get all devices from the building structure
                const allDevices = [
                    ...buildingStructure.Floors.flatMap(floor => [...floor.Areas.flatMap(area => area.Devices), ...floor.Devices]),
                    ...buildingStructure.Areas.flatMap(area => area.Devices),
                    ...buildingStructure.Devices
                ];

                //add all devices to the devices array
                devices.push(...allDevices);
            }

            const devicesCount = devices.length;
            if (devicesCount === 0) {
                this.emit('warn', `No devices found.`);
                return;
            }

            //save buildings to the file
            await this.saveData(this.devicesFile, devices);
            const debug3 = this.enableDebugMode ? this.emit('debug', `${devicesCount} devices saved.`) : false;

            return devices;
        } catch (error) {
            throw new Error(`Scanning for devices error: ${error.message ?? error}.`);
        };
    }

    async saveData(path, data) {
        try {
            await fsPromises.writeFile(path, JSON.stringify(data, null, 2));
            const debug3 = this.enableDebugMode ? this.emit('debug', `Data saved to: ${path}.`) : false;
            return true;
        } catch (error) {
            throw new Error(`Save data error: ${error.message ?? error}`);
        }
    }

    async send(accountInfo) {
        try {
            const options = {
                data: accountInfo
            };

            await this.axiosInstancePost(CONSTANTS.ApiUrls.UpdateApplicationOptions, options);
            await this.saveData(this.accountInfoFile, accountInfo);
            return true;
        } catch (error) {
            throw new Error(error.message ?? error);
        };
    };
};
module.exports = MelCloud;
