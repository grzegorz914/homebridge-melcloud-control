"use strict";
const fs = require('fs');
const fsPromises = fs.promises;
const axios = require('axios');
const https = require('https');
const EventEmitter = require('events');
const CONSTANS = require('./constans.json');

class MelCloudErv extends EventEmitter {
    constructor(config) {
        super();
        const prefDir = config.prefDir;
        const accountName = config.accountName;
        const contextKey = config.contextKey;
        const buildingId = config.buildingId;
        const deviceId = config.deviceId;
        const debugLog = config.debugLog;
        const restFulEnabled = config.restFulEnabled;
        const mqttEnabled = config.mqttEnabled;
        const deviceInfoFile = `${prefDir}/${accountName}_Device_${deviceId}`;
        const refreshIntervalSec = config.refreshInterval / 1000;
        this.refreshInterval = config.refreshInterval;

        this.axiosInstanceGet = axios.create({
            method: 'GET',
            baseURL: CONSTANS.ApiUrls.BaseURL,
            timeout: 25000,
            headers: {
                'X-MitsContextKey': contextKey,
            },
            withCredentials: true,
            httpsAgent: new https.Agent({
                keepAlive: true,
                rejectUnauthorized: false
            })
        });
        this.axiosInstancePost = axios.create({
            method: 'POST',
            baseURL: CONSTANS.ApiUrls.BaseURL,
            timeout: 25000,
            headers: {
                'X-MitsContextKey': contextKey,
                'content-type': 'application/json'
            },
            withCredentials: true,
            httpsAgent: new https.Agent({
                keepAlive: true,
                rejectUnauthorized: false
            })
        });

        //set default values
        this.roomTemperature = 0;
        this.supplyTemperature = 0;
        this.outdoorTemperature = 0;
        this.nightPurgeMode = false;
        this.setTemperature = 0;
        this.setFanSpeed = 0;
        this.operationMode = 0;
        this.ventilationMode = 0;
        this.defaultHeatingSetTemperature = 0;
        this.defaultCoolingSetTemperature = 0;
        this.hideRoomTemperature = false;
        this.hideSupplyTemperature = false;
        this.hideOutdoorTemperature = false;
        this.power = false;
        this.offline = false;

        this.on('checkDeviceInfo', async () => {
            try {
                //read device info from file
                const deviceInfo = await this.readData(deviceInfoFile);
                const debug = debugLog ? this.emit('debug', `Info: ${JSON.stringify(deviceInfo, null, 2)}`) : false;

                if (!deviceInfo) {
                    this.checkDeviceInfo();
                    return;
                }

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
                const pCycleActual = device.PCycleActual;
                const errorMessages = device.ErrorMessages;
                const deviceType = device.DeviceType;
                const ervFlags = device.ErvFlags;
                const ervModel = device.ErvModel;
                const labelControls = device.LabelControls;
                const devicePowerDisabled = device.DevicePowerDisabled;
                const silentMode = device.SilentMode;
                const deviceHolidayModde = device.DeviceHolidayMode;
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
                const hasRoomTemperature = device.HasRoomTemperature;
                const hasSupplyTemperature = device.HasSupplyTemperature;
                const hasOutdoorTemperature = device.HasOutdoorTemperature;
                const hasCO2Sensor = device.HasCO2Sensor;
                const hasPM25Sensor = device.HasPM25Sensor;
                const pM25SensorStatus = device.PM25SensorStatus;
                const pM25Level = device.PM25Level;
                const numberOfFanSpeeds = device.NumberOfFanSpeeds ?? 0;
                const hasHalfDegreeIncrements = device.HasHalfDegreeIncrements;
                const temperatureIncrementOverride = device.TemperatureIncrementOverride;
                const temperatureIncrement = device.TemperatureIncrement ?? 1;
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
                const operationMode = device.OperationMode; //0, Heat, 2, Cool, 4, 5, 6, Fan, Auto
                const actualOperationMode = device.ActualOperationMode;
                const ventilationMode = device.VentilationMode; //Lossnay, Bypass, Auto
                const actualVentilationMode = device.ActualVentilationMode; //Lossnay, Bypass
                const effectiveFlags = device.EffectiveFlags;
                const lastEffectiveFlags = device.LastEffectiveFlags;
                const defaultCoolingSetTemperature = device.DefaultCoolingSetTemperature;
                const defaultHeatingSetTemperature = device.DefaultHeatingSetTemperature;
                const hasEnergyConsumedMeter = device.HasEnergyConsumedMeter;
                const currentEnergyConsumed = device.CurrentEnergyConsumed
                const currentEnergyAssignment = device.CurrentEnergyAssignment;
                const coolingDisabled = device.CoolingDisabled
                const maxOutdoorUnits = device.MaxOutdoorUnits;
                const maxIndoorUnits = device.MaxIndoorUnits;
                const maxTemperatureControlUnits = device.MaxTemperatureControlUnits;
                const modelCode = device.ModelCode;
                //const deviceId = device.DeviceID;
                const macAddress = device.MacAddress;
                const serialNumber = device.SerialNumber ?? 'Undefined';
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
                const ownerCountry = device.OwnerCountry;
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
                const offline = device.Offline;
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
                let modelIndoor = 'Undefined';
                let typeIndoor = 0;

                //outdoor
                let idOutdoor = 0;
                let deviceOutdoor = 0;
                let serialNumberOutdoor = 'Undefined';
                let modelNumberOutdoor = 0;
                let modelOutdoor = 'Undefined';
                let typeOutdoor = 0;

                //units array
                for (const unit of units) {
                    const unitId = unit.ID;
                    const unitDevice = unit.Device;
                    const unitSerialNumber = unit.SerialNumber ?? 'Undefined';
                    const unitModelNumber = unit.ModelNumber;
                    const unitModel = unit.Model ?? 'Undefined';
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

                if (unitsCount === 0) {
                    this.emit('message', `No device found, check again in ${refreshIntervalSec}s.`);
                    this.checkDeviceInfo();
                    return;
                };

                this.emit('deviceInfo', manufacturer, modelIndoor, modelOutdoor, serialNumber, firmwareAppVersion, presets, presetsCount, hasCoolOperationMode, hasHeatOperationMode, hasAutoOperationMode, hasRoomTemperature, hasSupplyTemperature, hasOutdoorTemperature, hasCO2Sensor, hasPM25Sensor, pM25SensorStatus, pM25Level, hasAutoVentilationMode, hasBypassVentilationMode, hasAutomaticFanSpeed, coreMaintenanceRequired, filterMaintenanceRequired, roomCO2Level, actualVentilationMode, numberOfFanSpeeds, temperatureIncrement);

                //restFul
                const restFul = restFulEnabled ? this.emit('restFul', 'info', deviceInfo) : false;

                //mqtt
                const mqtt = mqttEnabled ? this.emit('mqtt', `Info`, deviceInfo) : false;

                //check device state
                await new Promise(resolve => setTimeout(resolve, 1000));
                this.emit('checkDeviceState');
            } catch (error) {
                this.emit('error', `check info, ${error}, check again in ${refreshIntervalSec}s.`);
                this.checkDeviceInfo();
            };
        }).on('checkDeviceState', async () => {
            try {
                const url = CONSTANS.ApiUrls.DeviceState.replace("DID", deviceId).replace("BID", buildingId);
                const responseData = await this.axiosInstanceGet(url);
                const deviceState = responseData.data;
                const debug = debugLog ? this.emit('debug', `State: ${JSON.stringify(deviceState, null, 2)}`) : false;

                // device ata state
                const effectiveFlags = deviceState.EffectiveFlags;
                const localIPAddress = deviceState.LocalIPAddress;
                const roomTemperature = deviceState.RoomTemperature;
                const supplyTemperature = deviceState.SupplyTemperature;
                const outdoorTemperature = deviceState.OutdoorTemperature;
                const roomCO2Level = deviceState.RoomCO2Level;
                const nightPurgeMode = deviceState.NightPurgeMode;
                const coreMaintenanceRequired = deviceState.CoreMaintenanceRequired;
                const filterMaintenanceRequired = deviceState.FilterMaintenanceRequired;
                const setTemperature = deviceState.SetTemperature;
                const setFanSpeed = deviceState.SetFanSpeed;
                const operationMode = deviceState.OperationMode;
                const ventilationMode = deviceState.VentilationMode;
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
                const ervFlags = deviceState.ErvFlags;
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
                    && nightPurgeMode === this.nightPurgeMode
                    && setTemperature === this.setTemperature
                    && setFanSpeed === this.setFanSpeed
                    && operationMode === this.operationMode
                    && ventilationMode === this.ventilationMode
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
                this.nightPurgeMode = nightPurgeMode;
                this.setTemperature = setTemperature;
                this.setFanSpeed = setFanSpeed;
                this.operationMode = operationMode;
                this.ventilationMode = ventilationMode;
                this.defaultHeatingSetTemperature = defaultHeatingSetTemperature;
                this.defaultCoolingSetTemperature = defaultCoolingSetTemperature;
                this.hideRoomTemperature = hideRoomTemperature;
                this.hideSupplyTemperature = hideSupplyTemperature;
                this.hideOutdoorTemperature = hideOutdoorTemperature;
                this.power = power;
                this.offline = offline;

                this.emit('deviceState', deviceState, roomTemperature, supplyTemperature, outdoorTemperature, nightPurgeMode, setTemperature, setFanSpeed, operationMode, ventilationMode, defaultHeatingSetTemperature, defaultCoolingSetTemperature, hideRoomTemperature, hideSupplyTemperature, hideOutdoorTemperature, power, offline);

                //restFul
                const restFul = restFulEnabled ? this.emit('restFul', 'state', deviceState) : false;

                //mqtt
                const mqtt = mqttEnabled ? this.emit('mqtt', `State`, deviceState) : false;

                this.checkDeviceInfo();
            } catch (error) {
                this.emit('error', `check device state error, ${error}, check again in ${refreshIntervalSec}s.`);
                this.checkDeviceInfo();
            };
        });

        this.emit('checkDeviceInfo');
    };

    async checkDeviceInfo() {
        await new Promise(resolve => setTimeout(resolve, this.refreshInterval));
        this.emit('checkDeviceInfo');
    };

    readData(path) {
        return new Promise(async (resolve, reject) => {
            try {
                const savedData = await fsPromises.readFile(path)
                const data = savedData.length > 0 ? JSON.parse(savedData) : false;
                resolve(data);
            } catch (error) {
                reject(`read data from path: ${path}, error: ${error}`);
            }
        });
    }

    send(deviceState) {
        return new Promise(async (resolve, reject) => {
            try {
                deviceState.HasPendingCommand = true;
                const options = {
                    data: deviceState
                };

                await this.axiosInstancePost(CONSTANS.ApiUrls.SetErv, options);
                resolve();

                await new Promise(resolve => setTimeout(resolve, 250));
                this.emit('deviceState', deviceState, deviceState.RoomTemperature, deviceState.SupplyTemperature, deviceState.OutdoorTemperature, deviceState.NightPurgeMode, deviceState.SetTemperature, deviceState.SetFanSpeed, deviceState.OperationMode, deviceState.VentilationMode, deviceState.DefaultHeatingSetTemperature, deviceState.DefaultCoolingSetTemperature, deviceState.HideRoomTemperature, deviceState.HideSupplyTemperature, deviceState.HideOutdoorTemperature, deviceState.Power, deviceState.Offline);;
                this.checkDeviceInfo();
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = MelCloudErv;
