const EventEmitter = require('events');
const axios = require('axios');
const API_URL = require('./apiurl.json');
const CONSTANS = require('./constans.json');


class MELCLOUDCLIENTDEVICE extends EventEmitter {
    constructor(config) {
        super();
        this.melCloudInfo = config.melCloudInfo;
        this.deviceInfo = config.deviceInfo;
        this.contextKey = config.contextKey;
        this.buildingId = config.buildingId;
        this.deviceId = config.deviceId;
        this.debugLog = config.debugLog;
        this.enableMqtt = config.mqttEnabled;

        this.axiosInstanceGet = axios.create({
            method: 'GET',
            baseURL: API_URL.BaseURL,
            headers: {
                'X-MitsContextKey': this.contextKey,
            }
        });
        this.axiosInstancePost = axios.create({
            method: 'POST',
            baseURL: API_URL.BaseURL,
            headers: {
                'X-MitsContextKey': this.contextKey,
                'content-type': 'application/json'
            }
        });

        this.on('refreschDeviceState', async () => {
                //deviceState
                const deviceInfo = this.deviceInfo;
                const deviceType = deviceInfo.Type;
                const deviceName = deviceInfo.DeviceName;
                const deviceTypeText = CONSTANS.DeviceType[deviceType];

                try {
                    const deviceUrl = API_URL.DeviceState.replace("DID", this.deviceId).replace("BID", this.buildingId);
                    const responseData = await this.axiosInstanceGet(deviceUrl);
                    const deviceState = responseData.data;
                    const deviceStateData = JSON.stringify(deviceState, null, 2);
                    const debug = this.debugLog ? this.emit('debug', `${deviceTypeText}: ${deviceName}, debug deviceState: ${deviceStateData}`) : false;
                    this.deviceState = deviceState;

                    this.emit('checkDeviceInfo');
                } catch (error) {
                    this.emit('error', `Check device state error: ${error}`);
                };
            })
            .on('checkDeviceInfo', () => {
                //deviceInfo
                const melCloudInfo = this.melCloudInfo;
                const deviceInfo = this.deviceInfo;

                const deviceId = this.deviceId;
                const deviceType = deviceInfo.Type;
                const deviceName = deviceInfo.DeviceName;
                const deviceTypeText = CONSTANS.DeviceType[deviceType];
                const accessLevel = deviceInfo.AccessLevel;
                const minTemperature = deviceInfo.MinTemperature;
                const maxTemperature = deviceInfo.MaxTemperature;
                const hideVaneControls = deviceInfo.HideVaneControls;
                const hideDryModeControl = deviceInfo.HideDryModeControl;
                const hideRoomTemperature = deviceInfo.HideRoomTemperature;
                const hideSupplyTemperature = deviceInfo.HideSupplyTemperature;
                const hideOutdoorTemperature = deviceInfo.HideOutdoorTemperature;
                const macAddress = deviceInfo.MacAddress;
                const wifiSerialNumber = deviceInfo.SerialNumber;
                const pCycleActual = deviceInfo.Device.PCycleActual;
                const canCool = deviceInfo.Device.CanCool;
                const canHeat = deviceInfo.Device.CanHeat;
                const canDry = deviceInfo.Device.CanDry;
                const hasAutomaticFanSpeed = deviceInfo.Device.HasAutomaticFanSpeed;
                const airDirectionFunction = deviceInfo.Device.AirDirectionFunction;
                const swingFunction = deviceInfo.Device.SwingFunction;
                const numberOfFanSpeeds = deviceInfo.Device.NumberOfFanSpeeds;
                const useTemperatureA = deviceInfo.Device.UseTemperatureA;
                const temperatureIncrementOverride = deviceInfo.Device.TemperatureIncrementOverride;
                const temperatureIncrement = deviceInfo.Device.TemperatureIncrement;
                const minTempCoolDry = deviceInfo.Device.MinTempCoolDry;
                const maxTempCoolDry = deviceInfo.Device.MaxTempCoolDry;
                const minTempHeat = deviceInfo.Device.MinTempHeat;
                const maxTempHeat = deviceInfo.Device.MaxTempHeat;
                const minTempAutomatic = deviceInfo.Device.MinTempAutomatic;
                const maxTempAutomatic = deviceInfo.Device.MaxTempAutomatic;
                const legacyDevice = deviceInfo.Device.LegacyDevice;
                const unitSupportsStandbyMode = deviceInfo.Device.UnitSupportsStandbyMode;
                const isSplitSystem = deviceInfo.Device.IsSplitSystem;
                const modelIsAirCurtain = deviceInfo.Device.ModelIsAirCurtain;
                const modelSupportsFanSpeed = deviceInfo.Device.ModelSupportsFanSpeed;
                const modelSupportsAuto = deviceInfo.Device.ModelSupportsAuto;
                const modelSupportsHeat = deviceInfo.Device.ModelSupportsHeat;
                const modelSupportsDry = deviceInfo.Device.ModelSupportsDry;
                const modelSupportsVaneVertical = deviceInfo.Device.ModelSupportsVaneVertical;
                const modelSupportsVaneHorizontal = deviceInfo.Device.ModelSupportsVaneHorizontal;
                const modelSupportsWideVane = deviceInfo.Device.ModelSupportsWideVane;
                const modelSupportsStandbyMode = deviceInfo.Device.ModelSupportsStandbyMode;
                const modelSupportsEnergyReporting = deviceInfo.Device.ModelSupportsEnergyReporting;
                const prohibitSetTemperature = deviceInfo.Device.ProhibitSetTemperature;
                const prohibitOperationMode = deviceInfo.Device.ProhibitOperationMode;
                const prohibitPower = deviceInfo.Device.ProhibitPower;
                const firmwareRevision = deviceInfo.Device.FirmwareAppVersion;
                const hasZone2 = deviceInfo.Device.HasZone2;

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
                        const unitSerialNumber = unit.SerialNumber;
                        const unitModelNumber = unit.ModelNumber;
                        const unitModel = unit.Model;
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
                const manufacturer = 'Mitsubishi';
                const modelName = modelsIndoor.length > 0 ? modelsIndoor[0] : 'Undefined';
                const modelName1 = modelsOutdoor.length > 0 ? modelsOutdoor[0] : 'Undefined';
                const serialNumber = serialsNumberIndoor.length > 0 ? serialsNumberIndoor[0] : 'Undefined';
                const serialNumber1 = serialsNumberOutdoor.length > 0 ? serialsNumberOutdoor[0] : 'Undefined';

                this.emit('deviceInfo', melCloudInfo, deviceId, deviceType, deviceName, deviceTypeText, manufacturer, modelName, modelName1, serialNumber, serialNumber1, firmwareRevision);
                this.emit('checkDeviceState');
            })
            .on('checkDeviceState', async () => {
                // device info / state
                const melCloudInfo = this.melCloudInfo;
                const deviceInfo = this.deviceInfo;
                const deviceState = this.deviceState;
                const deviceName = deviceInfo.DeviceName;

                const deviceType = deviceState.DeviceType;
                const effectiveFlags = deviceState.EffectiveFlags;
                const localIPAddress = deviceState.LocalIPAddress;
                const roomTemperature = deviceState.RoomTemperature;
                const setTemperature = deviceState.SetTemperature;
                const setTankWaterTemperature = (deviceType == 1) ? deviceState.SetTankWaterTemperature : false;
                const setTemperatureZone1 = (deviceType == 1) ? deviceState.SetTemperatureZone1 : false;
                const forcedHotWaterMode = (deviceType == 1) ? deviceState.ForcedHotWaterMode : false;
                const setTemperatureZone2 = (deviceType == 1) ? deviceState.SetTemperatureZone2 : false;
                const setHeatFlowTemperatureZone1 = (deviceType == 1) ? deviceState.SetHeatFlowTemperatureZone1 : false;
                const setCoolFlowTemperatureZone1 = (deviceType == 1) ? deviceState.SetCoolFlowTemperatureZone1 : false;
                const setHeatFlowTemperatureZone2 = (deviceType == 1) ? deviceState.SetHeatFlowTemperatureZone2 : false;
                const setCoolFlowTemperatureZone2 = (deviceType == 1) ? deviceState.SetCoolFlowTemperatureZone2 : false;
                const operationModeZone1 = (deviceType == 1) ? deviceState.OperationModeZone1 : false;
                const operationModeZone2 = (deviceType == 1) ? deviceState.OperationModeZone2 : false;
                const ventilationMode = (deviceType == 3) ? deviceState.VentilationMode : false;
                const setFanSpeed = (deviceType == 0 || deviceType == 3) ? deviceState.SetFanSpeed : false;
                const operationMode = deviceState.OperationMode;
                const vaneHorizontal = deviceState.VaneHorizontal;
                const vaneVertical = deviceState.VaneVertical;
                const name = deviceState.Name;
                const numberOfFanSpeeds = deviceState.NumberOfFanSpeeds;
                const errorMessage = deviceState.ErrorMessage;
                const errorCode = deviceState.ErrorCode;
                const defaultHeatingSetTemperature = deviceState.DefaultHeatingSetTemperature;
                const defaultCoolingSetTemperature = deviceState.DefaultCoolingSetTemperature;
                const hideVaneControls = deviceState.HideVaneControls;
                const hideDryModeControl = deviceState.HideDryModeControl;
                const roomTemperatureLabel = deviceState.RoomTemperatureLabel;
                const inStandbyMode = deviceState.InStandbyMode;
                const temperatureIncrementOverride = deviceState.TemperatureIncrementOverride;
                const prohibitSetTemperature = deviceState.ProhibitSetTemperature;
                const prohibitOperationMode = deviceState.ProhibitOperationMode;
                const prohibitPower = deviceState.ProhibitPower;
                const demandPercentage = deviceState.DemandPercentage;
                const deviceID = deviceState.DeviceID;
                const lastCommunication = deviceState.LastCommunication;
                const nextCommunication = deviceState.NextCommunication;
                const power = deviceState.Power;
                const hasPendingCommand = deviceState.HasPendingCommand;
                const offline = deviceState.Offline;
                const scene = deviceState.Scene;
                const sceneOwner = deviceState.SceneOwner;

                this.emit('deviceState', deviceInfo, deviceState, roomTemperature, setTemperature, setFanSpeed, operationMode, vaneHorizontal, vaneVertical, defaultHeatingSetTemperature, defaultCoolingSetTemperature, inStandbyMode, power);
	        const mqtt = this.enableMqtt ? this.emit('mqtt', `Device ${deviceName} Info:`, JSON.stringify(deviceInfo, null, 2)) : false;
		const mqtt1 = this.enableMqtt ? this.emit('mqtt', `Device ${deviceName} State:`, JSON.stringify(deviceState, null, 2)) : false;         
        });

        this.emit('refreschDeviceState');
    };

    refreshDeviceState() {
        setInterval(() => {
            this.emit('refreschDeviceState');
        }, 61000);
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
                const debug = this.debugLog ? this.emit('message', `Send command response: ${JSON.stringify(newState.data, null, 2)}`) : false;
                switch (type) {
                    case 0: //deviceState
                        this.deviceState = newData;
                        break;
                    case 1: //melCloudInfo
                        this.melCloudInfo = newData;
                        break;
                };
                this.emit('checkDeviceInfo');
                resolve(true);
            } catch (error) {
                this.emit('error', `Send command error: ${error}`);
                reject(error);
            };
        });
    };
};
module.exports = MELCLOUDCLIENTDEVICE;
