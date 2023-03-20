"use strict";
const fs = require('fs');
const fsPromises = fs.promises;
const axios = require('axios');
const EventEmitter = require('events');
const CONSTANS = require('./constans.json');


class MELCLOUDDEVICEATW extends EventEmitter {
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
        this.setTemperatureZone1 = 0;
        this.setTemperatureZone2 = 0;
        this.roomTemperatureZone1 = 0;
        this.roomTemperatureZone2 = 0;
        this.operationMode = 0;
        this.operationModeZone1 = 0;
        this.operationModeZone2 = 0;
        this.setHeatFlowTemperatureZone1 = 0;
        this.setHeatFlowTemperatureZone2 = 0;
        this.setCoolFlowTemperatureZone1 = 0;
        this.setCoolFlowTemperatureZone2 = 0;
        this.hcControlType = 0;
        this.tankWaterTemperature = 0;
        this.setTankWaterTemperature = 0;
        this.forcedHotWaterMode = 0;
        this.unitStatus = 0;
        this.outdoorTemperature = 0;
        this.ecoHotWater = false;
        this.holidayMode = false;
        this.prohibitZone1 = false;
        this.prohibitZone2 = false;
        this.prohibitHotWater = false;
        this.idleZone1 = false;
        this.idleZone2 = false;
        this.power = false;
        this.offline = false;

        this.on('checkDeviceInfo', async () => {
            try {
                const readDeviceInfoData = await fsPromises.readFile(melCloudBuildingDeviceFile);
                const deviceInfo = JSON.parse(readDeviceInfoData);
                const debug = debugLog ? this.emit('debug', `debug Info: ${JSON.stringify(deviceInfo, null, 2)}`) : false;

                //device info
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

                //device info
                const ownerId = deviceInfo.OwnerID;
                const ownerName = deviceInfo.OwnerName;
                const ownerEmail = deviceInfo.OwnerEmail;
                const accessLevel = deviceInfo.AccessLevel;
                const directAccess = deviceInfo.DirectAccess;
                const endDate = deviceInfo.EndDate;
                const zone1Name = deviceInfo.Zone1Name || 'Zone 1';
                const zone2Name = deviceInfo.Zone2Name || 'Zone 2';
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
                const canHeat = device.CanHeat;
                const canCool = device.CanCool;
                const hasHotWaterTank = device.HasHotWaterTank || false;
                const fTCVersion = device.FTCVersion;
                const fTCRevision = device.FTCRevision;
                const lastFTCVersion = device.LastFTCVersion;
                const lastFTCRevision = device.LastFTCRevision;
                const fTCModel = device.FTCModel;
                const refridgerentAddress = device.RefridgerentAddress;
                const dipSwitch1 = device.DipSwitch1;
                const dipSwitch2 = device.DipSwitch2;
                const dipSwitch3 = device.DipSwitch3;
                const minTempHeat = device.DipSwitch4;
                const dipSwitch5 = device.DipSwitch5;
                const dipSwitch6 = device.DipSwitch6;
                const hasThermostatZone1 = device.HasThermostatZone1;
                const hasThermostatZone2 = device.HasThermostatZone2;
                const temperatureIncrement = device.TemperatureIncrement;
                const defrostMode = device.DefrostMode;
                const heatPumpFrequency = device.HeatPumpFrequency;
                const maxSetTemperature = device.MaxSetTemperature;
                const minSetTemperature = device.MinSetTemperature;
                const roomTemperatureZone1 = device.RoomTemperatureZone1;
                const roomTemperatureZone2 = device.RoomTemperatureZone2;
                const outdoorTemperature = device.OutdoorTemperature;
                const flowTemperature = device.FlowTemperature;
                const flowTemperatureZone1 = device.FlowTemperatureZone1;
                const flowTemperatureZone2 = device.FlowTemperatureZone2;
                const flowTemperatureBoiler = device.FlowTemperatureBoiler;
                const returnTemperature = device.ReturnTemperature;
                const returnTemperatureZone1 = device.ReturnTemperatureZone1;
                const returnTemperatureZone2 = device.ReturnTemperatureZone2;
                const returnTemperatureBoiler = device.ReturnTemperatureBoiler;
                const boilerStatus = device.BoilerStatus;
                const boosterHeater1Status = device.BoosterHeater1Status;
                const boosterHeater2Status = device.BoosterHeater2Status;
                const boosterHeater2PlusStatus = device.BoosterHeater2PlusStatus;
                const immersionHeaterStatus = device.ImmersionHeaterStatus;
                const waterPump1Status = device.WaterPump1Status;
                const waterPump2Status = device.WaterPump2Status;
                const waterPump3Status = device.WaterPump3Status;
                const valveStatus3Way = device.ValveStatus3Way;
                const valveStatus2Way = device.ValveStatus2Way;
                const waterPump4Status = device.WaterPump4Status;
                const valveStatus2Way2a = device.ValveStatus2Way2a;
                const valveStatus2Way2b = device.ValveStatus2Way2b;
                const tankWaterTemperature = device.TankWaterTemperature;
                const unitStatus = device.UnitStatus;
                const heatingFunctionEnabled = device.HeatingFunctionEnabled;
                const serverTimerEnabled = device.ServerTimerEnabled;
                const thermostatStatusZone1 = device.ThermostatStatusZone1;
                const thermostatStatusZone2 = device.ThermostatStatusZone2;
                const thermostatTypeZone1 = device.ThermostatTypeZone1;
                const thermostatTypeZone2 = device.ThermostatTypeZone2;
                const mixingTankWaterTemperature = device.MixingTankWaterTemperature;
                const condensingTemperature = device.CondensingTemperature;
                const effectiveFlags = device.EffectiveFlags;
                const lastEffectiveFlags = device.LastEffectiveFlags;
                const power = device.Power;
                const ecoHotWater = device.EcoHotWater;
                const operationMode = device.OperationMode;
                const operationModeZone1 = device.OperationModeZone1;
                const operationModeZone2 = device.OperationModeZone2;
                const setTemperatureZone1 = device.SetTemperatureZone1;
                const setTemperatureZone2 = device.SetTemperatureZone2;
                const targetHCTemperatureZone1 = device.TargetHCTemperatureZone1;
                const targetHCTemperatureZone2 = device.TargetHCTemperatureZone2;
                const forcedHotWaterMode = device.ForcedHotWaterMode;
                const holidayMode = device.HolidayMode;
                const prohibitHotWater = device.ProhibitHotWater;
                const prohibitHeatingZone1 = device.ProhibitHeatingZone1;
                const prohibitHeatingZone2 = device.ProhibitHeatingZone2;
                const prohibitCoolingZone1 = device.ProhibitCoolingZone1;
                const prohibitCoolingZone2 = device.ProhibitCoolingZone2;
                const serverTimerDesired = device.ServerTimerDesired;
                const secondaryZoneHeatCurve = device.SecondaryZoneHeatCurve;
                const setHeatFlowTemperatureZone1 = device.SetHeatFlowTemperatureZone1;
                const setHeatFlowTemperatureZone2 = device.SetHeatFlowTemperatureZone2;
                const setCoolFlowTemperatureZone1 = device.SetCoolFlowTemperatureZone1;
                const setCoolFlowTemperatureZone2 = device.SetCoolFlowTemperatureZone2;
                const thermostatTemperatureZone1 = device.ThermostatTemperatureZone1;
                const thermostatTemperatureZone2 = device.ThermostatTemperatureZone2;
                const dECCReport = device.DECCReport;
                const cSVReport1min = device.CSVReport1min;
                const zone2Master = device.Zone2Master;
                const dailyEnergyConsumedDate = device.DailyEnergyConsumedDate;
                const dailyEnergyProducedDate = device.DailyEnergyProducedDate;
                const currentEnergyConsumed = device.CurrentEnergyConsumed;
                const currentEnergyProduced = device.CurrentEnergyProduced;
                const currentEnergyMode = device.CurrentEnergyMode;
                const heatingEnergyConsumedRate1 = device.HeatingEnergyConsumedRate1;
                const heatingEnergyConsumedRate2 = device.HeatingEnergyConsumedRate2
                const coolingEnergyConsumedRate1 = device.CoolingEnergyConsumedRate1;
                const coolingEnergyConsumedRate2 = device.CoolingEnergyConsumedRate2;
                const hotWaterEnergyConsumedRate1 = device.HotWaterEnergyConsumedRate1;
                const hotWaterEnergyConsumedRate2 = device.HotWaterEnergyConsumedRate2;
                const heatingEnergyProducedRate1 = device.HeatingEnergyProducedRate1;
                const heatingEnergyProducedRate2 = device.HeatingEnergyProducedRate2;
                const coolingEnergyProducedRate1 = device.CoolingEnergyProducedRate1;
                const coolingEnergyProducedRate2 = device.CoolingEnergyProducedRate2;
                const hotWaterEnergyProducedRate1 = device.HotWaterEnergyProducedRate1;
                const hotWaterEnergyProducedRate2 = device.HotWaterEnergyProducedRate2;
                const errorCode2Digit = device.ErrorCode2Digit;
                const sendSpecialFunctions = device.SendSpecialFunctions;
                const requestSpecialFunctions = device.RequestSpecialFunctions;
                const specialFunctionsState = device.SpecialFunctionsState;
                const pendingSendSpecialFunctions = device.PendingSendSpecialFunctions;
                const pendingRequestSpecialFunctions = device.PendingRequestSpecialFunctions;
                const hasSimplifiedZone2 = device.HasSimplifiedZone2;
                const canSetTankTemperature = device.CanSetTankTemperature;
                const canSetEcoHotWater = device.CanSetEcoHotWater;
                const hasEnergyConsumedMeter = device.HasEnergyConsumedMeter;
                const hasEnergyProducedMeter = device.HasEnergyProducedMeter;
                const canMeasureEnergyProduced = device.CanMeasureEnergyProduced;
                const canMeasureEnergyConsumed = device.CanMeasureEnergyConsumed;
                const zone1InRoomMode = device.Zone1InRoomMode;
                const zone2InRoomMode = device.Zone2InRoomMode;
                const zone1InHeatMode = device.Zone1InHeatMode;
                const zone2InHeatMode = device.Zone2InHeatMode;
                const zone1InCoolMode = device.Zone1InCoolMode;
                const zone2InCoolMode = device.Zone2InCoolMode;
                const allowDualRoomTemperature = device.AllowDualRoomTemperature;
                const isGeodan = device.IsGeodan;
                const hasEcoCuteSettings = device.HasEcoCuteSettings;
                const hasFTC45Settings = device.HasFTC45Settings;
                const hasFTC6Settings = device.HasFTC6Settings;
                const canEstimateEnergyUsage = device.CanEstimateEnergyUsage;
                const canUseRoomTemperatureCooling = device.CanUseRoomTemperatureCooling;
                const isFtcModelSupported = device.IsFtcModelSupported;
                const maxTankTemperature = device.MaxTankTemperature;
                const idleZone1 = device.IdleZone1;
                const idleZone2 = device.IdleZone2;
                const minPcycle = device.MinPcycle;
                const maxPcycle = device.MaxPcycle;
                const maxOutdoorUnits = device.MaxOutdoorUnits;
                const maxIndoorUnits = device.MaxIndoorUnits;
                const maxTemperatureControlUnits = device.MaxTemperatureControlUnits;
                const deviceId = device.DeviceID;
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
                const effectivePCycle = device.EffectivePCycle;
                const mqttFlags = device.MqttFlags;
                const hasErrorMessages = device.HasErrorMessages;
                const offline = device.Offline;
                const supportsHourlyEnergyReport = device.SupportsHourlyEnergyReport;
                const hasZone2 = device.HasZone2 || false;

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
                    const unitModel = unit.Model && unit.Model !== null ? unit.Model : 'unknown';
                    const unitType = unit.UnitType && unit.UnitType !== null ? unit.UnitType : 'unknown';
                    const unitIsIndoor = unit.IsIndoor || false;

                    const pushSerial = unitIsIndoor ? serialsNumberIndoor.push(unitSerialNumber) : serialsNumberOutdoor.push(unitSerialNumber);
                    const pushModelNumber = unitIsIndoor ? modelsNumberIndoor.push(unitModelNumber) : modelsNumberOutdoor.push(unitModelNumber);
                    const pushUnitModel = unitIsIndoor ? modelsIndoor.push(unitModel) : modelsOutdoor.push(unitModel);
                    const pushUnitTypel = unitIsIndoor ? typesIndoor.push(unitType) : typesOutdoor.push(unitType);
                }

                const manufacturer = 'Mitsubishi';
                const modelIndoor = modelsIndoor.length > 0 ? modelsIndoor[0] : 'Undefined';
                const modelOutdoor = modelsOutdoor.length > 0 ? modelsOutdoor[0] : 'Undefined';

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
                const permiossionCanSetForcedHotWater = deviceInfo.Permissions.CanSetForcedHotWater;
                const permiossionCanSetOperationMode = deviceInfo.Permissions.CanSetOperationMode;
                const permiossionCanSetPower = deviceInfo.Permissions.CanSetPower;
                const permiossionCanSetTankWaterTemperature = deviceInfo.Permissions.CanSetTankWaterTemperature;
                const permiossionCanSetEcoHotWater = deviceInfo.Permissions.CanSetEcoHotWater;
                const permiossionCanSetFlowTemperature = deviceInfo.Permissions.CanSetFlowTemperature;
                const permiossionCanSetTemperatureIncrementOverride = deviceInfo.Permissions.CanSetTemperatureIncrementOverride;

                //variables
                const heatPumpZoneName = 'Heat Pump';
                const hotWaterZoneName = 'Hot Water';
                const heatCoolModes = canHeat && canCool ? 0 : canHeat ? 1 : canCool ? 2 : 3;
                const hotWater = hasHotWaterTank ? 1 : 0;
                const zone2 = hasZone2 ? 1 : 0;
                const zonesCount = 2 + hotWater + zone2 || 0;
                const caseHotWater = hasHotWaterTank ? 2 : -1;
                const caseZone2 = hasHotWaterTank ? (hasZone2 ? 3 : 2) : -1;

                this.emit('deviceInfo', manufacturer, modelIndoor, modelOutdoor, serialNumber, firmwareAppVersion, presets, presetsCount, zonesCount, heatPumpZoneName, hotWaterZoneName, hasHotWaterTank, temperatureIncrement, maxTankTemperature, hasZone2, zone1Name, zone2Name, heatCoolModes, caseHotWater, caseZone2);
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
                const forcedHotWaterMode = deviceState.ForcedHotWaterMode ? 1 : 0;
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

                const stateHasNotChanged =
                    setTemperatureZone1 === this.setTemperatureZone1
                    && setTemperatureZone2 === this.setTemperatureZone2
                    && roomTemperatureZone1 === this.roomTemperatureZone1
                    && roomTemperatureZone2 === this.roomTemperatureZone2
                    && operationMode === this.operationMode
                    && operationModeZone1 === this.operationModeZone1
                    && operationModeZone2 === this.operationModeZone2
                    && setHeatFlowTemperatureZone1 === this.setHeatFlowTemperatureZone1
                    && setHeatFlowTemperatureZone2 === this.setHeatFlowTemperatureZone2
                    && setCoolFlowTemperatureZone1 === this.setCoolFlowTemperatureZone1
                    && setCoolFlowTemperatureZone2 === this.setCoolFlowTemperatureZone2
                    && hcControlType === this.hcControlType
                    && tankWaterTemperature === this.tankWaterTemperature
                    && setTankWaterTemperature === this.setTankWaterTemperature
                    && forcedHotWaterMode === this.forcedHotWaterMode
                    && unitStatus === this.unitStatus
                    && outdoorTemperature === this.outdoorTemperature
                    && ecoHotWater === this.ecoHotWater
                    && holidayMode === this.holidayMode
                    && prohibitZone1 === this.prohibitZone1
                    && prohibitZone2 === this.prohibitZone2
                    && prohibitHotWater === this.prohibitHotWater
                    && idleZone1 === this.idleZone1
                    && idleZone2 === this.idleZone2
                    && power === this.power;

                if (stateHasNotChanged) {
                    this.checkDeviceInfo();
                    return;
                }

                this.setTemperatureZone1 = setTemperatureZone1;
                this.setTemperatureZone2 = setTemperatureZone2;
                this.roomTemperatureZone1 = roomTemperatureZone1;
                this.roomTemperatureZone2 = roomTemperatureZone2;
                this.operationMode = operationMode;
                this.operationModeZone1 = operationModeZone1;
                this.operationModeZone2 = operationModeZone2;
                this.setHeatFlowTemperatureZone1 = setHeatFlowTemperatureZone1;
                this.setHeatFlowTemperatureZone2 = setHeatFlowTemperatureZone2;
                this.setCoolFlowTemperatureZone1 = setCoolFlowTemperatureZone1;
                this.setCoolFlowTemperatureZone2 = setCoolFlowTemperatureZone2;
                this.hcControlType = hcControlType;
                this.tankWaterTemperature = tankWaterTemperature;
                this.setTankWaterTemperature = setTankWaterTemperature;
                this.forcedHotWaterMode = forcedHotWaterMode;
                this.unitStatus = unitStatus;
                this.outdoorTemperature = outdoorTemperature;
                this.ecoHotWater = ecoHotWater;
                this.holidayMode = holidayMode;
                this.prohibitZone1 = prohibitZone1;
                this.prohibitZone2 = prohibitZone2;
                this.prohibitHotWater = prohibitHotWater;
                this.idleZone1 = idleZone1;
                this.idleZone2 = idleZone2;
                this.power = power;
                this.offline = offline;

                this.emit('deviceState', deviceState, setTemperatureZone1, setTemperatureZone2, roomTemperatureZone1, roomTemperatureZone2, operationMode, operationModeZone1, operationModeZone2, setHeatFlowTemperatureZone1, setHeatFlowTemperatureZone2, setCoolFlowTemperatureZone1, setCoolFlowTemperatureZone2, hcControlType, tankWaterTemperature, setTankWaterTemperature, forcedHotWaterMode, unitStatus, outdoorTemperature, ecoHotWater, holidayMode, prohibitZone1, prohibitZone2, prohibitHotWater, idleZone1, idleZone2, power, offline);
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

    send(newData) {
        return new Promise(async (resolve, reject) => {
            try {
                newData.HasPendingCommand = true;
                const options = {
                    data: newData
                };

                await this.axiosInstancePost(CONSTANS.ApiUrls.SetAtw, options);
                this.emit('checkDeviceInfo');
                await new Promise(resolve => setTimeout(resolve, 2000));
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = MELCLOUDDEVICEATW;
