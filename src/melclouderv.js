"use strict";
const fs = require('fs');
const fsPromises = fs.promises;
const axios = require('axios');
const EventEmitter = require('events');
const CONSTANS = require('./constans.json');


class MELCLOUDDEVICEERV extends EventEmitter {
    constructor(config) {
        super();
        const accountName = config.accountName;
        const contextKey = config.contextKey;
        const buildingId = config.buildingId;
        const deviceId = config.deviceId;
        const debugLog = config.debugLog;
        const mqttEnabled = config.mqttEnabled;
        const prefDir = config.prefDir;
        const melCloudBuildingDeviceFile = `${prefDir}/${accountName}_Device_${deviceId}`;

        this.axiosInstanceGet = axios.create({
            method: 'GET',
            baseURL: CONSTANS.ApiUrls.BaseURL,
            timeout: 15000,
            headers: {
                'X-MitsContextKey': contextKey,
            }
        });
        this.axiosInstancePost = axios.create({
            method: 'POST',
            baseURL: CONSTANS.ApiUrls.BaseURL,
            timeout: 15000,
            headers: {
                'X-MitsContextKey': contextKey,
                'content-type': 'application/json'
            }
        });

        //set default values
        this.roomTemperature = 0;
        this.supplyTemperature = 0;
        this.outdoorTemperature = 0;
        this.roomCO2Level = 0;
        this.nightPurgeMode = 0;
        this.setTemperature = 0;
        this.setFanSpeed = 0;
        this.operationMode = 0;
        this.ventilationMode = 0;
        this.actualVentilationMode = 0;
        this.defaultHeatingSetTemperature = 0;
        this.defaultCoolingSetTemperature = 0;
        this.hideRoomTemperature = false;
        this.hideSupplyTemperature = false;
        this.hideOutdoorTemperature = false;
        this.power = false;
        this.offline = false;

        this.on('checkDeviceInfo', async () => {
            try {
                const readDeviceInfoData = await fsPromises.readFile(melCloudBuildingDeviceFile);
                const deviceInfo = JSON.parse(readDeviceInfoData);
                const debug = debugLog ? this.emit('debug', `debug Info: ${JSON.stringify(deviceInfo, null, 2)}`) : false;

                //deviceInfo
                //const deviceId = deviceInfo.DeviceID;
                //const deviceName = deviceInfo.DeviceName;
                //const buildingId = deviceInfo.BuildingID;
                const buildingName = deviceInfo.BuildingName;
                const floorId = deviceInfo.FloorID;
                const floorName = deviceInfo.FloorName;
                const areaId = deviceInfo.AreaID;
                const areaName = deviceInfo.AreaName;
                const imageId = deviceInfo.ImageID;
                const installationDate = deviceInfo.InstallationDate;
                const lastServiceDate = deviceInfo.LastServiceDate;

                //presets
                const presets = deviceInfo.Presets;
                const presetsCount = presets.length;

                const ownerId = deviceInfo.OwnerID;
                const ownerName = deviceInfo.OwnerName;
                const ownerEmail = deviceInfo.OwnerEmail;
                const accessLevel = deviceInfo.AccessLevel;
                const directAccess = deviceInfo.DirectAccess;
                const endDate = deviceInfo.EndDate;
                const zone1Name = deviceInfo.Zone1Name;
                const zone2Name = deviceInfo.Zone2Name;
                const minTemperature = deviceInfo.MinTemperature;
                const maxTemperature = deviceInfo.MaxTemperature;
                const hideVaneControls = deviceInfo.HideVaneControls;
                const hideDryModeControl = deviceInfo.HideDryModeControl;
                const hideRoomTemperature = deviceInfo.HideRoomTemperature;
                const hideSupplyTemperature = deviceInfo.HideSupplyTemperature;
                const hideOutdoorTemperature = deviceInfo.HideOutdoorTemperature;
                const buildingCountry = deviceInfo.BuildingCountry;
                //const ownerCountry = deviceInfo.OwnerCountry;
                //const adaptorType = deviceInfo.AdaptorType;
                //const linkedDevice = deviceInfo.LinkedDevice;
                const type = deviceInfo.Type;
                //const macAddress = deviceInfo.MacAddress;
                //const serialNumber = (deviceInfo.SerialNumber !== undefined && deviceInfo.SerialNumber !== null) ? deviceInfo.SerialNumber : 'Undefined';

                //device
                const device = deviceInfo.Device;
                const listHistory24Formatters = Array.isArray(device.ListHistory24Formatters) ? device.ListHistory24Formatters : [];
                const listHistory24FormattersCount = listHistory24Formatters.length;
                const pCycleActual = device.PCycleActual;
                const errorMessages = device.ErrorMessages;
                const deviceType = device.DeviceType;
                const hasTemperatureControlUnit = device.HasTemperatureControlUnit;
                const hasCoolOperationMode = device.HasCoolOperationMode;
                const hasHeatOperationMode = device.HasHeatOperationMode;
                const hasAutoOperationMode = device.HasAutoOperationMode;
                const airDirectionFunction = device.AirDirectionFunction;
                const hasBypassVentilationMode = device.HasBypassVentilationMode || false;
                const hasAutoVentilationMode = device.HasAutoVentilationMode || false;
                const hasRoomTemperature = device.HasRoomTemperature;
                const hasSupplyTemperature = device.HasSupplyTemperature;
                const hasOutdoorTemperature = device.HasOutdoorTemperature;
                const hasCO2Sensor = device.HasCO2Sensor;
                const numberOfFanSpeeds = device.NumberOfFanSpeeds || 0;
                const hasHalfDegreeIncrements = device.HasHalfDegreeIncrements;
                const temperatureIncrement = device.TemperatureIncrement || 1;
                const temperatureIncrementOverride = device.TemperatureIncrementOverride;
                const minTempCoolDry = device.MinTempCoolDry;
                const maxTempCoolDry = device.MaxTempCoolDry;
                const minTempHeat = device.MinTempHeat;
                const maxTempHeat = device.MaxTempHeat;
                const minTempAutomatic = device.MinTempAutomatic;
                const maxTempAutomatic = device.MaxTempAutomatic;
                const setSupplyTemperatureMode = device.SetSupplyTemperatureMode;
                const hasAutomaticFanSpeed = device.HasAutomaticFanSpeed || false;
                const coreMaintenanceRequired = device.CoreMaintenanceRequired || false;
                const filterMaintenanceRequired = device.FilterMaintenanceRequired || false;
                const power = device.Power;
                const roomTemperature = device.RoomTemperature;
                const supplyTemperature = device.SupplyTemperature;
                const outdoorTemperature = device.OutdoorTemperature;
                const roomCO2Level = device.RoomCO2Level;
                const nightPurgeMode = device.NightPurgeMode;
                const thermostatOn = device.ThermostatOn;
                const setTemperature = device.SetTemperature;
                const actualSupplyFanSpeed = device.ActualSupplyFanSpeed;
                const actualExhaustFanSpeed = device.ActualExhaustFanSpeed;
                const setFanSpeed = device.SetFanSpeed;
                const automaticFanSpeed = device.AutomaticFanSpeed;
                const operationMode = device.OperationMode;
                const actualOperationMode = device.ActualOperationMode;
                const ventilationMode = device.VentilationMode;
                const actualVentilationMode = device.ActualVentilationMode;
                const effectiveFlags = device.EffectiveFlags;
                const inStandbyMode = device.InStandbyMode;
                const demandPercentage = device.DemandPercentage;
                const configuredDemandPercentage = device.ConfiguredDemandPercentage;
                const hasDemandSideControl = device.HasDemandSideControl;
                const defaultCoolingSetTemperature = device.DefaultCoolingSetTemperature;
                const defaultHeatingSetTemperature = device.DefaultHeatingSetTemperature;
                const hasEnergyConsumedMeter = device.HasEnergyConsumedMeter;
                const currentEnergyConsumed = device.CurrentEnergyConsumed;
                const currentEnergyAssignment = device.CurrentEnergyAssignment;
                const coolingDisabled = device.CoolingDisabled
                const minPcycle = device.MinPcycle;
                const maxPcycle = device.MaxPcycle;
                const effectivePCycle = device.EffectivePCycle;
                const maxOutdoorUnits = device.MaxOutdoorUnits;
                const maxIndoorUnits = device.MaxIndoorUnits;
                const maxTemperatureControlUnits = device.MaxTemperatureControlUnits;
                const modelCode = device.ModelCode;
                //const deviceId = device.DeviceID;
                const macAddress = device.MacAddress;
                const serialNumber = device.SerialNumber !== null ? device.SerialNumber.toString() : 'Undefined';
                const timeZoneId = device.TimeZoneID;
                const diagnosticMode = device.DiagnosticMode;
                const diagnosticEndDate = device.DiagnosticEndDate;
                const expectedCommand = device.ExpectedCommand;
                const owner = device.Owner;
                const detectedCountry = device.DetectedCountry;
                const adaptorType = device.AdaptorType;
                const firmwareDeployment = device.FirmwareDeployment;
                const firmwareUpdateAborted = device.FirmwareUpdateAborted;
                const linkedDevice = device.LinkedDevice;
                const wifiSignalStrength = device.WifiSignalStrength;
                const wifiAdapterStatus = device.WifiAdapterStatus;
                const position = device.Position;
                const pCycle = device.PCycle;
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
                const ownerCountry = device.OwnerCountry;
                const hideEnergyReport = device.HideEnergyReport;
                const exceptionHash = device.ExceptionHash;
                const exceptionDate = device.ExceptionDate;
                const exceptionCount = device.ExceptionCount;
                const rate1StartTime = device.Rate1StartTime;
                const rate2StartTime = device.Rate2StartTime;
                const protocolVersion = device.ProtocolVersion;
                const unitVersion = device.UnitVersion;
                const firmwareAppVersion = device.FirmwareAppVersion !== null ? device.FirmwareAppVersion.toString() : 'Undefined';
                const firmwareWebVersion = device.FirmwareWebVersion;
                const firmwareWlanVersion = device.FirmwareWlanVersion;
                const mqttFlags = device.MqttFlags;
                const hasErrorMessages = device.HasErrorMessages;
                const hasZone2 = device.HasZone2;
                const offline = device.Offline;
                const supportsHourlyEnergyReport = device.SupportsHourlyEnergyReport;

                //units info
                const units = Array.isArray(device.Units) ? device.Units : [];
                const serialsNumberIndoor = [];
                const serialsNumberOutdoor = [];
                const modelsNumberIndoor = [];
                const modelsNumberOutdoor = [];
                const modelsIndoor = [];
                const modelsOutdoor = [];
                const typesIndoor = [];
                const typesOutdoor = [];
                for (const unit of units) {
                    const unitId = unit.ID;
                    const unitDevice = unit.Device;
                    const unitSerialNumber = unit.SerialNumber && unit.SerialNumber !== null ? unit.SerialNumber.toString() : 'unknown';
                    const unitModelNumber = unit.ModelNumber && unit.ModelNumber !== null ? unit.ModelNumber : 'unknown';
                    const unitModel = unit.Model && unit.Model !== null ? unit.Model.toString() : 'unknown';
                    const unitType = unit.UnitType && unit.UnitType !== null ? unit.UnitType : 'unknown';
                    const unitIsIndoor = unit.IsIndoor || false;

                    const pushSerial = unitIsIndoor ? serialsNumberIndoor.push(unitSerialNumber) : serialsNumberOutdoor.push(unitSerialNumber);
                    const pushModelNumber = unitIsIndoor ? modelsNumberIndoor.push(unitModelNumber) : modelsNumberOutdoor.push(unitModelNumber);
                    const pushUnitModel = unitIsIndoor ? modelsIndoor.push(unitModel) : modelsOutdoor.push(unitModel);
                    const pushUnitTypel = unitIsIndoor ? typesIndoor.push(unitType) : typesOutdoor.push(unitType);
                }

                const manufacturer = 'Mitsubishi';
                const modelIndoor = modelsIndoor.length > 0 ? modelsIndoor[0] : 'Undefined';
                const modelOutdoor = modelsOutdoor.length > 0 ? modelsOutdoor[0] : 'Undefined'

                //diagnostic
                //const diagnosticMode = deviceInfo.DiagnosticMode;
                //const diagnosticEndDate = deviceInfo.DiagnosticEndDate;
                const location = deviceInfo.Location;
                //const detectedCountry = deviceInfo.DetectedCountry;
                const registrations = deviceInfo.Registrations;
                const localIPAddress = deviceInfo.LocalIPAddress;
                const timeZone = deviceInfo.TimeZone;
                const registReason = deviceInfo.RegistReason;
                //const expectedCommand = deviceInfo.ExpectedCommand;
                const registRetry = deviceInfo.RegistRetry;
                const dateCreated = deviceInfo.DateCreated;
                //const firmwareDeployment = deviceInfo.FirmwareDeployment;
                //const firmwareUpdateAborted = deviceInfo.FirmwareUpdateAborted;

                //permissions
                const permissionCanSetOperationMode = deviceInfo.Permissions.CanSetOperationMode;
                const permissionCanSetFanSpeed = deviceInfo.Permissions.CanSetFanSpeed;
                const permissionCanSetVaneDirection = deviceInfo.Permissions.CanSetVaneDirection;
                const permissionCanSetPower = deviceInfo.Permissions.CanSetPower;
                const permissionCanSetTemperatureIncrementOverride = deviceInfo.Permissions.CanSetTemperatureIncrementOverride;
                const permissionCanDisableLocalController = deviceInfo.Permissions.CanDisableLocalController;

                this.emit('deviceInfo', manufacturer, modelIndoor, modelOutdoor, serialNumber, firmwareAppVersion, presets, presetsCount, hasAutoVentilationMode, hasBypassVentilationMode, hasAutomaticFanSpeed, numberOfFanSpeeds, temperatureIncrement, coreMaintenanceRequired, filterMaintenanceRequired);
                const mqtt = mqttEnabled ? this.emit('mqtt', `Info`, JSON.stringify(deviceInfo, null, 2)) : false;

                //check device state
                await new Promise(resolve => setTimeout(resolve, 1500));
                this.emit('checkDeviceState');
            } catch (error) {
                this.emit('error', `check info, ${error}, check again in 60s.`);
                this.checkDeviceInfo();
            };
        }).on('checkDeviceState', async () => {
            try {
                const url = CONSTANS.ApiUrls.DeviceState.replace("DID", deviceId).replace("BID", buildingId);
                const responseData = await this.axiosInstanceGet(url);
                const deviceState = responseData.data;
                const deviceStateData = JSON.stringify(deviceState, null, 2);
                const debug = debugLog ? this.emit('debug', `debug State: ${deviceStateData}`) : false;

                // device ata state
                const effectiveFlags = deviceState.EffectiveFlags;
                const localIPAddress = deviceState.LocalIPAddress;
                const roomTemperature = deviceState.RoomTemperature;
                const supplyTemperature = deviceState.SupplyTemperature;
                const outdoorTemperature = deviceState.OutdoorTemperature;
                const roomCO2Level = deviceState.RoomCO2Level;
                const nightPurgeMode = deviceState.NightPurgeMode;
                const setTemperature = deviceState.SetTemperature;
                const setFanSpeed = deviceState.SetFanSpeed;
                const operationMode = deviceState.OperationMode;
                const ventilationMode = deviceState.VentilationMode;
                const actualVentilationMode = deviceState.ActualVentilationMode;
                const name = deviceState.Name;
                const numberOfFanSpeeds = deviceState.NumberOfFanSpeeds;
                const weatherObservations = deviceState.WeatherObservations;
                const errorMessage = deviceState.ErrorMessage;
                const errorCode = deviceState.ErrorCode;
                const defaultHeatingSetTemperature = deviceState.DefaultHeatingSetTemperature;
                const defaultCoolingSetTemperature = deviceState.DefaultCoolingSetTemperature;
                const temperatureIncrementOverride = deviceState.TemperatureIncrementOverride;
                const hideRoomTemperature = deviceState.HideRoomTemperature;
                const hideSupplyTemperature = deviceState.HideSupplyTemperature;
                const hideOutdoorTemperature = deviceState.HideOutdoorTemperature;
                //const deviceId = deviceState.DeviceID;
                const deviceType = deviceState.DeviceType;
                const lastCommunication = deviceState.LastCommunication;
                const nextCommunication = deviceState.NextCommunication;
                const power = deviceState.Power;
                const hasPendingCommand = deviceState.HasPendingCommand;
                const offline = deviceState.Offline;
                const scene = deviceState.Scene;
                const sceneOwner = deviceState.SceneOwner;

                const stateHasNotChanged =
                    roomTemperature === this.roomTemperature
                    && supplyTemperature === this.supplyTemperature
                    && outdoorTemperature === this.outdoorTemperature
                    && roomCO2Level === this.roomCO2Level
                    && nightPurgeMode === this.nightPurgeMode
                    && setTemperature === this.setTemperature
                    && setFanSpeed === this.setFanSpeed
                    && operationMode === this.operationMode
                    && ventilationMode === this.ventilationMode
                    && actualVentilationMode === this.actualVentilationMode
                    && defaultHeatingSetTemperature === this.defaultHeatingSetTemperature
                    && defaultCoolingSetTemperature === this.defaultCoolingSetTemperature
                    && hideRoomTemperature === this.hideRoomTemperature
                    && hideSupplyTemperature === this.hideSupplyTemperature
                    && hideOutdoorTemperature === this.hideOutdoorTemperature
                    && power === this.power
                    && offline === this.offline;

                if (stateHasNotChanged) {
                    this.checkDeviceInfo();
                    return;
                }

                this.roomTemperature = roomTemperature;
                this.supplyTemperature = supplyTemperature;
                this.outdoorTemperature = outdoorTemperature;
                this.roomCO2Level = roomCO2Level;
                this.nightPurgeMode = nightPurgeMode;
                this.setTemperature = setTemperature;
                this.setFanSpeed = setFanSpeed;
                this.operationMode = operationMode;
                this.ventilationMode = ventilationMode;
                this.actualVentilationMode = actualVentilationMode;
                this.defaultHeatingSetTemperature = defaultHeatingSetTemperature;
                this.defaultCoolingSetTemperature = defaultCoolingSetTemperature;
                this.hideRoomTemperature = hideRoomTemperature;
                this.hideSupplyTemperature = hideSupplyTemperature;
                this.hideOutdoorTemperature = hideOutdoorTemperature;
                this.power = power;
                this.offline = offline;

                this.emit('deviceState', deviceState, roomTemperature, supplyTemperature, outdoorTemperature, roomCO2Level, nightPurgeMode, setTemperature, setFanSpeed, operationMode, ventilationMode, actualVentilationMode, defaultHeatingSetTemperature, defaultCoolingSetTemperature, hideRoomTemperature, hideSupplyTemperature, hideOutdoorTemperature, power, offline);
                const mqtt = mqttEnabled ? this.emit('mqtt', `State`, JSON.stringify(deviceState, null, 2)) : false;

                this.checkDeviceInfo();
            } catch (error) {
                this.emit('error', `check device state error, ${error}, check again in 60s.`);
                this.checkDeviceInfo();
            };
        });

        this.emit('checkDeviceInfo');
    };

    async checkDeviceInfo() {
        await new Promise(resolve => setTimeout(resolve, 65000));
        this.emit('checkDeviceInfo');
    };

    send(url, newData, type) {
        return new Promise(async (resolve, reject) => {
            if (!type) {
                newData.HasPendingCommand = true;
            };

            try {
                const options = {
                    data: newData
                };

                await this.axiosInstancePost(url, options);
                this.emit('checkDeviceInfo');
                await new Promise(resolve => setTimeout(resolve, 2000));
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = MELCLOUDDEVICEERV;
