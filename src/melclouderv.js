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

        //store variable to compare
        this.roomTemperature = 0;
        this.setTemperature = 0;
        this.setFanSpeed = 0;
        this.operationMode = 0;
        this.supplyTemperature = 0;
        this.outdoorTemperature = 0;
        this.nightPurgeMode = 0;
        this.power = false;
        this.roomCO2Level = 0;
        this.ventilationMode = 0;
        this.actualVentilationMode = 0;
        this.hideRoomTemperature = false;
        this.hideSupplyTemperature = false;
        this.hideOutdoorTemperature = false;

        this.on('checkDeviceInfo', async () => {
            try {
                const readDeviceInfoData = await fsPromises.readFile(melCloudBuildingDeviceFile);
                const deviceInfo = JSON.parse(readDeviceInfoData);
                const debug = debugLog ? this.emit('debug', `debug Info: ${JSON.stringify(deviceInfo, null, 2)}`) : false;

                //deviceInfo
                //const deviceID = deviceInfo.DeviceID;
                //const deviceName = deviceInfo.DeviceName;
                const buildingName = deviceInfo.BuildingName;
                const floorID = deviceInfo.FloorID;
                const floorName = deviceInfo.FloorName;
                const areaID = deviceInfo.AreaID;
                const areaName = deviceInfo.AreaName;
                const imageID = deviceInfo.ImageID;
                const installationDate = deviceInfo.InstallationDate;
                const lastServiceDate = deviceInfo.LastServiceDate;

                //presets
                const devicePresets = deviceInfo.Presets;
                const devicePresetsCount = devicePresets.length;

                const ownerID = deviceInfo.OwnerID;
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
                const ownerCountry = deviceInfo.OwnerCountry;
                const adaptorType = deviceInfo.AdaptorType;
                const linkedDevice = deviceInfo.LinkedDevice;
                const type = deviceInfo.Type;
                const macAddress = deviceInfo.MacAddress;
                const serialNumber = (deviceInfo.SerialNumber !== undefined && deviceInfo.SerialNumber !== null) ? deviceInfo.SerialNumber : 'Undefined';

                //device
                const deviceListHistory24Formatters = Array.isArray(deviceInfo.Device.ListHistory24Formatters) ? deviceInfo.Device.ListHistory24Formatters : [];
                const deviceListHistory24FormattersCount = deviceListHistory24Formatters.length;

                const devicePCycleActual = deviceInfo.Device.PCycleActual;
                const deviceErrorMessages = deviceInfo.Device.ErrorMessages;
                const deviceDeviceType = deviceInfo.Device.DeviceType;
                const deviceHasTemperatureControlUnit = deviceInfo.Device.HasTemperatureControlUnit;
                const deviceHasCoolOperationMode = deviceInfo.Device.HasCoolOperationMode;
                const deviceHasHeatOperationMode = deviceInfo.Device.HasHeatOperationMode;
                const deviceHasAutoOperationMode = deviceInfo.Device.HasAutoOperationMode;
                const deviceAirDirectionFunction = deviceInfo.Device.AirDirectionFunction;
                const deviceHasBypassVentilationMode = deviceInfo.Device.HasBypassVentilationMode;
                const deviceHasAutoVentilationMode = deviceInfo.Device.HasAutoVentilationMode;
                const deviceHasRoomTemperature = deviceInfo.Device.HasRoomTemperature;
                const deviceHasSupplyTemperature = deviceInfo.Device.HasSupplyTemperature;
                const deviceHasOutdoorTemperature = deviceInfo.Device.HasOutdoorTemperature;
                const deviceHasCO2Sensor = deviceInfo.Device.HasCO2Sensor;
                const deviceNumberOfFanSpeeds = deviceInfo.Device.NumberOfFanSpeeds;
                const deviceHasHalfDegreeIncrements = deviceInfo.Device.HasHalfDegreeIncrements;
                const deviceTemperatureIncrement = deviceInfo.Device.TemperatureIncrement;
                const deviceTemperatureIncrementOverride = deviceInfo.Device.TemperatureIncrementOverride;
                const deviceMinTempCoolDry = deviceInfo.Device.MinTempCoolDry;
                const deviceMaxTempCoolDry = deviceInfo.Device.MaxTempCoolDry;
                const deviceMinTempHeat = deviceInfo.Device.MinTempHeat;
                const deviceMaxTempHeat = deviceInfo.Device.MaxTempHeat;
                const deviceMinTempAutomatic = deviceInfo.Device.MinTempAutomatic;
                const deviceMaxTempAutomatic = deviceInfo.Device.MaxTempAutomatic;
                const deviceSetSupplyTemperatureMode = deviceInfo.Device.SetSupplyTemperatureMode;
                const deviceHasAutomaticFanSpeed = deviceInfo.Device.HasAutomaticFanSpeed;
                const deviceCoreMaintenanceRequired = deviceInfo.Device.CoreMaintenanceRequired;
                const deviceFilterMaintenanceRequired = deviceInfo.Device.FilterMaintenanceRequired;
                const devicePower = deviceInfo.Device.Power;
                const deviceRoomTemperature = deviceInfo.Device.RoomTemperature;
                const deviceSupplyTemperature = deviceInfo.Device.SupplyTemperature;
                const deviceOutdoorTemperature = deviceInfo.Device.OutdoorTemperature;
                const deviceRoomCO2Level = deviceInfo.Device.RoomCO2Level;
                const deviceNightPurgeMode = deviceInfo.Device.NightPurgeMode;
                const deviceThermostatOn = deviceInfo.Device.ThermostatOn;
                const deviceSetTemperature = deviceInfo.Device.SetTemperature;
                const deviceActualSupplyFanSpeed = deviceInfo.Device.ActualSupplyFanSpeed;
                const deviceActualExhaustFanSpeed = deviceInfo.Device.ActualExhaustFanSpeed;
                const deviceSetFanSpeed = deviceInfo.Device.SetFanSpeed;
                const deviceAutomaticFanSpeed = deviceInfo.Device.AutomaticFanSpeed;
                const deviceOperationMode = deviceInfo.Device.OperationMode;
                const deviceActualOperationMode = deviceInfo.Device.ActualOperationMode;
                const deviceVentilationMode = deviceInfo.Device.VentilationMode;
                const deviceActualVentilationMode = deviceInfo.Device.ActualVentilationMode;
                const deviceEffectiveFlags = deviceInfo.Device.EffectiveFlags;
                const deviceInStandbyMode = deviceInfo.Device.InStandbyMode;
                const deviceDemandPercentage = deviceInfo.Device.DemandPercentage;
                const deviceConfiguredDemandPercentage = deviceInfo.Device.ConfiguredDemandPercentage;
                const deviceHasDemandSideControl = deviceInfo.Device.HasDemandSideControl;
                const deviceDefaultCoolingSetTemperature = deviceInfo.Device.DefaultCoolingSetTemperature;
                const deviceDefaultHeatingSetTemperature = deviceInfo.Device.DefaultHeatingSetTemperature;
                const deviceHasEnergyConsumedMeter = deviceInfo.Device.HasEnergyConsumedMeter;
                const deviceCurrentEnergyConsumed = deviceInfo.Device.CurrentEnergyConsumed;
                const deviceCurrentEnergyAssignment = deviceInfo.Device.CurrentEnergyAssignment;
                const deviceCoolingDisabled = deviceInfo.Device.CoolingDisabled
                const deviceMinPcycle = deviceInfo.Device.MinPcycle;
                const deviceMaxPcycle = deviceInfo.Device.MaxPcycle;
                const deviceEffectivePCycle = deviceInfo.Device.EffectivePCycle;
                const deviceMaxOutdoorUnits = deviceInfo.Device.MaxOutdoorUnits;
                const deviceMaxIndoorUnits = deviceInfo.Device.MaxIndoorUnits;
                const deviceMaxTemperatureControlUnits = deviceInfo.Device.MaxTemperatureControlUnits;
                const deviceModelCode = deviceInfo.Device.ModelCode;
                const deviceDeviceID = deviceInfo.Device.DeviceID;
                const deviceMacAddress = deviceInfo.Device.MacAddress;
                const deviceSerialNumber = deviceInfo.Device.SerialNumber !== null ? deviceInfo.Device.SerialNumber.toString() : 'Undefined';
                const deviceTimeZoneID = deviceInfo.Device.TimeZoneID;
                const deviceDiagnosticMode = deviceInfo.Device.DiagnosticMode;
                const deviceDiagnosticEndDate = deviceInfo.Device.DiagnosticEndDate;
                const deviceExpectedCommand = deviceInfo.Device.ExpectedCommand;
                const deviceOwner = deviceInfo.Device.Owner;
                const deviceDetectedCountry = deviceInfo.Device.DetectedCountry;
                const deviceAdaptorType = deviceInfo.Device.AdaptorType;
                const deviceFirmwareDeployment = deviceInfo.Device.FirmwareDeployment;
                const deviceFirmwareUpdateAborted = deviceInfo.Device.FirmwareUpdateAborted;
                const deviceLinkedDevice = deviceInfo.Device.LinkedDevice;
                const deviceWifiSignalStrength = deviceInfo.Device.WifiSignalStrength;
                const deviceWifiAdapterStatus = deviceInfo.Device.WifiAdapterStatus;
                const devicePosition = deviceInfo.Device.Position;
                const devicePCycle = deviceInfo.Device.PCycle;
                const deviceRecordNumMax = deviceInfo.Device.RecordNumMax;
                const deviceLastTimeStamp = deviceInfo.Device.LastTimeStamp;
                const deviceErrorCode = deviceInfo.Device.ErrorCode;
                const deviceHasError = deviceInfo.Device.HasError;
                const deviceLastReset = deviceInfo.Device.LastReset;
                const deviceFlashWrites = deviceInfo.Device.FlashWrites;
                const deviceScene = deviceInfo.Device.Scene;
                const deviceSSLExpirationDate = deviceInfo.Device.SSLExpirationDate;
                const deviceSPTimeout = deviceInfo.Device.SPTimeout;
                const devicePasscode = deviceInfo.Device.Passcode;
                const deviceServerCommunicationDisabled = deviceInfo.Device.ServerCommunicationDisabled;
                const deviceConsecutiveUploadErrors = deviceInfo.Device.ConsecutiveUploadErrors;
                const deviceDoNotRespondAfter = deviceInfo.Device.DoNotRespondAfter;
                const deviceOwnerRoleAccessLevel = deviceInfo.Device.OwnerRoleAccessLevel;
                const deviceOwnerCountry = deviceInfo.Device.OwnerCountry;
                const deviceHideEnergyReport = deviceInfo.Device.HideEnergyReport;
                const deviceExceptionHash = deviceInfo.Device.ExceptionHash;
                const deviceExceptionDate = deviceInfo.Device.ExceptionDate;
                const deviceExceptionCount = deviceInfo.Device.ExceptionCount;
                const deviceRate1StartTime = deviceInfo.Device.Rate1StartTime;
                const deviceRate2StartTime = deviceInfo.Device.Rate2StartTime;
                const deviceProtocolVersion = deviceInfo.Device.ProtocolVersion;
                const deviceUnitVersion = deviceInfo.Device.UnitVersion;
                const deviceFirmwareAppVersion = deviceInfo.Device.FirmwareAppVersion !== null ? deviceInfo.Device.FirmwareAppVersion.toString() : 'Undefined';
                const deviceFirmwareWebVersion = deviceInfo.Device.FirmwareWebVersion;
                const deviceFirmwareWlanVersion = deviceInfo.Device.FirmwareWlanVersion;
                const deviceMqttFlags = deviceInfo.Device.MqttFlags;
                const deviceHasErrorMessages = deviceInfo.Device.HasErrorMessages;
                const deviceHasZone2 = deviceInfo.Device.HasZone2;
                const deviceOffline = deviceInfo.Device.Offline;
                const deviceSupportsHourlyEnergyReport = deviceInfo.Device.SupportsHourlyEnergyReport;

                //units info
                const units = Array.isArray(deviceInfo.Device.Units) ? deviceInfo.Device.Units : [];
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
                const diagnosticMode = deviceInfo.DiagnosticMode;
                const diagnosticEndDate = deviceInfo.DiagnosticEndDate;
                const location = deviceInfo.Location;
                const detectedCountry = deviceInfo.DetectedCountry;
                const registrations = deviceInfo.Registrations;
                const localIPAddress = deviceInfo.LocalIPAddress;
                const timeZone = deviceInfo.TimeZone;
                const registReason = deviceInfo.RegistReason;
                const expectedCommand = deviceInfo.ExpectedCommand;
                const registRetry = deviceInfo.RegistRetry;
                const dateCreated = deviceInfo.DateCreated;
                const firmwareDeployment = deviceInfo.FirmwareDeployment;
                const firmwareUpdateAborted = deviceInfo.FirmwareUpdateAborted;

                //permissions
                const CanSetOperationMode = deviceInfo.Permissions.CanSetOperationMode;
                const CanSetFanSpeed = deviceInfo.Permissions.CanSetFanSpeed;
                const CanSetVaneDirection = deviceInfo.Permissions.CanSetVaneDirection;
                const CanSetPower = deviceInfo.Permissions.CanSetPower;
                const CanSetTemperatureIncrementOverride = deviceInfo.Permissions.CanSetTemperatureIncrementOverride;
                const CanDisableLocalController = deviceInfo.Permissions.CanDisableLocalController;

                this.emit('deviceInfo', manufacturer, modelIndoor, modelOutdoor, serialNumber, deviceFirmwareAppVersion, devicePresets, devicePresetsCount, deviceHasAutoVentilationMode, deviceHasBypassVentilationMode, deviceHasAutomaticFanSpeed, deviceNumberOfFanSpeeds);
                const mqtt = mqttEnabled ? this.emit('mqtt', `Info`, JSON.stringify(deviceInfo, null, 2)) : false;

                //check device state
                await new Promise(resolve => setTimeout(resolve, 2000));
                this.emit('checkDeviceState');
            } catch (error) {
                this.emit('error', `check info, ${error}, check again in 60s.`);
                this.checkDeviceInfo();
            };
        }).on('checkDeviceState', async () => {
            try {
                const deviceUrl = CONSTANS.ApiUrls.DeviceState.replace("DID", deviceId).replace("BID", buildingId);
                const responseData = await this.axiosInstanceGet(deviceUrl);
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

                const deviceStateHasNotChanged =
                    roomTemperature === this.roomTemperature
                    && setTemperature === this.setTemperature
                    && setFanSpeed === this.setFanSpeed
                    && operationMode === this.operationMode
                    && supplyTemperature === this.supplyTemperature
                    && outdoorTemperature === this.outdoorTemperature
                    && nightPurgeMode === this.nightPurgeMode
                    && power === this.power
                    && roomCO2Level === this.roomCO2Level
                    && ventilationMode === this.ventilationMode
                    && actualVentilationMode === this.actualVentilationMode
                    && hideRoomTemperature === this.hideRoomTemperature
                    && hideSupplyTemperature === this.hideSupplyTemperature
                    && hideOutdoorTemperature === this.hideOutdoorTemperature;

                if (deviceStateHasNotChanged) {
                    this.checkDeviceInfo();
                    return;
                }

                this.roomTemperature = roomTemperature;
                this.setTemperature = setTemperature;
                this.setFanSpeed = setFanSpeed;
                this.operationMode = operationMode;
                this.supplyTemperature = supplyTemperature;
                this.outdoorTemperature = outdoorTemperature;
                this.nightPurgeMode = nightPurgeMode;
                this.power = power;
                this.roomCO2Level = roomCO2Level;
                this.ventilationMode = ventilationMode;
                this.actualVentilationMode = actualVentilationMode;
                this.hideRoomTemperature = hideRoomTemperature;
                this.hideSupplyTemperature = hideSupplyTemperature;
                this.hideOutdoorTemperature = hideOutdoorTemperature;

                this.emit('deviceState', deviceState, power, roomTemperature, supplyTemperature, outdoorTemperature, nightPurgeMode, roomCO2Level, setTemperature, setFanSpeed, operationMode, ventilationMode, actualVentilationMode, hideRoomTemperature, hideSupplyTemperature, hideOutdoorTemperature);
                const mqtt = mqttEnabled ? this.emit('mqtt', `State`, JSON.stringify(deviceState, null, 2)) : false;

                this.checkDeviceInfo();
            } catch (error) {
                this.emit('error', `check state error, ${error}, check again in 60s.`);
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
            if (type === 0) {
                newData.HasPendingCommand = true;
            };

            try {
                const options = {
                    data: newData
                };

                await this.axiosInstancePost(url, options);
                this.emit('checkDeviceInfo');
                await new Promise(resolve => setTimeout(resolve, 3000));
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = MELCLOUDDEVICEERV;