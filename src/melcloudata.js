import EventEmitter from 'events';
import Functions from './functions.js';
import { ApiUrls, AirConditioner } from './constants.js';

class MelCloudAta extends EventEmitter {
    constructor(account, device, defaultTempsFile, melCloudClass) {
        super();
        this.accountTypeMelcloud = account.type === 'melcloud';
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
                            case 'ataUnitFrostProtectionTriggered':
                                deviceData.FrostProtection.Active = messageData.active;

                                //update device settings
                                for (const [key, value] of Object.entries(settings)) {
                                    if (!this.functions.isValidValue(value) || key === 'SetTemperature') continue;

                                    if (key in deviceData.Device) {
                                        deviceData.Device[key] = value;
                                    }
                                }
                                break;
                            case 'ataUnitOverheatProtectionTriggered':
                                deviceData.OverheatProtection.Active = messageData.active;

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
                        if (this.logDebug) this.emit('debug', `Web socket update unit ${this.deviceId}settings: ${JSON.stringify(deviceData.Device, null, 2)}`);
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
            if (!this.accountTypeMelcloud) {
                if (type === 'ws') {
                    deviceData.Device.OperationMode = AirConditioner.OperationModeMapEnumToEnumWs[deviceData.Device.OperationMode] ?? deviceData.Device.OperationMode;
                    deviceData.Device.VaneHorizontalDirection = AirConditioner.VaneHorizontalDirectionMapEnumToEnumWs[deviceData.Device.VaneHorizontalDirection] ?? deviceData.Device.VaneHorizontalDirection;
                    deviceData.Device.VaneVerticalDirection = AirConditioner.VaneVerticalDirectionMapEnumToEnumWs[deviceData.Device.VaneVerticalDirection] ?? deviceData.Device.VaneVerticalDirection;
                } else {
                    deviceData.Device.OperationMode = AirConditioner.OperationModeMapStringToEnum[deviceData.Device.OperationMode] ?? deviceData.Device.OperationMode;
                    deviceData.Device.ActualFanSpeed = AirConditioner.AktualFanSpeedMapStringToEnum[deviceData.Device.ActualFanSpeed] ?? deviceData.Device.ActualFanSpeed;
                    deviceData.Device.SetFanSpeed = AirConditioner.SetFanSpeedMapStringToEnum[deviceData.Device.SetFanSpeed] ?? deviceData.Device.SetFanSpeed;
                    deviceData.Device.VaneHorizontalDirection = AirConditioner.VaneHorizontalDirectionMapStringToEnum[deviceData.Device.VaneHorizontalDirection] ?? deviceData.Device.VaneHorizontalDirection;
                    deviceData.Device.VaneVerticalDirection = AirConditioner.VaneVerticalDirectionMapStringToEnum[deviceData.Device.VaneVerticalDirection] ?? deviceData.Device.VaneVerticalDirection;
                }

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
            throw new Error(`Update state error: ${error.message}`);
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
                            if (displayType === 1 && deviceData.Device.OperationMode === 8) {
                                payload.setTemperature = (deviceData.Device.DefaultCoolingSetTemperature + deviceData.Device.DefaultHeatingSetTemperature) / 2;
                            }

                            flag = !flag ? AirConditioner.EffectiveFlags.Power : AirConditioner.EffectiveFlags.Power + flag;
                            payload = this.functions.toPascalCaseKeys({
                                ...payload,
                                power: payload.power !== false,
                                deviceID: deviceData.Device.DeviceID,
                                effectiveFlags: flag,
                                hasPendingCommand: true,
                            });

                            path = ApiUrls.Post.Ata;
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
                        case 'frostprotection':
                            payload = {
                                enabled: payload.enabled,
                                min: payload.min,
                                max: payload.max,
                                units: { ATA: [deviceData.DeviceID] }
                            };
                            method = 'POST';
                            path = ApiUrls.Home.Post.ProtectionFrost;
                            deviceData.FrostProtection.Enabled = payload.enabled;
                            deviceData.FrostProtection.Min = payload.min;
                            deviceData.FrostProtection.Max = payload.max;
                            break;
                        case 'overheatprotection':
                            payload = {
                                enabled: payload.enabled,
                                min: payload.min,
                                max: payload.max,
                                units: { ATA: [deviceData.DeviceID] }
                            };
                            method = 'POST';
                            path = ApiUrls.Home.Post.ProtectionOverheat;
                            deviceData.OverheatProtection.Enabled = payload.enabled;
                            deviceData.OverheatProtection.Min = payload.min;
                            deviceData.OverheatProtection.Max = payload.max;
                            break;
                        case 'holidaymode':
                            payload = {
                                enabled: payload.enabled,
                                startDate: deviceData.HolidayMode.StartDate,
                                endDate: deviceData.HolidayMode.EndDate,
                                units: { ATA: [deviceData.DeviceID] }
                            };
                            method = 'POST';
                            path = ApiUrls.Home.Post.HolidayMode;
                            deviceData.HolidayMode.Enabled = payload.enabled;
                            break;
                        case 'schedule':
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
                            if (displayType === 1 && deviceData.Device.OperationMode === 8) {
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
                            if (payload.operationMode >= 0) payload.operationMode = AirConditioner.OperationModeMapEnumToString[payload.operationMode];
                            if (payload.vaneHorizontalDirection >= 0) payload.vaneHorizontalDirection = AirConditioner.VaneHorizontalDirectionMapEnumToString[payload.vaneHorizontalDirection];
                            if (payload.vaneVerticalDirection >= 0) payload.vaneVerticalDirection = AirConditioner.VaneVerticalDirectionMapEnumToString[payload.vaneVerticalDirection];

                            deviceData.Device = { ...deviceData.Device, ...payload };
                            method = 'PUT';
                            path = ApiUrls.Home.Put.Ata.replace('deviceid', deviceData.DeviceID);
                            break;
                    }

                    //send payload
                    if (!this.logDebug) this.emit('debug', `Send data: ${JSON.stringify(payload, null, 2)}`);
                    await this.client(path, { method: method, data: payload });
                    return true;
                default:
                    if (this.logWarn) this.emit('warn', `Received unknwn account type: ${accountType}`);
                    return;
            }
        } catch (error) {
            if (error.response?.status === 500) return;
            throw new Error(`Send data error: ${error.message}`);
        }
    }
}

export default MelCloudAta;
