import { promises as fsPromises } from 'fs';
import { Agent } from 'https';
import axios from 'axios';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import { ApiUrls } from './constants.js';

class MelCloudAta extends EventEmitter {
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
            this.emit('success', `Impulse generator ${state ? 'started' : 'stopped'}`);
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
            if (this.enableDebugMode) this.emit('debug', `Device Data: ${JSON.stringify(deviceData, null, 2)}`);

            //device info
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
            const hideVaneControls = deviceData.HideVaneControls ?? false;
            const hideDryModeControl = deviceData.HideDryModeControl ?? false;
            const hideRoomTemperature = deviceData.HideRoomTemperature;
            const hideSupplyTemperature = deviceData.HideSupplyTemperature;
            const hideOutdoorTemperature = deviceData.HideOutdoorTemperature;
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
            const canCool = device.CanCool;
            const canHeat = device.CanHeat;
            const canDry = device.CanDry;
            const canAuto = device.CanAuto;
            const hasAutomaticFanSpeed = device.HasAutomaticFanSpeed;
            const airDirectionFunction = device.AirDirectionFunction;
            const swingFunction = device.SwingFunction;
            const numberOfFanSpeeds = device.NumberOfFanSpeeds;
            const useTemperatureA = device.UseTemperatureA;
            const temperatureIncrementOverride = device.TemperatureIncrementOverride; //Auto, 1, 0.5
            const temperatureIncrement = device.TemperatureIncrement; //1, 0.5
            const minTempCoolDry = device.MinTempCoolDry;
            const maxTempCoolDry = device.MaxTempCoolDry;
            const minTempHeat = device.MinTempHeat;
            const maxTempHeat = device.MaxTempHeat;
            const minTempAutomatic = device.MinTempAutomatic;
            const maxTempAutomatic = device.MaxTempAutomatic;
            const legacyDevice = device.LegacyDevice;
            const unitSupportsStandbyMode = device.UnitSupportsStandbyMode;
            const isSplitSystem = device.IsSplitSystem;
            const hasHalfDegreeIncrements = device.HasHalfDegreeIncrements;
            const hasOutdoorTemperature = device.HasOutdoorTemperature;
            const modelIsAirCurtain = device.ModelIsAirCurtain;
            const modelSupportsFanSpeed = device.ModelSupportsFanSpeed;
            const modelSupportsAuto = device.ModelSupportsAuto;
            const modelSupportsHeat = device.ModelSupportsHeat;
            const modelSupportsDry = device.ModelSupportsDry;
            const modelSupportsVaneVertical = device.ModelSupportsVaneVertical;
            const modelSupportsVaneHorizontal = device.ModelSupportsVaneHorizontal;
            const modelSupportsWideVane = device.ModelSupportsWideVane;
            const modelDisableEnergyReport = device.ModelDisableEnergyReport;
            const modelSupportsStandbyMode = device.ModelSupportsStandbyMode;
            const modelSupportsEnergyReporting = device.ModelSupportsEnergyReporting;
            const prohibitSetTemperature = device.ProhibitSetTemperature;
            const prohibitOperationMode = device.ProhibitOperationMode;
            const prohibitPower = device.ProhibitPower;
            const power = device.Power;
            const roomTemperature = device.RoomTemperature;
            const outdoorTemperature = device.OutdoorTemperature;
            const setTemperature = device.SetTemperature;
            const actualFanSpeed = device.ActualFanSpeed;
            const fanSpeed = device.FanSpeed;
            const automaticFanSpeed = device.AutomaticFanSpeed;
            const vaneVerticalDirection = device.VaneVerticalDirection;
            const vaneVerticalSwing = device.VaneVerticalSwing;
            const vaneHorizontalDirection = device.VaneHorizontalDirection;
            const vaneHorizontalSwing = device.VaneHorizontalSwing;
            const operationMode = device.OperationMode;
            const effectiveFlags = device.EffectiveFlags;
            const inStandbyMode = device.InStandbyMode;
            const demandPercentage = device.DemandPercentage;
            const configuredDemandPercentage = device.ConfiguredDemandPercentage;
            const hasDemandSideControl = device.HasDemandSideControl;
            const defaultCoolingSetTemperature = device.DefaultCoolingSetTemperature;
            const defaultHeatingSetTemperature = device.DefaultHeatingSetTemperature;
            const roomTemperatureLabel = device.RoomTemperatureLabel;
            const heatingEnergyConsumedRate1 = device.HeatingEnergyConsumedRate1;
            const heatingEnergyConsumedRate2 = device.HeatingEnergyConsumedRate2;
            const coolingEnergyConsumedRate1 = device.CoolingEnergyConsumedRate1;
            const coolingEnergyConsumedRate2 = device.CoolingEnergyConsumedRate2;
            const autoEnergyConsumedRate1 = device.AutoEnergyConsumedRate1;
            const autoEnergyConsumedRate2 = device.AutoEnergyConsumedRate2;
            const dryEnergyConsumedRate1 = device.DryEnergyConsumedRate1;
            const dryEnergyConsumedRate2 = device.DryEnergyConsumedRate2;
            const fanEnergyConsumedRate1 = device.FanEnergyConsumedRate1;
            const fanEnergyConsumedRate2 = device.FanEnergyConsumedRate2;
            const otherEnergyConsumedRate1 = device.OtherEnergyConsumedRate1;
            const otherEnergyConsumedRate2 = device.OtherEnergyConsumedRate2;
            const hasEnergyConsumedMeter = device.HasEnergyConsumedMeter;
            const currentEnergyConsumed = device.CurrentEnergyConsumed;
            const currentEnergyMode = device.CurrentEnergyMode;
            const coolingDisabled = device.CoolingDisabled
            const energyCorrectionModel = device.EnergyCorrectionModel;
            const energyCorrectionActive = device.EnergyCorrectionActive;
            const minPcycle = device.MinPcycle;
            const maxPcycle = device.MaxPcycle;
            const effectivePCycle = device.EffectivePCycle;
            const maxOutdoorUnits = device.MaxOutdoorUnits;
            const maxIndoorUnits = device.MaxIndoorUnits;
            const maxTemperatureControlUnits = device.MaxTemperatureControlUnits;
            const modelCode = device.ModelCode;
            //const deviceId = device.DeviceID;
            //const macAddress = device.MacAddress;
            //const serialNumber = device.SerialNumber;
            const timeZoneID = device.TimeZoneID;
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
            const linkToMELCloudHome = device.LinkToMELCloudHome;
            const linkedByUserFromMELCloudHome = device.LinkedByUserFromMELCloudHome;
            const mqttFlags = device.MqttFlags;
            const hasErrorMessages = device.HasErrorMessages;
            const hasZone2 = device.HasZone2;
            const offline = device.Offline ?? false;
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
                this.emit('warn', `Units are not configured in MELCloud service`);
            };

            const deviceState = {
                Power: power,
                InStandbyMode: inStandbyMode,
                RoomTemperature: roomTemperature,
                OutdoorTemperature: outdoorTemperature,
                SetTemperature: setTemperature,
                ActualFanSpeed: actualFanSpeed,
                FanSpeed: fanSpeed,
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
                if (this.enableDebugMode) this.emit('debug', `Device state not changed`);
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
            //set target temp based on display mode and operation mode
            switch (displayMode) {
                case 1: //Heather/Cooler
                    switch (deviceData.Device.OperationMode) {
                        case 1: //HEAT
                            deviceData.Device.SetTemperature = deviceData.Device.DefaultHeatingSetTemperature;
                            break;
                        case 2: //DRY
                            deviceData.Device.SetTemperature = deviceData.Device.DefaultCoolingSetTemperature;
                            break;
                        case 3: //COOL
                            deviceData.Device.SetTemperature = deviceData.Device.DefaultCoolingSetTemperature;
                            break;
                        case 7: //FAN
                            deviceData.Device.SetTemperature = deviceData.Device.SetTemperature;
                            break;
                        case 8: //AUTO
                            const setTemperature = (deviceData.Device.DefaultCoolingSetTemperature + deviceData.Device.DefaultHeatingSetTemperature) / 2;
                            deviceData.Device.SetTemperature = setTemperature;
                            break;
                        case 9: //HISEE HEAT
                            deviceData.Device.SetTemperature = deviceData.Device.DefaultHeatingSetTemperature;
                            break;
                        case 10: //ISEE DRY
                            deviceData.Device.SetTemperature = deviceData.Device.DefaultCoolingSetTemperature;
                            break;
                        case 11: //ISEE COOL
                            deviceData.Device.SetTemperature = deviceData.Device.DefaultCoolingSetTemperature;
                            break;
                    };
                case 2: //Thermostat
                    deviceData.Device.SetTemperature = deviceData.Device.SetTemperature;
                    break;
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

            await this.axiosInstancePost(ApiUrls.SetAta, payload);
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
export default MelCloudAta;
