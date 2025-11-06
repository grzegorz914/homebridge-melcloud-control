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
            if (this.logDebug) this.emit('debug', `Device Data: ${JSON.stringify(deviceData, null, 2)}`);

            //keys
            const fanKey = this.accountType === 'melcloud' ? 'FanSpeed' : 'SetFanSpeed';
            const tempStepKey = this.accountType === 'melcloud' ? 'TemperatureIncrement' : 'HasHalfDegreeIncrements';
            const errorKey = this.accountType === 'melcloud' ? 'HasError' : 'IsInError';

            //device info
            const hideVaneControls = deviceData.HideVaneControls;
            const hideDryModeControl = deviceData.HideDryModeControl;
            const serialNumber = deviceData.SerialNumber;

            //device
            const device = deviceData.Device ?? {};
            const prohibitSetTemperature = device.ProhibitSetTemperature;
            const prohibitOperationMode = device.ProhibitOperationMode;
            const prohibitPower = device.ProhibitPower;
            const power = device.Power;
            const roomTemperature = device.RoomTemperature;
            const outdoorTemperature = device.OutdoorTemperature;
            const setTemperature = device.SetTemperature;
            const actualFanSpeed = device.ActualFanSpeed;
            const setFanSpeed = device[fanKey];
            const automaticFanSpeed = device.AutomaticFanSpeed;
            const vaneVerticalDirection = device.VaneVerticalDirection;
            const vaneVerticalSwing = device.VaneVerticalSwing;
            const vaneHorizontalDirection = device.VaneHorizontalDirection;
            const vaneHorizontalSwing = device.VaneHorizontalSwing;
            const operationMode = device.OperationMode;
            const inStandbyMode = device.InStandbyMode;
            const temperatureIncrement = device[tempStepKey];
            const defaultCoolingSetTemperature = device.DefaultCoolingSetTemperature;
            const defaultHeatingSetTemperature = device.DefaultHeatingSetTemperature;
            const firmwareAppVersion = device.FirmwareAppVersion;
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
                InStandbyMode: inStandbyMode,
                RoomTemperature: roomTemperature,
                OutdoorTemperature: outdoorTemperature,
                SetTemperature: setTemperature,
                ActualFanSpeed: actualFanSpeed,
                SetFanSpeed: setFanSpeed,
                AutomaticFanSpeed: automaticFanSpeed,
                OperationMode: operationMode,
                VaneVerticalDirection: vaneVerticalDirection,
                VaneVerticalSwing: vaneVerticalSwing,
                VaneHorizontalDirection: vaneHorizontalDirection,
                VaneHorizontalSwing: vaneHorizontalSwing,
                TemperatureIncrement: temperatureIncrement,
                DefaultCoolingSetTemperature: defaultCoolingSetTemperature,
                DefaultHeatingSetTemperature: defaultHeatingSetTemperature,
                ProhibitPower: prohibitPower,
                ProhibitSetTemperature: prohibitSetTemperature,
                ProhibitOperationMode: prohibitOperationMode,
                HideVaneControls: hideVaneControls,
                HideDryModeControl: hideDryModeControl,
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
            throw new Error(`Check state error: ${error.message}`);
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

                    if (displayType === 1 && deviceData.Device.OperationMode === 8) {
                        deviceData.Device.SetTemperature = (deviceData.Device.DefaultCoolingSetTemperature + deviceData.Device.DefaultHeatingSetTemperature) / 2;
                    }

                    deviceData.Device.EffectiveFlags = effectiveFlags;
                    const payload = {
                        data: {
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
                        }
                    };
                    if (this.logDebug) this.emit('debug', `Send Data: ${JSON.stringify(payload.data, null, 2)}`);

                    await axiosInstancePost(ApiUrls.SetAta, payload);
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

                    const path = ApiUrlsHome.SetAta.replace('deviceid', deviceData.DeviceID);
                    await axiosInstancePut(path, settings);
                    this.updateData(deviceData);
                    return true;
                default:
                    return;
            }
        } catch (error) {
            throw new Error(`Send data error: ${error.message}`);
        }
    }

    updateData(deviceData) {
        setTimeout(() => {
            this.emit('deviceState', deviceData);
        }, 500);
    }

};
export default MelCloudAta;
