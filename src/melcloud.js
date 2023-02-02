"use strict";
const fs = require('fs');
const fsPromises = fs.promises;
const axios = require('axios');
const EventEmitter = require('events');
const CONSTANS = require('./constans.json');

class MELCLOUD extends EventEmitter {
    constructor(config) {
        super();
        const accountName = config.name;
        const user = config.user;
        const passwd = config.passwd;
        const language = config.language;
        const debugLog = config.debugLog;
        const prefDir = config.prefDir;
        const melCloudBuildingsFile = `${prefDir}/${accountName}_Buildings`;
        const devicesId = [];

        this.axiosInstanceLogin = axios.create({
            method: 'POST',
            baseURL: CONSTANS.ApiUrls.BaseURL,
            timeout: 10000
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
                const melCloudInfoData = JSON.stringify(loginData.data, null, 2);
                const debug = debugLog ? this.emit('debug', `Account ${accountName}, debug MELCloud Info: ${melCloudInfoData}`) : false;
                const melCloudInfo = loginData.data.LoginData;
                const contextKey = loginData.data.LoginData.ContextKey;

                if (contextKey === undefined || contextKey === null) {
                    this.emit('message', `Account ${accountName}, context key not found or undefined, reconnect in 65s.`)
                    this.reconnect();
                    return;
                };

                this.melCloudInfo = melCloudInfo;
                this.contextKey = contextKey;
                this.emit('connected', melCloudInfoData);
                this.emit('checkDevicesList');
            } catch (error) {
                this.emit('error', `Account: ${accountName}, login error, ${error}, reconnect in 65s.`);
                this.reconnect();
            };
        }).on('checkDevicesList', async () => {
            const debug = debugLog ? this.emit('debug', `Account ${accountName}, Scanning for devices.`) : false;
            const melCloudInfo = this.melCloudInfo;
            const contextKey = this.contextKey;

            this.axiosInstanceGet = axios.create({
                method: 'GET',
                baseURL: CONSTANS.ApiUrls.BaseURL,
                timeout: 10000,
                headers: {
                    'X-MitsContextKey': contextKey
                }
            });

            try {
                const listDevicesData = await this.axiosInstanceGet(CONSTANS.ApiUrls.ListDevices);
                const buildingsData = JSON.stringify(listDevicesData.data, null, 2);
                const debug1 = debugLog ? this.emit('debug', `Account ${accountName}, debug Buildings: ${buildingsData}`) : false;
                const writeDevicesData = await fsPromises.writeFile(melCloudBuildingsFile, buildingsData);


                //read building structure and get the devices
                const buildingsList = listDevicesData.data;
                if (!buildingsList) {
                    this.emit('message', `Account ${accountName}, no building found, check again in 90s.`);
                    this.checkDevicesList();
                    return;
                }

                // Check available devices
                const devices = [];
                for (const building of buildingsList) {
                    const buildingStructure = building.Structure;

                    // Get all devices from the building structure
                    const allDevices = [
                        ...buildingStructure.Floors.flatMap(floor => [...floor.Areas.flatMap(area => area.Devices), ...floor.Devices]),
                        ...buildingStructure.Areas.flatMap(area => area.Devices),
                        ...buildingStructure.Devices
                    ];

                    // Add all devices to the devices array
                    devices.push(...allDevices);
                }

                if (!devices) {
                    this.emit('message', `Account ${accountName}, no devices found, check again in 90s.`);
                    this.checkDevicesList();
                    return;
                }

                const devicesCount = devices.length;
                const useFahrenheit = (melCloudInfo.UseFahrenheit === true) ? 1 : 0;
                const temperatureDisplayUnit = CONSTANS.TemperatureDisplayUnits[useFahrenheit];
                const debug2 = debugLog ? this.emit('debug', `Account ${accountName}, Found: ${devicesCount} devices.`) : false;

                for (const deviceInfo of devices) {
                    const buildingId = deviceInfo.BuildingID.toString();
                    const deviceId = deviceInfo.DeviceID.toString();
                    const deviceType = deviceInfo.Type;
                    const deviceName = deviceInfo.DeviceName;
                    const deviceTypeText = CONSTANS.DeviceType[deviceType];

                    //write device info
                    const deviceData = JSON.stringify(deviceInfo, null, 2);
                    const melCloudBuildingDeviceFile = `${prefDir}/${accountName}_Device_${deviceId}`;
                    const writeDeviceInfoData = await fsPromises.writeFile(melCloudBuildingDeviceFile, deviceData);

                    //prepare device if not in devices array
                    if (!devicesId.includes(deviceId)) {
                        devicesId.push(deviceId);
                        this.emit('checkDevicesListComplete', melCloudInfo, contextKey, buildingId, deviceInfo, deviceId, deviceType, deviceName, deviceTypeText, useFahrenheit, temperatureDisplayUnit);
                    }
                }

                this.checkDevicesList();
            } catch (error) {
                this.emit('error', `Account ${accountName}, check devices list error, ${error}, check again in 90s.`);
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
};
module.exports = MELCLOUD;