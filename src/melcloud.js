"use strict";
const fs = require('fs');
const fsPromises = fs.promises;
const axios = require('axios');
const EventEmitter = require('events');
const CONSTANS = require('./constans.json');

class MELCLOUD extends EventEmitter {
    constructor(config) {
        super();
        const accountName = config.accountName;
        const user = config.user;
        const passwd = config.passwd;
        const language = config.language;
        const debugLog = config.debugLog;
        const prefDir = config.prefDir

        this.melCloudInfoFile = `${prefDir}/${accountName}_Account`;
        const melCloudBuildingsFile = `${prefDir}/${accountName}_Buildings`;
        const devicesId = [];

        this.axiosInstanceLogin = axios.create({
            method: 'POST',
            baseURL: CONSTANS.ApiUrls.BaseURL,
            timeout: 15000
        });


        this.on('connect', async () => {
            const options = {
                data: {
                    Email: user,
                    Password: passwd,
                    Language: language,
                    AppVersion: '1.25.0',
                    CaptchaChallenge: '',
                    CaptchaResponse: '',
                    Persist: true
                }
            };

            try {
                const loginData = await this.axiosInstanceLogin(CONSTANS.ApiUrls.ClientLogin, options);
                const debug = debugLog ? this.emit('debug', `debug MELCloud Info: ${JSON.stringify(loginData.data, null, 2)}`) : false;
                const melCloudInfo = loginData.data.LoginData;
                const contextKey = melCloudInfo.ContextKey;

                if (contextKey === undefined || contextKey === null) {
                    this.emit('message', `context key not found or undefined, reconnect in 65s.`)
                    this.reconnect();
                    return;
                };

                this.emit('connected', melCloudInfo, contextKey);

                //create axios instance get
                this.axiosInstanceGet = axios.create({
                    method: 'GET',
                    baseURL: CONSTANS.ApiUrls.BaseURL,
                    timeout: 15000,
                    headers: {
                        'X-MitsContextKey': contextKey
                    }
                });

                //create axios instance post
                this.axiosInstancePost = axios.create({
                    method: 'POST',
                    baseURL: CONSTANS.ApiUrls.BaseURL,
                    timeout: 15000,
                    headers: {
                        'X-MitsContextKey': contextKey,
                        'content-type': 'application/json'
                    }
                });

                //save melcloud info to the file
                try {
                    await fsPromises.writeFile(this.melCloudInfoFile, JSON.stringify(melCloudInfo, null, 2));
                } catch (error) {
                    this.emit('error', `save MELCloud info error: ${error}`);
                };

                await new Promise(resolve => setTimeout(resolve, 500));
                this.emit('checkDevicesList');
            } catch (error) {
                this.emit('error', `login error, ${error}, reconnect in 65s.`);
                this.reconnect();
            };
        }).on('checkDevicesList', async () => {
            const debug = debugLog ? this.emit('debug', `scanning for devices.`) : false;

            try {
                const listDevicesData = await this.axiosInstanceGet(CONSTANS.ApiUrls.ListDevices);
                const buildingsData = JSON.stringify(listDevicesData.data, null, 2);
                const debug1 = debugLog ? this.emit('debug', `debug Buildings: ${buildingsData}`) : false;

                //read building structure and get the devices
                const buildingsList = listDevicesData.data;
                if (!buildingsList) {
                    this.emit('message', `no building found, check again in 90s.`);
                    this.checkDevicesList();
                    return;
                }

                //write buildings to the file
                try {
                    await fsPromises.writeFile(melCloudBuildingsFile, buildingsData);
                } catch (error) {
                    this.emit('error', `save buildings error, ${error}, check again in 90s.`);
                    this.checkDevicesList();
                };

                //check available devices in buildings
                const devices = [];
                for (const building of buildingsList) {
                    const buildingStructure = building.Structure;

                    // Get all devices from the building structure
                    const allDevices = [
                        ...buildingStructure.Floors.flatMap(floor => [...floor.Areas.flatMap(area => area.Devices), ...floor.Devices]),
                        ...buildingStructure.Areas.flatMap(area => area.Devices),
                        ...buildingStructure.Devices
                    ];

                    //add all devices to the devices array
                    devices.push(...allDevices);
                }

                if (!devices) {
                    this.emit('message', `no devices found, check again in 90s.`);
                    this.checkDevicesList();
                    return;
                }

                const devicesCount = devices.length;
                const debug2 = debugLog ? this.emit('debug', `found: ${devicesCount} devices.`) : false;

                for (const deviceInfo of devices) {
                    const buildingId = deviceInfo.BuildingID.toString();
                    const deviceId = deviceInfo.DeviceID.toString();
                    const deviceType = deviceInfo.Type;
                    const deviceName = deviceInfo.DeviceName;
                    const deviceTypeText = CONSTANS.DeviceType[deviceType];

                    //write every device to the filr
                    try {
                        const deviceData = JSON.stringify(deviceInfo, null, 2);
                        const melCloudBuildingDeviceFile = `${prefDir}/${accountName}_Device_${deviceId}`;
                        await fsPromises.writeFile(melCloudBuildingDeviceFile, deviceData);
                    } catch (error) {
                        this.emit('error', `write device info error, ${error}, check again in 90s.`);
                        this.checkDevicesList();
                    };

                    //prepare device if not in devices array
                    if (!devicesId.includes(deviceId)) {
                        devicesId.push(deviceId);
                        this.emit('checkDevicesListComplete', buildingId, deviceId, deviceType, deviceName, deviceTypeText);
                    }
                }

                this.checkDevicesList();
            } catch (error) {
                this.emit('error', `check devices list error, ${error}, check again in 90s.`);
                this.checkDevicesList();
            };
        })
        this.emit('connect');
    };

    async reconnect() {
        await new Promise(resolve => setTimeout(resolve, 65000));
        this.emit('connect');
    };

    async checkDevicesList() {
        await new Promise(resolve => setTimeout(resolve, 90000));
        this.emit('checkDevicesList');
    };

    send(newData) {
        return new Promise(async (resolve, reject) => {
            try {
                const options = {
                    data: newData
                };

                await this.axiosInstancePost(CONSTANS.ApiUrls.UpdateApplicationOptions, options);

                try {
                    const melCloudInfo = JSON.stringify(newData, null, 2);
                    await fsPromises.writeFile(this.melCloudInfoFile, melCloudInfo);
                } catch (error) {
                    this.emit('error', `save MELCloud info error: ${error}`);
                };
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = MELCLOUD;