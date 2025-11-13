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
        this.devicesData = {};

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

            if (this.accountType === 'melcloudhome') {
                deviceData.SerialNumber = deviceData.DeviceID || '4.0.0';
                deviceData.Device.FirmwareAppVersion = deviceData.ConnectedInterfaceIdentifier || '4.0.0';
            }
            const safeConfig = {
                ...deviceData,
                headers: 'removed',
            };
            if (this.logDebug) this.emit('debug', `Device Data: ${JSON.stringify(safeConfig, null, 2)}`);

            //device
            const serialNumber = deviceData.SerialNumber;
            const hasHotWaterTank = deviceData.Device?.HasHotWaterTank;
            const firmwareAppVersion = deviceData.Device?.FirmwareAppVersion;
            const hasZone2 = deviceData.Device?.HasZone2;

            //units
            const units = Array.isArray(deviceData.Device?.Units) ? deviceData.Device?.Units : [];
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
            const deviceDataHasNotChanged = JSON.stringify(devicesData) === JSON.stringify(this.devicesData);
            if (deviceDataHasNotChanged) {
                if (this.logDebug) this.emit('debug', `Device state not changed`);
                return;
            }
            this.devicesData = devicesData;

            //emit info
            this.emit('deviceInfo', manufacturer, indoor.model, outdoor.model, serialNumber, firmwareAppVersion, hasHotWaterTank, hasZone2);

            //emit state
            this.emit('deviceState', deviceData);

            return true;
        } catch (error) {
            throw new Error(`Check state error: ${error.message}`);
        };
    };

    async send(accountType, displayType, deviceData, effectiveFlags) {
        try {

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

            let method = null
            let payload = {};
            let path = '';
            switch (accountType) {
                case "melcloud":
                    const axiosInstancePost = axios.create({
                        method: 'POST',
                        baseURL: ApiUrls.BaseURL,
                        timeout: 10000,
                        headers: deviceData.Headers,
                        withCredentials: true
                    });

                    deviceData.Device.EffectiveFlags = effectiveFlags;
                    payload = {
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
                    switch (effectiveFlags) {
                        case 'holidaymode':
                            payload = {
                                data: { enabled: deviceData.HolidayMode.Enabled, startDate: deviceData.HolidayMode.StartDate, endDate: deviceData.HolidayMode.EndDate, units: { "ATW": [deviceData.DeviceID] } }
                            };
                            method = 'POST';
                            path = ApiUrlsHome.PostHolidayMode;
                            break;
                        case 'schedule':
                            payload = {
                                data: {
                                    enabled: deviceData.ScheduleEnabled
                                }
                            };
                            method = 'PUT';
                            path = ApiUrlsHome.PutScheduleEnable.replace('deviceid', deviceData.DeviceID);
                            break;
                        default:
                            payload = {
                                data: {
                                    Power: deviceData.Device.Power,
                                    SetTemperatureZone1: deviceData.Device.SetTemperatureZone1,
                                    SetTemperatureZone2: deviceData.Device.SetTemperatureZone2,
                                    OperationMode: HeatPump.OperationModeMapEnumToString[deviceData.Device.OperationMode],
                                    OperationModeZone1: HeatPump.OperationModeMapEnumToString[deviceData.Device.OperationModeZone1],
                                    OperationModeZone2: HeatPump.OperationModeMapEnumToString[deviceData.Device.OperationModeZone2],
                                    SetHeatFlowTemperatureZone1: deviceData.Device.SetHeatFlowTemperatureZone1,
                                    SetHeatFlowTemperatureZone2: deviceData.Device.SetHeatFlowTemperatureZone2,
                                    SetCoolFlowTemperatureZone1: deviceData.Device.SetCoolFlowTemperatureZone1,
                                    SetCoolFlowTemperatureZone2: deviceData.Device.SetCoolFlowTemperatureZone2,
                                    SetTankWaterTemperature: deviceData.Device.SetTankWaterTemperature,
                                    ForcedHotWaterMode: deviceData.Device.ForcedHotWaterMode,
                                    EcoHotWater: deviceData.Device.EcoHotWater,
                                }
                            };
                            method = 'PUT';
                            path = ApiUrlsHome.SetAtw.replace('deviceid', deviceData.DeviceID);
                            break
                    }

                    const axiosInstancePut = axios.create({
                        method: method,
                        baseURL: ApiUrlsHome.BaseURL,
                        timeout: 10000,
                        headers: deviceData.Headers,
                        withCredentials: true
                    });

                    if (this.logDebug) this.emit('debug', `Send Data: ${JSON.stringify(settings.data, null, 2)}`);
                    await axiosInstancePut(path, settings);
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
        setTimeout(() => {
            this.emit('deviceState', deviceData);
        }, 300);
    }
};
export default MelCloudAtw;
