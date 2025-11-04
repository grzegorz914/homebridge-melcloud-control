import axios from 'axios';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import Functions from './functions.js';
import { ApiUrls, ApiUrlsHome, Ventilation } from './constants.js';

class MelCloudErv extends EventEmitter {
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

            //presets
            const hideRoomTemperature = deviceData.HideRoomTemperature ?? false;
            const hideSupplyTemperature = deviceData.HideSupplyTemperature ?? false;
            const hideOutdoorTemperature = deviceData.HideOutdoorTemperature ?? false;
            const serialNumber = deviceData.SerialNumber;

            //device
            const device = deviceData.Device ?? {};
            const pM25SensorStatus = device.PM25SensorStatus;
            const pM25Level = device.PM25Level;
            const temperatureIncrement = device.TemperatureIncrement;
            const coreMaintenanceRequired = device.CoreMaintenanceRequired ?? false;
            const filterMaintenanceRequired = device.FilterMaintenanceRequired ?? false;
            const power = device.Power ?? false;
            const roomTemperature = device.RoomTemperature;
            const supplyTemperature = device.SupplyTemperature;
            const outdoorTemperature = device.OutdoorTemperature;
            const roomCO2Level = device.RoomCO2Level;
            const nightPurgeMode = device.NightPurgeMode ?? false;
            const setTemperature = device.SetTemperature;
            const actualSupplyFanSpeed = device.ActualSupplyFanSpeed;
            const actualExhaustFanSpeed = device.ActualExhaustFanSpeed;
            const setFanSpeed = device.SetFanSpeed;
            const operationMode = device.OperationMode; //0, Heat, 2, Cool, 4, 5, 6, Fan, Auto
            const ventilationMode = device.VentilationMode; //Lossnay, Bypass, Auto
            const defaultCoolingSetTemperature = device.DefaultCoolingSetTemperature ?? 23;
            const defaultHeatingSetTemperature = device.DefaultHeatingSetTemperature ?? 21;
            const firmwareAppVersion = device.FirmwareAppVersion;
            const isInError = device.IsInError;

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
                RoomTemperature: roomTemperature,
                SupplyTemperature: supplyTemperature,
                OutdoorTemperature: outdoorTemperature,
                NightPurgeMode: nightPurgeMode,
                SetTemperature: setTemperature,
                SetFanSpeed: setFanSpeed,
                OperationMode: operationMode,
                VentilationMode: ventilationMode,
                RoomCO2Level: roomCO2Level,
                ActualSupplyFanSpeed: actualSupplyFanSpeed,
                ActualExhaustFanSpeed: actualExhaustFanSpeed,
                CoreMaintenanceRequired: coreMaintenanceRequired,
                FilterMaintenanceRequired: filterMaintenanceRequired,
                TemperatureIncrement: temperatureIncrement,
                DefaultCoolingSetTemperature: defaultCoolingSetTemperature,
                DefaultHeatingSetTemperature: defaultHeatingSetTemperature,
                PM25SensorStatus: pM25SensorStatus,
                PM25Level: pM25Level,
                HideRoomTemperature: hideRoomTemperature,
                HideSupplyTemperature: hideSupplyTemperature,
                HideOutdoorTemperature: hideOutdoorTemperature,
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
            this.emit('deviceInfo', manufacturer, indoor.model, outdoor.model, serialNumber, firmwareAppVersion);

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

                    //set target temp based on display mode and ventilation mode
                    switch (displayType) {
                        case 1: //Heather/Cooler
                            switch (deviceData.Device.VentilationMode) {
                                case 0: //LOSNAY
                                    deviceData.Device.SetTemperature = deviceData.Device.DefaultHeatingSetTemperature;
                                    break;
                                case 1: //BYPASS
                                    deviceData.Device.SetTemperature = deviceData.Device.DefaultCoolingSetTemperature;
                                    break;
                                case 2: //AUTO
                                    const setTemperature = (deviceData.Device.DefaultCoolingSetTemperature + deviceData.Device.DefaultHeatingSetTemperature) / 2;
                                    deviceData.Device.SetTemperature = setTemperature;
                                    break;
                            };
                        case 2: //Thermostat
                            deviceData.Device.SetTemperature = deviceData.Device.SetTemperature;
                            break;
                    };

                    //device state
                    deviceData.Device.EffectiveFlags = effectiveFlags;
                    const payload = {
                        data: {
                            DeviceID: deviceData.Device.DeviceID,
                            EffectiveFlags: deviceData.Device.EffectiveFlags,
                            Power: deviceData.Device.Power,
                            SetTemperature: deviceData.Device.SetTemperature,
                            SetFanSpeed: deviceData.Device.SetFanSpeed,
                            OperationMode: deviceData.Device.OperationMode,
                            VentilationMode: deviceData.Device.VentilationMode,
                            DefaultCoolingSetTemperature: deviceData.Device.DefaultCoolingSetTemperature,
                            DefaultHeatingSetTemperature: deviceData.Device.DefaultHeatingSetTemperature,
                            HideRoomTemperature: deviceData.Device.HideRoomTemperature,
                            HideSupplyTemperature: deviceData.Device.HideSupplyTemperature,
                            HideOutdoorTemperature: deviceData.Device.HideOutdoorTemperature,
                            NightPurgeMode: deviceData.Device.NightPurgeMode,
                            HasPendingCommand: true
                        }
                    }

                    await axiosInstancePost(ApiUrls.SetErv, payload);
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

                    const path = ApiUrlsHome.SetErv.replace('deviceid', deviceData.DeviceID);
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
export default MelCloudErv;
