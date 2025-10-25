import { Agent } from 'https';
import axios from 'axios';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import Functions from './functions.js';
import { ApiUrls } from './constants.js';

class MelCloudErv extends EventEmitter {
    constructor(device, contextKey, devicesFile, defaultTempsFile) {
        super();
        this.deviceId = device.id;
        this.logWarn = device.log?.warn;
        this.logDebug = device.log?.debug;
        this.devicesFile = devicesFile;
        this.defaultTempsFile = defaultTempsFile;
        this.functions = new Functions();

        //set default values
        this.deviceState = {};

        this.axiosInstancePost = axios.create({
            method: 'POST',
            baseURL: ApiUrls.BaseURL,
            timeout: 25000,
            headers: {
                'X-MitsContextKey': contextKey,
                'content-type': 'application/json'
            },
            withCredentials: true,
            httpsAgent: new Agent({
                keepAlive: false,
                rejectUnauthorized: false
            })
        });

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
            const devicesData = await this.functions.readData(this.devicesFile, true);

            if (!Array.isArray(devicesData)) {
                if (this.logWarn) this.emit('warn', `Device data not found`);
                return null;
            }
            const deviceData = devicesData.find(device => device.DeviceID === this.deviceId);
            if (this.logDebug) this.emit('debug', `Device Data: ${JSON.stringify(deviceData, null, 2)}`);

            //presets
            const hideRoomTemperature = deviceData.HideRoomTemperature ?? false;
            const hideSupplyTemperature = deviceData.HideSupplyTemperature ?? false;
            const hideOutdoorTemperature = deviceData.HideOutdoorTemperature ?? false;
            const serialNumber = deviceData.SerialNumber ?? 'Undefined';

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
            const firmwareAppVersion = device.FirmwareAppVersion?.toString() ?? 'Undefined';

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
                this.emit('message', `Units are not configured in MELCloud service`);
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
                HideOutdoorTemperature: hideOutdoorTemperature
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

    async send(deviceData, displayType) {
        try {
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

            await this.axiosInstancePost(ApiUrls.SetErv, payload);
            this.updateData(deviceData);
            return true;
        } catch (error) {
            throw new Error(`Send data error: ${error}`);
        };
    };

    updateData(deviceData) {
        setTimeout(() => {
            this.emit('deviceState', deviceData);
        }, 500);
    }
};
export default MelCloudErv;
