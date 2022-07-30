const EventEmitter = require('events');
const axios = require('axios');
const API_URL = require('./apiurl.json');
const CONSTANS = require('./constans.json');


class MELCLOUDDEVICEATA extends EventEmitter {
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
                    const deviceID = deviceState.DeviceID;
                    const deviceType = deviceState.DeviceType;
                    const lastCommunication = deviceState.LastCommunication;
                    const nextCommunication = deviceState.NextCommunication;
                    const power = deviceState.Power;
                    const hasPendingCommand = deviceState.HasPendingCommand;
                    const offline = deviceState.Offline;
                    const scene = deviceState.Scene;
                    const sceneOwner = deviceState.SceneOwner;

                    this.emit('checkDeviceInfo');
                    this.emit('deviceState', deviceInfo, deviceState, roomTemperature, setTemperature, setFanSpeed, operationMode, vaneHorizontal, vaneVertical, inStandbyMode, power);
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
                const serialNumber = (deviceInfo.SerialNumber != null) ? deviceInfo.SerialNumber.toString() : 'Undefined';

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
                const deviceCanDry = deviceInfo.Device.CanDry;
                const deviceHasAutomaticFanSpeed = deviceInfo.Device.HasAutomaticFanSpeed;
                const deviceAirDirectionFunction = deviceInfo.Device.AirDirectionFunction;
                const deviceSwingFunction = deviceInfo.Device.SwingFunction;
                const deviceNumberOfFanSpeeds = deviceInfo.Device.NumberOfFanSpeeds;
                const deviceUseTemperatureA = deviceInfo.Device.UseTemperatureA;
                const deviceTemperatureIncrement = deviceInfo.Device.TemperatureIncrement;
                const deviceTemperatureIncrementOverride = deviceInfo.Device.TemperatureIncrementOverride;
                const deviceMinTempCoolDry = deviceInfo.Device.MinTempCoolDry;
                const deviceMaxTempCoolDry = deviceInfo.Device.MaxTempCoolDry;
                const deviceMinTempHeat = deviceInfo.Device.MinTempHeat;
                const deviceMaxTempHeat = deviceInfo.Device.MaxTempHeat;
                const deviceMinTempAutomatic = deviceInfo.Device.MinTempAutomatic;
                const deviceMaxTempAutomatic = deviceInfo.Device.MaxTempAutomatic;
                const deviceLegacyDevice = deviceInfo.Device.LegacyDevice;
                const deviceUnitSupportsStandbyMode = deviceInfo.Device.UnitSupportsStandbyMode;
                const deviceIsSplitSystem = deviceInfo.Device.IsSplitSystem;
                const deviceModelIsAirCurtain = deviceInfo.Device.ModelIsAirCurtain;
                const deviceModelSupportsFanSpeed = deviceInfo.Device.ModelSupportsFanSpeed;
                const deviceModelSupportsAuto = deviceInfo.Device.ModelSupportsAuto;
                const deviceModelSupportsHeat = deviceInfo.Device.ModelSupportsHeat;
                const deviceModelSupportsDry = deviceInfo.Device.ModelSupportsDry;
                const deviceModelSupportsVaneVertical = deviceInfo.Device.ModelSupportsVaneVertical;
                const deviceModelSupportsVaneHorizontal = deviceInfo.Device.ModelSupportsVaneHorizontal;
                const deviceModelSupportsWideVane = deviceInfo.Device.ModelSupportsWideVane;
                const deviceModelDisableEnergyReport = deviceInfo.Device.ModelDisableEnergyReport;
                const deviceModelSupportsStandbyMode = deviceInfo.Device.ModelSupportsStandbyMode;
                const deviceModelSupportsEnergyReporting = deviceInfo.Device.ModelSupportsEnergyReporting;
                const deviceProhibitSetTemperature = deviceInfo.Device.ProhibitSetTemperature;
                const deviceProhibitOperationMode = deviceInfo.Device.ProhibitOperationMode;
                const deviceProhibitPower = deviceInfo.Device.ProhibitPower;
                const devicePower = deviceInfo.Device.Power;
                const deviceRoomTemperature = deviceInfo.Device.RoomTemperature;
                const deviceSetTemperature = deviceInfo.Device.SetTemperature;
                const deviceActualFanSpeed = deviceInfo.Device.ActualFanSpeed;
                const deviceFanSpeed = deviceInfo.Device.FanSpeed;
                const deviceAutomaticFanSpeed = deviceInfo.Device.AutomaticFanSpeed;
                const deviceVaneVerticalDirection = deviceInfo.Device.VaneVerticalDirection;
                const deviceVaneVerticalSwing = deviceInfo.Device.VaneVerticalSwing;
                const deviceVaneHorizontalDirection = deviceInfo.Device.VaneHorizontalDirection;
                const deviceVaneHorizontalSwing = deviceInfo.Device.VaneHorizontalSwing;
                const deviceOperationMode = deviceInfo.Device.OperationMode;
                const deviceEffectiveFlags = deviceInfo.Device.EffectiveFlags;
                const deviceInStandbyMode = deviceInfo.Device.InStandbyMode;
                const deviceDemandPercentage = deviceInfo.Device.DemandPercentage;
                const deviceConfiguredDemandPercentage = deviceInfo.Device.ConfiguredDemandPercentage;
                const deviceHasDemandSideControl = deviceInfo.Device.HasDemandSideControl;
                const deviceDefaultCoolingSetTemperature = deviceInfo.Device.DefaultCoolingSetTemperature;
                const deviceDefaultHeatingSetTemperature = deviceInfo.Device.DefaultHeatingSetTemperature;
                const deviceRoomTemperatureLabel = deviceInfo.Device.RoomTemperatureLabel;
                const deviceHeatingEnergyConsumedRate1 = deviceInfo.Device.HeatingEnergyConsumedRate1;
                const deviceHeatingEnergyConsumedRate2 = deviceInfo.Device.HeatingEnergyConsumedRate2;
                const deviceCoolingEnergyConsumedRate1 = deviceInfo.Device.CoolingEnergyConsumedRate1;
                const deviceCoolingEnergyConsumedRate2 = deviceInfo.Device.CoolingEnergyConsumedRate2;
                const deviceAutoEnergyConsumedRate1 = deviceInfo.Device.AutoEnergyConsumedRate1;
                const deviceAutoEnergyConsumedRate2 = deviceInfo.Device.AutoEnergyConsumedRate2;
                const deviceDryEnergyConsumedRate1 = deviceInfo.Device.DryEnergyConsumedRate1;
                const deviceDryEnergyConsumedRate2 = deviceInfo.Device.DryEnergyConsumedRate2;
                const deviceFanEnergyConsumedRate1 = deviceInfo.Device.FanEnergyConsumedRate1;
                const deviceFanEnergyConsumedRate2 = deviceInfo.Device.FanEnergyConsumedRate2;
                const deviceOtherEnergyConsumedRate1 = deviceInfo.Device.OtherEnergyConsumedRate1;
                const deviceOtherEnergyConsumedRate2 = deviceInfo.Device.OtherEnergyConsumedRate2;
                const deviceHasEnergyConsumedMeter = deviceInfo.Device.HasEnergyConsumedMeter;
                const deviceCurrentEnergyConsumed = deviceInfo.Device.CurrentEnergyConsumed;
                const deviceCurrentEnergyMode = deviceInfo.Device.CurrentEnergyMode;
                const deviceCoolingDisabled = deviceInfo.Device.CoolingDisabled
                const deviceEnergyCorrectionModel = deviceInfo.Device.EnergyCorrectionModel;
                const deviceEnergyCorrectionActive = deviceInfo.Device.EnergyCorrectionActive;
                const deviceMinPcycle = deviceInfo.Device.MinPcycle;
                const deviceMaxPcycle = deviceInfo.Device.MaxPcycle;
                const deviceEffectivePCycle = deviceInfo.Device.EffectivePCycle;
                const deviceMaxOutdoorUnits = deviceInfo.Device.MaxOutdoorUnits;
                const deviceMaxIndoorUnits = deviceInfo.Device.MaxIndoorUnits;
                const deviceMaxTemperatureControlUnits = deviceInfo.Device.MaxTemperatureControlUnits;
                const deviceModelCode = deviceInfo.Device.ModelCode;
                const deviceDeviceID = deviceInfo.Device.DeviceID;
                const deviceMacAddress = deviceInfo.Device.MacAddress;
                const deviceSerialNumber = (deviceInfo.Device.SerialNumber != null) ? deviceInfo.Device.SerialNumber.toString() : 'Undefined';
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
                const deviceFirmwareAppVersion = (deviceInfo.Device.FirmwareAppVersion != null) ? deviceInfo.Device.FirmwareAppVersion.toString() : 'Undefined';
                const deviceFirmwareWebVersion = deviceInfo.Device.FirmwareWebVersion;
                const deviceFirmwareWlanVersion = deviceInfo.Device.FirmwareWlanVersion;
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
                        const unitSerialNumber = (unit.SerialNumber != null) ? (unit.SerialNumber.length > 1) != null ? unit.SerialNumber.toString() : 'Serial to short' : 'Undefined';
                        const unitModelNumber = unit.ModelNumber;
                        const unitModel = (unit.Model != null) ? unit.Model.toString() : 'Undefined';
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
                const CanSetOperationMode = deviceInfo.Permissions.CanSetOperationMode;
                const CanSetFanSpeed = deviceInfo.Permissions.CanSetFanSpeed;
                const CanSetVaneDirection = deviceInfo.Permissions.CanSetVaneDirection;
                const CanSetPower = deviceInfo.Permissions.CanSetPower;
                const CanSetTemperatureIncrementOverride = deviceInfo.Permissions.CanSetTemperatureIncrementOverride;
                const CanDisableLocalController = deviceInfo.Permissions.CanDisableLocalController;

                //device info
                const manufacturer = 'Mitsubishi';
                const modelName = (modelsIndoor.length > 0) ? modelsIndoor[0] : 'Undefined';
                const modelName1 = (modelsOutdoor.length > 0) ? modelsOutdoor[0] : 'Undefined';

                this.emit('deviceInfo', manufacturer, modelName, modelName1, serialNumber, deviceFirmwareAppVersion);
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
module.exports = MELCLOUDDEVICEATA;