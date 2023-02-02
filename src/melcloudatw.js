"use strict";
const fs = require('fs');
const fsPromises = fs.promises;
const axios = require('axios');
const EventEmitter = require('events');
const CONSTANS = require('./constans.json');


class MELCLOUDDEVICEATW extends EventEmitter {
    constructor(config) {
        super();
        const accountName = config.name;
        //const deviceInfo = config.deviceInfo;
        const deviceName = config.deviceName;
        const deviceTypeText = config.deviceTypeText;
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
            timeout: 10000,
            headers: {
                'X-MitsContextKey': contextKey,
            }
        });
        this.axiosInstancePost = axios.create({
            method: 'POST',
            baseURL: CONSTANS.ApiUrls.BaseURL,
            timeout: 10000,
            headers: {
                'X-MitsContextKey': contextKey,
                'content-type': 'application/json'
            }
        });

        //store variable to compare
        this.unitStatus = 0;
        this.outdoorTemperature = 0;
        this.power = false;
        this.holidayMode = false;
        this.forcedHotWaterMode = false;
        this.ecoHotWater = false;
        this.tankWaterTemperature = 0;
        this.setTankWaterTemperature = 0;
        this.prohibitHotWater = false;
        this.operationMode = 0;
        this.operationModeZone1 = 0;
        this.roomTemperatureZone1 = 0;
        this.setTemperatureZone1 = 0;
        this.setHeatFlowTemperatureZone1 = 0;
        this.setCoolFlowTemperatureZone1 = 0;
        this.prohibitZone1 = false;
        this.idleZone1 = false;
        this.operationModeZone2 = 0;
        this.roomTemperatureZone2 = 0;
        this.setTemperatureZone2 = 0;
        this.setHeatFlowTemperatureZone2 = 0;
        this.setCoolFlowTemperatureZone2 = 0;
        this.prohibitZone2 = false;
        this.idleZone2 = false;

        this.on('checkDeviceInfo', async () => {
            try {
                const readDeviceInfoData = await fsPromises.readFile(melCloudBuildingDeviceFile);
                const deviceInfo = JSON.parse(readDeviceInfoData);
                const debug = debugLog ? this.emit('debug', `${deviceTypeText} ${deviceName}, debug Info: ${JSON.stringify(deviceInfo, null, 2)}`) : false;

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
                const deviceCanHeat = deviceInfo.Device.CanHeat;
                const deviceCanCool = deviceInfo.Device.CanCool;
                const deviceHasHotWaterTank = deviceInfo.Device.HasHotWaterTank;
                const deviceFTCVersion = deviceInfo.Device.FTCVersion;
                const deviceFTCRevision = deviceInfo.Device.FTCRevision;
                const deviceLastFTCVersion = deviceInfo.Device.LastFTCVersion;
                const deviceLastFTCRevision = deviceInfo.Device.LastFTCRevision;
                const deviceFTCModel = deviceInfo.Device.FTCModel;
                const deviceRefridgerentAddress = deviceInfo.Device.RefridgerentAddress;
                const deviceDipSwitch1 = deviceInfo.Device.DipSwitch1;
                const deviceDipSwitch2 = deviceInfo.Device.DipSwitch2;
                const deviceDipSwitch3 = deviceInfo.Device.DipSwitch3;
                const devicedeviceMinTempHeat = deviceInfo.Device.DipSwitch4;
                const deviceDipSwitch5 = deviceInfo.Device.DipSwitch5;
                const deviceDipSwitch6 = deviceInfo.Device.DipSwitch6;
                const deviceHasThermostatZone1 = deviceInfo.Device.HasThermostatZone1;
                const deviceHasThermostatZone2 = deviceInfo.Device.HasThermostatZone2;
                const deviceTemperatureIncrement = deviceInfo.Device.TemperatureIncrement;
                const deviceDefrostMode = deviceInfo.Device.DefrostMode;
                const deviceHeatPumpFrequency = deviceInfo.Device.HeatPumpFrequency;
                const deviceMaxSetTemperature = deviceInfo.Device.MaxSetTemperature;
                const deviceMinSetTemperature = deviceInfo.Device.MinSetTemperature;
                const deviceRoomTemperatureZone1 = deviceInfo.Device.RoomTemperatureZone1;
                const deviceRoomTemperatureZone2 = deviceInfo.Device.RoomTemperatureZone2;
                const deviceOutdoorTemperature = deviceInfo.Device.OutdoorTemperature;
                const deviceFlowTemperature = deviceInfo.Device.FlowTemperature;
                const deviceFlowTemperatureZone1 = deviceInfo.Device.FlowTemperatureZone1;
                const deviceFlowTemperatureZone2 = deviceInfo.Device.FlowTemperatureZone2;
                const deviceFlowTemperatureBoiler = deviceInfo.Device.FlowTemperatureBoiler;
                const deviceReturnTemperature = deviceInfo.Device.ReturnTemperature;
                const deviceReturnTemperatureZone1 = deviceInfo.Device.ReturnTemperatureZone1;
                const deviceReturnTemperatureZone2 = deviceInfo.Device.ReturnTemperatureZone2;
                const deviceReturnTemperatureBoiler = deviceInfo.Device.ReturnTemperatureBoiler;
                const deviceBoilerStatus = deviceInfo.Device.BoilerStatus;
                const deviceBoosterHeater1Status = deviceInfo.Device.BoosterHeater1Status;
                const deviceBoosterHeater2Status = deviceInfo.Device.BoosterHeater2Status;
                const deviceBoosterHeater2PlusStatus = deviceInfo.Device.BoosterHeater2PlusStatus;
                const deviceImmersionHeaterStatus = deviceInfo.Device.ImmersionHeaterStatus;
                const deviceWaterPump1Status = deviceInfo.Device.WaterPump1Status;
                const deviceWaterPump2Status = deviceInfo.Device.WaterPump2Status;
                const deviceWaterPump3Status = deviceInfo.Device.WaterPump3Status;
                const deviceValveStatus3Way = deviceInfo.Device.ValveStatus3Way;
                const deviceValveStatus2Way = deviceInfo.Device.ValveStatus2Way;
                const deviceWaterPump4Status = deviceInfo.Device.WaterPump4Status;
                const deviceValveStatus2Way2a = deviceInfo.Device.ValveStatus2Way2a;
                const deviceValveStatus2Way2b = deviceInfo.Device.ValveStatus2Way2b;
                const deviceTankWaterTemperature = deviceInfo.Device.TankWaterTemperature;
                const deviceUnitStatus = deviceInfo.Device.UnitStatus;
                const deviceHeatingFunctionEnabled = deviceInfo.Device.HeatingFunctionEnabled;
                const deviceServerTimerEnabled = deviceInfo.Device.ServerTimerEnabled;
                const deviceThermostatStatusZone1 = deviceInfo.Device.ThermostatStatusZone1;
                const deviceThermostatStatusZone2 = deviceInfo.Device.ThermostatStatusZone2;
                const deviceThermostatTypeZone1 = deviceInfo.Device.ThermostatTypeZone1;
                const deviceThermostatTypeZone2 = deviceInfo.Device.ThermostatTypeZone2;
                const deviceMixingTankWaterTemperature = deviceInfo.Device.MixingTankWaterTemperature;
                const deviceCondensingTemperature = deviceInfo.Device.CondensingTemperature;
                const deviceEffectiveFlags = deviceInfo.Device.EffectiveFlags;
                const deviceLastEffectiveFlags = deviceInfo.Device.LastEffectiveFlags;
                const devicedevicePower = deviceInfo.Device.Power;
                const deviceEcoHotWater = deviceInfo.Device.EcoHotWater;
                const deviceOperationMode = deviceInfo.Device.OperationMode;
                const deviceOperationModeZone1 = deviceInfo.Device.OperationModeZone1;
                const deviceOperationModeZone2 = deviceInfo.Device.OperationModeZone2;
                const deviceSetTemperatureZone1 = deviceInfo.Device.SetTemperatureZone1;
                const deviceSetTemperatureZone2 = deviceInfo.Device.SetTemperatureZone2;
                const deviceTargetHCTemperatureZone1 = deviceInfo.Device.TargetHCTemperatureZone1;
                const deviceTargetHCTemperatureZone2 = deviceInfo.Device.TargetHCTemperatureZone2;
                const deviceForcedHotWaterMode = deviceInfo.Device.ForcedHotWaterMode;
                const deviceHolidayMode = deviceInfo.Device.HolidayMode;
                const deviceProhibitHotWater = deviceInfo.Device.ProhibitHotWater;
                const deviceProhibitHeatingZone1 = deviceInfo.Device.ProhibitHeatingZone1;
                const deviceProhibitHeatingZone2 = deviceInfo.Device.ProhibitHeatingZone2;
                const deviceProhibitCoolingZone1 = deviceInfo.Device.ProhibitCoolingZone1;
                const deviceProhibitCoolingZone2 = deviceInfo.Device.ProhibitCoolingZone2;
                const deviceServerTimerDesired = deviceInfo.Device.ServerTimerDesired;
                const deviceSecondaryZoneHeatCurve = deviceInfo.Device.SecondaryZoneHeatCurve;
                const deviceSetHeatFlowTemperatureZone1 = deviceInfo.Device.SetHeatFlowTemperatureZone1;
                const deviceSetHeatFlowTemperatureZone2 = deviceInfo.Device.SetHeatFlowTemperatureZone2;
                const deviceSetCoolFlowTemperatureZone1 = deviceInfo.Device.SetCoolFlowTemperatureZone1;
                const deviceSetCoolFlowTemperatureZone2 = deviceInfo.Device.SetCoolFlowTemperatureZone2;
                const deviceThermostatTemperatureZone1 = deviceInfo.Device.ThermostatTemperatureZone1;
                const deviceThermostatTemperatureZone2 = deviceInfo.Device.ThermostatTemperatureZone2;
                const deviceDECCReport = deviceInfo.Device.DECCReport;
                const deviceCSVReport1min = deviceInfo.Device.CSVReport1min;
                const deviceZone2Master = deviceInfo.Device.Zone2Master;
                const deviceDailyEnergyConsumedDate = deviceInfo.Device.DailyEnergyConsumedDate;
                const deviceDailyEnergyProducedDate = deviceInfo.Device.DailyEnergyProducedDate;
                const deviceCurrentEnergyConsumed = deviceInfo.Device.CurrentEnergyConsumed;
                const deviceCurrentEnergyProduced = deviceInfo.Device.CurrentEnergyProduced;
                const deviceCurrentEnergyMode = deviceInfo.Device.CurrentEnergyMode;
                const deviceHeatingEnergyConsumedRate1 = deviceInfo.Device.HeatingEnergyConsumedRate1;
                const deviceHeatingEnergyConsumedRate2 = deviceInfo.Device.HeatingEnergyConsumedRate2
                const deviceCoolingEnergyConsumedRate1 = deviceInfo.Device.CoolingEnergyConsumedRate1;
                const deviceCoolingEnergyConsumedRate2 = deviceInfo.Device.CoolingEnergyConsumedRate2;
                const deviceHotWaterEnergyConsumedRate1 = deviceInfo.Device.HotWaterEnergyConsumedRate1;
                const deviceHotWaterEnergyConsumedRate2 = deviceInfo.Device.HotWaterEnergyConsumedRate2;
                const deviceHeatingEnergyProducedRate1 = deviceInfo.Device.HeatingEnergyProducedRate1;
                const deviceHeatingEnergyProducedRate2 = deviceInfo.Device.HeatingEnergyProducedRate2;
                const deviceCoolingEnergyProducedRate1 = deviceInfo.Device.CoolingEnergyProducedRate1;
                const deviceCoolingEnergyProducedRate2 = deviceInfo.Device.CoolingEnergyProducedRate2;
                const deviceHotWaterEnergyProducedRate1 = deviceInfo.Device.HotWaterEnergyProducedRate1;
                const deviceHotWaterEnergyProducedRate2 = deviceInfo.Device.HotWaterEnergyProducedRate2;
                const deviceErrorCode2Digit = deviceInfo.Device.ErrorCode2Digit;
                const deviceSendSpecialFunctions = deviceInfo.Device.SendSpecialFunctions;
                const deviceRequestSpecialFunctions = deviceInfo.Device.RequestSpecialFunctions;
                const deviceSpecialFunctionsState = deviceInfo.Device.SpecialFunctionsState;
                const devicePendingSendSpecialFunctions = deviceInfo.Device.PendingSendSpecialFunctions;
                const devicePendingRequestSpecialFunctions = deviceInfo.Device.PendingRequestSpecialFunctions;
                const deviceHasSimplifiedZone2 = deviceInfo.Device.HasSimplifiedZone2;
                const deviceCanSetTankTemperature = deviceInfo.Device.CanSetTankTemperature;
                const deviceCanSetEcoHotWater = deviceInfo.Device.CanSetEcoHotWater;
                const deviceHasEnergyConsumedMeter = deviceInfo.Device.HasEnergyConsumedMeter;
                const deviceHasEnergyProducedMeter = deviceInfo.Device.HasEnergyProducedMeter;
                const deviceCanMeasureEnergyProduced = deviceInfo.Device.CanMeasureEnergyProduced;
                const deviceCanMeasureEnergyConsumed = deviceInfo.Device.CanMeasureEnergyConsumed;
                const deviceZone1InRoomMode = deviceInfo.Device.Zone1InRoomMode;
                const deviceZone2InRoomMode = deviceInfo.Device.Zone2InRoomMode;
                const deviceZone1InHeatMode = deviceInfo.Device.Zone1InHeatMode;
                const deviceZone2InHeatMode = deviceInfo.Device.Zone2InHeatMode;
                const deviceZone1InCoolMode = deviceInfo.Device.Zone1InCoolMode;
                const deviceZone2InCoolMode = deviceInfo.Device.Zone2InCoolMode;
                const deviceAllowDualRoomTemperature = deviceInfo.Device.AllowDualRoomTemperature;
                const deviceIsGeodan = deviceInfo.Device.IsGeodan;
                const deviceHasEcoCuteSettings = deviceInfo.Device.HasEcoCuteSettings;
                const deviceHasFTC45Settings = deviceInfo.Device.HasFTC45Settings;
                const deviceHasFTC6Settings = deviceInfo.Device.HasFTC6Settings;
                const deviceCanEstimateEnergyUsage = deviceInfo.Device.CanEstimateEnergyUsage;
                const deviceCanUseRoomTemperatureCooling = deviceInfo.Device.CanUseRoomTemperatureCooling;
                const deviceIsFtcModelSupported = deviceInfo.Device.IsFtcModelSupported;
                const deviceMaxTankTemperature = deviceInfo.Device.MaxTankTemperature;
                const deviceIdleZone1 = deviceInfo.Device.IdleZone1;
                const deviceIdleZone2 = deviceInfo.Device.IdleZone2;
                const deviceMinPcycle = deviceInfo.Device.MinPcycle;
                const deviceMaxPcycle = deviceInfo.Device.MaxPcycle;
                const deviceMaxOutdoorUnits = deviceInfo.Device.MaxOutdoorUnits;
                const deviceMaxIndoorUnits = deviceInfo.Device.MaxIndoorUnits;
                const deviceMaxTemperatureControlUnits = deviceInfo.Device.MaxTemperatureControlUnits;
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
                const deviceEffectivePCycle = deviceInfo.Device.EffectivePCycle;
                const deviceMqttFlags = deviceInfo.Device.MqttFlags;
                const deviceHasErrorMessages = deviceInfo.Device.HasErrorMessages;
                const deviceOffline = deviceInfo.Device.Offline;
                const deviceSupportsHourlyEnergyReport = deviceInfo.Device.SupportsHourlyEnergyReport;
                const deviceHasZone2 = deviceInfo.Device.HasZone2;

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
                    const unitSerialNumber = unit.SerialNumber !== null ? (unit.SerialNumber.length > 1 ? unit.SerialNumber.toString() : 'Serial to short') : 'Undefined';
                    const unitModelNumber = unit.ModelNumber;
                    const unitModel = unit.Model !== null ? unit.Model.toString() : 'Undefined';
                    const unitType = unit.UnitType;
                    const unitIsIndoor = (unit.IsIndoor === true);

                    const pushSerial = unitIsIndoor ? serialsNumberIndoor.push(unitSerialNumber) : serialsNumberOutdoor.push(unitSerialNumber);
                    const pushModelNumber = unitIsIndoor ? modelsNumberIndoor.push(unitModelNumber) : modelsNumberOutdoor.push(unitModelNumber);
                    const pushUnitModel = unitIsIndoor ? modelsIndoor.push(unitModel) : modelsOutdoor.push(unitModel);
                    const pushUnitTypel = unitIsIndoor ? typesIndoor.push(unitType) : typesOutdoor.push(unitType);
                }

                const manufacturer = 'Mitsubishi';
                const modelIndoor = modelsIndoor.length > 0 ? modelsIndoor[0] : 'Undefined';
                const modelOutdoor = modelsOutdoor.length > 0 ? modelsOutdoor[0] : 'Undefined';

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
                const canSetForcedHotWater = deviceInfo.Permissions.CanSetForcedHotWater;
                const canSetOperationMode = deviceInfo.Permissions.CanSetOperationMode;
                const canSetPower = deviceInfo.Permissions.CanSetPower;
                const canSetTankWaterTemperature = deviceInfo.Permissions.CanSetTankWaterTemperature;
                const canSetEcoHotWater = deviceInfo.Permissions.CanSetEcoHotWater;
                const canSetFlowTemperature = deviceInfo.Permissions.CanSetFlowTemperature;
                const canSetTemperatureIncrementOverride = deviceInfo.Permissions.CanSetTemperatureIncrementOverride;

                const zonesCount = 4;
                this.emit('deviceInfo', manufacturer, modelIndoor, modelOutdoor, serialNumber, deviceFirmwareAppVersion, devicePresets, devicePresetsCount, zonesCount, deviceHasHotWaterTank, deviceHasZone2, zone1Name, zone2Name);
                this.emit('checkDeviceState');
                const mqtt = mqttEnabled ? this.emit('mqtt', `${deviceTypeText} ${deviceName}, Info`, JSON.stringify(deviceInfo, null, 2)) : false;
            } catch (error) {
                this.emit('error', `${deviceTypeText} ${deviceName}, check info, ${error}, check again in 60s.`);
                this.checkDeviceInfo();
            };
        }).on('checkDeviceState', async () => {
            //deviceState
            try {
                const deviceUrl = CONSTANS.ApiUrls.DeviceState.replace("DID", deviceId).replace("BID", buildingId);
                const responseData = await this.axiosInstanceGet(deviceUrl);
                const deviceState = responseData.data;
                const deviceStateData = JSON.stringify(deviceState, null, 2);
                const debug = debugLog ? this.emit('debug', `${deviceTypeText} ${deviceName}, debug State: ${deviceStateData}`) : false;

                // device state
                const effectiveFlags = deviceState.EffectiveFlags;
                const localIpAddress = deviceState.LocalIpAddress;
                const setTemperatureZone1 = deviceState.SetTemperatureZone1;
                const setTemperatureZone2 = deviceState.SetTemperatureZone2;
                const roomTemperatureZone1 = deviceState.RoomTemperatureZone1;
                const roomTemperatureZone2 = deviceState.RoomTemperatureZone2;
                const operationMode = deviceState.OperationMode;
                const operationModeZone1 = deviceState.OperationModeZone1;
                const operationModeZone2 = deviceState.OperationModeZone2;
                const weatherObservations = deviceState.WeatherObservations;
                const errorMessage = deviceState.ErrorMessage;
                const errorCode = deviceState.ErrorCode;
                const setHeatFlowTemperatureZone1 = deviceState.SetHeatFlowTemperatureZone1;
                const setHeatFlowTemperatureZone2 = deviceState.SetHeatFlowTemperatureZone2;
                const setCoolFlowTemperatureZone1 = deviceState.SetCoolFlowTemperatureZone1;
                const setCoolFlowTemperatureZone2 = deviceState.SetCoolFlowTemperatureZone2;
                const hcControlType = deviceState.HcControlType;
                const tankWaterTemperature = deviceState.TankWaterTemperature;
                const setTankWaterTemperature = deviceState.SetTankWaterTemperature;
                const forcedHotWaterMode = deviceState.ForcedHotWaterMode;
                const unitStatus = deviceState.UnitStatus;
                const outdoorTemperature = deviceState.OutdoorTemperature;
                const ecoHotWater = deviceState.EcoHotWater;
                const zone1Name = deviceState.Zone1Name;
                const zone2Name = deviceState.Zone2Name;
                const holidayMode = deviceState.HolidayMode;
                const prohibitZone1 = deviceState.ProhibitZone1;
                const prohibitZone2 = deviceState.ProhibitZone2;
                const prohibitHotWater = deviceState.ProhibitHotWater;
                const temperatureIncrementOverride = deviceState.TemperatureIncrementOverride
                const idleZone1 = deviceState.IdleZone1;
                const idleZone2 = deviceState.IdleZone2;
                const demandPercentage = deviceState.DemandPercentage;
                //const deviceId = deviceState.DeviceId;
                const deviceType = deviceState.DeviceType;
                const lastCommunication = deviceState.LastCommunication;
                const nextCommunication = deviceState.NextCommunication;
                const power = deviceState.Power;
                const hasPendingCommand = deviceState.HasPendingCommand;
                const offline = deviceState.Offline;
                const scene = deviceState.Scene;
                const sceneOwner = deviceState.SceneOwner;

                const deviceStateHasNotChanged =
                    unitStatus === this.unitStatus
                    && holidayMode === this.holidayMode
                    && forcedHotWaterMode === this.forcedHotWaterMode
                    && operationMode === this.operationMode
                    && ecoHotWater === this.ecoHotWater
                    && outdoorTemperature === this.outdoorTemperature
                    && tankWaterTemperature === this.tankWaterTemperature
                    && setTankWaterTemperature === this.setTankWaterTemperature
                    && prohibitHotWater === this.prohibitHotWater
                    && power === this.power
                    && operationModeZone1 === this.operationModeZone1
                    && roomTemperatureZone1 === this.roomTemperatureZone1
                    && setTemperatureZone1 === this.setTemperatureZone1
                    && setHeatFlowTemperatureZone1 === this.setHeatFlowTemperatureZone1
                    && setCoolFlowTemperatureZone1 === this.setCoolFlowTemperatureZone1
                    && prohibitZone1 === this.prohibitZone1
                    && idleZone1 === this.idleZone1
                    && operationModeZone2 === this.operationModeZone2
                    && roomTemperatureZone2 === this.roomTemperatureZone2
                    && setTemperatureZone2 === this.setTemperatureZone2
                    && setHeatFlowTemperatureZone2 === this.setHeatFlowTemperatureZone2
                    && setCoolFlowTemperatureZone2 === this.setCoolFlowTemperatureZone2
                    && prohibitZone2 === this.prohibitZone2
                    && idleZone2 === this.idleZone2;

                if (deviceStateHasNotChanged) {
                    this.checkDeviceInfo();
                    return;
                }

                this.unitStatus = unitStatus;
                this.outdoorTemperature = outdoorTemperature;
                this.power = power;
                this.holidayMode = holidayMode;
                this.forcedHotWaterMode = forcedHotWaterMode;
                this.ecoHotWater = ecoHotWater;
                this.tankWaterTemperature = tankWaterTemperature;
                this.setTankWaterTemperature = setTankWaterTemperature;
                this.prohibitHotWater = prohibitHotWater;
                this.operationMode = operationMode;
                this.operationModeZone1 = operationModeZone1;
                this.roomTemperatureZone1 = roomTemperatureZone1;
                this.setTemperatureZone1 = setTemperatureZone1;
                this.setHeatFlowTemperatureZone1 = setHeatFlowTemperatureZone1;
                this.setCoolFlowTemperatureZone1 = setCoolFlowTemperatureZone1;
                this.prohibitZone1 = prohibitZone1;
                this.idleZone1 = idleZone1;
                this.operationModeZone2 = operationModeZone2;
                this.roomTemperatureZone2 = roomTemperatureZone2;
                this.setTemperatureZone2 = setTemperatureZone2;
                this.setHeatFlowTemperatureZone2 = setHeatFlowTemperatureZone2;
                this.setCoolFlowTemperatureZone2 = setCoolFlowTemperatureZone2;
                this.prohibitZone2 = prohibitZone2;
                this.idleZone2 = idleZone2;

                this.emit('deviceState', deviceState, unitStatus, outdoorTemperature, power, operationMode, holidayMode, operationModeZone1, roomTemperatureZone1, setTemperatureZone1, setHeatFlowTemperatureZone1, setCoolFlowTemperatureZone1, prohibitZone1, idleZone1, forcedHotWaterMode, ecoHotWater, tankWaterTemperature, setTankWaterTemperature, prohibitHotWater, operationModeZone2, roomTemperatureZone2, setTemperatureZone2, setHeatFlowTemperatureZone2, setCoolFlowTemperatureZone2, prohibitZone2, idleZone2);
                const mqtt = mqttEnabled ? this.emit('mqtt', `${deviceTypeText} ${deviceName}, State`, JSON.stringify(deviceState, null, 2)) : false;

                this.checkDeviceInfo();
            } catch (error) {
                this.emit('error', `${deviceTypeText} ${deviceName}, check state error, ${error}, check again in 60s.`);
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
            const options = {
                data: newData
            };

            try {
                await this.axiosInstancePost(url, options);
                this.emit('checkDeviceInfo');
                resolve(true);
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = MELCLOUDDEVICEATW;