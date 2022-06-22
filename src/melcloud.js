const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const axios = require('axios');
const API_URL = require('./apiurl.json');

class MELCLOUD extends EventEmitter {
    constructor(config) {
        super();
        const accountName = config.name;
        const user = config.user;
        const passwd = config.passwd;
        const language = config.language;
        const debugLog = config.debugLog;
        const melCloudInfoFile = config.melCloudInfoFile;
        const melCloudBuildingsFile = config.melCloudBuildingsFile;
        const melCloudDevicesFile = config.melCloudDevicesFile;
        const mqttEnabled = config.enableMqtt;

        this.axiosInstanceLogin = axios.create({
            method: 'POST',
            baseURL: API_URL.BaseURL
        });


        this.on('connect', async () => {
                const options = {
                    data: {
                        AppVersion: '1.22.10.0',
                        CaptchaChallenge: '',
                        CaptchaResponse: '',
                        Email: user,
                        Password: passwd,
                        Language: language,
                        Persist: 'true',
                    }
                };

                try {
                    const data = await this.axiosInstanceLogin(API_URL.ClientLogin, options);
                    const melCloudInfo = data.data;
                    const melCloudInfoData = JSON.stringify(melCloudInfo, null, 2);
                    const debug = debugLog ? this.emit('debug', `Account: ${accountName}, debug melCloudInfo: ${melCloudInfoData}`) : false;
                    const writeMelCloudInfoData = await fsPromises.writeFile(melCloudInfoFile, melCloudInfoData);

                    const melCloudData = melCloudInfoData.data;
                    const contextKey = melCloudData.LoginData.ContextKey;

                    this.emit('mesasage', `Account: ${accountName}, Connected.`);
                    this.emit('checkDevicesList', melCloudInfo, contextKey);
                    const mqtt = mqttEnabled ? this.emit('mqtt', `Account Info:`, melCloudInfoData) : false;
                } catch (error) {
                    this.emit('error', `Account: ${this.accountName}, login error: ${error}`);
                };
            })
            .on('checkDevicesList', async (melCloudInfo, contextKey) => {
                this.buildings = new Array();
                this.buildingsAreas = new Array();
                this.floors = new Array();
                this.florsAreas = new Array();
                this.devices = new Array();

                this.axiosInstanceGet = axios.create({
                    method: 'GET',
                    baseURL: API_URL.BaseURL,
                    headers: {
                        'X-MitsContextKey': contextKey,
                    }
                });

                try {
                    const data = await this.axiosInstanceGet(API_URL.ListDevices);
                    const buildings = data.data;
                    const buildingsData = JSON.stringify(buildings, null, 2);
                    const debug = debugLog ? this.emit('debug', `Account: ${accountName}, debug buildings: ${buildingsData}`) : false;
                    const writeBuildingsData = await fsPromises.writeFile(melCloudBuildingsFile, buildingsData);

                    //read building structure and get the devices
                    const buildingsCount = buildings.length;
                    for (let i = 0; i < buildingsCount; i++) {
                        const building = buildings[i].Structure;
                        this.buildings.push(building);

                        if (building.Devices) {
                            const devicesCount = building.Devices.length;
                            for (let j = 0; j < devicesCount; j++) {
                                const device = building.Devices[j];
                                this.devices.push(device);
                            };
                        };

                        const floorsCount = building.Floors.length;
                        for (let k = 0; k < floorsCount; k++) {
                            const flor = building.Floors[k];
                            this.floors.push(flor);

                            if (flor.Devices) {
                                const devicesCount = flor.Devices.length;
                                for (let l = 0; l < devicesCount; l++) {
                                    const device = flor.Devices[l];
                                    this.devices.push(device);
                                };
                            };

                            const florAreasCount = flor.Areas.length;
                            for (let m = 0; m < florAreasCount; m++) {
                                const florArea = flor.Areas[m];
                                this.florsAreas.push(florArea);

                                if (florArea.Devices) {
                                    const devicesCount = florArea.Devices.length;
                                    for (let n = 0; n < devicesCount; n++) {
                                        const device = florArea.Devices[n];
                                        this.devices.push(device);
                                    };
                                };
                            };
                        };

                        if (building.Areas) {
                            const buildingsAreasCount = building.Areas.length;
                            for (let o = 0; o < buildingsAreasCount; o++) {
                                const buildingArea = building.Areas[o];
                                this.buildingsAreas.push(buildingArea);

                                if (buildingArea.Devices) {
                                    const devicesCount = buildingArea.Devices.length;
                                    for (let p = 0; p < devicesCount; p++) {
                                        const device = buildingArea.Devices[p];
                                        this.devices.push(device);
                                    };
                                };
                            };
                        };
                    };

                    const devicesList = this.devices;
                    const devicesCount = devicesList.length;
                    const devicesListData = JSON.stringify(devicesList, null, 2);
                    const writeDevicesDevicesListData = await fsPromises.writeFile(melCloudDevicesFile, devicesListData);

                    this.emit('connected', melCloudInfo, contextKey, devicesList, devicesCount);
                    const mqtt = mqttEnabled ? this.emit('mqtt', 'mqtt', `Devices List:`, devicesListData) : false;
                } catch (error) {
                    this.emit('error', `Account: ${accountName}, Update devices list error: ${error}`);
                };
            })
        this.emit('connect');
    };
};
module.exports = MELCLOUD;