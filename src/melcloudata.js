import axios from 'axios';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import Functions from './functions.js';
import { ApiUrls, ApiUrlsHome, AirConditioner } from './constants.js';

class MelCloudAta extends EventEmitter {
    constructor(account, device, devicesFile, defaultTempsFile) {
        super();
        this.accountType = account.type;
        this.logWarn = account.log?.warn;
        this.logError = account.log?.error;
        this.logDebug = account.log?.debug;
        this.restFulEnabled = account.restFul?.enable;
        this.mqttEnabled = account.mqtt?.enable;
        this.deviceId = device.id;
        this.devicesFile = devicesFile;
        this.defaultTempsFile = defaultTempsFile;
        this.functions = new Functions(this.logWarn, this.logError, this.logDebug)
            .on('warn', warn => this.emit('warn', warn))
            .on('error', error => this.emit('error', error))
            .on('debug', debug => this.emit('debug', debug));

        //set default values
        this.deviceData = {};

        //lock flag
        this.locks = true;
        this.impulseGenerator = new ImpulseGenerator()
            .on('checkState', () => this.handleWithLock(async () => {
                await this.checkState();
            }))
            .on('state', (state) => {
                this.emit(state ? 'success' : 'warn', `Impulse generator ${state ? 'started' : 'stopped'}`);
            });
    }

    async handleWithLock(fn) {
        if (this.locks) return;

        this.locks = true;
        try {
            await fn();
        } catch (error) {
            this.emit('error', `Inpulse generator error: ${error}`);
        } finally {
            this.locks = false;
        }
    }

    async checkState() {
        try {
            //read device info from file
            const devicesData = await this.functions.readData(this.devicesFile, true);
            const scenes = devicesData.Scenes ?? [];
            const deviceData = devicesData.Devices.find(device => device.DeviceID === this.deviceId);

            if (this.accountType === 'melcloudhome') {
                deviceData.Scenes = scenes;
                deviceData.Device.OperationMode = AirConditioner.OperationModeMapStringToEnum[deviceData.Device.OperationMode] ?? deviceData.Device.OperationMode;
                deviceData.Device.ActualFanSpeed = AirConditioner.FanSpeedMapStringToEnum[deviceData.Device.ActualFanSpeed] ?? deviceData.Device.ActualFanSpeed;
                deviceData.Device.SetFanSpeed = AirConditioner.FanSpeedMapStringToEnum[deviceData.Device.SetFanSpeed] ?? deviceData.Device.SetFanSpeed;
                deviceData.Device.VaneVerticalDirection = AirConditioner.VaneVerticalDirectionMapStringToEnum[deviceData.Device.VaneVerticalDirection] ?? deviceData.Device.VaneVerticalDirection;
                deviceData.Device.VaneHorizontalDirection = AirConditioner.VaneHorizontalDirectionMapStringToEnum[deviceData.Device.VaneHorizontalDirection] ?? deviceData.Device.VaneHorizontalDirection;

                //read default temps
                const temps = await this.functions.readData(this.defaultTempsFile, true);
                deviceData.Device.DefaultHeatingSetTemperature = temps?.defaultHeatingSetTemperature ?? 20;
                deviceData.Device.DefaultCoolingSetTemperature = temps?.defaultCoolingSetTemperature ?? 24;
            }

            const safeConfig = {
                ...deviceData,
                Headers: 'removed',
            };
            if (this.logDebug) this.emit('debug', `Device Data: ${JSON.stringify(safeConfig, null, 2)}`);

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

            //display info if units are not configured in MELCloud service
            if (unitsCount === 0 && this.logDebug) if (this.logDebug) this.emit('debug', `Units are not configured in MELCloud service`);

            //restFul
            if (this.restFulEnabled) {
                this.emit('restFul', 'info', deviceData);
                this.emit('restFul', 'state', deviceData.Device);
            }

            //mqtt
            if (this.mqttEnabled) {
                this.emit('mqtt', 'Info', deviceData);
                this.emit('mqtt', 'State', deviceData.Device);
            }

            //check state changes
            const deviceDataHasNotChanged = JSON.stringify(deviceData) === JSON.stringify(this.deviceData);
            if (deviceDataHasNotChanged) return;
            this.deviceData = deviceData;

            //emit info
            this.emit('deviceInfo', indoor.model, outdoor.model, serialNumber, firmwareAppVersion);

            //emit state
            this.emit('deviceState', deviceData);

            return true;
        } catch (error) {
            throw new Error(`Check state error: ${error.message}`);
        };
    };

    async send(accountType, displayType, deviceData, flag, flagData) {
        try {
            let method = null
            let payload = {};
            let path = '';
            switch (accountType) {
                case "melcloud":

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

                    if (this.logDebug) this.emit('debug', `Send Data: ${JSON.stringify(payload, null, 2)}`);
                    await axios(ApiUrls.SetAta, {
                        method: 'POST',
                        baseURL: ApiUrls.BaseURL,
                        timeout: 10000,
                        headers: deviceData.Headers,
                        data: payload
                    });
                    this.updateData(deviceData);
                    return true;
                case "melcloudhome":
                    if (displayType === 1 && deviceData.Device.OperationMode === 8) {
                        deviceData.Device.SetTemperature = (deviceData.Device.DefaultCoolingSetTemperature + deviceData.Device.DefaultHeatingSetTemperature) / 2;

                        if (this.deviceState.DefaultCoolingSetTemperature !== deviceData.Device.DefaultCoolingSetTemperature || this.deviceState.DefaultHeatingSetTemperature !== deviceData.Device.DefaultHeatingSetTemperature) {
                            const temps = {
                                defaultCoolingSetTemperature: deviceData.Device.DefaultCoolingSetTemperature,
                                defaultHeatingSetTemperature: deviceData.Device.DefaultHeatingSetTemperature
                            };
                            await this.functions.saveData(this.defaultTempsFile, temps);
                        }
                    }

                    switch (flag) {
                        case 'frostprotection':
                            payload = {
                                enabled: deviceData.FrostProtection.Enabled,
                                min: deviceData.FrostProtection.Min,
                                max: deviceData.FrostProtection.Max,
                                units: { "ATA": [deviceData.DeviceID] }
                            };
                            method = 'POST';
                            path = ApiUrlsHome.PostProtectionFrost;
                            deviceData.Headers.Referer = ApiUrlsHome.Referers.PostProtectionFrost.replace('deviceid', deviceData.DeviceID);
                            break;
                        case 'overheatprotection':
                            payload = {
                                enabled: deviceData.OverheatProtection.Enabled,
                                min: deviceData.OverheatProtection.Min,
                                max: deviceData.OverheatProtection.Max,
                                units: { "ATA": [deviceData.DeviceID] }
                            };
                            method = 'POST';
                            path = ApiUrlsHome.PostProtectionOverheat;
                            deviceData.Headers.Referer = ApiUrlsHome.Referers.PostProtectionOverheat.replace('deviceid', deviceData.DeviceID);
                            break;
                        case 'holidaymode':
                            payload = {
                                enabled: deviceData.HolidayMode.Enabled,
                                startDate: deviceData.HolidayMode.StartDate,
                                endDate: deviceData.HolidayMode.EndDate,
                                units: { "ATA": [deviceData.DeviceID] }
                            };
                            method = 'POST';
                            path = ApiUrlsHome.PostHolidayMode;
                            deviceData.Headers.Referer = ApiUrlsHome.Referers.PostHolidayMode.replace('deviceid', deviceData.DeviceID);
                            break;
                        case 'schedule':
                            payload = { enabled: deviceData.ScheduleEnabled };
                            method = 'PUT';
                            path = ApiUrlsHome.PutScheduleEnabled.replace('deviceid', deviceData.DeviceID);
                            deviceData.Headers.Referer = ApiUrlsHome.Referers.PutScheduleEnabled.replace('deviceid', deviceData.DeviceID);
                            break;
                        case 'scene':
                            method = 'PUT';
                            const state = flagData.Enabled ? 'Enable' : 'Disable';
                            path = ApiUrlsHome.PutScene[state].replace('sceneid', flagData.Id);
                            deviceData.Headers.Referer = ApiUrlsHome.Referers.GetPutScenes;
                            break;
                        default:
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
                            path = ApiUrlsHome.PutAta.replace('deviceid', deviceData.DeviceID);
                            deviceData.Headers.Referer = ApiUrlsHome.Referers.PutDeviceSettings
                            break
                    }

                    deviceData.Headers['Content-Type'] = 'application/json; charset=utf-8';
                    deviceData.Headers.Origin = ApiUrlsHome.Origin;
                    if (!this.logDebug) this.emit('warn', `Send Data: ${JSON.stringify(payload, null, 2)}, Headers: ${JSON.stringify(deviceData.Headers, null, 2)}`);
                    await axios(path, {
                        method: method,
                        baseURL: ApiUrlsHome.BaseURL,
                        timeout: 10000,
                        headers: deviceData.Headers,
                        data: payload
                    });
                    this.updateData(deviceData);
                    return true;
                default:
                    return;
            }
        } catch (error) {
            if (error.response?.status === 500) return true; // Return 500 for schedule hovewer working correct
            throw new Error(`Send data error: ${error.message}`);
        }
    }

    updateData(deviceData) {
        this.lock = true;
        this.emit('deviceState', deviceData);

        setTimeout(() => {
            this.lock = false
        }, 2500);
    }
};
export default MelCloudAta;
