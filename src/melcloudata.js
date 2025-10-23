import axios from 'axios';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import Functions from './functions.js';
import { ApiUrls, ApiUrlsHome, AirConditioner } from './constants.js';

class MelCloudAta extends EventEmitter {
    constructor(device, devicesFile) {
        super();
        this.accountType = device.displayType
        this.deviceId = device.id;
        this.logWarn = device.log?.warn;
        this.logDebug = device.log?.debug;
        this.devicesFile = devicesFile;
        this.functions = new Functions();

        //set default values
        this.deviceState = {};

        //lock flags
        this.locks = {
            checkState: false,
        };
        this.impulseGenerator = new ImpulseGenerator()
            .on('checkState', () => this.handleWithLock('checkState', async () => {
                await this.checkState();
            }))
            .on('state', (state) => {
                this.emit('success', `Impulse generator ${state ? 'started' : 'stopped'}.`);
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
            const data = await this.functions.readData(this.devicesFile);
            const devicesData = JSON.parse(data);

            if (!Array.isArray(devicesData)) {
                if (this.logWarn) this.emit('warn', `Device data not found`);
                return null;
            }
            const deviceData = devicesData.find(device => device.DeviceID === this.deviceId);
            if (this.logDebug) this.emit('debug', `Device Data: ${JSON.stringify(deviceData, null, 2)}`);

            //device info
            const hideVaneControls = deviceData.HideVaneControls ?? false;
            const hideDryModeControl = deviceData.HideDryModeControl ?? false;
            const serialNumber = deviceData.SerialNumber || deviceData.DeviceID || '4.0.0';

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
            const fanSpeed = device.FanSpeed;
            const setFanSpeed = device.SetFanSpeed; // melcloud home only
            const automaticFanSpeed = device.AutomaticFanSpeed;
            const vaneVerticalDirection = device.VaneVerticalDirection;
            const vaneVerticalSwing = device.VaneVerticalSwing;
            const vaneHorizontalDirection = device.VaneHorizontalDirection;
            const vaneHorizontalSwing = device.VaneHorizontalSwing;
            const operationMode = device.OperationMode;
            const inStandbyMode = device.InStandbyMode;
            const defaultCoolingSetTemperature = device.DefaultCoolingSetTemperature;
            const defaultHeatingSetTemperature = device.DefaultHeatingSetTemperature;
            const firmwareAppVersion = device.FirmwareAppVersion || '4.0.0';

            //units
            const units = Array.isArray(device.Units) ? device.Units : [];
            const unitsCount = units.length;
            const manufacturer = 'Mitsubishi';

            //indoor
            let idIndoor = 0;
            let deviceIndoor = 0;
            let serialNumberIndoor = 'Undefined';
            let modelNumberIndoor = 0;
            let modelIndoor = false;
            let typeIndoor = 0;

            //outdoor
            let idOutdoor = 0;
            let deviceOutdoor = 0;
            let serialNumberOutdoor = 'Undefined';
            let modelNumberOutdoor = 0;
            let modelOutdoor = false;
            let typeOutdoor = 0;

            //units array
            for (const unit of units) {
                const unitId = unit.ID;
                const unitDevice = unit.Device;
                const unitSerialNumber = unit.SerialNumber ?? 'Undefined';
                const unitModelNumber = unit.ModelNumber;
                const unitModel = unit.Model ?? false;
                const unitType = unit.UnitType;
                const unitIsIndoor = unit.IsIndoor ?? false;

                switch (unitIsIndoor) {
                    case true:
                        idIndoor = unitId;
                        deviceIndoor = unitDevice;
                        serialNumberIndoor = unitSerialNumber;
                        modelNumberIndoor = unitModelNumber;
                        modelIndoor = unitModel;
                        typeIndoor = unitType;
                        break;
                    case false:
                        idOutdoor = unitId;
                        deviceOutdoor = unitDevice;
                        serialNumberOutdoor = unitSerialNumber;
                        modelNumberOutdoor = unitModelNumber;
                        modelOutdoor = unitModel;
                        typeOutdoor = unitType;
                        break;
                }
            }

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
                FanSpeed: fanSpeed,
                SetFanSpeed: setFanSpeed,
                AutomaticFanSpeed: automaticFanSpeed,
                OperationMode: operationMode,
                VaneVerticalDirection: vaneVerticalDirection,
                VaneVerticalSwing: vaneVerticalSwing,
                VaneHorizontalDirection: vaneHorizontalDirection,
                VaneHorizontalSwing: vaneHorizontalSwing,
                DefaultCoolingSetTemperature: defaultCoolingSetTemperature,
                DefaultHeatingSetTemperature: defaultHeatingSetTemperature,
                ProhibitPower: prohibitPower,
                ProhibitSetTemperature: prohibitSetTemperature,
                ProhibitOperationMode: prohibitOperationMode,
                HideVaneControls: hideVaneControls,
                HideDryModeControl: hideDryModeControl
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
            this.emit('deviceInfo', manufacturer, modelIndoor, modelOutdoor, serialNumber, firmwareAppVersion);

            //emit state
            this.emit('deviceState', deviceData);

            return true;
        } catch (error) {
            throw new Error(`Check state error: ${error}`);
        };
    };

    async send(accountType, deviceData, displayMode) {
        switch (accountType) {
            case "melcloud":
                try {
                    const axiosInstancePost = axios.create({
                        method: 'POST',
                        baseURL: ApiUrls.BaseURL,
                        timeout: 25000,
                        headers: {
                            'X-MitsContextKey': deviceData.ContextKey,
                            'content-type': 'application/json'
                        },
                        withCredentials: true
                    });

                    //set target temp based on display mode and operation mode
                    switch (displayMode) {
                        case 1: //Heather/Cooler
                            switch (deviceData.Device.OperationMode) {
                                case 1: //HEAT
                                case 9: //ISEE HEAT
                                    deviceData.Device.SetTemperature = deviceData.Device.DefaultHeatingSetTemperature;
                                    break;
                                case 2: //DRY
                                case 3: //COOL
                                case 10: //ISEE DRY
                                case 11: //ISEE COOL
                                    deviceData.Device.SetTemperature = deviceData.Device.DefaultCoolingSetTemperature;
                                    break;
                                case 7: //FAN
                                    deviceData.Device.SetTemperature = deviceData.Device.SetTemperature;
                                    break;
                                case 8: //AUTO
                                    deviceData.Device.SetTemperature = (deviceData.Device.DefaultCoolingSetTemperature + deviceData.Device.DefaultHeatingSetTemperature) / 2;
                                    break;
                                default:
                                    deviceData.Device.SetTemperature = deviceData.Device.SetTemperature;
                                    break;
                            };
                        case 2: //Thermostat
                            deviceData.Device.SetTemperature = deviceData.Device.SetTemperature;
                            break;
                        default:
                            return;
                    };

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
                    }

                    await axiosInstancePost(ApiUrls.SetAta, payload);
                    this.emit('deviceState', deviceData);
                    return true;
                } catch (error) {
                    throw new Error(`Send data error: ${error}`);
                };
            case "melcloudhome":
                try {
                    const axiosInstancePut = axios.create({
                        method: 'PUT',
                        timeout: 25000,
                        baseURL: ApiUrlsHome.BaseURL,
                        headers: {
                            'Accept': '*/*',
                            'Accept-Language': 'en-US,en;q=0.9',
                            'Cookie': deviceData.ContextKey,
                            'User-Agent': 'homebridge-melcloud-control/4.0.0',
                            'DNT': '1',
                            'Origin': 'https://melcloudhome.com',
                            'Referer': 'https://melcloudhome.com/dashboard',
                            'Sec-Fetch-Dest': 'empty',
                            'Sec-Fetch-Mode': 'cors',
                            'Sec-Fetch-Site': 'same-origin',
                            'X-CSRF': '1'
                        }
                    });

                    //set target temp based on display mode and operation mode
                    switch (displayMode) {
                        case 1: //Heather/Cooler
                            switch (deviceData.Device.OperationMode) {
                                case 8: //AUTO
                                    deviceData.Device.SetTemperature = (deviceData.Device.DefaultCoolingSetTemperature + deviceData.Device.DefaultHeatingSetTemperature) / 2;
                                    break;
                                default:
                                    deviceData.Device.SetTemperature = deviceData.Device.SetTemperature;
                                    break;
                            };
                        case 2: //Thermostat
                            deviceData.Device.SetTemperature = deviceData.Device.SetTemperature;
                            break;
                        default:
                            return;
                    };

                    deviceData.Device.OperationMode = AirConditioner.OperationModeMapEnumToString[deviceData.Device.OperationMode];
                    this.emit('warn', JSON.stringify(deviceData.Device, null, 2));

                    const payload = {
                        data: {
                            Power: deviceData.Device.Power,
                            SetTemperature: deviceData.Device.SetTemperature,
                            SetFanSpeed: deviceData.Device.SetFanSpeed,
                            OperationMode: deviceData.Device.OperationMode,
                            VaneHorizontalDirection: deviceData.Device.VaneHorizontalDirection,
                            VaneVerticalDirection: deviceData.Device.VaneVerticalDirection
                        }
                    }

                    this.emit('warn', JSON.stringify(payload, null, 2));

                    const path = ApiUrlsHome.SetAta.replace('deviceid', deviceData.DeviceID);
                    await axiosInstancePut(path, payload);
                    return true;
                } catch (error) {
                    throw new Error(`Send data error: ${error}`);
                };
            default:
                return;
        }
    }
};
export default MelCloudAta;
