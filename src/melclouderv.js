import { promises as fsPromises } from 'fs';
import { Agent } from 'https';
import axios from 'axios';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import { ApiUrls } from './constants.js';

class MelCloudErv extends EventEmitter {
    constructor(config) {
        super();
        this.devicesFile = config.devicesFile;
        this.deviceId = config.deviceId;
        this.enableDebugMode = config.enableDebugMode;

        //set default values
        this.deviceState = {};

        this.axiosInstancePost = axios.create({
            method: 'POST',
            baseURL: ApiUrls.BaseURL,
            timeout: 25000,
            headers: {
                'X-MitsContextKey': config.contextKey,
                'content-type': 'application/json'
            },
            withCredentials: true,
            httpsAgent: new Agent({
                keepAlive: false,
                rejectUnauthorized: false
            })
        });

        this.impulseGenerator = new ImpulseGenerator();
        this.impulseGenerator.on('checkState', async () => {
            try {
                await this.checkState();
            } catch (error) {
                this.emit('error', `Impulse generator error: ${error}`);
            };
        }).on('state', (state) => {
            const emitState = state ? this.emit('success', `Impulse generator started`) : this.emit('warn', `Impulse generator stopped`);
        });
    };

    async checkState() {
        try {
            //read device info from file
            const devicesData = await this.readData(this.devicesFile);

            if (!Array.isArray(devicesData)) {
                this.emit('warn', `Device data not found`);
                return null;
            }
            const deviceData = devicesData.find(device => device.DeviceID === this.deviceId);
            const debug = this.enableDebugMode ? this.emit('debug', `Device Data: ${JSON.stringify(deviceData, null, 2)}`) : false;

            //deviceData
            const deviceId = deviceData.DeviceID;
            const deviceName = deviceData.DeviceName;
            const buildingId = deviceData.BuildingID;
            const buildingName = deviceData.BuildingName;
            const floorId = deviceData.FloorID;
            const floorName = deviceData.FloorName;
            const areaId = deviceData.AreaID;
            const areaName = deviceData.AreaName;
            const imageId = deviceData.ImageID;
            const installationDate = deviceData.InstallationDate;
            const lastServiceDate = deviceData.LastServiceDate;

            //presets
            const presets = deviceData.Presets ?? [];

            const ownerId = deviceData.OwnerID;
            const ownerName = deviceData.OwnerName;
            const ownerEmail = deviceData.OwnerEmail;
            const accessLevel = deviceData.AccessLevel;
            const directAccess = deviceData.DirectAccess;
            const endDate = deviceData.EndDate;
            const zone1Name = deviceData.Zone1Name;
            const zone2Name = deviceData.Zone2Name;
            const minTemperature = deviceData.MinTemperature;
            const maxTemperature = deviceData.MaxTemperature;
            const hideVaneControls = deviceData.HideVaneControls;
            const hideDryModeControl = deviceData.HideDryModeControl;
            const hideRoomTemperature = deviceData.HideRoomTemperature ?? false;
            const hideSupplyTemperature = deviceData.HideSupplyTemperature ?? false;
            const hideOutdoorTemperature = deviceData.HideOutdoorTemperature ?? false;
            const buildingCountry = deviceData.BuildingCountry;
            const ownerCountry = deviceData.OwnerCountry;
            const adaptorType = deviceData.AdaptorType;
            const linkedDevice = deviceData.LinkedDevice;
            const type = deviceData.Type;
            const macAddress = deviceData.MacAddress;
            const serialNumber = deviceData.SerialNumber ?? 'Undefined';

            //device
            const device = deviceData.Device ?? {};
            const pCycleActual = device.PCycleActual;
            const errorMessages = device.ErrorMessages;
            const deviceType = device.DeviceType;
            const ervFlags = device.ErvFlags;
            const ervModel = device.ErvModel;
            const labelControls = device.LabelControls;
            const devicePowerDisabled = device.DevicePowerDisabled;
            const silentMode = device.SilentMode;
            const deviceHolidayMode = device.DeviceHolidayMode;
            const externalControl = device.ExternalControl;
            const bypassVentilationSkipped = device.BypassVentilationSkipped;
            const autoVentilationSkipped = device.AutoVentilationSkipped;
            const fanSpeedSkipped = device.FanSpeedSkipped;
            const fanSpeedRestricted = device.FanSpeedRestricted;
            const hasTemperatureControlUnit = device.HasTemperatureControlUnit;
            const hasCoolOperationMode = device.HasCoolOperationMode;
            const hasHeatOperationMode = device.HasHeatOperationMode;
            const hasAutoOperationMode = device.HasAutoOperationMode;
            const hasBypassVentilationMode = device.HasBypassVentilationMode ?? false;
            const hasAutoVentilationMode = device.HasAutoVentilationMode ?? false;
            const hasRoomTemperature = device.HasRoomTemperature ?? false;
            const hasSupplyTemperature = device.HasSupplyTemperature ?? false;
            const hasOutdoorTemperature = device.HasOutdoorTemperature ?? false;
            const hasCO2Sensor = device.HasCO2Sensor;
            const hasPM25Sensor = device.HasPM25Sensor;
            const pM25SensorStatus = device.PM25SensorStatus;
            const pM25Level = device.PM25Level;
            const numberOfFanSpeeds = device.NumberOfFanSpeeds;
            const hasHalfDegreeIncrements = device.HasHalfDegreeIncrements;
            const temperatureIncrementOverride = device.TemperatureIncrementOverride;
            const temperatureIncrement = device.TemperatureIncrement;
            const minTempCoolDry = device.MinTempCoolDry;
            const maxTempCoolDry = device.MaxTempCoolDry;
            const minTempHeat = device.MinTempHeat;
            const maxTempHeat = device.MaxTempHeat;
            const minTempAutomatic = device.MinTempAutomatic;
            const maxTempAutomatic = device.MaxTempAutomatic;
            const setSupplyTemperatureMode = device.SetSupplyTemperatureMode;
            const hasAutomaticFanSpeed = device.HasAutomaticFanSpeed ?? false;
            const coreMaintenanceRequired = device.CoreMaintenanceRequired ?? false;
            const filterMaintenanceRequired = device.FilterMaintenanceRequired ?? false;
            const power = device.Power ?? false;
            const roomTemperature = device.RoomTemperature;
            const supplyTemperature = device.SupplyTemperature;
            const outdoorTemperature = device.OutdoorTemperature;
            const roomCO2Level = device.RoomCO2Level;
            const nightPurgeMode = device.NightPurgeMode ?? false;
            const thermostatOn = device.ThermostatOn;
            const setTemperature = device.SetTemperature;
            const actualSupplyFanSpeed = device.ActualSupplyFanSpeed;
            const actualExhaustFanSpeed = device.ActualExhaustFanSpeed;
            const setFanSpeed = device.SetFanSpeed;
            const automaticFanSpeed = device.AutomaticFanSpeed;
            const operationMode = device.OperationMode; //0, Heat, 2, Cool, 4, 5, 6, Fan, Auto
            const actualOperationMode = device.ActualOperationMode;
            const ventilationMode = device.VentilationMode; //Lossnay, Bypass, Auto
            const actualVentilationMode = device.ActualVentilationMode; //Lossnay, Bypass
            const effectiveFlags = device.EffectiveFlags;
            const lastEffectiveFlags = device.LastEffectiveFlags;
            const defaultCoolingSetTemperature = device.DefaultCoolingSetTemperature ?? 23;
            const defaultHeatingSetTemperature = device.DefaultHeatingSetTemperature ?? 21;
            const hasEnergyConsumedMeter = device.HasEnergyConsumedMeter;
            const currentEnergyConsumed = device.CurrentEnergyConsumed
            const currentEnergyAssignment = device.CurrentEnergyAssignment;
            const coolingDisabled = device.CoolingDisabled
            const maxOutdoorUnits = device.MaxOutdoorUnits;
            const maxIndoorUnits = device.MaxIndoorUnits;
            const maxTemperatureControlUnits = device.MaxTemperatureControlUnits;
            const modelCode = device.ModelCode;
            //const deviceId = device.DeviceID;
            //const macAddress = device.MacAddress;
            //const serialNumber = device.SerialNumber;
            const timeZoneId = device.TimeZoneID;
            const diagnosticMode = device.DiagnosticMode;
            const diagnosticEndDate = device.DiagnosticEndDate;
            const expectedCommand = device.ExpectedCommand;
            const owner = device.Owner;
            const detectedCountry = device.DetectedCountry;
            //const adaptorType = device.AdaptorType;
            const firmwareDeployment = device.FirmwareDeployment;
            const firmwareUpdateAborted = device.FirmwareUpdateAborted;
            //const linkedDevice = device.LinkedDevice;
            const wifiSignalStrength = device.WifiSignalStrength;
            const wifiAdapterStatus = device.WifiAdapterStatus;
            const position = device.Position;
            const pCycle = device.PCycle;
            const pCycleConfigured = device.PCycleConfigured;
            const recordNumMax = device.RecordNumMax;
            const lastTimeStamp = device.LastTimeStamp;
            const errorCode = device.ErrorCode;
            const hasError = device.HasError;
            const lastReset = device.LastReset;
            const flashWrites = device.FlashWrites;
            const scene = device.Scene;
            const sSLExpirationDate = device.SSLExpirationDate;
            const sPTimeout = device.SPTimeout;
            const passcode = device.Passcode;
            const serverCommunicationDisabled = device.ServerCommunicationDisabled;
            const consecutiveUploadErrors = device.ConsecutiveUploadErrors;
            const doNotRespondAfter = device.DoNotRespondAfter;
            const ownerRoleAccessLevel = device.OwnerRoleAccessLevel;
            //const ownerCountry = device.OwnerCountry;
            const hideEnergyReport = device.HideEnergyReport;
            const exceptionHash = device.ExceptionHash;
            const exceptionDate = device.ExceptionDate;
            const exceptionCount = device.ExceptionCount;
            const rate1StartTime = device.Rate1StartTime;
            const rate2StartTime = device.Rate2StartTime;
            const protocolVersion = device.ProtocolVersion;
            const unitVersion = device.UnitVersion;
            const firmwareAppVersion = device.FirmwareAppVersion?.toString() ?? 'Undefined';
            const firmwareWebVersion = device.FirmwareWebVersion;
            const firmwareWlanVersion = device.FirmwareWlanVersion;
            const effectivePCycle = device.EffectivePCycle;
            const mqttFlags = device.MqttFlags;
            const hasErrorMessages = device.HasErrorMessages;
            const hasZone2 = device.HasZone2;
            const offline = device.Offline ?? false;
            const minPcycle = device.MinPcycle;
            const maxPcycle = device.MaxPcycle;
            const supportsHourlyEnergyReport = device.SupportsHourlyEnergyReport;

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

            //diagnostic
            //const diagnosticMode = deviceData.DiagnosticMode;
            //const diagnosticEndDate = deviceData.DiagnosticEndDate;
            const location = deviceData.Location;
            //const detectedCountry = deviceData.DetectedCountry;
            const registrations = deviceData.Registrations;
            const localIPAddress = deviceData.LocalIPAddress;
            const timeZone = deviceData.TimeZone;
            const registReason = deviceData.RegistReason;
            //const expectedCommand = deviceData.ExpectedCommand;
            const registRetry = deviceData.RegistRetry;
            const dateCreated = deviceData.DateCreated;
            //const firmwareDeployment = deviceData.FirmwareDeployment;
            //const firmwareUpdateAborted = deviceData.FirmwareUpdateAborted;

            //permissions
            const permissionCanSetOperationMode = deviceData.Permissions.CanSetOperationMode;
            const permissionCanSetFanSpeed = deviceData.Permissions.CanSetFanSpeed;
            const permissionCanSetVaneDirection = deviceData.Permissions.CanSetVaneDirection;
            const permissionCanSetPower = deviceData.Permissions.CanSetPower;
            const permissionCanSetTemperatureIncrementOverride = deviceData.Permissions.CanSetTemperatureIncrementOverride;
            const permissionCanDisableLocalController = deviceData.Permissions.CanDisableLocalController;

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

            //check state changes
            const deviceDataHasNotChanged = JSON.stringify(deviceState) === JSON.stringify(this.deviceState);
            if (deviceDataHasNotChanged) {
                return;
            }
            this.deviceState = deviceState;

            //restFul
            this.emit('restFul', 'info', deviceData);
            this.emit('restFul', 'state', deviceData.Device);

            //mqtt
            this.emit('mqtt', 'Info', deviceData);
            this.emit('mqtt', 'State', deviceData.Device);

            //emit info
            this.emit('deviceInfo', manufacturer, modelIndoor, modelOutdoor, serialNumber, firmwareAppVersion);

            //emit state 
            this.emit('deviceState', deviceData);

            return true;
        } catch (error) {
            throw new Error(`Check state error: ${error}`);
        };
    };

    async readData(path) {
        try {
            const savedData = await fsPromises.readFile(path)
            if (savedData.toString().trim().length === 0) {
                return null;
            }

            try {
                const data = JSON.parse(savedData);
                return data;
            } catch (error) {
                throw new Error(`Parse JSON error: ${error}`);
            }
        } catch (error) {
            throw new Error(`Read data error: ${error}`);
        }
    }

    async send(deviceData, displayMode) {
        try {
            //set target temp based on display mode and ventilation mode
            switch (displayMode) {
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
            this.emit('externalIntegrations', deviceData);
            this.emit('deviceState', deviceData);
        }, 500);
    }
};
export default MelCloudErv;
