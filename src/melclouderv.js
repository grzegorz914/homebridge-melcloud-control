import EventEmitter from 'events';
import Functions from './functions.js';
import { ApiUrls, Ventilation } from './constants.js';

class MelCloudErv extends EventEmitter {
    constructor(account, device, defaultTempsFile, melCloudClass) {
        super();
        this.accountTypeMelCloud = account.type === 'melcloud';
        this.logSuccess = account.log?.success;
        this.logWarn = account.log?.warn;
        this.logError = account.log?.error;
        this.logDebug = account.log?.debug;
        this.restFulEnabled = account.restFul?.enable;
        this.mqttEnabled = account.mqtt?.enable;
        this.deviceId = device.id;
        this.defaultTempsFile = defaultTempsFile;

        this.functions = new Functions(this.logWarn, this.logError, this.logDebug)
            .on('warn', warn => this.emit('warn', warn))
            .on('error', error => this.emit('error', error))
            .on('debug', debug => this.emit('debug', debug));

        //set default values
        this.deviceData = {};
        this.client = melCloudClass.client;

        //handle melcloud events
        melCloudClass.on('client', (client) => {
            this.client = client;
        }).on(this.deviceId, async (type, message) => {
            switch (type) {
                case 'ws':
                    try {
                        const deviceData = structuredClone(this.deviceData);
                        const messageType = message.messageType;
                        const messageData = message.Data;
                        const settings = this.functions.parseArrayNameValue(messageData.settings);
                        switch (messageType) {
                            case 'unitStateChanged':

                                //update values
                                for (const [key, value] of Object.entries(settings)) {
                                    if (!this.functions.isValidValue(value)) continue;

                                    //update holiday mode
                                    if (key === 'HolidayMode') {
                                        deviceData.HolidayMode.Enabled = value;
                                        continue;
                                    }

                                    //update device settings
                                    if (key in deviceData.Device) {
                                        deviceData.Device[key] = value;
                                    }
                                }
                                break;
                            case 'ervUnitFrostProtectionTriggered':
                                deviceData.FrostProtection.Active = messageData.active;

                                //update device settings
                                for (const [key, value] of Object.entries(settings)) {
                                    if (!this.functions.isValidValue(value) || key === 'SetTemperature') continue;

                                    if (key in deviceData.Device) {
                                        deviceData.Device[key] = value;
                                    }
                                }
                                break;
                            case 'unitHolidayModeTriggered':
                                deviceData.Device.Power = settings.Power;
                                deviceData.HolidayMode.Enabled = settings.HolidayMode;
                                deviceData.HolidayMode.Active = messageData.active;
                                break;
                            case 'unitWifiSignalChanged':
                                deviceData.Rssi = messageData.rssi;
                                break;
                            case 'unitCommunicationRestored':
                                deviceData.Device.IsConnected = true;
                                break;
                            default:
                                if (this.logDebug) this.emit('debug', `Unit ${this.deviceId}, received unknown message type: ${messageType}`);
                                return;
                        }

                        //update state
                        if (this.logDebug) this.emit('debug', `Web socket update unit ${this.deviceId} settings: ${JSON.stringify(deviceData.Device, null, 2)}`);
                        await this.updateState('ws', deviceData);
                    } catch (error) {
                        if (this.logError) this.emit('error', `Web socket unit ${this.deviceId} process message error: ${error}`);
                    }
                    break;
                case 'request':
                    try {
                        //update device data
                        const deviceData = structuredClone(this.deviceData);
                        Object.assign(deviceData, message);

                        //update state
                        if (this.logDebug) this.emit('debug', `Request update unit ${this.deviceId} settings: ${JSON.stringify(deviceData.Device, null, 2)}`);
                        await this.updateState('request', deviceData);
                    } catch (error) {
                        if (this.logError) this.emit('error', `Request unit ${this.deviceId} process message error: ${error}`);
                    }
                    break;
                default:
                    if (this.logDebug) this.emit('debug', `Unit ${this.deviceId}, received unknown event type: ${type}`);
                    return;
            }
        });
    }

    async updateState(type, deviceData) {
        try {
            if (!this.accountTypeMelCloud) {
                //read default temps
                const temps = await this.functions.readData(this.defaultTempsFile, true);
                deviceData.Device.DefaultHeatingSetTemperature = temps?.defaultHeatingSetTemperature ?? 20;
                deviceData.Device.DefaultCoolingSetTemperature = temps?.defaultCoolingSetTemperature ?? 24;
            }
            if (this.logDebug) this.emit('debug', `Device Data: ${JSON.stringify(deviceData, null, 2)}`);

            //device
            const serialNumber = deviceData.SerialNumber || '4.0.0';
            const firmwareAppVersion = deviceData.Device?.FirmwareAppVersion || '4.0.0';

            //units
            const units = Array.isArray(deviceData.Device?.Units) ? deviceData.Device?.Units : [];
            const unitsCount = units.length;

            const { indoor, outdoor } = units.reduce((acc, unit) => {
                const target = unit.IsIndoor ? 'indoor' : 'outdoor';
                acc[target] = {
                    id: unit.ID,
                    device: unit.Device,
                    serialNumber: unit.SerialNumber ?? 'Undefined',
                    modelNumber: unit.ModelNumber ?? 0,
                    model: unit.Model ?? false,
                    type: unit.UnitType ?? 0
                };
                return acc;
            }, { indoor: {}, outdoor: {} });

            //filter info
            const { Device: _ignored, ...info } = deviceData;

            //check state changes
            const previousState = JSON.stringify(this.deviceData);
            const currentState = JSON.stringify(deviceData);
            if (previousState === currentState) return;
            this.deviceData = deviceData;

            //restFul
            if (this.restFulEnabled) {
                this.emit('restFul', 'info', info);
                this.emit('restFul', 'state', deviceData.Device);
            }

            //mqtt
            if (this.mqttEnabled) {
                this.emit('mqtt', 'Info', info);
                this.emit('mqtt', 'State', deviceData.Device);
            }

            //emit info
            this.emit('deviceInfo', indoor.model, outdoor.model, serialNumber, firmwareAppVersion);

            //emit state 
            this.emit('deviceState', deviceData);

            return true;
        } catch (error) {
            throw new Error(`Check state error: ${error.message}`);
        };
    }

    async send(accountType, displayType, deviceData, payload = {}, flag = null) {
        try {
            let method = null
            let path = '';
            let update = false;
            switch (accountType) {
                case "melcloud":
                    switch (flag) {
                        case 'account':
                            payload = { data: payload.LoginData };
                            path = ApiUrls.Post.UpdateApplicationOptions;
                            break;
                        default:
                            //set target temp based on display mode and ventilation mode
                            switch (displayType) {
                                case 1: //Heather/Cooler
                                    switch (deviceData.Device.VentilationMode) {
                                        case 0: //LOSNAY
                                            payload.setTemperature = deviceData.Device.DefaultHeatingSetTemperature;
                                            break;
                                        case 1: //BYPASS
                                            payload.setTemperature = deviceData.Device.DefaultCoolingSetTemperature;
                                            break;
                                        case 2: //AUTO
                                            const setTemperature = (deviceData.Device.DefaultCoolingSetTemperature + deviceData.Device.DefaultHeatingSetTemperature) / 2;
                                            payload.setTemperature = setTemperature;
                                            break;
                                    };
                                case 2: //Thermostat
                                    payload.setTemperature = deviceData.Device.SetTemperature;
                                    break;
                            };

                            //device state
                            flag = !flag ? Ventilation.EffectiveFlags.Power : Ventilation.EffectiveFlags.Power + flag;
                            payload = this.functions.toPascalCaseKeys({
                                ...payload,
                                power: payload.power !== false,
                                deviceID: deviceData.Device.DeviceID,
                                effectiveFlags: flag,
                                hasPendingCommand: true,
                            });
                            path = ApiUrls.Post.Erv;
                            deviceData.Device = { ...deviceData.Device, ...payload };
                            update = true;
                            break;
                    }

                    if (this.logDebug) this.emit('debug', `Send data: ${JSON.stringify(payload, null, 2)}`);
                    await this.client(path, { method: 'POST', data: payload });

                    if (update) {
                        setTimeout(() => {
                            this.updateState('request', deviceData);
                        }, 500);
                    }
                    return true;
                case "melcloudhome":
                    switch (flag) {
                        case 'holidaymode':
                            payload = {
                                enabled: payload.enabled,
                                startDate: deviceData.HolidayMode.StartDate,
                                endDate: deviceData.HolidayMode.EndDate,
                                units: { ERV: [deviceData.DeviceID] }
                            };
                            method = 'POST';
                            path = ApiUrls.Home.Post.HolidayMode;
                            deviceData.HolidayMode.Enabled = payload.enabled;
                            break;
                        case 'schedule':
                            payload = { enabled: payload.enabled };
                            method = 'PUT';
                            path = ApiUrls.Home.Put.ScheduleEnableDisable.replace('deviceid', deviceData.DeviceID);
                            deviceData.ScheduleEnabled = payload.enabled;
                            break;
                        case 'scene':
                            method = 'PUT';
                            path = `${ApiUrls.Home.Put.SceneEnableDisable.replace('sceneid', payload.id)}/${payload.enabled ? 'enable' : 'disable'}`;
                            const scene = deviceData.Scenes.find(s => s.Id === payload.id);
                            scene.Enabled = payload.enabled;
                            payload = {};
                            break;
                        default:
                            if (displayType === 1 && deviceData.Device.VentilationMode === 2) {
                                payload.setTemperature = (deviceData.Device.DefaultCoolingSetTemperature + deviceData.Device.DefaultHeatingSetTemperature) / 2;

                                if (this.deviceData.Device.DefaultCoolingSetTemperature !== deviceData.Device.DefaultCoolingSetTemperature || this.deviceData.Device.DefaultHeatingSetTemperature !== deviceData.Device.DefaultHeatingSetTemperature) {
                                    const temps = {
                                        defaultCoolingSetTemperature: deviceData.Device.DefaultCoolingSetTemperature,
                                        defaultHeatingSetTemperature: deviceData.Device.DefaultHeatingSetTemperature
                                    };
                                    await this.functions.saveData(this.defaultTempsFile, temps);
                                }
                            }

                            if (payload.setFanSpeed >= 0) payload.setFanSpeed = String(payload.setFanSpeed);
                            if (payload.operationMode >= 0) payload.operationMode = Ventilation.OperationModeMapEnumToString[payload.operationMode];
                            if (payload.ventilationMode >= 0) payload.ventilationMode = Ventilation.VentilationModeMapEnumToString[payload.ventilationMode];

                            deviceData.Device = { ...deviceData.Device, ...payload };
                            method = 'PUT';
                            path = ApiUrls.Home.Put.Erv.replace('deviceid', deviceData.DeviceID);
                            break
                    }

                    if (this.logDebug) this.emit('debug', `Send data: ${JSON.stringify(payload, null, 2)}`);
                    await this.client(path, { method: method, data: payload });
                    return true;
                default:
                    if (this.logWarn) this.emit('warn', `Received unknwn account type: ${accountType}`);
                    return;
            }
        } catch (error) {
            throw new Error(`Send data error: ${error.message}`);
        }
    }
}

export default MelCloudErv;
