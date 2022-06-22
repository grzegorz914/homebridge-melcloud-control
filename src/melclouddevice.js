const EventEmitter = require('events');
const axios = require('axios');
const API_URL = require('./apiurl.json');
const CONSTANS = require('./src/constans.json');


class MELCLOUDDEVICE extends EventEmitter {
    constructor(config) {
        super();
        const contextKey = config.contextKey;
        const devices = config.devices;
        const devicesCount = config.devicesCount;
        const debugLog = config.debugLog;
        const mqttEnabled = config.enableMqtt;
        this.startPrepareAccessory = true;

        this.axiosInstanceGet = axios.create({
            method: 'GET',
            baseURL: API_URL.BaseURL,
            headers: {
                'X-MitsContextKey': contextKey,
            }
        });
        this.axiosInstancePost = axios.create({
            method: 'GET',
            baseURL: API_URL.BaseURL,
            headers: {
                'X-MitsContextKey': contextKey,
            }
        });

        this.on('checkDeviceState', async () => {
            for (let i = 0; i < devicesCount; i++) {
                const deviceInfo = devices[i];
                const buildingId = deviceInfo.BuildingID;
                const deviceId = deviceInfo.DeviceID;
                const deviceName = deviceInfo.DeviceName;
                const deviceType = deviceInfo.Type;
                const deviceTypeText = CONSTANS.DeviceType[deviceType];
                const mqtt = mqttEnabled ? this.emit('mqtt', `Device: ${deviceName}, Info:`, deviceInfo) : false;

                try {
                    const deviceUrl = API_URL.DeviceState.replace("DID", deviceId).replace("BID", buildingId);
                    const data = await this.axiosInstanceGet(deviceUrl);
                    const deviceState = data.data;
                    const deviceStateData = JSON.stringify(deviceState, null, 2);
                    const debug = debugLog ? this.emit('debug', `${deviceTypeText}: ${deviceName}, debug deviceState: ${deviceStateData}`) : false;

                    const emitDeviceInfo = this.startPrepareAccessory ? this.emit('deviceInfo', deviceInfo) : false;

                    this.emit('deviceState', deviceState, this.startPrepareAccessory);
                    this.startPrepareAccessory = false;
                    const mqtt1 = mqttEnabled ? this.emit('mqtt', `Device: ${deviceName}, State:`, deviceState) : false;
                } catch (error) {
                    this.emit('debug', `Check device error: ${error}`);
                };
            }
        })

        this.emit('checkDeviceState');
    };

    refreshDeviceState() {
        setInterval(() => {
            this.emit('checkDeviceState');
        }, 60000);
    };

    send(url, newData, type) {
        return new Promise(async (resolve, reject) => {
            newData = (type == 0) ? newData.HasPendingCommand = true : newData;
            const options = {
                data: newData
            }
            try {
                const newState = await this.axiosInstancePost(url, options);
                resolve(true);
            } catch (error) {
                this.emit('error', `Send command error: ${error}`);
                reject(error);
            };
        });
    };
};
module.exports = MELCLOUDDEVICE;