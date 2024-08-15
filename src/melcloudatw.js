"use strict";
const fs = require('fs');
const fsPromises = fs.promises;
const https = require('https');
const axios = require('axios');
const EventEmitter = require('events');
const ImpulseGenerator = require('./impulsegenerator.js');
const CONSTANTS = require('./constants.json');

class MelCloudAtw extends EventEmitter {
    constructor(config) {
        super();
        const contextKey = config.contextKey;
        const accountInfoFile = config.accountInfoFile;
        const deviceInfoFile = config.deviceInfoFile;
        const debugLog = config.debugLog;

        //set default values
        this.deviceData = {};
        this.displayDeviceInfo = true;

        this.axiosInstancePost = axios.create({
            method: 'POST',
            baseURL: CONSTANTS.ApiUrls.BaseURL,
            timeout: 25000,
            headers: {
                'X-MitsContextKey': contextKey,
                'content-type': 'application/json'
            },
            withCredentials: true,
            httpsAgent: new https.Agent({
                keepAlive: false,
                rejectUnauthorized: false
            })
        });

        const timers = [
            { name: 'checkDevice', interval: 5000 },
        ];

        const impulseGenerator = new ImpulseGenerator(timers);
        impulseGenerator.on('checkDevice', async () => {
            try {
                //read account info from file
                const accountInfo = await this.readData(accountInfoFile);

                //remove sensitive data
                const debugData = {
                    ...accountInfo,
                    ContextKey: 'removed',
                    ClientId: 'removed',
                    Client: 'removed',
                    Name: 'removed',
                    MapLongitude: 'removed',
                    MapLatitude: 'removed'
                };
                const debug = debugLog ? this.emit('debug', `Account Info: ${JSON.stringify(debugData, null, 2)}`) : false;
                const useFahrenheit = accountInfo.UseFahrenheit ? 1 : 0;
                this.useFahrenheit = useFahrenheit;

                //read device info from file
                const deviceData = await this.readData(deviceInfoFile);
                const debug1 = debugLog ? this.emit('debug', `Device Info: ${JSON.stringify(deviceData, null, 2)}`) : false;

                if (!deviceData) {
                    return;
                }

                //device info
                const deviceId = deviceData.DeviceID.toString();
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

                //device info
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
                const listHistory24Formatters = Array.isArray(device.ListHistory24Formatters) ? device.ListHistory24Formatters : [];
                const listHistory24FormattersCount = listHistory24Formatters.length;
                const pCycleActual = device.PCycleActual;
                const errorMessages = device.ErrorMessages;
                const deviceType = device.DeviceType;
                const canHeat = device.CanHeat;
                const canCool = device.CanCool;
                const hasHotWaterTank = device.HasHotWaterTank ?? false;
                const fTCVersion = device.FTCVersion;
                const fTCRevision = device.FTCRevision;
                const lastFTCVersion = device.LastFTCVersion;
                const lastFTCRevision = device.LastFTCRevision;
                const fTCModel = device.FTCModel;
                const refridgerentAddress = device.RefridgerentAddress; // TODO: Typo in MELCloud service?
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
                const unitStatus = device.UnitStatus ?? 0;
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
                const power = device.Power ?? false;
                const ecoHotWater = device.EcoHotWater ?? false;
                const operationMode = device.OperationMode;
                const operationModeZone1 = device.OperationModeZone1;
                const operationModeZone2 = device.OperationModeZone2;
                const setTemperatureZone1 = device.SetTemperatureZone1;
                const setTemperatureZone2 = device.SetTemperatureZone2;
                const setTankWaterTemperature = device.SetTankWaterTemperature;
                const targetHCTemperatureZone1 = device.TargetHCTemperatureZone1;
                const targetHCTemperatureZone2 = device.TargetHCTemperatureZone2;
                const forcedHotWaterMode = device.ForcedHotWaterMode ? 1 : 0 ?? 0;
                const holidayMode = device.HolidayMode ?? false;
                const prohibitHotWater = device.ProhibitHotWater ?? false;
                const prohibitHeatingZone1 = device.ProhibitHeatingZone1 ?? false;
                const prohibitHeatingZone2 = device.ProhibitHeatingZone2 ?? false;
                const prohibitCoolingZone1 = device.ProhibitCoolingZone1 ?? false;
                const prohibitCoolingZone2 = device.ProhibitCoolingZone2 ?? false;
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
                const idleZone1 = device.IdleZone1 ?? false;
                const idleZone2 = device.IdleZone2 ?? false;
                const minPcycle = device.MinPcycle;
                const maxPcycle = device.MaxPcycle;
                const maxOutdoorUnits = device.MaxOutdoorUnits;
                const maxIndoorUnits = device.MaxIndoorUnits;
                const maxTemperatureControlUnits = device.MaxTemperatureControlUnits;
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
                const offline = device.Offline ?? false;
                const supportsHourlyEnergyReport = device.SupportsHourlyEnergyReport;
                const hasZone2 = device.HasZone2 ?? false;

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
                const permissionCanSetForcedHotWater = deviceData.Permissions.CanSetForcedHotWater;
                const permissionCanSetOperationMode = deviceData.Permissions.CanSetOperationMode;
                const permissionCanSetPower = deviceData.Permissions.CanSetPower;
                const permissionCanSetTankWaterTemperature = deviceData.Permissions.CanSetTankWaterTemperature;
                const permissionCanSetEcoHotWater = deviceData.Permissions.CanSetEcoHotWater;
                const permissionCanSetFlowTemperature = deviceData.Permissions.CanSetFlowTemperature;
                const permissionCanSetTemperatureIncrementOverride = deviceData.Permissions.CanSetTemperatureIncrementOverride;

                //display info if units are not configured in MELCloud service
                if (unitsCount === 0) {
                    this.emit('message', `Units are not configured in MELCloud service.`);
                };

                //emit info
                const emitInfo = this.displayDeviceInfo ? this.emit('deviceInfo', manufacturer, modelIndoor, modelOutdoor, serialNumber, firmwareAppVersion, hasHotWaterTank, hasZone2) : false;
                this.displayDeviceInfo = false;

                //device state
                const deviceState = {
                    DeviceId: deviceId,
                    EffectiveFlags: effectiveFlags,
                    SetTemperatureZone1: setTemperatureZone1,
                    SetTemperatureZone2: setTemperatureZone2,
                    RoomTemperatureZone1: roomTemperatureZone1,
                    RoomTemperatureZone2: roomTemperatureZone2,
                    OperationMode: operationMode,
                    OperationModeZone1: operationModeZone1,
                    OperationModeZone2: operationModeZone2,
                    SetHeatFlowTemperatureZone1: setHeatFlowTemperatureZone1,
                    SetHeatFlowTemperatureZone2: setHeatFlowTemperatureZone2,
                    SetCoolFlowTemperatureZone1: setCoolFlowTemperatureZone1,
                    SetCoolFlowTemperatureZone2: setCoolFlowTemperatureZone2,
                    TankWaterTemperature: tankWaterTemperature,
                    SetTankWaterTemperature: setTankWaterTemperature,
                    ForcedHotWaterMode: forcedHotWaterMode,
                    OutdoorTemperature: outdoorTemperature,
                    EcoHotWater: ecoHotWater,
                    HolidayMode: holidayMode,
                    ProhibitZone1: prohibitHeatingZone1,
                    ProhibitZone2: prohibitHeatingZone2,
                    ProhibitHotWater: prohibitHotWater,
                    IdleZone1: idleZone1,
                    IdleZone2: idleZone2,
                    UnitStatus: unitStatus,
                    Power: power,
                    Offline: offline
                }

                //external integrations
                this.emit('externalIntegrations', deviceData, deviceState);

                //check state changes
                const stateHasNotChanged = JSON.stringify(deviceData) === JSON.stringify(this.deviceData);
                if (stateHasNotChanged) {
                    return;
                }

                //emit state
                this.deviceData = deviceData;
                const debug2 = debugLog ? this.emit('debug', `Device State: ${JSON.stringify(deviceState, null, 2)}`) : false;
                this.emit('deviceState', deviceData, deviceState, useFahrenheit);
            } catch (error) {
                this.emit('error', `Check device error: ${error}.`);
            };
        });

        impulseGenerator.start();
    };

    async readData(path) {
        try {
            const savedData = await fsPromises.readFile(path)
            const data = savedData.length > 0 ? JSON.parse(savedData) : false;
            return data;
        } catch (error) {
            this.emit('error', `Read data from path: ${path}, error: ${error}`);
        }
    }

    async send(deviceState) {
        try {
            //prevent to set out of range temp
            const minTempZones = 10;
            const maxTempZones = 31;
            const minTempWaterTank = 16;
            const maxTempWaterTank = this.deviceData.Device.MaxTankTemperature ?? 70;
            deviceState.SetTemperatureZone1 = deviceState.SetTemperatureZone1 < minTempZones ? minTempZones : deviceState.SetTemperatureZone1;
            deviceState.SetTemperatureZone1 = deviceState.SetTemperatureZone1 > maxTempZones ? maxTempZones : deviceState.SetTemperatureZone1;
            deviceState.SetTemperatureZone1 = deviceState.SetTemperatureZone2 < minTempZones ? minTempZones : deviceState.SetTemperatureZone2;
            deviceState.SetTemperatureZone1 = deviceState.SetTemperatureZone2 > maxTempZones ? maxTempZones : deviceState.SetTemperatureZone2;
            deviceState.SetTankWaterTemperature = deviceState.SetTankWaterTemperature < minTempWaterTank ? minTempWaterTank : deviceState.SetTankWaterTemperature;
            deviceState.SetTankWaterTemperature = deviceState.SetTankWaterTemperature > maxTempWaterTank ? maxTempWaterTank : deviceState.SetTankWaterTemperature;

            deviceState.HasPendingCommand = true;
            const options = {
                data: deviceState
            };

            await this.axiosInstancePost(CONSTANTS.ApiUrls.SetAtw, options);
            this.emit('deviceState', this.deviceData, deviceState, this.useFahrenheit);
            return true;
        } catch (error) {
            this.emit('error', error);
        };
    };
};
module.exports = MelCloudAtw;
