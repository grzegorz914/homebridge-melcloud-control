import axios from 'axios';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import Functions from './functions.js';
import { ApiUrls, ApiUrlsHome, HeatPump } from './constants.js';

class MelCloudAtw extends EventEmitter {
    constructor(account, device, devicesFile, defaultTempsFile) {
        super();
        this.accountType = account.type;
        this.logWarn = account.log?.warn;
        this.logError = account.log?.error;
        this.logDebug = account.log?.debug;
        this.deviceId = device.id;
        this.devicesFile = devicesFile;
        this.defaultTempsFile = defaultTempsFile;
        this.functions = new Functions(this.logWarn, this.logError, this.logDebug)
            .on('warn', warn => this.emit('warn', warn))
            .on('error', error => this.emit('error', error))
            .on('debug', debug => this.emit('debug', debug));

        //set default values
        this.deviceState = {};
        this.headers = {};

        //lock flags
        this.locks = {
            checkState: false,
        };
        this.impulseGenerator = new ImpulseGenerator()
            .on('checkState', () => this.handleWithLock('checkState', async () => {
                await this.checkState();
            }))
            .on('state', (state) => {
                this.emit(state ? 'success' : 'warn', `Impulse generator ${state ? 'started' : 'stopped'}`);
            });
    }

    async handleWithLock(lockKey, fn) {
        if (this.locks[lockKey]) return;

        this.locks[lockKey] = true;
        try {
            await fn();
        } catch (error) {
            this.emit('error', `Inpulse generator error: ${error}`);
        } finally {
            this.locks[lockKey] = false;
        }
    }

    async checkState() {
        try {
            //read device info from file
            const devicesData = await this.functions.readData(this.devicesFile, true);

            if (!Array.isArray(devicesData)) {
                if (this.logWarn) this.emit('warn', `Device data not found`);
                return null;
            }
            const deviceData = devicesData.find(device => device.DeviceID === this.deviceId);
            this.headers = deviceData.Headers;

            if (this.accountType === 'melcloudhome') {
                deviceData.SerialNumber = deviceData.DeviceID || '4.0.0';
                deviceData.Device.FirmwareAppVersion = deviceData.ConnectedInterfaceIdentifier || '4.0.0';
            }
            if (this.logDebug) this.emit('debug', `Device Data: ${JSON.stringify(deviceData, null, 2)}`);

            //keys
            const fanKey = this.accountType === 'melcloud' ? 'FanSpeed' : 'SetFanSpeed';
            const tempStepKey = this.accountType === 'melcloud' ? 'TemperatureIncrement' : 'HasHalfDegreeIncrements';
            const errorKey = this.accountType === 'melcloud' ? 'HasError' : 'IsInError';

            //device info
            const serialNumber = deviceData.SerialNumber;

            //device
            const device = deviceData.Device ?? {};
            const hasHotWaterTank = device.HasHotWaterTank ?? false;
            const temperatureIncrement = device[tempStepKey];
            const roomTemperatureZone1 = device.RoomTemperatureZone1;
            const roomTemperatureZone2 = device.RoomTemperatureZone2;
            const outdoorTemperature = device.OutdoorTemperature;
            const tankWaterTemperature = device.TankWaterTemperature;
            const unitStatus = device.UnitStatus;
            const power = device.Power;
            const ecoHotWater = device.EcoHotWater;
            const operationMode = device.OperationMode;
            const operationModeZone1 = device.OperationModeZone1;
            const operationModeZone2 = device.OperationModeZone2;
            const setTemperatureZone1 = device.SetTemperatureZone1;
            const setTemperatureZone2 = device.SetTemperatureZone2;
            const setTankWaterTemperature = device.SetTankWaterTemperature;
            const forcedHotWaterMode = device.ForcedHotWaterMode;
            const holidayMode = device.HolidayMode;
            const prohibitHotWater = device.ProhibitHotWater;
            const prohibitHeatingZone1 = device.ProhibitHeatingZone1;
            const prohibitHeatingZone2 = device.ProhibitHeatingZone2;
            const setHeatFlowTemperatureZone1 = device.SetHeatFlowTemperatureZone1;
            const setHeatFlowTemperatureZone2 = device.SetHeatFlowTemperatureZone2;
            const setCoolFlowTemperatureZone1 = device.SetCoolFlowTemperatureZone1;
            const setCoolFlowTemperatureZone2 = device.SetCoolFlowTemperatureZone2;
            const idleZone1 = device.IdleZone1 ?? false;
            const idleZone2 = device.IdleZone2 ?? false;
            const firmwareAppVersion = device.FirmwareAppVersion;
            const hasZone2 = device.HasZone2 ?? false;
            const isInError = device[errorKey];

            //units
            const units = Array.isArray(device.Units) ? device.Units : [];
            const unitsCount = units.length;
            const manufacturer = 'Mitsubishi';

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
            if (unitsCount === 0) {
                if (this.logDebug) this.emit('debug', `Units are not configured in MELCloud service`);
            };

            const deviceState = {
                Power: power,
                IdleZone1: idleZone1,
                IdleZone2: idleZone2,
                UnitStatus: unitStatus,
                SetTemperatureZone1: setTemperatureZone1,
                SetTemperatureZone2: setTemperatureZone2,
                RoomTemperatureZone1: roomTemperatureZone1,
                RoomTemperatureZone2: roomTemperatureZone2,
                OperationMode: operationMode,
                OperationModeZone1: operationModeZone1,
                OperationModeZone2: operationModeZone2,
                SetHeatFlowTemperatureZone1: setHeatFlowTemperatureZone1,
                SetHeatFlowTemperatureZone2: setHeatFlowTemperatureZone2,
                SetCoolFlowTemperatureZone1: setCoolFlowTemperatureZone1,
                SetCoolFlowTemperatureZone2: setCoolFlowTemperatureZone2,
                TankWaterTemperature: tankWaterTemperature,
                SetTankWaterTemperature: setTankWaterTemperature,
                ForcedHotWaterMode: forcedHotWaterMode,
                OutdoorTemperature: outdoorTemperature,
                TemperatureIncrement: temperatureIncrement,
                EcoHotWater: ecoHotWater,
                HolidayMode: holidayMode,
                ProhibitZone1: prohibitHeatingZone1,
                ProhibitZone2: prohibitHeatingZone2,
                ProhibitHotWater: prohibitHotWater,
                IsInError: isInError
            }

            //restFul
            this.emit('restFul', 'info', deviceData);
            this.emit('restFul', 'state', deviceData.Device);

            //mqtt
            this.emit('mqtt', 'Info', deviceData);
            this.emit('mqtt', 'State', deviceData.Device);

            //check state changes
            const deviceDataHasNotChanged = JSON.stringify(deviceState) === JSON.stringify(this.deviceState);
            if (deviceDataHasNotChanged) {
                if (this.logDebug) this.emit('debug', `Device state not changed`);
                return;
            }
            this.deviceState = deviceState;

            //emit info
            this.emit('deviceInfo', manufacturer, indoor.model, outdoor.model, serialNumber, firmwareAppVersion, hasHotWaterTank, hasZone2);

            //emit state
            this.emit('deviceState', deviceData);

            return true;
        } catch (error) {
            throw new Error(`Check state error: ${error}`);
        };
    };

    async send(accountType, displayType, deviceData, effectiveFlags) {
        try {
            switch (accountType) {
                case "melcloud":
                    const axiosInstancePost = axios.create({
                        method: 'POST',
                        baseURL: ApiUrls.BaseURL,
                        timeout: 10000,
                        headers: this.headers,
                        withCredentials: true
                    });

                    //prevent to set out of range temp
                    const minTempZones = 0;
                    const maxTempZones = 60;
                    const minTempWaterTank = 16;
                    const maxTempWaterTank = deviceData.Device.MaxTankTemperature ?? 70;

                    deviceData.Device.SetTemperatureZone1 = deviceData.Device.SetTemperatureZone1 < minTempZones ? minTempZones : deviceData.Device.SetTemperatureZone1;
                    deviceData.Device.SetTemperatureZone1 = deviceData.Device.SetTemperatureZone1 > maxTempZones ? maxTempZones : deviceData.Device.SetTemperatureZone1;
                    deviceData.Device.SetTemperatureZone1 = deviceData.Device.SetTemperatureZone2 < minTempZones ? minTempZones : deviceData.Device.SetTemperatureZone2;
                    deviceData.Device.SetTemperatureZone1 = deviceData.Device.SetTemperatureZone2 > maxTempZones ? maxTempZones : deviceData.Device.SetTemperatureZone2;
                    deviceData.Device.SetTankWaterTemperature = deviceData.Device.SetTankWaterTemperature < minTempWaterTank ? minTempWaterTank : deviceData.Device.SetTankWaterTemperature;
                    deviceData.Device.SetTankWaterTemperature = deviceData.Device.SetTankWaterTemperature > maxTempWaterTank ? maxTempWaterTank : deviceData.Device.SetTankWaterTemperature;

                    deviceData.Device.EffectiveFlags = effectiveFlags;
                    const payload = {
                        data: {
                            DeviceID: deviceData.Device.DeviceID,
                            EffectiveFlags: deviceData.Device.EffectiveFlags,
                            Power: deviceData.Device.Power,
                            SetTemperatureZone1: deviceData.Device.SetTemperatureZone1,
                            SetTemperatureZone2: deviceData.Device.SetTemperatureZone2,
                            OperationMode: deviceData.Device.OperationMode,
                            OperationModeZone1: deviceData.Device.OperationModeZone1,
                            OperationModeZone2: deviceData.Device.OperationModeZone2,
                            SetHeatFlowTemperatureZone1: deviceData.Device.SetHeatFlowTemperatureZone1,
                            SetHeatFlowTemperatureZone2: deviceData.Device.SetHeatFlowTemperatureZone2,
                            SetCoolFlowTemperatureZone1: deviceData.Device.SetCoolFlowTemperatureZone1,
                            SetCoolFlowTemperatureZone2: deviceData.Device.SetCoolFlowTemperatureZone2,
                            SetTankWaterTemperature: deviceData.Device.SetTankWaterTemperature,
                            ForcedHotWaterMode: deviceData.Device.ForcedHotWaterMode,
                            EcoHotWater: deviceData.Device.EcoHotWater,
                            HolidayMode: deviceData.Device.HolidayMode,
                            ProhibitZone1: deviceData.Device.ProhibitHeatingZone1,
                            ProhibitZone2: deviceData.Device.ProhibitHeatingZone2,
                            ProhibitHotWater: deviceData.Device.ProhibitHotWater,
                            HasPendingCommand: true
                        }
                    }

                    await axiosInstancePost(ApiUrls.SetAtw, payload);
                    this.updateData(deviceData);
                    return true;
                case "melcloudhome":
                    const axiosInstancePut = axios.create({
                        method: 'PUT',
                        baseURL: ApiUrlsHome.BaseURL,
                        timeout: 10000,
                        headers: this.headers,
                        withCredentials: true
                    });

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

                    const settings = {
                        data: {
                            Power: deviceData.Device.Power,
                            SetTemperature: deviceData.Device.SetTemperature,
                            SetFanSpeed: String(deviceData.Device.SetFanSpeed),
                            OperationMode: AirConditioner.OperationModeMapEnumToString[deviceData.Device.OperationMode],
                            VaneHorizontalDirection: AirConditioner.VaneHorizontalDirectionMapEnumToString[deviceData.Device.VaneHorizontalDirection],
                            VaneVerticalDirection: AirConditioner.VaneVerticalDirectionMapEnumToString[deviceData.Device.VaneVerticalDirection]
                        }
                    };
                    if (this.logDebug) this.emit('debug', `Send Data: ${JSON.stringify(settings.data, null, 2)}`);

                    const path = ApiUrlsHome.SetAtw.replace('deviceid', deviceData.DeviceID);
                    await axiosInstancePut(path, settings);
                    this.updateData(deviceData);
                    return true;
                default:
                    return;
            }
        } catch (error) {
            if (error.response) {
                throw new Error(`Send data error: HTTP ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            } else if (error.request) {
                throw new Error(`Send data error: No response received - ${error.message}`);
            } else {
                throw new Error(`Send data error: ${error.message}`);
            }
        }
    }

    updateData(deviceData) {
        setTimeout(() => {
            this.emit('deviceState', deviceData);
        }, 500);
    }
};
export default MelCloudAtw;
