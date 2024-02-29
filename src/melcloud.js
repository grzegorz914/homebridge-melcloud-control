"use strict";
const fs = require('fs');
const fsPromises = fs.promises;
const https = require('https');
const axios = require('axios');
const EventEmitter = require('events');
const CONSTANS = require('./constans.json');

class MelCloud extends EventEmitter {
    constructor(prefDir, accountName, user, passwd, language, enableDebugMode, refreshInterval) {
        super();
        this.accountInfoFile = `${prefDir}/${accountName}_Account`;
        const buildingsFile = `${prefDir}/${accountName}_Buildings`;
        const devicesId = [];
        const refreshIntervalSec = refreshInterval / 1000;
        this.refreshInterval = refreshInterval;

        const options = {
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
        const axiosInstanceLogin = axios.create({
            method: 'POST',
            baseURL: CONSTANS.ApiUrls.BaseURL,
            timeout: 25000,
            withCredentials: true,
            maxContentLength: 100000000,
            maxBodyLength: 1000000000,
            httpsAgent: new https.Agent({
                keepAlive: false,
                rejectUnauthorized: false
            })
        });

        this.on('connect', async () => {
            try {
                const accountData = await axiosInstanceLogin(CONSTANS.ApiUrls.ClientLogin, options);
                const account = accountData.data;
                const accountInfo = account.LoginData;
                const contextKey = accountInfo.ContextKey;

                //remove sensitive data
                const config = {
                    ...account.LoginData,
                    ContextKey: 'removed',
                    ClientId: 'removed',
                    Client: 'removed',
                    Name: 'removed',
                    MapLongitude: 'removed',
                    MapLatitude: 'removed'
                };
                const debug = enableDebugMode ? this.emit('debug', `MELCloud Info: ${JSON.stringify(config, null, 2)}`) : false;

                if (contextKey === undefined || contextKey === null) {
                    this.emit('message', `context key: ${contextKey}, missing, reconnect in ${refreshIntervalSec}.`)
                    this.reconnect();
                    return;
                };

                //create axios instance get
                this.axiosInstanceGet = axios.create({
                    method: 'GET',
                    baseURL: CONSTANS.ApiUrls.BaseURL,
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
                    baseURL: CONSTANS.ApiUrls.BaseURL,
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
                await new Promise(resolve => setTimeout(resolve, 500));
                this.emit('checkDevicesList', accountInfo, contextKey);
            } catch (error) {
                this.emit('error', `Login error: ${error}, reconnect in  ${refreshIntervalSec}s.`);
                this.reconnect();
            };
        }).on('checkDevicesList', async () => {
            const debug = enableDebugMode ? this.emit('debug', `Scanning for devices.`) : false;

            try {
                const listDevicesData = await this.axiosInstanceGet(CONSTANS.ApiUrls.ListDevices);
                const buildingsList = listDevicesData.data;
                const debug1 = enableDebugMode ? this.emit('debug', `Buildings: ${JSON.stringify(buildingsList, null, 2)}`) : false;

                if (!buildingsList) {
                    this.emit('message', `No building found, check again in ${refreshIntervalSec}s.`);
                    this.checkDevicesList();
                    return;
                }

                //save buildings to the file
                await this.saveData(buildingsFile, buildingsList);
                const debug = enableDebugMode ? this.emit('debug', `Buildings list saved.`) : false;

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
                    this.emit('message', `No devices found, check again in: ${refreshIntervalSec}s.`);
                    this.checkDevicesList();
                    return;
                }
                const debug2 = enableDebugMode ? this.emit('debug', `Found: ${devicesCount} devices.`) : false;

                //get device info fom devices
                for (const deviceInfo of devices) {
                    const deviceId = deviceInfo.DeviceID.toString();
                    const deviceName = deviceInfo.DeviceName;

                    //save every device info to the file
                    const deviceInfoFile = `${prefDir}/${accountName}_Device_${deviceId}`;
                    await this.saveData(deviceInfoFile, deviceInfo);
                    const debug = enableDebugMode ? this.emit('debug', `Device: ${deviceName} info saved.`) : false;

                    //prepare device if not in devices array
                    await new Promise(resolve => setTimeout(resolve, 350));
                    if (!devicesId.includes(deviceId)) {
                        this.emit('checkDevicesListComplete', this.accountInfo, this.contextKey, deviceInfo);
                        devicesId.push(deviceId);
                    }
                }

                this.checkDevicesList();
            } catch (error) {
                this.emit('error', `Check devices list error: ${error}, check again in: ${refreshIntervalSec}s.`);
                this.reconnect();
            };
        })
        this.emit('connect');
    };

    async reconnect() {
        await new Promise(resolve => setTimeout(resolve, this.refreshInterval));
        this.emit('connect');
    };

    async checkDevicesList() {
        await new Promise(resolve => setTimeout(resolve, this.refreshInterval));
        this.emit('checkDevicesList');
    };

    saveData(path, data) {
        return new Promise(async (resolve, reject) => {
            try {
                await fsPromises.writeFile(path, JSON.stringify(data, null, 2));
                resolve();
            } catch (error) {
                reject(`Save data to path: ${path}, error: ${error}`);
            }
        });
    }

    send(accountInfo) {
        return new Promise(async (resolve, reject) => {
            try {
                const options = {
                    data: accountInfo
                };

                await this.axiosInstancePost(CONSTANS.ApiUrls.UpdateApplicationOptions, options);
                await this.saveData(this.accountInfoFile, accountInfo);

                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = MelCloud;