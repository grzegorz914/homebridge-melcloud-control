const EventEmitter = require('events');
const axios = require('axios');
const API_URL = require('./apiurl.json');
const CONSTANS = require('./constans.json');


class MELCLOUDDEVICEATW extends EventEmitter {
    constructor(config) {
        super();
        const deviceInfo = config.deviceInfo;
        const deviceName = config.deviceName;
        const deviceTypeText = config.deviceTypeText;
        const contextKey = config.contextKey;
        const buildingId = config.buildingId;
        const deviceId = config.deviceId;
        const debugLog = config.debugLog;
        const enableMqtt = config.mqttEnabled;

        this.axiosInstanceGet = axios.create({
            method: 'GET',
            baseURL: API_URL.BaseURL,
            timeout: 10000,
            headers: {
                'X-MitsContextKey': contextKey,
            }
        });
        this.axiosInstancePost = axios.create({
            method: 'POST',
            baseURL: API_URL.BaseURL,
            timeout: 10000,
            headers: {
                'X-MitsContextKey': contextKey,
                'content-type': 'application/json'
            }
        });

        this.on('checkDeviceState', async () => {
                //deviceState
                try {
                    const deviceUrl = API_URL.DeviceState.replace("DID", deviceId).replace("BID", buildingId);
                    const responseData = await this.axiosInstanceGet(deviceUrl);
                    const deviceState = responseData.data;
                    const deviceStateData = JSON.stringify(deviceState, null, 2);
                    const debug = debugLog ? this.emit('debug', `${deviceTypeText} ${deviceName}, debug deviceState: ${deviceStateData}`) : false;

                    // device state
                    const temperatureIncrement = deviceState.TemperatureIncrement
                    const defrostMode = deviceState.DefrostMode
                    const heatPumpFrequenc = deviceState.HeatPumpFrequenc
                    const maxSetTemperature = deviceState.MaxSetTemperature
                    const minSetTemperature = deviceState.MinSetTemperature
                    const roomTemperatureZone1 = deviceState.RoomTemperatureZone1
                    const roomTemperatureZone2 = deviceState.RoomTemperatureZone2
                    const tankWaterTemperature = deviceState.TankWaterTemperature
                    const unitStatus = deviceState.UnitStatus
                    const heatingFunctionEnabled = deviceState.HeatingFunctionEnabled
                    const serverTimerEnabled = deviceState.ServerTimerEnabled
                    const thermostatStatusZone1 = deviceState.ThermostatStatusZone1
                    const thermostatStatusZone2 = deviceState.ThermostatStatusZone2
                    const thermostatTypeZone1 = deviceState.ThermostatTypeZone1
                    const thermostatTypeZone2 = deviceState.ThermostatTypeZone2
                    const mixingTankWaterTemperature = deviceState.MixingTankWaterTemperature
                    const condensingTemperature = deviceState.CondensingTemperature
                    const effectiveFlags = deviceState.EffectiveFlags
                    const lastEffectiveFlags = deviceState.LastEffectiveFlags
                    const power = deviceState.Power
                    const ecoHotWater = deviceState.EcoHotWater
                    const operationMode = deviceState.OperationMode
                    const operationModeZone1 = deviceState.OperationModeZone1
                    const operationModeZone2 = deviceState.OperationModeZone2
                    const setTemperatureZone1 = deviceState.SetTemperatureZone1
                    const setTemperatureZone2 = deviceState.SetTemperatureZone2
                    const setTankWaterTemperatureconst = deviceState.SetTankWaterTemperatureconst
                    const targetHCTemperatureZone1 = deviceState.TargetHCTemperatureZone1
                    const targetHCTemperatureZone2 = deviceState.TargetHCTemperatureZone2
                    const forcedHotWaterMode = deviceState.ForcedHotWaterMode
                    const holidayMode = deviceState.HolidayMode
                    const prohibitHotWater = deviceState.ProhibitHotWater
                    const prohibitHeatingZone1 = deviceState.ProhibitHeatingZone1
                    const prohibitHeatingZone2 = deviceState.ProhibitHeatingZone2
                    const prohibitCoolingZone1 = deviceState.ProhibitCoolingZone1
                    const prohibitCoolingZone2 = deviceState.ProhibitCoolingZone2
                    const serverTimerDesired = deviceState.ServerTimerDesired
                    const secondaryZoneHeatCurve = deviceState.SecondaryZoneHeatCurve
                    const setHeatFlowTemperatureZone1 = deviceState.SetHeatFlowTemperatureZone1
                    const setHeatFlowTemperatureZone2 = deviceState.SetHeatFlowTemperatureZone2
                    const setCoolFlowTemperatureZone1 = deviceState.SetCoolFlowTemperatureZone1
                    const setCoolFlowTemperatureZone2 = deviceState.SetCoolFlowTemperatureZone2
                    const thermostatTemperatureZone1 = deviceState.ThermostatTemperatureZone1
                    const thermostatTemperatureZone2 = deviceState.ThermostatTemperatureZone2
                    const dECCReport = deviceState.DECCReport
                    const cSVReport1min = deviceState.CSVReport1min
                    const zone2Master = deviceState.Zone2Master
                    const dailyEnergyConsumedDate = deviceState.DailyEnergyConsumedDate
                    const dailyEnergyProducedDate = deviceState.DailyEnergyProducedDate
                    const currentEnergyConsumed = deviceState.CurrentEnergyConsumed
                    const currentEnergyProduced = deviceState.CurrentEnergyProduced
                    const currentEnergyMode = deviceState.CurrentEnergyMode
                    const heatingEnergyConsumedRate1 = deviceState.HeatingEnergyConsumedRate1
                    const heatingEnergyConsumedRate2 = deviceState.HeatingEnergyConsumedRate2
                    const coolingEnergyConsumedRate1 = deviceState.CoolingEnergyConsumedRate1
                    const coolingEnergyConsumedRate2 = deviceState.CoolingEnergyConsumedRate2
                    const hotWaterEnergyConsumedRate1 = deviceState.HotWaterEnergyConsumedRate1
                    const hotWaterEnergyConsumedRate2 = deviceState.HotWaterEnergyConsumedRate2
                    const heatingEnergyProducedRate1 = deviceState.HeatingEnergyProducedRate1
                    const heatingEnergyProducedRate2 = deviceState.HeatingEnergyProducedRate2
                    const coolingEnergyProducedRate1 = deviceState.CoolingEnergyProducedRate1
                    const coolingEnergyProducedRate2 = deviceState.CoolingEnergyProducedRate2
                    const hotWaterEnergyProducedRate1 = deviceState.HotWaterEnergyProducedRate1
                    const hotWaterEnergyProducedRate2 = deviceState.HotWaterEnergyProducedRate2
                    const errorCode2Digit = deviceState.ErrorCode2Digit
                    const sendSpecialFunctions = deviceState.SendSpecialFunctions
                    const requestSpecialFunctions = deviceState.RequestSpecialFunctions
                    const specialFunctionsState = deviceState.SpecialFunctionsState
                    const pendingSendSpecialFunctions = deviceState.PendingSendSpecialFunctions
                    const pendingRequestSpecialFunctions = deviceState.PendingRequestSpecialFunctions
                    const hasZone2 = deviceState.HasZone2
                    const hasSimplifiedZone2 = deviceState.HasSimplifiedZone2
                    const canHeat = deviceState.CanHeat
                    const canCool = deviceState.CanCool
                    const hasHotWaterTank = deviceState.HasHotWaterTank
                    const canSetTankTemperature = deviceState.CanSetTankTemperature
                    const canSetEcoHotWater = deviceState.CanSetEcoHotWater
                    const hasEnergyConsumedMeter = deviceState.HasEnergyConsumedMeter
                    const hasEnergyProducedMeter = deviceState.HasEnergyProducedMeter
                    const canMeasureEnergyProduced = deviceState.CanMeasureEnergyProduced
                    const canMeasureEnergyConsumed = deviceState.CanMeasureEnergyConsumed
                    const zone1InRoomMode = deviceState.Zone1InRoomMode
                    const zone2InRoomMode = deviceState.Zone2InRoomMode
                    const zone1InHeatMode = deviceState.Zone1InHeatMode
                    const zone2InHeatMode = deviceState.Zone2InHeatMode
                    const zone1InCoolMode = deviceState.Zone1InCoolMode
                    const zone2InCoolMode = deviceState.Zone2InCoolMode
                    const allowDualRoomTemperature = deviceState.AllowDualRoomTemperature
                    const isGeodan = deviceState.IsGeodan
                    const hasEcoCuteSettings = deviceState.HasEcoCuteSettings
                    const hasFTC45Settings = deviceState.HasFTC45Settings
                    const hasFTC6Settings = deviceState.HasFTC6Settings
                    const canEstimateEnergyUsage = deviceState.CanEstimateEnergyUsage
                    const canUseRoomTemperatureCooling = deviceState.CanUseRoomTemperatureCooling
                    const isFtcModelSupported = deviceState.IsFtcModelSupported
                    const maxTankTemperature = deviceState.MaxTankTemperature
                    const idleZone1 = deviceState.IdleZone1
                    const idleZone2 = deviceState.IdleZone2
                    const minPcycle = deviceState.MinPcycle
                    const maxPcycle = deviceState.MaxPcycle
                    const maxOutdoorUnits = deviceState.MaxOutdoorUnits
                    const maxIndoorUnits = deviceState.MaxIndoorUnits
                    const maxTemperatureControlUnits = deviceState.MaxTemperatureControlUnits
                    const deviceID = deviceState.DeviceID
                    const macAddress = deviceState.MacAddress
                    const serialNumber = deviceState.SerialNumber
                    const timeZoneID = deviceState.TimeZoneID
                    const diagnosticMode = deviceState.DiagnosticMode
                    const diagnosticEndDate = deviceState.DiagnosticEndDate
                    const expectedCommand = deviceState.ExpectedCommand
                    const owner = deviceState.Owner
                    const detectedCountry = deviceState.DetectedCountry
                    const adaptorType = deviceState.AdaptorType
                    const firmwareDeployment = deviceState.FirmwareDeployment
                    const firmwareUpdateAborted = deviceState.FirmwareUpdateAborted
                    const linkedDevice = deviceState.LinkedDevice
                    const wifiSignalStrength = deviceState.WifiSignalStrength
                    const wifiAdapterStatus = deviceState.WifiAdapterStatus
                    const position = deviceState.Position
                    const pCycle = deviceState.PCycle
                    const recordNumMax = deviceState.RecordNumMax
                    const lastTimeStamp = deviceState.LastTimeStamp
                    const errorCode = deviceState.ErrorCode
                    const hasError = deviceState.HasError
                    const lastReset = deviceState.LastReset
                    const flashWrites = deviceState.FlashWrites
                    const scene = deviceState.Scene
                    const temperatureIncrementOverride = deviceState.TemperatureIncrementOverride
                    const sSLExpirationDate = deviceState.SSLExpirationDate
                    const sPTimeout = deviceState.SPTimeout
                    const passcode = deviceState.Passcode
                    const serverCommunicationDisabled = deviceState.ServerCommunicationDisabled
                    const consecutiveUploadErrors = deviceState.ConsecutiveUploadErrors
                    const doNotRespondAfter = deviceState.DoNotRespondAfter
                    const ownerRoleAccessLevel = deviceState.OwnerRoleAccessLevel
                    const ownerCountry = deviceState.OwnerCountry
                    const hideEnergyReport = deviceState.HideEnergyReport
                    const exceptionHash = deviceState.ExceptionHash
                    const exceptionDate = deviceState.ExceptionDate
                    const exceptionCount = deviceState.ExceptionCount
                    const rate1StartTime = deviceState.Rate1StartTime
                    const rate2StartTime = deviceState.Rate2StartTime
                    const protocolVersion = deviceState.ProtocolVersion
                    const unitVersion = deviceState.UnitVersion
                    const firmwareAppVersion = deviceState.FirmwareAppVersion
                    const firmwareWebVersion = deviceState.FirmwareWebVersion
                    const firmwareWlanVersion = deviceState.FirmwareWlanVersion
                    const effectivePCycle = deviceState.EffectivePCycle
                    const hasErrorMessages = deviceState.HasErrorMessages
                    const offline = deviceState.Offline
                    const units = deviceState.Units

                    this.emit('checkDeviceInfo');
                    this.emit('deviceState', deviceInfo, deviceState, power, roomTemperatureZone1, setTemperatureZone1, roomTemperatureZone2, setTemperatureZone2, tankWaterTemperature, setTankWaterTemperatureconst, operationMode, operationModeZone1, operationModeZone2);
                    const mqtt = enableMqtt ? this.emit('mqtt', `${deviceTypeText} ${deviceName}, Info:`, JSON.stringify(deviceInfo, null, 2)) : false;
                    const mqtt1 = enableMqtt ? this.emit('mqtt', `${deviceTypeText} ${deviceName}, State:`, JSON.stringify(deviceState, null, 2)) : false;

                    this.checkDeviceState();
                } catch (error) {
                    this.emit('error', `${deviceTypeText} ${deviceName}, check state error, ${error}, check again in 60s.`);
                    this.checkDeviceState();
                };
            })
            .on('checkDeviceInfo', () => {
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
                const presets = deviceInfo.Presets;
                if (Array.isArray(presets) && presets.length > 0) {
                    for (let i = 0; i < presets.length; i++) {
                        const preset = presets[i];
                    }
                }

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
                const serialNumber = (deviceInfo.SerialNumber != undefined && deviceInfo.SerialNumber != null) ? deviceInfo.SerialNumber : 'Undefined';

                //device
                const deviceListHistory24Formatters = deviceInfo.Device.ListHistory24Formatters;
                if (Array.isArray(deviceListHistory24Formatters) && deviceListHistory24Formatters.length > 0) {
                    for (let i = 0; i < deviceListHistory24Formatters.length; i++) {
                        const deviveListHistory24Formatter = deviceListHistory24Formatters[i];
                    }
                }

                const devicePCycleActual = deviceInfo.Device.PCycleActual;
                const deviceErrorMessages = deviceInfo.Device.ErrorMessages;
                const deviceDeviceType = deviceInfo.Device.DeviceType;
                const deviceCanCool = deviceInfo.Device.CanCool;
                const deviceCanHeat = deviceInfo.Device.CanHeat;
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
                const deviceDIdleZone2 = deviceInfo.Device.IdleZone2;
                const deviceMinPcycle = deviceInfo.Device.MinPcycle;
                const deviceMaxPcycle = deviceInfo.Device.MaxPcycle;
                const deviceMaxOutdoorUnits = deviceInfo.Device.MaxOutdoorUnits;
                const deviceMaxIndoorUnits = deviceInfo.Device.MaxIndoorUnits;
                const deviceMaxTemperatureControlUnits = deviceInfo.Device.MaxTemperatureControlUnits;
                const deviceDeviceID = deviceInfo.Device.DeviceID;
                const deviceMacAddress = deviceInfo.Device.MacAddress;
                const deviceSerialNumber = (deviceInfo.Device.SerialNumber != undefined && deviceInfo.Device.SerialNumber != null) ? deviceInfo.Device.SerialNumber : 'Undefined';
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
                const deviceFirmwareAppVersion = (deviceInfo.Device.FirmwareAppVersion != undefined && deviceInfo.Device.FirmwareAppVersion != null) ? deviceInfo.Device.FirmwareAppVersion.toString() : 'Undefined';
                const deviceFirmwareWebVersion = deviceInfo.Device.FirmwareWebVersion;
                const deviceFirmwareWlanVersion = deviceInfo.Device.FirmwareWlanVersion;
                const deviceEffectivePCycle = deviceInfo.Device.EffectivePCycle;
                const deviceMqttFlags = deviceInfo.Device.MqttFlags;
                const deviceHasErrorMessages = deviceInfo.Device.HasErrorMessages;
                const deviceHasZone2 = deviceInfo.Device.HasZone2;
                const deviceOffline = deviceInfo.Device.Offline;
                const deviceSupportsHourlyEnergyReport = deviceInfo.Device.SupportsHourlyEnergyReport;

                //units info
                const units = deviceInfo.Device.Units;
                const serialsNumberIndoor = new Array();
                const serialsNumberOutdoor = new Array();
                const modelsNumberIndoor = new Array();
                const modelsNumberOutdoor = new Array();
                const modelsIndoor = new Array();
                const modelsOutdoor = new Array();
                const typesIndoor = new Array();
                const typesOutdoor = new Array();
                if (Array.isArray(units) && units.length > 0) {
                    for (let i = 0; i < units.length; i++) {
                        const unit = units[i];
                        const unitId = unit.ID;
                        const unitDevice = unit.Device;
                        const unitSerialNumber = (unit.SerialNumber != undefined && unit.SerialNumber != null) ? unit.SerialNumber.toString() : 'Undefined';
                        const unitModelNumber = unit.ModelNumber;
                        const unitModel = (unit.Model != undefined && unit.Model != null) ? unit.Model.toString() : 'Undefined';
                        const unitType = unit.UnitType;
                        const unitIsIndoor = (unit.IsIndoor == true);

                        if (unitIsIndoor) {
                            serialsNumberIndoor.push(unitSerialNumber);
                            modelsNumberIndoor.push(unitModelNumber);
                            modelsIndoor.push(unitModel);
                            typesIndoor.push(unitType);
                        }
                        if (!unitIsIndoor) {
                            serialsNumberOutdoor.push(unitSerialNumber);
                            modelsNumberOutdoor.push(unitModelNumber);
                            modelsOutdoor.push(unitModel);
                            typesOutdoor.push(unitType);
                        }
                    }
                }

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

                //device info
                const manufacturer = 'Mitsubishi';
                const modelName = (modelsIndoor.length > 0) ? modelsIndoor[0] : 'Undefined';

                this.emit('deviceInfo', manufacturer, modelName, serialNumber, deviceFirmwareAppVersion);
            });

        this.emit('checkDeviceState');
    };

    checkDeviceState() {
        setTimeout(() => {
            this.emit('checkDeviceState');
        }, 60000);
    };

    send(url, newData, type) {
        return new Promise(async (resolve, reject) => {
            if (type == 0) {
                newData.HasPendingCommand = true;
            };
            const options = {
                data: newData
            };

            try {
                const newState = await this.axiosInstancePost(url, options);
                this.emit('checkDeviceState');
                resolve(true);
            } catch (error) {
                this.emit('error', `Send command error: ${error}`);
                reject(error);
            };
        });
    };
};
module.exports = MELCLOUDDEVICEATW;