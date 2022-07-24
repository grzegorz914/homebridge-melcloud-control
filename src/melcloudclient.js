const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const axios = require('axios');
const API_URL = require('./apiurl.json');
const CONSTANS = require('./constans.json');

class MELCLOUDCLIENT extends EventEmitter {
    constructor(config) {
        super();
        const accountName = config.name;
        const user = config.user;
        const passwd = config.passwd;
        const language = config.language;
        const debugLog = config.debugLog;
        const melCloudInfoFile = config.melCloudInfoFile;
        const melCloudBuildingsFile = config.melCloudBuildingsFile;

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
                        Persist: 'true'
                    }
                };

                try {
                    const loginData = await this.axiosInstanceLogin(API_URL.ClientLogin, options);
                    const melCloudInfoData = JSON.stringify(loginData.data, null, 2);
                    const debug = debugLog ? this.emit('debug', `Account: ${accountName}, debug melCloudInfo: ${melCloudInfoData}`) : false;
                    const writeMelCloudInfoData = await fsPromises.writeFile(melCloudInfoFile, melCloudInfoData);

                    this.melCloudInfo = loginData.data.LoginData;
                    this.contextKey = loginData.data.LoginData.ContextKey;

                    const debug1 = debugLog ? this.emit('message', `Account: ${accountName}, Connected.`) : false;
                    this.emit('checkDevicesList');
                } catch (error) {
                    this.emit('error', `Account: ${accountName}, login error: ${error}`);
                };
            })
            .on('checkDevicesList', async () => {
                const melCloudInfo = this.melCloudInfo;
                const contextKey = this.contextKey;

                const debug = debugLog ? this.emit('message', `Account: ${accountName}, Scanning for devices.`) : false;
                this.axiosInstanceGet = axios.create({
                    method: 'GET',
                    baseURL: API_URL.BaseURL,
                    headers: {
                        'X-MitsContextKey': contextKey
                    }
                });

                try {
                    const listDevicesData = await this.axiosInstanceGet(API_URL.ListDevices);
                    const buildingsData = JSON.stringify(listDevicesData.data, null, 2);
                    const debug1 = debugLog ? this.emit('debug', `Account: ${accountName}, debug buildings: ${buildingsData}`) : false;
                    const writeDevicesData = await fsPromises.writeFile(melCloudBuildingsFile, buildingsData);


                    //read building structure and get the devices
                    const buildings = new Array();
                    const buildingsStructure = new Array();
                    const buildingsAreas = new Array();
                    const floors = new Array();
                    const floorsAreas = new Array();
                    const devices = new Array();

                    const buildingsList = listDevicesData.data;
                    const buildingsCount = buildingsList.length;
                    for (let i = 0; i < buildingsCount; i++) {
                        const building = buildingsList[i];
                        const buildingStructure = building.Structure;
                        buildings.push(building);
                        buildingsStructure.push(buildingStructure);

                        //floors
                        const floorsCount = buildingStructure.Floors.length;
                        for (let j = 0; j < floorsCount; j++) {
                            const floor = buildingStructure.Floors[j];
                            floors.push(floor);

                            //floor areas
                            const florAreasCount = floor.Areas.length;
                            for (let l = 0; l < florAreasCount; l++) {
                                const florArea = floor.Areas[l];
                                floorsAreas.push(florArea);

                                //floor areas devices
                                const florAreaDevicesCount = florArea.Devices.length;
                                for (let m = 0; m < florAreaDevicesCount; m++) {
                                    const floorAreaDevice = florArea.Devices[m];
                                    devices.push(floorAreaDevice);
                                };
                            };

                            //floor devices
                            const floorDevicesCount = floor.Devices.length;
                            for (let k = 0; k < floorDevicesCount; k++) {
                                const floorDevice = floor.Devices[k];
                                devices.push(floorDevice);
                            };
                        };

                        //building areas
                        const buildingAreasCount = buildingStructure.Areas.length;
                        for (let n = 0; n < buildingAreasCount; n++) {
                            const buildingArea = buildingStructure.Areas[n];
                            buildingsAreas.push(buildingArea);
                        };

                        //building devices
                        const buildingDevicesCount = buildingStructure.Devices.length;
                        for (let p = 0; p < buildingDevicesCount; p++) {
                            const buildingDevice = buildingStructure.Devices[p];
                            devices.push(buildingDevice);
                        };
                    };

                    const devicesCount = devices.length;
                    const useFahrenheit = (melCloudInfo.UseFahrenheit == true) ? 1 : 0;
                    const temperatureDisplayUnit = CONSTANS.TemperatureDisplayUnits[useFahrenheit];
                    
                    const debug2 = debugLog ? this.emit('message', `Account: ${accountName}, Found devices: ${devicesCount}.`) : false;
                    this.emit('connected', melCloudInfo, contextKey, devices, devicesCount, useFahrenheit, temperatureDisplayUnit);
                } catch (error) {
                    this.emit('error', `Account: ${accountName}, Update devices list error: ${error}`);
                };
            })
        this.emit('connect');
    };
};
module.exports = MELCLOUDCLIENT;