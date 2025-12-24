import EventEmitter from 'events';
import Functions from './functions.js';
import { ApiUrls, AirConditioner } from './constants.js';

class MelCloudAta extends EventEmitter {
    constructor(account, device, defaultTempsFile, accountFile, melcloud) {
        super();
        this.accountType = account.type;
        this.logSuccess = account.log?.success;
        this.logWarn = account.log?.warn;
        this.logError = account.log?.error;
        this.logDebug = account.log?.debug;
        this.restFulEnabled = account.restFul?.enable;
        this.mqttEnabled = account.mqtt?.enable;
        this.deviceId = device.id;
        this.defaultTempsFile = defaultTempsFile;
        this.accountFile = accountFile;

        this.functions = new Functions(this.logWarn, this.logError, this.logDebug)
            .on('warn', warn => this.emit('warn', warn))
            .on('error', error => this.emit('error', error))
            .on('debug', debug => this.emit('debug', debug));

        //set default values
        this.deviceData = {};
        this.client = melcloud.client;
        this.lock = false;

        //handle melcloud events
        let deviceData = null;
        melcloud.on('client', (client) => {
            this.client = client;
        }).on('devicesList', async (devicesData) => {
            try {
                deviceData = devicesData.Devices.find(device => device.DeviceID === this.deviceId);
                if (!deviceData) return;
                deviceData.Scenes = devicesData.Scenes ?? [];

                //update state
                if (this.logDebug) this.emit('debug', `Request update settings: ${JSON.stringify(deviceData.Device, null, 2)}`);
                await this.updateState('request', deviceData);
            } catch (error) {
                if (this.logError) this.emit('error', `Request process message error: ${error}`);
            }
        }).on('webSocket', async (parsedMessage) => {
            try {
                const messageData = parsedMessage?.[0]?.Data;
                if (!messageData || !deviceData) return;

                let updateState = false;
                const unitId = messageData?.id;
                switch (unitId) {
                    case this.deviceId:
                        const messageType = parsedMessage[0].messageType;
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

                                updateState = true;
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

                                updateState = true;
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

                                updateState = true;
                                break;
                            case 'unitHolidayModeTriggered':
                                deviceData.Device.Power = settings.Power;
                                deviceData.HolidayMode.Enabled = settings.HolidayMode;
                                deviceData.HolidayMode.Active = messageData.active;
                                updateState = true;
                                break;
                            case 'unitWifiSignalChanged':
                                deviceData.Rssi = messageData.rssi;
                                updateState = true;
                                break;
                            case 'unitCommunicationRestored':
                                deviceData.Device.IsConnected = true;
                                break;
                            default:
                                if (this.logDebug) this.emit('debug', `Unit ${unitId}, received unknown message type: ${parsedMessage}`);
                                return;
                        }
                        break;
                    default:
                        return;
                }

                //update state
                if (updateState) await this.updateState('ws', deviceData);
            } catch (error) {
                if (this.logError) this.emit('error', `Web socket process message error: ${error}`);
            }
        });
    }

    async updateState(type, deviceData) {
        try {
            if (this.accountType === 'melcloudhome') {
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

            //check state changes
            const deviceDataNotChanged = JSON.stringify(deviceData) === JSON.stringify(this.deviceData);
            if (deviceDataNotChanged) return;
            this.deviceData = deviceData;

            //emit info
            this.emit('deviceInfo', indoor.model, outdoor.model, serialNumber, firmwareAppVersion);

            //emit state
            this.emit('deviceState', deviceData);

            return true;
        } catch (error) {
            throw new Error(`Update state error: ${error.message}`);
        };
    }

    async checkState(devicesData) {
        try {
            const deviceData = devicesData.Devices.find(device => device.DeviceID === this.deviceId);
            deviceData.Scenes = devicesData.Scenes ?? [];
            await this.updateState('request', deviceData);

            return true;
        } catch (error) {
            throw new Error(`Chaeck state error: ${error.message}`);
        };
    }

    async send(accountType, displayType, deviceData, flag, flagData) {
        try {
            let method = null
            let payload = {};
            let path = '';
            let update = false;
            switch (accountType) {
                case "melcloud":
                    switch (flag) {
                        case 'account':
                            flagData.Account.LoginData.UseFahrenheit = flagData.UseFahrenheit;
                            payload = { data: flagData.LoginData };
                            path = ApiUrls.Post.UpdateApplicationOptions;
                            await this.functions.saveData(this.accountFile, flagData);
                            break;
                        default:
                            if (displayType === 1 && deviceData.Device.OperationMode === 8) {
                                deviceData.Device.SetTemperature = (deviceData.Device.DefaultCoolingSetTemperature + deviceData.Device.DefaultHeatingSetTemperature) / 2;
                            }
                            deviceData.Device.EffectiveFlags = flag;
                            payload = {
                                DeviceID: deviceData.Device.DeviceID,
                                EffectiveFlags: deviceData.Device.EffectiveFlags,
                                Power: deviceData.Device.Power,
                                SetTemperature: deviceData.Device.SetTemperature,
                                SetFanSpeed: deviceData.Device.FanSpeed,
                                OperationMode: deviceData.Device.OperationMode,
                                VaneHorizontal: deviceData.Device.VaneHorizontalDirection,
                                VaneVertical: deviceData.Device.VaneVerticalDirection,
                                DefaultHeatingSetTemperature: deviceData.Device.DefaultHeatingSetTemperature,
                                DefaultCoolingSetTemperature: deviceData.Device.DefaultCoolingSetTemperature,
                                ProhibitSetTemperature: deviceData.Device.ProhibitSetTemperature,
                                ProhibitOperationMode: deviceData.Device.ProhibitOperationMode,
                                ProhibitPower: deviceData.Device.ProhibitPower,
                                HideVaneControls: deviceData.HideVaneControls,
                                HideDryModeControl: deviceData.HideDryModeControl,
                                HasPendingCommand: true
                            };
                            path = ApiUrls.Post.Ata;
                            update = true;
                            break;
                    }

                    if (this.logDebug) this.emit('debug', `Send data: ${JSON.stringify(payload, null, 2)}`);
                    await this.client(path, { method: 'POST', data: payload });

                    if (update) {
                        setTimeout(() => {
                            this.emit('deviceState', deviceData);
                        }, 500);
                    }
                    return true;
                case "melcloudhome":
                    switch (flag) {
                        case 'frostprotection':
                            payload = {
                                enabled: deviceData.FrostProtection.Enabled,
                                min: deviceData.FrostProtection.Min,
                                max: deviceData.FrostProtection.Max,
                                units: { ATA: [deviceData.DeviceID] }
                            };
                            method = 'POST';
                            path = ApiUrls.Home.Post.ProtectionFrost;
                            update = true;
                            break;
                        case 'overheatprotection':
                            payload = {
                                enabled: deviceData.OverheatProtection.Enabled,
                                min: deviceData.OverheatProtection.Min,
                                max: deviceData.OverheatProtection.Max,
                                units: { ATA: [deviceData.DeviceID] }
                            };
                            method = 'POST';
                            path = ApiUrls.Home.Post.ProtectionOverheat;
                            update = true;
                            break;
                        case 'holidaymode':
                            payload = {
                                enabled: deviceData.HolidayMode.Enabled,
                                startDate: deviceData.HolidayMode.StartDate,
                                endDate: deviceData.HolidayMode.EndDate,
                                units: { ATA: [deviceData.DeviceID] }
                            };
                            method = 'POST';
                            path = ApiUrls.Home.Post.HolidayMode;
                            break;
                        case 'schedule':
                            payload = { enabled: deviceData.ScheduleEnabled };
                            method = 'PUT';
                            path = ApiUrls.Home.Put.ScheduleEnableDisable.Home.replace('deviceid', deviceData.DeviceID);
                            update = true;
                            break;
                        case 'scene':
                            method = 'PUT';
                            path = `${ApiUrls.Home.Put.SceneEnableDisable.replace('sceneid', flagData.Id)}${flagData.Enabled ? 'enable' : 'disable'}`;
                            break;
                        default:
                            if (displayType === 1 && deviceData.Device.OperationMode === 8) {
                                deviceData.Device.SetTemperature = (deviceData.Device.DefaultCoolingSetTemperature + deviceData.Device.DefaultHeatingSetTemperature) / 2;

                                if (this.deviceData.Device.DefaultCoolingSetTemperature !== deviceData.Device.DefaultCoolingSetTemperature || this.deviceData.Device.DefaultHeatingSetTemperature !== deviceData.Device.DefaultHeatingSetTemperature) {
                                    const temps = {
                                        defaultCoolingSetTemperature: deviceData.Device.DefaultCoolingSetTemperature,
                                        defaultHeatingSetTemperature: deviceData.Device.DefaultHeatingSetTemperature
                                    };
                                    await this.functions.saveData(this.defaultTempsFile, temps);
                                }
                            }

                            payload = {
                                power: deviceData.Device.Power,
                                setTemperature: deviceData.Device.SetTemperature,
                                setFanSpeed: String(deviceData.Device.SetFanSpeed),
                                operationMode: AirConditioner.OperationModeMapEnumToString[deviceData.Device.OperationMode],
                                vaneHorizontalDirection: AirConditioner.VaneHorizontalDirectionMapEnumToString[deviceData.Device.VaneHorizontalDirection],
                                vaneVerticalDirection: AirConditioner.VaneVerticalDirectionMapEnumToString[deviceData.Device.VaneVerticalDirection],
                                temperatureIncrementOverride: null,
                                inStandbyMode: null
                            };
                            method = 'PUT';
                            path = ApiUrls.Home.Put.Ata.replace('deviceid', deviceData.DeviceID);
                            break;
                    }

                    //send payload
                    if (this.logDebug) this.emit('debug', `Send data: ${JSON.stringify(payload, null, 2)}`);
                    await this.client(path, { method: method, data: payload });

                    if (update) {
                        setTimeout(() => {
                            this.emit('deviceState', deviceData);
                        }, 500);
                    }
                    return true;
                default:
                    return;
            }
        } catch (error) {
            throw new Error(`Send data error: ${error.message}`);
        }
    }
}

export default MelCloudAta;
