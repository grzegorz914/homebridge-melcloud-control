"use strict";
const fs = require('fs');
const fsPromises = fs.promises;
const axios = require('axios');
const EventEmitter = require('events');
const CONSTANS = require('./constans.json');


class MelCloudAta extends EventEmitter {
    constructor(config) {
        super();
        const accountName = config.accountName;
        const contextKey = config.contextKey;
        const buildingId = config.buildingId;
        const deviceId = config.deviceId;
        const debugLog = config.debugLog;
        const mqttEnabled = config.mqttEnabled;
        const prefDir = config.prefDir;
        const deviceInfoFile = `${prefDir}/${accountName}_Device_${deviceId}`;

        //set default values
        this.roomTemperature = 0;
        this.setTemperature = 0;
        this.setFanSpeed = 0;
        this.operationMode = 0;
        this.vaneHorizontal = 0;
        this.vaneVertical = 0;
        this.defaultHeatingSetTemperature = 0;
        this.defaultCoolingSetTemperature = 0;
        this.hideVaneControls = false;
        this.hideDryModeControl = false;
        this.inStandbyMode = false;
        this.prohibitSetTemperature = false;
        this.prohibitOperationMode = false;
        this.prohibitPower = false;
        this.power = false;
        this.offline = false;

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

        this.on('checkDeviceInfo', async () => {
            try {
                const deviceInfoData = await fsPromises.readFile(deviceInfoFile);
                const deviceInfo = JSON.parse(deviceInfoData);
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
                //const serialNumber = deviceInfo.SerialNumber !== null ? deviceInfo.SerialNumber.toString() : 'Undefined';

                //device
                const device = deviceInfo.Device;
                const pCycleActual = device.PCycleActual;
                const errorMessages = device.ErrorMessages;
                const deviceType = device.DeviceType;
                const canCool = device.CanCool;
                const canHeat = device.CanHeat;
                const canDry = device.CanDry;
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
                const modelIsAirCurtain = device.ModelIsAirCurtain;
                const modelSupportsFanSpeed = device.ModelSupportsFanSpeed || false;
                const modelSupportsAuto = device.ModelSupportsAuto || false;
                const modelSupportsHeat = device.ModelSupportsHeat || false;
                const modelSupportsDry = device.ModelSupportsDry || false;
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
                const deviceId = device.DeviceID;
                const macAddress = device.MacAddress;
                const serialNumber = device.SerialNumber ?? 'Undefined';
                const timeZoneID = device.TimeZoneID;
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
                const mqttFlags = device.MqttFlags;
                const hasErrorMessages = device.HasErrorMessages;
                const hasZone2 = device.HasZone2;
                const offline = device.Offline;
                const supportsHourlyEnergyReport = device.SupportsHourlyEnergyReport;

                //units info
                const units = Array.isArray(device.Units) ? device.Units : [];
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
                for (const unit of units) {
                    const unitId = unit.ID;
                    const unitDevice = unit.Device;
                    const unitSerialNumber = unit.SerialNumber;
                    const unitModelNumber = unit.ModelNumber;
                    const unitModel = unit.Model;
                    const unitType = unit.UnitType;
                    const unitIsIndoor = unit.IsIndoor || false;

                    switch (unitIsIndoor) {
                        case true:
                            idIndoor = unitId;
                            deviceIndoor = unitDevice;
                            serialNumberIndoor = unitSerialNumber ?? 'Undefined';
                            modelNumberIndoor = unitModelNumber;
                            modelIndoor = unitModel ?? 'Undefined';
                            typeIndoor = unitType;
                            break;
                        case false:
                            idOutdoor = unitId;
                            deviceOutdoor = unitDevice;
                            serialNumberOutdoor = unitSerialNumber ?? 'Undefined';
                            modelNumberOutdoor = unitModelNumber;
                            modelOutdoor = unitModel ?? 'Undefined';
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

                this.emit('deviceInfo', manufacturer, modelIndoor, modelOutdoor, serialNumber, firmwareAppVersion, presets, presetsCount, hasAutomaticFanSpeed, airDirectionFunction, swingFunction, numberOfFanSpeeds, temperatureIncrement, minTempCoolDry, maxTempCoolDry, minTempHeat, maxTempHeat, minTempAutomatic, maxTempAutomatic, modelSupportsFanSpeed, modelSupportsAuto, modelSupportsHeat, modelSupportsDry);
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
                const localIPAddress = deviceState.LocalIPAddress;
                const roomTemperature = deviceState.RoomTemperature;
                const setTemperature = deviceState.SetTemperature;
                const setFanSpeed = deviceState.SetFanSpeed;
                const operationMode = deviceState.OperationMode;
                const vaneHorizontal = deviceState.VaneHorizontal;
                const vaneVertical = deviceState.VaneVertical;
                const name = deviceState.Name;
                const numberOfFanSpeeds = deviceState.NumberOfFanSpeeds;
                const weatherObservations = deviceState.WeatherObservations;
                const errorMessage = deviceState.ErrorMessage;
                const errorCode = deviceState.ErrorCode;
                const defaultHeatingSetTemperature = deviceState.DefaultHeatingSetTemperature;
                const defaultCoolingSetTemperature = deviceState.DefaultCoolingSetTemperature;
                const demandPercentage = deviceState.DemandPercentage;
                const hideVaneControls = deviceState.HideVaneControls;
                const hideDryModeControl = deviceState.HideDryModeControl;
                const roomTemperatureLabel = deviceState.RoomTemperatureLabel;
                const inStandbyMode = deviceState.InStandbyMode;
                const temperatureIncrementOverride = deviceState.TemperatureIncrementOverride;
                const prohibitSetTemperature = deviceState.ProhibitSetTemperature;
                const prohibitOperationMode = deviceState.ProhibitOperationMode;
                const prohibitPower = deviceState.ProhibitPower;
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
                    && setTemperature === this.setTemperature
                    && setFanSpeed === this.setFanSpeed
                    && operationMode === this.operationMode
                    && vaneHorizontal === this.vaneHorizontal
                    && vaneVertical === this.vaneVertical
                    && defaultHeatingSetTemperature === this.defaultHeatingSetTemperature
                    && defaultCoolingSetTemperature === this.defaultCoolingSetTemperature
                    && hideVaneControls === this.hideVaneControls
                    && hideDryModeControl === this.hideDryModeControl
                    && inStandbyMode === this.inStandbyMode
                    && prohibitSetTemperature === this.prohibitSetTemperature
                    && prohibitOperationMode === this.prohibitOperationMode
                    && prohibitPower === this.prohibitPower
                    && power === this.power
                    && offline === this.offline;

                if (stateHasNotChanged) {
                    this.checkDeviceInfo();
                    return;
                }

                this.roomTemperature = roomTemperature;
                this.setTemperature = setTemperature;
                this.setFanSpeed = setFanSpeed;
                this.operationMode = operationMode;
                this.vaneHorizontal = vaneHorizontal;
                this.vaneVertical = vaneVertical;
                this.defaultHeatingSetTemperature = defaultHeatingSetTemperature;
                this.defaultCoolingSetTemperature = defaultCoolingSetTemperature;
                this.hideVaneControls = hideVaneControls;
                this.hideDryModeControl = hideDryModeControl;
                this.inStandbyMode = inStandbyMode;
                this.prohibitSetTemperature = prohibitSetTemperature;
                this.prohibitOperationMode = prohibitOperationMode;
                this.prohibitPower = prohibitPower;
                this.power = power;
                this.offline = offline;

                this.emit('deviceState', deviceState, roomTemperature, setTemperature, setFanSpeed, operationMode, vaneHorizontal, vaneVertical, defaultHeatingSetTemperature, defaultCoolingSetTemperature, hideVaneControls, hideDryModeControl, inStandbyMode, prohibitSetTemperature, prohibitOperationMode, prohibitPower, power, offline);
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

    send(deviceState) {
        return new Promise(async (resolve, reject) => {
            try {
                deviceState.HasPendingCommand = true;
                const options = {
                    data: deviceState
                };

                await this.axiosInstancePost(CONSTANS.ApiUrls.SetAta, options);
                this.emit('checkDeviceInfo');
                await new Promise(resolve => setTimeout(resolve, 2000));
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = MelCloudAta;
