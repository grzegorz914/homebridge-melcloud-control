"use strict";
const fs = require('fs');
const fsPromises = fs.promises;
const https = require('https');
const axios = require('axios');
const EventEmitter = require('events');
const ImpulseGenerator = require('./impulsegenerator.js');
const CONSTANTS = require('./constants.json');

class MelCloud extends EventEmitter {
    constructor(prefDir, accountName, user, passwd, language, enableDebugMode, accountInfoFile, buildingsFile, refreshInterval) {
        super();
        this.prefDir = prefDir;
        this.accountName = accountName;
        this.enableDebugMode = enableDebugMode;
        this.accountInfoFile = accountInfoFile;
        this.buildingsFile = buildingsFile;
        this.refreshInterval = refreshInterval;
        this.devicesId = [];

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

        this.impulseGenerator = new ImpulseGenerator();
        this.impulseGenerator.on('checkDevicesList', async () => {
            try {
                await this.chackDevicesList();
            } catch (error) {
                this.emit('error', `Scheck devices list: ${error}.`);
            };
        }).on('state', (state) => { });

        this.connect();
    };

    async connect() {
        const debug = this.enableDebugMode ? this.emit('debug', `Connecting to MELCloud.`) : false;

        try {
            //create timers array
            const timers = [{ name: 'checkDevicesList', sampling: this.refreshInterval }];

            const axiosInstanceLogin = axios.create({
                method: 'POST',
                baseURL: CONSTANTS.ApiUrls.BaseURL,
                timeout: 25000,
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
                this.emit('message', `Context key: ${contextKey}, missing.`)
                return;
            };

            //create axios instance get
            this.axiosInstanceGet = axios.create({
                method: 'GET',
                baseURL: CONSTANTS.ApiUrls.BaseURL,
                timeout: 15000,
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

            //create axios instance post
            this.axiosInstancePost = axios.create({
                method: 'POST',
                baseURL: CONSTANTS.ApiUrls.BaseURL,
                timeout: 15000,
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

            this.accountInfo = accountInfo;
            this.contextKey = contextKey;

            //save melcloud info to the file
            await this.saveData(this.accountInfoFile, accountInfo);

            //check devices list
            await this.chackDevicesList();

            //start impulse generator
            this.impulseGenerator.start(timers);
            return true;
        } catch (error) {
            this.emit('error', `Connect to MELCloud error: ${error}.`);
        };
    }

    async chackDevicesList() {
        try {
            const debug = this.enableDebugMode ? this.emit('debug', `Scanning for devices.`) : false;
            const listDevicesData = await this.axiosInstanceGet(CONSTANTS.ApiUrls.ListDevices);
            const buildingsList = listDevicesData.data;
            const debug1 = this.enableDebugMode ? this.emit('debug', `Buildings: ${JSON.stringify(buildingsList, null, 2)}`) : false;

            if (!buildingsList) {
                this.emit('message', `No building found.`);
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
                this.emit('message', `No devices found.`);
                return;
            }
            const debug3 = this.enableDebugMode ? this.emit('debug', `Found: ${devicesCount} devices.`) : false;

            //get device info fom devices
            for (const deviceInfo of devices) {
                const deviceId = deviceInfo.DeviceID
                const deviceName = deviceInfo.DeviceName;

                //save every device info to the file
                const deviceInfoFile = `${this.prefDir}/${this.accountName}_Device_${deviceId}`;
                await this.saveData(deviceInfoFile, deviceInfo);
                const debug = this.enableDebugMode ? this.emit('debug', `Device: ${deviceName} info saved.`) : false;

                //prepare device if not in devices array
                if (!this.devicesId.includes(deviceId)) {
                    this.devicesId.push(deviceId);
                    this.emit('checkDevicesListComplete', this.accountInfo, this.contextKey, deviceInfo);
                }
            }
            return true;
        } catch (error) {
            this.emit('error', `Scanning for devices error: ${error}.`);
        };
    }

    async saveData(path, data) {
        try {
            await fsPromises.writeFile(path, JSON.stringify(data, null, 2));
            const debug3 = this.enableDebugMode ? this.emit('debug', `Data saved to path: ${path}.`) : false;
            return true;
        } catch (error) {
            this.emit('error', `Save data to path: ${path}, error: ${error}`);
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
            this.emit('error', error);
        };
    };
};
module.exports = MelCloud;
