"use strict";
const EventEmitter = require('events');
const MelCloudAta = require('./melcloudata.js');
const MelCloudAtw = require('./melcloudatw.js');
const MelCloudErv = require('./melclouderv.js');
const RestFul = require('./restful.js');
const Mqtt = require('./mqtt.js');
const CONSTANS = require('./constans.json');
let Accessory, Characteristic, Service, Categories, UUID;

class MelCloudDevice extends EventEmitter {
    constructor(api, account, accountName, melCloud, accountInfo, contextKey, deviceId, deviceType, deviceName, deviceTypeText, useFahrenheit, deviceInfoFile) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        UUID = api.hap.uuid;

        //account config
        this.ataDisplayMode = account.ataDisplayMode || 0;
        this.ataTemperatureSensor = account.ataTemperatureSensor || false;
        this.ataPresetsEnabled = account.ataPresets || false;
        this.ataDisableAutoMode = account.ataDisableAutoMode || false;
        this.ataDisableHeatMode = account.ataDisableHeatMode || false;
        this.ataAutoHeatMode = account.ataAutoHeatMode || 0; //DRY, FAN
        this.ataButtons = account.ataButtons || [];
        this.ataButtonsCount = this.ataButtons.length;
        this.atwDisplayMode = account.atwDisplayMode || 0;
        this.atwTemperatureSensor = account.atwTemperatureSensor || false;
        this.atwPresetsEnabled = account.atwPresets || false;
        this.atwButtons = account.atwButtons || [];
        this.atwButtonsCount = this.atwButtons.length;
        this.ervDisplayMode = account.ervDisplayMode || 0;
        this.ervTemperatureSensor = account.ervTemperatureSensor || false;
        this.ervPresetsEnabled = account.ervPresets || false;
        this.ervButtons = account.ervButtons || [];
        this.ervButtonsCount = this.ervButtons.length;
        this.disableLogInfo = account.disableLogInfo || false;
        this.disableLogDeviceInfo = account.disableLogDeviceInfo || false;
        this.enableDebugMode = account.enableDebugMode || false;

        //variables
        this.melCloud = melCloud; //function
        this.startPrepareAccessory = true;
        this.restFulConnected = false;
        this.mqttConnected = false;

        //temp unit
        this.useFahrenheit = useFahrenheit;

        //RESTFul server
        const restFulEnabled = account.enableRestFul || false;
        if (restFulEnabled) {
            const restFulPort = deviceId.slice(-4);
            this.restFul = new RestFul({
                port: restFulPort,
                debug: account.restFulDebug || false
            });

            this.restFul.on('connected', (message) => {
                this.emit('message', message);
                this.restFulConnected = true;
            })
                .on('debug', (debug) => {
                    this.emit('debug', debug);
                })
                .on('error', (error) => {
                    this.emit('error', error);
                });
        }

        //MQTT client
        const mqttEnabled = account.enableMqtt || false;
        if (mqttEnabled) {
            const mqttHost = account.mqttHost;
            const mqttPort = account.mqttPort || 1883;
            const mqttClientId = `${account.mqttClientId}_${deviceId}` || `${deviceTypeText}_${deviceName}_${deviceId}`;
            const mqttUser = account.mqttUser;
            const mqttPasswd = account.mqttPass;
            const mqttPrefix = `${account.mqttPrefix}/${deviceTypeText}/${deviceName}`;
            const mqttDebug = account.mqttDebug || false;

            this.mqtt = new Mqtt({
                host: mqttHost,
                port: mqttPort,
                clientId: mqttClientId,
                user: mqttUser,
                passwd: mqttPasswd,
                prefix: mqttPrefix,
                debug: mqttDebug
            });

            this.mqtt.on('connected', (message) => {
                this.emit('message', message);
                this.mqttConnected = true;
            })
                .on('debug', (debug) => {
                    this.emit('debug', debug);
                })
                .on('error', (error) => {
                    this.emit('error', error);
                });
        }

        //melcloud device
        switch (deviceType) {
            case 0: //air conditioner
                this.melCloudAta = new MelCloudAta({
                    contextKey: contextKey,
                    deviceInfoFile: deviceInfoFile,
                    debugLog: account.enableDebugMode
                });

                this.melCloudAta.on('deviceInfo', (manufacturer, modelIndoor, modelOutdoor, serialNumber, firmwareAppVersion) => {
                    if (!this.disableLogDeviceInfo) {
                        this.emit('devInfo', `---- ${deviceTypeText}: ${deviceName} ----`);
                        this.emit('devInfo', `Account: ${accountName}`);
                        const indoor = modelIndoor ? this.emit('devInfo', `Indoor: ${modelIndoor}`) : false;
                        const outdoor = modelOutdoor ? this.emit('devInfo', `Outdoor: ${modelOutdoor}`) : false
                        this.emit('devInfo', `Serial: ${serialNumber}`);
                        this.emit('devInfo', `Firmware: ${firmwareAppVersion}`);
                        this.emit('devInfo', `Manufacturer: ${manufacturer}`);
                        this.emit('devInfo', '----------------------------------');
                    };

                    //accessory info 					
                    this.manufacturer = manufacturer;
                    this.model = modelIndoor ? modelIndoor : modelOutdoor ? modelOutdoor : `${deviceTypeText} ${deviceId}`;
                    this.serialNumber = serialNumber;
                    this.firmwareRevision = firmwareAppVersion;
                }).on('deviceState', async (deviceData, deviceState) => {
                    //device info
                    const displayMode = this.ataDisplayMode;
                    const hasAutomaticFanSpeed = deviceData.Device.HasAutomaticFanSpeed ?? false;
                    const airDirectionFunction = deviceData.Device.AirDirectionFunction ?? false;
                    const hasOutdoorTemperature = deviceData.Device.HasOutdoorTemperature ?? false;
                    const swingFunction = deviceData.Device.SwingFunction ?? false;
                    const numberOfFanSpeeds = deviceData.Device.NumberOfFanSpeeds ?? 0;
                    const modelSupportsFanSpeed = deviceData.Device.ModelSupportsFanSpeed ?? false;
                    const modelSupportsAuto1 = deviceData.Device.ModelSupportsAuto ?? false;
                    const modelSupportsAuto = !this.ataDisableAutoMode && modelSupportsAuto1;
                    const modelSupportsHeat1 = deviceData.Device.ModelSupportsHeat ?? false;
                    const modelSupportsHeat = !this.ataDisableHeatMode && modelSupportsHeat1;
                    const modelSupportsDry = deviceData.Device.ModelSupportsDry ?? false;
                    const temperatureIncrement = deviceData.Device.TemperatureIncrement ?? 1;
                    const outdoorTemperature = deviceData.Device.OutdoorTemperature;

                    this.ataHasAutomaticFanSpeed = hasAutomaticFanSpeed;
                    this.ataAirDirectionFunction = airDirectionFunction;
                    this.ataHasOutdoorTemperature = hasOutdoorTemperature;
                    this.ataSwingFunction = swingFunction;
                    this.ataNumberOfFanSpeeds = numberOfFanSpeeds;
                    this.ataModelSupportsFanSpeed = modelSupportsFanSpeed;
                    this.ataModelSupportsAuto = modelSupportsAuto;
                    this.ataModelSupportsHeat = modelSupportsHeat;
                    this.ataModelSupportsDry = modelSupportsDry;
                    this.ataTemperatureIncrement = temperatureIncrement;

                    //device state
                    const roomTemperature = deviceState.RoomTemperature;
                    const setTemperature = deviceState.SetTemperature;
                    const setFanSpeed = deviceState.SetFanSpeed;
                    const operationMode = deviceState.OperationMode;
                    const vaneHorizontal = deviceState.VaneHorizontal;
                    const vaneVertical = deviceState.VaneVertical;
                    const hideVaneControls = deviceState.HideVaneControls;
                    const hideDryModeControl = deviceState.HideDryModeControl;
                    const inStandbyMode = deviceData.Device.InStandbyMode;
                    const prohibitSetTemperature = deviceState.ProhibitSetTemperature;
                    const prohibitOperationMode = deviceState.ProhibitOperationMode;
                    const prohibitPower = deviceState.ProhibitPower;
                    const power = deviceState.Power;
                    const offline = deviceState.Offline;

                    //presets
                    const presets = deviceData.Presets ?? [];
                    this.ataPresets = presets;
                    this.ataPresetsCount = this.ataPresetsEnabled ? presets.length : 0;

                    //operating mode
                    let autoHeatDryFanMode = 0;
                    let currentOperationMode = 0;
                    let targetOperationMode = 0;
                    let fanSpeed = 0;
                    let swingMode = 0;
                    let lockPhysicalControls = 0;

                    let operationModeSetPropsMinValue = 0;
                    let operationModeSetPropsMaxValue = 3;
                    let operationModeSetPropsValidValues = [0, 1, 2, 3];
                    let fanSpeedSetPropsMaxValue = 2;

                    switch (displayMode) {
                        case 0: //Heater Cooler
                            //operating mode 0, HEAT, DRY, COOL, 4, 5, 6, FAN, AUTO, ISEE HEAT, ISEE DRY, ISEE COOL
                            autoHeatDryFanMode = !modelSupportsAuto && !modelSupportsHeat ? [operationMode === 2 ? 0 : 1, operationMode === 6 ? 0 : 1][this.ataAutoHeatMode] : !modelSupportsAuto && modelSupportsHeat ? 0 : modelSupportsAuto && !modelSupportsHeat ? 1 : 1;
                            currentOperationMode = !power ? 0 : inStandbyMode ? 1 : [0, 2, 3, 3, 1, 1, 1, 1, (setTemperature < roomTemperature) ? 3 : 2, 2, 1, 3][operationMode]; //INACTIVE, IDLE, HEATING, COOLING
                            targetOperationMode = [0, 1, autoHeatDryFanMode, 2, 2, 2, 2, autoHeatDryFanMode, 0, 1, 1, 2][operationMode]; //AUTO, HEAT, COOL
                            operationModeSetPropsMinValue = 0;
                            operationModeSetPropsMaxValue = 2;
                            operationModeSetPropsValidValues = [0, 1, 2];

                            //fan speed mode
                            if (modelSupportsFanSpeed) {
                                switch (numberOfFanSpeeds) {
                                    case 2: //Fan speed mode 2
                                        fanSpeed = hasAutomaticFanSpeed ? [3, 1, 2][setFanSpeed] : [0, 1, 2][setFanSpeed];
                                        fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 3 : 2;
                                        break;
                                    case 3: //Fan speed mode 3
                                        fanSpeed = hasAutomaticFanSpeed ? [4, 1, 2, 3][setFanSpeed] : [0, 1, 2, 3][setFanSpeed];
                                        fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 4 : 3;
                                        break;
                                    case 4: //Fan speed mode 4
                                        fanSpeed = hasAutomaticFanSpeed ? [5, 1, 2, 3, 4][setFanSpeed] : [0, 1, 2, 3, 4][setFanSpeed];
                                        fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 5 : 4;
                                        break;
                                    case 5: //Fan speed mode 5
                                        fanSpeed = hasAutomaticFanSpeed ? [6, 1, 2, 3, 4, 5][setFanSpeed] : [0, 1, 2, 3, 4, 5][setFanSpeed];
                                        fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 6 : 5;
                                        break;
                                    case 6: //Fan speed mode 6
                                        fanSpeed = hasAutomaticFanSpeed ? [7, 1, 2, 3, 4, 5, 6][setFanSpeed] : [0, 1, 2, 3, 4, 5, 6][setFanSpeed];
                                        fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 7 : 6;
                                        break;
                                };
                            };

                            //swing and vane mode
                            swingMode = swingFunction && vaneHorizontal === 12 && vaneVertical === 7 ? 1 : 0;

                            //lock physical controls
                            lockPhysicalControls = prohibitSetTemperature && prohibitOperationMode && prohibitPower ? 1 : 0;

                            //update characteristics
                            if (this.ataMelCloudServices) {
                                this.ataMelCloudServices[0]
                                    .updateCharacteristic(Characteristic.Active, power)
                                    .updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentOperationMode)
                                    .updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetOperationMode)
                                    .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                                    .updateCharacteristic(Characteristic.HeatingThresholdTemperature, setTemperature)
                                    .updateCharacteristic(Characteristic.CoolingThresholdTemperature, setTemperature)
                                    .updateCharacteristic(Characteristic.LockPhysicalControls, lockPhysicalControls)
                                    .updateCharacteristic(Characteristic.TemperatureDisplayUnits, this.useFahrenheit);
                                const updateRotationSpeed = modelSupportsFanSpeed ? this.ataMelCloudServices[0].updateCharacteristic(Characteristic.RotationSpeed, fanSpeed) : false;
                                const updateSwingMode = swingFunction ? this.ataMelCloudServices[0].updateCharacteristic(Characteristic.SwingMode, swingMode) : false;
                            };
                            break;
                        case 1: //Thermostat
                            //operating mode 0, HEAT, DRY, COOL, 4, 5, 6, FAN, AUTO, ISEE HEAT, ISEE DRY, ISEE COOL
                            autoHeatDryFanMode = !modelSupportsAuto && !modelSupportsHeat ? [operationMode === 2 ? 3 : 1, operationMode === 6 ? 3 : 1][this.ataAutoHeatMode] : !modelSupportsAuto && modelSupportsHeat ? 3 : modelSupportsAuto && !modelSupportsHeat ? 1 : 1;
                            currentOperationMode = !power || inStandbyMode ? 0 : [0, 1, 2, 2, 2, 2, 2, 2, (setTemperature < roomTemperature) ? 2 : 1, 1, 1, 2][operationMode]; //OFF, HEAT, COOL
                            targetOperationMode = !power || inStandbyMode ? 0 : [0, 1, autoHeatDryFanMode, 2, 2, 2, 2, autoHeatDryFanMode, 3, 1, 1, 2][operationMode]; //OFF, HEAT, COOL, AUTO
                            operationModeSetPropsMinValue = 0;
                            operationModeSetPropsMaxValue = 3;
                            operationModeSetPropsValidValues = [0, 1, 2, 3];

                            //update characteristics
                            if (this.ataMelCloudServices) {
                                this.ataMelCloudServices[0]
                                    .updateCharacteristic(Characteristic.CurrentHeatingCoolingState, currentOperationMode)
                                    .updateCharacteristic(Characteristic.TargetHeatingCoolingState, targetOperationMode)
                                    .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                                    .updateCharacteristic(Characteristic.TargetTemperature, setTemperature)
                                    .updateCharacteristic(Characteristic.TemperatureDisplayUnits, this.useFahrenheit);
                            };
                            break;
                    };

                    if (this.ataRoomTemperatureSensorService) {
                        this.ataRoomTemperatureSensorService
                            .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                    };

                    if (this.ataOutdoorTemperatureSensorService) {
                        this.ataOutdoorTemperatureSensorService
                            .updateCharacteristic(Characteristic.CurrentTemperature, outdoorTemperature)
                    };

                    this.power = power;
                    this.offline = offline;
                    this.currentOperationMode = currentOperationMode;
                    this.targetOperationMode = targetOperationMode;
                    this.roomTemperature = roomTemperature;
                    this.setTemperature = setTemperature;
                    this.fanSpeed = fanSpeed;
                    this.setFanSpeed = setFanSpeed;
                    this.swingMode = swingMode;
                    this.vaneHorizontal = vaneHorizontal;
                    this.vaneVertical = vaneVertical;
                    this.lockPhysicalControls = lockPhysicalControls;
                    this.outdoorTemperature = outdoorTemperature;

                    //update buttons state
                    if (this.ataButtonsCount > 0) {
                        this.ataButtonsConfigured = [];

                        for (const button of this.ataButtons) {
                            const buttonDisplayType = button.displayType ?? 0;

                            if (buttonDisplayType > 0) {
                                const buttonMode = button.mode ?? 100;
                                switch (buttonMode) {
                                    case 0: //POWER ON,OFF
                                        button.buttonState = (power === true);
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 1: //OPERATING MODE HEAT
                                        button.buttonState = power ? (operationMode === 1) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 2: //OPERATING MODE DRY
                                        button.buttonState = power ? (operationMode === 2) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break
                                    case 3: //OPERATING MODE COOL
                                        button.buttonState = power ? (operationMode === 3) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 4: //OPERATING MODE FAN
                                        button.buttonState = power ? (operationMode === 7) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 5: //OPERATING MODE AUTO
                                        button.buttonState = power ? (operationMode === 8) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 6: //OPERATING MODE PURIFY
                                        button.buttonState = power ? (operationMode === 9) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 7: //OPERATING MODE DRY CONTROL HIDE
                                        button.buttonState = power ? (hideDryModeControl === true) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 10: //VANE H SWING MODE AUTO
                                        button.buttonState = power ? (vaneHorizontal === 0) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 11: //VANE H SWING MODE 1
                                        button.buttonState = power ? (vaneHorizontal === 1) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 12: //VANE H SWING MODE 2
                                        button.buttonState = power ? (vaneHorizontal === 2) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 13: //VANE H SWING MODE 3
                                        button.buttonState = power ? (vaneHorizontal === 3) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 14: //VANE H SWING MODE 4
                                        button.buttonState = power ? (vaneHorizontal === 4) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 15: //VANE H SWING MODE 5
                                        button.buttonState = power ? (vaneHorizontal === 5) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 16: //VANE H SWING MODE SPLIT
                                        button.buttonState = power ? (vaneHorizontal === 8) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 17: //VANE H SWING MODE SWING
                                        button.buttonState = power ? (vaneHorizontal === 12) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 20: //VANE V SWING MODE AUTO
                                        button.buttonState = power ? (vaneVertical === 0) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 21: //VANE V SWING MODE 1
                                        button.buttonState = power ? (vaneVertical === 1) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 22: //VANE V SWING MODE 2
                                        button.buttonState = power ? (vaneVertical === 2) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 23: //VANE V SWING MODE 3
                                        button.buttonState = power ? (vaneVertical === 3) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 24: //VANE V SWING MODE 4
                                        button.buttonState = power ? (vaneVertical === 4) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 25: //VANE V SWING MODE 5
                                        button.buttonState = power ? (vaneVertical === 5) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 26: //VANE V SWING MODE SWING
                                        button.buttonState = power ? (vaneVertical === 7) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 27: //VANE H/V CONTROLS HIDE
                                        button.buttonState = power ? (hideVaneControls === true) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 30: //FAN SPEED MODE AUTO
                                        button.buttonState = power ? (setFanSpeed === 0) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 31: //FAN SPEED MODE 1
                                        button.buttonState = power ? (setFanSpeed === 1) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 32: //FAN SPEED MODE 2
                                        button.buttonState = power ? (setFanSpeed === 2) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 33: //FAN SPEED MODE 3
                                        button.buttonState = power ? (setFanSpeed === 3) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 34: //FAN SPEED MODE 4
                                        button.buttonState = power ? (setFanSpeed === 4) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 35: //FAN SPEED  MODE 5
                                        button.buttonState = power ? (setFanSpeed === 5) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 36: //FAN SPEED  MODE 6
                                        button.buttonState = power ? (setFanSpeed === 6) : false;
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 37: //PHYSICAL LOCK CONTROLS ALL
                                        button.buttonState = (lockPhysicalControls === 1);
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 38: //PHYSICAL LOCK CONTROLS POWER
                                        button.buttonState = (prohibitPower === true);
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 39: //PHYSICAL LOCK CONTROLS MODE
                                        button.buttonState = (prohibitOperationMode === true);
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    case 40: //PHYSICAL LOCK CONTROLS TEMP
                                        button.buttonState = (prohibitSetTemperature === true);
                                        this.ataButtonsConfigured.push(button);
                                        break;
                                    default: //Unknown button
                                        this.emit('message', `Unknown button mode: ${buttonMode} detected.`);
                                        break;
                                };
                            };
                        };

                        this.ataButtonsConfiguredCount = this.ataButtonsConfigured.length;
                        for (let i = 0; i < this.ataButtonsConfiguredCount; i++) {
                            const button = this.ataButtonsConfigured[i];
                            const buttonState = button.buttonState;
                            const buttonDisplayType = button.displayType;
                            const characteristicType = ['', Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][buttonDisplayType];
                            if (this.ataButtonsServices) {
                                this.ataButtonsServices[i]
                                    .updateCharacteristic(characteristicType, buttonState)
                            };
                        };

                    };

                    //update presets state
                    if (this.ataPresetsCount > 0) {
                        this.ataPresetsStates = [];

                        for (let i = 0; i < this.ataPresetsCount; i++) {
                            const preset = presets[i];
                            const presetState =
                                preset.SetTemperature === setTemperature
                                && preset.Power === power
                                && preset.OperationMode === operationMode
                                && preset.VaneHorizontal === vaneHorizontal
                                && preset.VaneVertical === vaneVertical
                                && preset.FanSpeed === setFanSpeed;
                            this.ataPresetsStates.push(presetState);

                            if (this.ataPresetsServices) {
                                this.ataPresetsServices[i]
                                    .updateCharacteristic(Characteristic.On, presetState)
                            };
                        };
                    };

                    //start prepare accessory
                    if (this.startPrepareAccessory) {
                        try {
                            this.operationModeSetPropsMinValue = operationModeSetPropsMinValue;
                            this.operationModeSetPropsMaxValue = operationModeSetPropsMaxValue;
                            this.operationModeSetPropsValidValues = operationModeSetPropsValidValues;
                            this.fanSpeedSetPropsMaxValue = fanSpeedSetPropsMaxValue;

                            const accessory = await this.prepareAccessory(accountInfo, deviceState, deviceId, deviceType, deviceTypeText, deviceName);
                            this.emit('publishAccessory', accessory);
                            this.startPrepareAccessory = false;
                        } catch (error) {
                            this.emit('error', `Prepare accessory error: ${error}`);
                        };
                    };
                })
                    .on('message', (message) => {
                        this.emit('message', message);
                    })
                    .on('debug', (debug) => {
                        this.emit('debug', debug);
                    })
                    .on('error', (error) => {
                        this.emit('error', error);
                    })
                    .on('restFul', (path, data) => {
                        const restFul = this.restFulConnected ? this.restFul.update(path, data) : false;
                    })
                    .on('mqtt', (topic, message) => {
                        const mqtt = this.mqttConnected ? this.mqtt.send(topic, message) : false;
                    });
                break;
            case 1: //heat pump
                this.melCloudAtw = new MelCloudAtw({
                    contextKey: contextKey,
                    deviceInfoFile: deviceInfoFile,
                    debugLog: account.enableDebugMode
                });

                this.melCloudAtw.on('deviceInfo', (manufacturer, modelIndoor, modelOutdoor, serialNumber, firmwareAppVersion, hasHotWaterTank, hasZone2) => {
                    if (!this.disableLogDeviceInfo) {
                        this.emit('devInfo', `---- ${deviceTypeText}: ${deviceName} ----`);
                        this.emit('devInfo', `Account: ${accountName}`);
                        const indoor = modelIndoor ? this.emit('devInfo', `Indoor: ${modelIndoor}`) : false;
                        const outdoor = modelOutdoor ? this.emit('devInfo', `Outdoor: ${modelOutdoor}`) : false
                        this.emit('devInfo', `Serial: ${serialNumber}`)
                        this.emit('devInfo', `Firmware: ${firmwareAppVersion}`);
                        this.emit('devInfo', `Manufacturer: ${manufacturer}`);
                        this.emit('devInfo', '----------------------------------');
                        this.emit('devInfo', `Hot Water Tank: ${hasHotWaterTank ? 'Yes' : 'No'}`);
                        this.emit('devInfo', `Zone 2: ${hasZone2 ? 'Yes' : 'No'}`);
                        this.emit('devInfo', '----------------------------------');
                    };

                    //accessory info 					
                    this.manufacturer = manufacturer;
                    this.model = modelIndoor ? modelIndoor : modelOutdoor ? modelOutdoor : `${deviceTypeText} ${deviceId}`;
                    this.serialNumber = serialNumber;
                    this.firmwareRevision = firmwareAppVersion;
                }).on('deviceState', async (deviceData, deviceState) => {
                    //device info
                    const displayMode = this.atwDisplayMode;
                    const heatPumpZoneName = 'Heat Pump';
                    const hotWaterZoneName = 'Hot Water';
                    const heatPumpZone1Name = deviceData.Zone1Name ?? 'Zone 1';
                    const heatPumpZone2Name = deviceData.Zone2Name ?? 'Zone 2';
                    const hasHotWaterTank = deviceData.Device.HasHotWaterTank ?? false;
                    const hasZone2 = deviceData.Device.HasZone2 ?? false;
                    const canHeat = deviceData.Device.CanHeat ?? false;
                    const canCool = deviceData.Device.CanCool ?? false;
                    const heatCoolModes = canHeat && canCool ? 0 : canHeat ? 1 : canCool ? 2 : 3;
                    const temperatureIncrement = deviceData.Device.TemperatureIncrement ?? 1;

                    //zones
                    const hotWater = hasHotWaterTank ? 1 : 0;
                    const zone2 = hasZone2 ? 1 : 0;
                    const zonesCount = 2 + hotWater + zone2;
                    const caseHotWater = hasHotWaterTank ? 2 : -1;
                    const caseZone2 = hasZone2 ? hasHotWaterTank ? 3 : 2 : -1;

                    this.atwZonesCount = zonesCount;
                    this.atwHeatPumpName = heatPumpZoneName;
                    this.atwHotWaterName = hotWaterZoneName;
                    this.atwZone1Name = heatPumpZone1Name
                    this.atwZone2Name = heatPumpZone2Name;
                    this.atwHeatCoolModes = heatCoolModes;
                    this.atwCaseHotWater = caseHotWater;
                    this.atwCaseZone2 = caseZone2;
                    this.atwTemperatureIncrement = temperatureIncrement;

                    //device state
                    const setTemperatureZone1 = deviceState.SetTemperatureZone1;
                    const setTemperatureZone2 = deviceState.SetTemperatureZone2;
                    const roomTemperatureZone1 = deviceState.RoomTemperatureZone1;
                    const roomTemperatureZone2 = deviceState.RoomTemperatureZone2;
                    const operationMode = deviceState.OperationMode;
                    const operationModeZone1 = deviceState.OperationModeZone1;
                    const operationModeZone2 = deviceState.OperationModeZone2;
                    const setHeatFlowTemperatureZone1 = deviceState.SetHeatFlowTemperatureZone1;
                    const setHeatFlowTemperatureZone2 = deviceState.SetHeatFlowTemperatureZone2;
                    const setCoolFlowTemperatureZone1 = deviceState.SetCoolFlowTemperatureZone1;
                    const setCoolFlowTemperatureZone2 = deviceState.SetCoolFlowTemperatureZone2;
                    const tankWaterTemperature = deviceState.TankWaterTemperature;
                    const setTankWaterTemperature = deviceState.SetTankWaterTemperature;
                    const forcedHotWaterMode = deviceState.ForcedHotWaterMode;
                    const unitStatus = deviceState.UnitStatus;
                    const outdoorTemperature = deviceState.OutdoorTemperature;
                    const ecoHotWater = deviceState.EcoHotWater;
                    const holidayMode = deviceState.HolidayMode;
                    const prohibitZone1 = deviceState.ProhibitZone1;
                    const prohibitZone2 = deviceState.ProhibitZone2;
                    const prohibitHotWater = deviceState.ProhibitHotWater;
                    const idleZone1 = deviceState.IdleZone1;
                    const idleZone2 = deviceState.IdleZone2;
                    const power = deviceState.Power;
                    const offline = deviceState.Offline;

                    //presets
                    const presets = deviceData.Presets ?? [];
                    this.atwPresets = presets;
                    this.atwPresetsCount = this.atwPresetsEnabled ? presets.length : 0;

                    //zones array
                    this.currentOperationModes = [];
                    this.targetOperationModes = [];
                    this.roomTemperatures = [];
                    this.setTemperatures = [];
                    this.lockPhysicalsControls = [];

                    this.operationModesSetPropsMinValue = [];
                    this.operationModesSetPropsMaxValue = [];
                    this.operationModesSetPropsValidValues = [];
                    this.temperaturesSetPropsMinValue = [];
                    this.temperaturesSetPropsMaxValue = [];

                    //default values
                    let currentOperationMode = 0;
                    let targetOperationMode = 0;
                    let roomTemperature = 20;
                    let setTemperature = 20;
                    let lockPhysicalControls = 0;

                    let operationModeSetPropsMinValue = 0;
                    let operationModeSetPropsMaxValue = 3;
                    let operationModeSetPropsValidValues = [];
                    let temperatureSetPropsMinValue = -35;
                    let temperatureSetPropsMaxValue = 140;

                    for (let i = 0; i < zonesCount; i++) {
                        switch (displayMode) {
                            case 0: //Heater Cooler
                                switch (i) {
                                    case 0: //Heat Pump Operation Mode - IDLE, HOT WATER, HEATING ZONES, COOLING, HOT WATER STORAGE, FREZE STAT, LEGIONELLA, HEATING ECO, MODE 1, MODE 2, MODE 3, HEATING UP /// Unit Status - HEAT, COOL
                                        currentOperationMode = !power ? 0 : [1, 2, 2, 3, 2, 1, 1, 2, 1, 1, 1, 2][operationMode]; //INACTIVE, IDLE, HEATING, COOLING 
                                        targetOperationMode = [1, 2][unitStatus]; //AUTO, HEAT, COOL
                                        roomTemperature = outdoorTemperature;
                                        setTemperature = outdoorTemperature;
                                        lockPhysicalControls = hasHotWaterTank && hasZone2 ? (prohibitZone1 && prohibitHotWater && prohibitZone2 ? 1 : 0) : hasHotWaterTank ? (prohibitZone1 && prohibitHotWater ? 1 : 0) : hasZone2 ? (prohibitZone1 && prohibitZone2 ? 1 : 0) : 0;

                                        operationModeSetPropsMinValue = [1, 1, 2][heatCoolModes];
                                        operationModeSetPropsMaxValue = [2, 1, 2][heatCoolModes];
                                        operationModeSetPropsValidValues = [[1, 2], [1], [2]][heatCoolModes];
                                        temperatureSetPropsMinValue = [-35, -31][this.useFahrenheit];
                                        temperatureSetPropsMaxValue = [50, 122][this.useFahrenheit];
                                        break;
                                    case 1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
                                        currentOperationMode = !power ? 0 : idleZone1 ? 1 : [2, 2, 2, 3, 3, 2][operationModeZone1]; //INACTIVE, IDLE, HEATING, COOLING
                                        targetOperationMode = [1, 2, 0, 1, 2, 1][operationModeZone1]; //AUTO, HEAT, COOL
                                        roomTemperature = roomTemperatureZone1;
                                        setTemperature = setTemperatureZone1;
                                        lockPhysicalControls = prohibitZone1 ? 1 : 0;

                                        operationModeSetPropsMinValue = [0, 0, 1][heatCoolModes];
                                        operationModeSetPropsMaxValue = [2, 2, 2][heatCoolModes];
                                        operationModeSetPropsValidValues = [[0, 1, 2], [0, 1, 2], [1, 2]][heatCoolModes];
                                        temperatureSetPropsMinValue = [10, 50][this.useFahrenheit];
                                        temperatureSetPropsMaxValue = [35, 95][this.useFahrenheit];
                                        break;
                                    case caseHotWater: //Hot Water - NORMAL, HEAT NOW
                                        currentOperationMode = !power ? 0 : operationMode === 1 ? 2 : [1, 2][forcedHotWaterMode]; //INACTIVE, IDLE, HEATING, COOLING
                                        targetOperationMode = [0, 1][forcedHotWaterMode] //AUTO, HEAT, COOL
                                        roomTemperature = tankWaterTemperature;
                                        setTemperature = setTankWaterTemperature;
                                        lockPhysicalControls = prohibitHotWater ? 1 : 0;

                                        operationModeSetPropsMinValue = 0;
                                        operationModeSetPropsMaxValue = 1;
                                        operationModeSetPropsValidValues = [0, 1];
                                        temperatureSetPropsMinValue = [30, 86][this.useFahrenheit];
                                        temperatureSetPropsMaxValue = [60, 140][this.useFahrenheit];
                                        break;
                                    case caseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
                                        currentOperationMode = !power ? 0 : idleZone2 ? 1 : [2, 2, 2, 3, 3, 2][operationModeZone2]; //INACTIVE, IDLE, HEATING, COOLING
                                        targetOperationMode = [1, 2, 0, 1, 2, 1][operationModeZone2]; //AUTO, HEAT, COOL
                                        roomTemperature = roomTemperatureZone2;
                                        setTemperature = setTemperatureZone2;
                                        lockPhysicalControls = prohibitZone2 ? 1 : 0;

                                        operationModeSetPropsMinValue = [0, 0, 1][heatCoolModes];
                                        operationModeSetPropsMaxValue = [2, 2, 2][heatCoolModes];
                                        operationModeSetPropsValidValues = [[0, 1, 2], [0, 1, 2], [1, 2]][heatCoolModes];
                                        temperatureSetPropsMinValue = [10, 50][this.useFahrenheit];
                                        temperatureSetPropsMaxValue = [35, 95][this.useFahrenheit];
                                        break;
                                };

                                //update characteristics
                                if (this.atwMelCloudServices && currentOperationMode !== undefined && targetOperationMode !== undefined) {
                                    this.atwMelCloudServices[i]
                                        .updateCharacteristic(Characteristic.Active, power)
                                        .updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentOperationMode)
                                        .updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetOperationMode)
                                        .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                                        .updateCharacteristic(Characteristic.LockPhysicalControls, lockPhysicalControls)
                                        .updateCharacteristic(Characteristic.TemperatureDisplayUnits, this.useFahrenheit)
                                    if (this.atwHeatCoolModes === 0 || this.atwHeatCoolModes === 1) {
                                        this.atwMelCloudServices[i].updateCharacteristic(Characteristic.HeatingThresholdTemperature, setTemperature)
                                    }
                                    if ((this.atwHeatCoolModes === 0 || this.atwHeatCoolModes === 2) && i !== this.atwCaseHotWate) {
                                        this.atwMelCloudServices[i].updateCharacteristic(Characteristic.CoolingThresholdTemperature, setTemperature)
                                    }
                                }
                                break;
                            case 1: //Thermostat
                                switch (i) {
                                    case 0: //Heat Pump Operation Mode - IDLE, HOT WATER, HEATING ZONES, COOLING, HOT WATER STORAGE, FREZE STAT, LEGIONELLA, HEATING ECO, MODE 1, MODE 2, MODE 3, HEATING UP /// Unit Status - HEAT, COOL
                                        currentOperationMode = !power ? 0 : [0, 1, 1, 2, 1, 0, 0, 1, 0, 0, 0, 1][operationMode]; //OFF, HEAT, COOL
                                        targetOperationMode = !power ? 0 : [1, 2][unitStatus]; //OFF, HEAT, COOL, AUTO
                                        roomTemperature = outdoorTemperature;
                                        setTemperature = outdoorTemperature;

                                        operationModeSetPropsMinValue = [0, 0, 0][heatCoolModes];
                                        operationModeSetPropsMaxValue = [2, 1, 2][heatCoolModes];
                                        operationModeSetPropsValidValues = [[0, 1, 2], [0, 1], [0, 2]][heatCoolModes];
                                        temperatureSetPropsMinValue = [-35, -31][this.useFahrenheit];
                                        temperatureSetPropsMaxValue = [50, 122][this.useFahrenheit];
                                        break;
                                    case 1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
                                        currentOperationMode = !power ? 0 : idleZone1 ? 0 : [1, 1, 1, 2, 2, 1][operationModeZone1]; //OFF, HEAT, COOL
                                        targetOperationMode = [1, 2, 3, 1, 2, 1][operationModeZone1]; //OFF, HEAT, COOL, AUTO
                                        roomTemperature = roomTemperatureZone1;
                                        setTemperature = setTemperatureZone1;

                                        operationModeSetPropsMinValue = [1, 1, 1][heatCoolModes];
                                        operationModeSetPropsMaxValue = [3, 3, 2][heatCoolModes];
                                        operationModeSetPropsValidValues = [[1, 2, 3], [1, 2, 3], [1, 2]][heatCoolModes];
                                        temperatureSetPropsMinValue = [10, 50][this.useFahrenheit];
                                        temperatureSetPropsMaxValue = [35, 95][this.useFahrenheit];
                                        break;
                                    case caseHotWater: //Hot Water - NORMAL, HEAT NOW
                                        currentOperationMode = !power ? 0 : operationMode === 1 ? 1 : [0, 1][forcedHotWaterMode]; //OFF, HEAT, COOL
                                        targetOperationMode = [3, 1][forcedHotWaterMode] //OFF, HEAT, COOL, AUTO
                                        roomTemperature = tankWaterTemperature;
                                        setTemperature = setTankWaterTemperature;

                                        operationModeSetPropsMinValue = 1;
                                        operationModeSetPropsMaxValue = 3;
                                        operationModeSetPropsValidValues = [1, 3];
                                        temperatureSetPropsMinValue = [30, 86][this.useFahrenheit];
                                        temperatureSetPropsMaxValue = [60, 140][this.useFahrenheit];
                                        break;
                                    case caseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
                                        currentOperationMode = !power ? 0 : idleZone2 ? 0 : [1, 1, 1, 2, 2, 1][operationModeZone2]; //OFF, HEAT, COOL
                                        targetOperationMode = [1, 2, 3, 1, 2, 1][operationModeZone2]; //OFF, HEAT, COOL, AUTO
                                        roomTemperature = roomTemperatureZone2;
                                        setTemperature = setTemperatureZone2;

                                        operationModeSetPropsMinValue = [1, 1, 1][heatCoolModes];
                                        operationModeSetPropsMaxValue = [3, 3, 2][heatCoolModes];
                                        operationModeSetPropsValidValues = [[1, 2, 3], [1, 2, 3], [1, 2]][heatCoolModes];
                                        temperatureSetPropsMinValue = [10, 10][this.useFahrenheit];
                                        temperatureSetPropsMaxValue = [35, 95][this.useFahrenheit];
                                        break;
                                };

                                //update characteristics
                                if (this.atwMelCloudServices && currentOperationMode !== undefined && targetOperationMode !== undefined) {
                                    this.atwMelCloudServices[i]
                                        .updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentOperationMode)
                                        .updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetOperationMode)
                                        .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                                        .updateCharacteristic(Characteristic.TargetTemperature, setTemperature)
                                        .updateCharacteristic(Characteristic.TemperatureDisplayUnits, this.useFahrenheit)
                                }
                                break;
                        };

                        if (this.atwTemperatureSensorServices) {
                            this.atwTemperatureSensorServices[i]
                                .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                        };

                        //push value to arrays
                        this.currentOperationModes.push(currentOperationMode);
                        this.targetOperationModes.push(targetOperationMode);
                        this.roomTemperatures.push(roomTemperature);
                        this.setTemperatures.push(setTemperature);
                        this.lockPhysicalsControls.push(lockPhysicalControls);

                        if (this.startPrepareAccessory) {
                            this.operationModesSetPropsMinValue.push(operationModeSetPropsMinValue);
                            this.operationModesSetPropsMaxValue.push(operationModeSetPropsMaxValue);
                            this.operationModesSetPropsValidValues.push(operationModeSetPropsValidValues);
                            this.temperaturesSetPropsMinValue.push(temperatureSetPropsMinValue);
                            this.temperaturesSetPropsMaxValue.push(temperatureSetPropsMaxValue);
                        };
                    };

                    this.unitStatus = unitStatus;
                    this.idleZone1 = idleZone1;
                    this.idleZone2 = idleZone2;
                    this.power = power;
                    this.offline = offline;

                    //update buttons state
                    if (this.atwButtonsCount > 0) {
                        this.atwButtonsConfigured = [];

                        for (const button of this.atwButtons) {
                            const buttonDisplayType = button.displayType ?? 0;

                            if (buttonDisplayType > 0) {
                                const buttonMode = button.mode ?? 100;
                                switch (buttonMode) {
                                    case 0: //POWER ON,OFF
                                        button.buttonState = (power === true);
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    case 1: //HEAT PUMP HEAT
                                        button.buttonState = power ? (operationMode === 0) : false;
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    case 2: //COOL
                                        button.buttonState = power ? (operationMode === 1) : false;
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    case 53: //HOLIDAY
                                        button.buttonState = power ? (holidayMode === true) : false;
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    case 10: //ALL ZONES PHYSICAL LOCK CONTROL
                                        button.buttonState = power ? (prohibitZone1 === true && prohibitHotWater === true && prohibitZone2 === true) : false;
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    case 20: //HOT WATER AUTO
                                        button.buttonState = power ? (forcedHotWaterMode === false) : false;
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    case 21: //ECO
                                        button.buttonState = power ? (ecoHotWater === true) : false;
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    case 22: //FORCE HEAT
                                        button.buttonState = power ? (forcedHotWaterMode === true) : false;
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    case 30: //PHYSICAL LOCK CONTROL
                                        button.buttonState = (prohibitHotWater === true);
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    case 40: //ZONE 1 HEAT THERMOSTAT
                                        button.buttonState = power ? (operationModeZone1 === 0) : false;
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    case 41: //HEAT FLOW
                                        button.buttonState = power ? (operationModeZone1 === 1) : false;
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    case 42: //HEAT CURVE
                                        button.buttonState = power ? (operationModeZone1 === 2) : false;
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    case 43: //COOL THERMOSTAT
                                        button.buttonState = power ? (operationModeZone1 === 3) : false;
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    case 44: //COOL FLOW
                                        button.buttonState = power ? (operationModeZone1 === 4) : false;
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    case 45: //FLOOR DRYUP
                                        button.buttonState = power ? (operationModeZone1 === 5) : false;
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    case 50: //PHYSICAL LOCK CONTROL
                                        button.buttonState = (prohibitZone1 === true);
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    case 60: //ZONE 2 HEAT THERMOSTAT
                                        button.buttonState = power ? (operationModeZone2 === 0) : false;
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    case 61: //HEAT FLOW
                                        button.buttonState = power ? (operationModeZone2 === 1) : false;
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    case 62: //HEAT CURVE
                                        button.buttonState = power ? (operationModeZone2 === 2) : false;
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    case 63: //COOL THERMOSTAT
                                        button.buttonState = power ? (operationModeZone2 === 3) : false;
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    case 64: //COOL FLOW
                                        button.buttonState = power ? (operationModeZone2 === 4) : false;
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    case 65: //FLOOR DRYUP
                                        button.buttonState = power ? (operationModeZone2 === 5) : false;
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    case 70: //PHYSICAL LOCK CONTROL
                                        button.buttonState = (prohibitZone2 === true);
                                        this.atwButtonsConfigured.push(button);
                                        break;
                                    default: //Unknown button
                                        this.emit('message', `Unknown button mode: ${buttonMode} detected.`);
                                        break;
                                };
                            };
                        };

                        this.atwButtonsConfiguredCount = this.atwButtonsConfigured.length;
                        for (let i = 0; i < this.atwButtonsConfiguredCount; i++) {
                            const button = this.atwButtonsConfigured[i];
                            const buttonState = button.buttonState;
                            const buttonDisplayType = button.displayType;
                            const characteristicType = ['', Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][buttonDisplayType];
                            if (this.atwButtonsServices) {
                                this.atwButtonsServices[i]
                                    .updateCharacteristic(characteristicType, buttonState)
                            };
                        };
                    };

                    //update presets state
                    if (this.atwPresetsCount > 0) {
                        this.atwPresetsStates = [];

                        for (let i = 0; i < this.atwPresetsCount; i++) {
                            const preset = presets[i];
                            const presetState =
                                preset.Power === power
                                && preset.EcoHotWater === ecoHotWater
                                && preset.OperationModeZone1 === operationModeZone1
                                && preset.OperationModeZone2 === operationModeZone2
                                && preset.SetTankWaterTemperature === setTankWaterTemperature
                                && preset.SetTemperatureZone1 === setTemperatureZone1
                                && preset.SetTemperatureZone2 === setTemperatureZone2
                                && preset.ForcedHotWaterMode === forcedHotWaterMode
                                && preset.SetHeatFlowTemperatureZone1 === setHeatFlowTemperatureZone1
                                && preset.SetHeatFlowTemperatureZone2 === setHeatFlowTemperatureZone2
                                && preset.SetCoolFlowTemperatureZone1 === setCoolFlowTemperatureZone1
                                && preset.SetCoolFlowTemperatureZone2 === setCoolFlowTemperatureZone2;
                            this.atwPresetsStates.push(presetState);

                            if (this.atwPresetsServices) {
                                this.atwPresetsServices[i]
                                    .updateCharacteristic(Characteristic.On, presetState)
                            };
                        };
                    };

                    //start prepare accessory
                    if (this.startPrepareAccessory) {
                        try {
                            const accessory = await this.prepareAccessory(accountInfo, deviceState, deviceId, deviceType, deviceTypeText, deviceName);
                            this.emit('publishAccessory', accessory);
                            this.startPrepareAccessory = false;
                        } catch (error) {
                            this.emit('error', `Prepare accessory error: ${error}`);
                        };
                    };
                })
                    .on('message', (message) => {
                        this.emit('message', message);
                    })
                    .on('debug', (debug) => {
                        this.emit('debug', debug);
                    })
                    .on('error', (error) => {
                        this.emit('error', error);
                    })
                    .on('restFul', (path, data) => {
                        const restFul = this.restFulConnected ? this.restFul.update(path, data) : false;
                    })
                    .on('mqtt', (topic, message) => {
                        const mqtt = this.mqttConnected ? this.mqtt.send(topic, message) : false;
                    });
                break;
            case 3: //energy recovery ventilation
                this.melCloudErv = new MelCloudErv({
                    contextKey: contextKey,
                    deviceInfoFile: deviceInfoFile,
                    debugLog: account.enableDebugMode
                });

                this.melCloudErv.on('deviceInfo', (manufacturer, modelIndoor, modelOutdoor, serialNumber, firmwareAppVersion) => {
                    if (!this.disableLogDeviceInfo) {
                        this.emit('devInfo', `---- ${deviceTypeText}: ${deviceName} ----`);
                        this.emit('devInfo', `Account: ${accountName}`);
                        const indoor = modelIndoor ? this.emit('devInfo', `Indoor: ${modelIndoor}`) : false;
                        const outdoor = modelOutdoor ? this.emit('devInfo', `Outdoor: ${modelOutdoor}`) : false;
                        this.emit('devInfo', `Serial: ${serialNumber}`);
                        this.emit('devInfo', `Firmware: ${firmwareAppVersion}`);
                        this.emit('devInfo', `Manufacturer: ${manufacturer}`);
                        this.emit('devInfo', '----------------------------------');
                    };

                    //accessory info 					
                    this.manufacturer = manufacturer;
                    this.model = modelIndoor ? modelIndoor : modelOutdoor ? modelOutdoor : `${deviceTypeText} ${deviceId}`;
                    this.serialNumber = serialNumber;
                    this.firmwareRevision = firmwareAppVersion;

                    //device info

                }).on('deviceState', async (deviceData, deviceState) => {
                    //device info
                    const displayMode = this.ervDisplayMode;
                    const hasCoolOperationMode = deviceData.Device.HasCoolOperationMode ?? false;
                    const hasHeatOperationMode = deviceData.Device.HasHeatOperationMode ?? false;
                    const hasAutoOperationMode = deviceData.Device.HasAutoOperationMode ?? false;
                    const hasRoomTemperature = deviceData.Device.HasRoomTemperature ?? false;
                    const hasSupplyTemperature = deviceData.Device.HasSupplyTemperature ?? false;
                    const hasOutdoorTemperature = deviceData.Device.HasOutdoorTemperature ?? false;
                    const hasCO2Sensor = deviceData.Device.HasCO2Sensor ?? false;
                    const roomCO2Level = deviceData.Device.RoomCO2Level ?? false;
                    const roomCO2Detected = hasCO2Sensor && roomCO2Level > 1000 ? true : false;
                    const hasPM25Sensor = deviceData.Device.HasPM25Sensor ?? false;
                    const pM25SensorStatus = hasPM25Sensor ? deviceData.Device.PM25SensorStatus : 0;
                    const pM25Level = hasPM25Sensor ? deviceData.Device.PM25Level : 0;
                    const pM25AirQuality = hasPM25Sensor ? pM25Level <= 13 ? 1 : pM25Level <= 35 ? 2 : pM25Level <= 55 ? 3 : pM25Level <= 75 ? 4 : pM25Level <= 110 ? 5 : 0 : 0;
                    const hasAutoVentilationMode = deviceData.Device.HasAutoVentilationMode ?? false;
                    const hasBypassVentilationMode = deviceData.Device.HasBypassVentilationMode ?? false;
                    const hasAutomaticFanSpeed = deviceData.Device.HasAutomaticFanSpeed ?? false;
                    const coreMaintenanceRequired = deviceData.Device.CoreMaintenanceRequired ? 1 : 0;
                    const filterMaintenanceRequired = deviceData.Device.FilterMaintenanceRequired ? 1 : 0;
                    const actualVentilationMode = deviceData.Device.ActualVentilationMode;
                    const numberOfFanSpeeds = deviceData.Device.NumberOfFanSpeeds ?? 0;
                    const temperatureIncrement = deviceData.Device.TemperatureIncrement ?? 1;

                    this.ervHasCoolOperationMode = hasCoolOperationMode;
                    this.ervHasHeatOperationMode = hasHeatOperationMode;
                    this.ervHasAutoOperationMode = hasAutoOperationMode;
                    this.ervHasRoomTemperature = hasRoomTemperature;
                    this.ervHasSupplyTemperature = hasSupplyTemperature;
                    this.ervHasOutdoorTemperature = hasOutdoorTemperature;
                    this.ervHasCO2Sensor = hasCO2Sensor;
                    this.ervRoomCO2Level = roomCO2Level;
                    this.ervRoomCO2Detected = roomCO2Detected;
                    this.ervHasPM25Sensor = hasPM25Sensor;
                    this.ervPM25SensorStatus = pM25SensorStatus;
                    this.ervPM25Level = pM25Level;
                    this.ervPM25AirQuality = pM25AirQuality;
                    this.ervHasAutoVentilationMode = hasAutoVentilationMode;
                    this.ervHasBypassVentilationMode = hasBypassVentilationMode;
                    this.ervHasAutomaticFanSpeed = hasAutomaticFanSpeed;
                    this.ervCoreMaintenanceRequired = coreMaintenanceRequired;
                    this.ervFilterMaintenanceRequired = filterMaintenanceRequired;
                    this.ervActualVentilationMode = actualVentilationMode;
                    this.ervNumberOfFanSpeeds = numberOfFanSpeeds;
                    this.ervTemperatureIncrement = temperatureIncrement;

                    //device state
                    const roomTemperature = deviceState.RoomTemperature;
                    const supplyTemperature = deviceState.SupplyTemperature;
                    const outdoorTemperature = deviceState.OutdoorTemperature;
                    const nightPurgeMode = deviceState.NightPurgeMode;
                    const setTemperature = deviceState.SetTemperature;
                    const setFanSpeed = deviceState.SetFanSpeed;
                    const operationMode = deviceState.OperationMode;
                    const ventilationMode = deviceState.VentilationMode;
                    const hideRoomTemperature = deviceState.HideRoomTemperature;
                    const hideSupplyTemperature = deviceState.HideSupplyTemperature;
                    const hideOutdoorTemperature = deviceState.HideOutdoorTemperature;
                    const power = deviceState.Power;
                    const offline = deviceState.Offline;

                    //presets
                    const presets = deviceData.Presets ?? [];
                    this.ervPresets = presets;
                    this.ervPresetsCount = this.ervPresetsEnabled ? presets.length : 0;

                    //operating mode
                    let currentOperationMode = 0;
                    let targetOperationMode = 0;
                    let fanSpeed = 0;
                    let lockPhysicalControls = 0;

                    //set temperature
                    const targetTemperature = hasCoolOperationMode || hasHeatOperationMode ? setTemperature : roomTemperature

                    let operationModeSetPropsMinValue = 0;
                    let operationModeSetPropsMaxValue = 3;
                    let operationModeSetPropsValidValues = [0, 1, 2, 3];
                    let fanSpeedSetPropsMaxValue = 2;

                    switch (displayMode) {
                        case 0: //Heater Cooler
                            //operation mode - 0, HEAT, 2, COOL, 4, 5, 6, FAN, AUTO
                            //ventilation mode - LOSSNAY, BYPASS, AUTO
                            //aktual ventilation mode - LOSSNAY, BYPASS
                            currentOperationMode = !power ? 0 : [2, 3, [2, 3][actualVentilationMode]][ventilationMode]; //INACTIVE, IDLE, HEATING, COOLING
                            targetOperationMode = [1, 2, 0][ventilationMode]; //AUTO, HEAT, COOL
                            operationModeSetPropsMinValue = hasAutoVentilationMode ? 0 : 1;
                            operationModeSetPropsMaxValue = hasAutoVentilationMode ? 2 : 2;
                            operationModeSetPropsValidValues = hasAutoVentilationMode ? (hasBypassVentilationMode ? [0, 1, 2] : [0, 2]) : (hasBypassVentilationMode ? [1, 2] : [2]);

                            //fan speed mode
                            switch (numberOfFanSpeeds) {
                                case 2: //Fan speed mode 2
                                    fanSpeed = hasAutomaticFanSpeed ? [3, 1, 2][setFanSpeed] : [0, 1, 2][setFanSpeed];
                                    fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 3 : 2;
                                    break;
                                case 3: //Fan speed mode 3
                                    fanSpeed = hasAutomaticFanSpeed ? [4, 1, 2, 3][setFanSpeed] : [0, 1, 2, 3][setFanSpeed];
                                    fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 4 : 3;
                                    break;
                                case 4: //Fan speed mode 4
                                    fanSpeed = hasAutomaticFanSpeed ? [5, 1, 2, 3, 4][setFanSpeed] : [0, 1, 2, 3, 4][setFanSpeed];
                                    fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 5 : 4;
                                    break;
                            };

                            //lock physical controls
                            lockPhysicalControls = 0;

                            //update characteristics
                            if (this.ervMelCloudServices) {
                                this.ervMelCloudServices[0]
                                    .updateCharacteristic(Characteristic.Active, power)
                                    .updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentOperationMode)
                                    .updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetOperationMode)
                                    .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                                    .updateCharacteristic(Characteristic.RotationSpeed, fanSpeed)
                                    .updateCharacteristic(Characteristic.LockPhysicalControls, lockPhysicalControls)
                                    .updateCharacteristic(Characteristic.TemperatureDisplayUnits, this.useFahrenheit);
                                if (hasHeatOperationMode) {
                                    this.ervMelCloudServices[0].updateCharacteristic(Characteristic.HeatingThresholdTemperature, targetTemperature)
                                }
                                if (hasCoolOperationMode) {
                                    this.ervMelCloudServices[0].updateCharacteristic(Characteristic.CoolingThresholdTemperature, targetTemperature)
                                }
                            };
                            break;
                        case 1: //Thermostat
                            //operation mode - 0, HEAT, 2, COOL, 4, 5, 6, FAN, AUTO
                            //ventilation mode - LOSSNAY, BYPASS, AUTO
                            //aktual ventilation mode - LOSSNAY, BYPASS
                            currentOperationMode = !power ? 0 : [1, 2, [1, 2][actualVentilationMode]][ventilationMode]; //OFF, HEAT, COOL
                            targetOperationMode = !power ? 0 : [1, 2, 3][ventilationMode]; //OFF, HEAT, COOL, AUTO
                            operationModeSetPropsMinValue = hasAutoVentilationMode ? 0 : 0;
                            operationModeSetPropsMaxValue = hasAutoVentilationMode ? 3 : 2;
                            operationModeSetPropsValidValues = hasAutoVentilationMode ? (hasBypassVentilationMode ? [0, 1, 2, 3] : [0, 2, 3]) : (hasBypassVentilationMode ? [0, 1, 2] : [0, 2]);

                            //update characteristics
                            if (this.ervMelCloudServices) {
                                this.ervMelCloudServices[0]
                                    .updateCharacteristic(Characteristic.CurrentHeatingCoolingState, currentOperationMode)
                                    .updateCharacteristic(Characteristic.TargetHeatingCoolingState, targetOperationMode)
                                    .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                                    .updateCharacteristic(Characteristic.TargetTemperature, targetTemperature)
                                    .updateCharacteristic(Characteristic.TemperatureDisplayUnits, this.useFahrenheit);
                            };
                            break;
                    };

                    //update temprature sensors
                    if (this.ervRoomTemperatureSensorService) {
                        this.ervRoomTemperatureSensorService
                            .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                    };

                    if (this.ervOutdoorTemperatureSensorService) {
                        this.ervOutdoorTemperatureSensorService
                            .updateCharacteristic(Characteristic.CurrentTemperature, outdoorTemperature)
                    };

                    if (this.ervSupplyTemperatureSensorService) {
                        this.ervSupplyTemperatureSensorService
                            .updateCharacteristic(Characteristic.CurrentTemperature, supplyTemperature)
                    };

                    //update core maintenance
                    if (this.ervCoreMaintenanceService) {
                        this.ervCoreMaintenanceService
                            .updateCharacteristic(Characteristic.FilterChangeIndication, coreMaintenanceRequired)
                    }

                    //update filter maintenance
                    if (this.ervFilterMaintenanceService) {
                        this.ervFilterMaintenanceService
                            .updateCharacteristic(Characteristic.FilterChangeIndication, filterMaintenanceRequired)
                    }

                    //update CO2 sensor
                    if (this.ervCarbonDioxideSensorService) {
                        this.ervCarbonDioxideSensorService
                            .updateCharacteristic(Characteristic.CarbonDioxideDetected, roomCO2Detected)
                            .updateCharacteristic(Characteristic.CarbonDioxideLevel, roomCO2Level)
                    }

                    //update PM2.5 sensor
                    if (this.ervAirQualitySensorService) {
                        this.ervAirQualitySensorService
                            .updateCharacteristic(Characteristic.AirQuality, pM25AirQuality)
                            .updateCharacteristic(Characteristic.PM2_5Density, pM25Level)
                    }

                    this.power = power;
                    this.offline = offline;
                    this.currentOperationMode = currentOperationMode;
                    this.targetOperationMode = targetOperationMode;
                    this.roomTemperature = roomTemperature;
                    this.supplyTemperature = supplyTemperature;
                    this.outdoorTemperature = outdoorTemperature;
                    this.setTemperature = targetTemperature;
                    this.fanSpeed = fanSpeed;
                    this.setFanSpeed = setFanSpeed;
                    this.lockPhysicalControls = lockPhysicalControls;

                    //update buttons state
                    if (this.ervButtonsCount > 0) {
                        this.ervButtonsConfigured = [];

                        for (const button of this.ervButtons) {
                            const buttonDisplayType = button.displayType ?? 0;

                            if (buttonDisplayType > 0) {
                                const buttonMode = button.mode ?? 100;
                                switch (buttonMode) {
                                    case 0: //POWER ON,OFF
                                        button.buttonState = (power === true);
                                        this.ervButtonsConfigured.push(button);
                                        break;
                                    case 1: //OPERATION MODE RECOVERY
                                        button.buttonState = power ? (ventilationMode === 0) : false;
                                        this.ervButtonsConfigured.push(button);
                                        break;
                                    case 2: //OPERATION MODE BYPAS
                                        button.buttonState = power ? (ventilationMode === 1) : false;
                                        this.ervButtonsConfigured.push(button);
                                        break;
                                    case 3: //OPERATION MODE AUTO
                                        button.buttonState = power ? (ventilationMode === 2) : false;
                                        this.ervButtonsConfigured.push(button);
                                        break;
                                    case 4: //NIGHT PURGE MODE
                                        button.buttonState = power ? (nightPurgeMode === true) : false;
                                        this.ervButtonsConfigured.push(button);
                                        break;
                                    case 10: //FAN SPEED MODE AUTO
                                        button.buttonState = power ? (setFanSpeed === 0) : false;
                                        this.ervButtonsConfigured.push(button);
                                        break;
                                    case 11: //FAN SPEED MODE 1
                                        button.buttonState = power ? (setFanSpeed === 1) : false;
                                        this.ervButtonsConfigured.push(button);
                                        break;
                                    case 12: //FAN SPEED MODE 2
                                        button.buttonState = power ? (setFanSpeed === 2) : false;
                                        this.ervButtonsConfigured.push(button);
                                        break;
                                    case 13: //FAN SPEED MODE 3
                                        button.buttonState = power ? (setFanSpeed === 3) : false;
                                        this.ervButtonsConfigured.push(button);
                                        break;
                                    case 14: //FAN SPEED MODE 4
                                        button.buttonState = power ? (setFanSpeed === 4) : false;
                                        this.ervButtonsConfigured.push(button);
                                        break;
                                    case 15: //PHYSICAL LOCK CONTROLS
                                        button.buttonState = (lockPhysicalControls === 1);
                                        this.ervButtonsConfigured.push(button);
                                        break;
                                    case 16: //ROOM TEMP HIDE
                                        button.buttonState = (hideRoomTemperature === true);
                                        this.ervButtonsConfigured.push(button);
                                        break;
                                    case 17: //SUPPLY TEMP HIDE
                                        button.buttonState = (hideSupplyTemperature === true);
                                        this.ervButtonsConfigured.push(button);
                                        break;
                                    case 18: //OUTDOOR TEMP HIDE
                                        button.buttonState = (hideOutdoorTemperature === true);
                                        this.ervButtonsConfigured.push(button);
                                        break;
                                    default: //Unknown button
                                        this.emit('message', `Unknown button mode: ${buttonMode} detected.`);
                                        break;
                                };
                            };
                        };

                        this.ervButtonsConfiguredCount = this.ervButtonsConfigured.length;
                        for (let i = 0; i < this.ervButtonsConfiguredCount; i++) {
                            const button = this.ervButtonsConfigured[i];
                            const buttonState = button.buttonState;
                            const buttonDisplayType = button.displayType;
                            const characteristicType = ['', Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][buttonDisplayType];
                            if (this.ervButtonsServices) {
                                this.ervButtonsServices[i]
                                    .updateCharacteristic(characteristicType, buttonState)
                            };
                        };
                    };

                    //update presets state
                    if (this.ervPresetsCount > 0) {
                        this.ervPresetsStates = [];

                        for (let i = 0; i < this.ervPresetsCount; i++) {
                            const preset = presets[i];
                            const presetState =
                                preset.SetTemperature === targetTemperature
                                && preset.Power === power
                                && preset.OperationMode === operationMode
                                && preset.VentilationMode === ventilationMode
                                && preset.FanSpeed === setFanSpeed;
                            this.ervPresetsStates.push(presetState);

                            if (this.ervPresetsServices) {
                                this.ervPresetsServices[i]
                                    .updateCharacteristic(Characteristic.On, presetState)
                            };
                        };
                    };

                    //start prepare accessory
                    if (this.startPrepareAccessory) {
                        try {
                            this.operationModeSetPropsMinValue = operationModeSetPropsMinValue;
                            this.operationModeSetPropsMaxValue = operationModeSetPropsMaxValue;
                            this.operationModeSetPropsValidValues = operationModeSetPropsValidValues;
                            this.fanSpeedSetPropsMaxValue = fanSpeedSetPropsMaxValue;

                            const accessory = await this.prepareAccessory(accountInfo, deviceState, deviceId, deviceType, deviceTypeText, deviceName);
                            this.emit('publishAccessory', accessory);
                            this.startPrepareAccessory = false;
                        } catch (error) {
                            this.emit('error', `Prepare accessory error: ${error}`);
                        };
                    };
                })
                    .on('message', (message) => {
                        this.emit('message', message);
                    })
                    .on('debug', (debug) => {
                        this.emit('debug', debug);
                    })
                    .on('error', (error) => {
                        this.emit('error', error);
                    })
                    .on('restFul', (path, data) => {
                        const restFul = this.restFulConnected ? this.restFul.update(path, data) : false;
                    })
                    .on('mqtt', (topic, message) => {
                        const mqtt = this.mqttConnected ? this.mqtt.send(topic, message) : false;
                    });
                break;
            default: //unknown system detected
                this.emit('message', `Unknown system type: ${deviceType} detected.`);
                break;
        };
    };

    //prepare accessory
    prepareAccessory(accountInfo, deviceState, deviceId, deviceType, deviceTypeText, deviceName) {
        return new Promise((resolve, reject) => {
            try {
                //accessory
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare accessory`) : false;
                const accessoryName = deviceName;
                const accessoryUUID = UUID.generate(deviceId.toString());
                const accessoryCategory = [Categories.AIR_CONDITIONER, Categories.AIR_HEATER, Categories.OTHER, Categories.AIR_PURIFIER][deviceType];
                const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

                //information service
                const debug1 = this.enableDebugMode ? this.emit('debug', `Prepare information service`) : false;
                accessory.getService(Service.AccessoryInformation)
                    .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
                    .setCharacteristic(Characteristic.Model, this.model)
                    .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
                    .setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

                //melcloud services
                const temperatureUnit = CONSTANS.TemperatureDisplayUnits[this.useFahrenheit];

                switch (deviceType) {
                    case 0: //air conditioner
                        const debug0 = this.enableDebugMode ? this.emit('debug', `Prepare ata service`) : false;
                        const ataDisplayMode = this.ataDisplayMode;
                        const ataTemperatureSensor = this.ataTemperatureSensor;
                        const ataButtonsConfigured = this.ataButtonsConfigured;
                        const ataButtonsConfiguredCount = this.ataButtonsConfiguredCount;
                        const ataPresets = this.ataPresets;
                        const ataPresetsCount = this.ataPresetsCount;
                        const ataHasAutomaticFanSpeed = this.ataHasAutomaticFanSpeed;
                        const ataModelSupportsFanSpeed = this.ataModelSupportsFanSpeed;
                        const ataModelSupportsAuto = this.ataModelSupportsAuto;
                        const ataModelSupportsHeat = this.ataModelSupportsHeat;
                        const ataModelSupportsDry = this.ataModelSupportsDry;
                        const ataNumberOfFanSpeeds = this.ataNumberOfFanSpeeds;
                        const ataSwingFunction = this.ataSwingFunction;
                        const ataAutoDryFan = [ataModelSupportsDry ? 2 : 7, 7][this.ataAutoHeatMode];
                        const ataHeatFanDry = [7, ataModelSupportsDry ? 2 : 7][this.ataAutoHeatMode];
                        const ataServiceName = `${deviceTypeText} ${accessoryName}`;

                        this.ataMelCloudServices = [];
                        switch (ataDisplayMode) {
                            case 0: //Heater Cooler
                                const ataMelCloudService = accessory.addService(Service.HeaterCooler, ataServiceName, `HeaterCooler ${deviceId}`);
                                ataMelCloudService.getCharacteristic(Characteristic.Active)
                                    .onGet(async () => {
                                        const state = this.power;
                                        const info = this.disableLogInfo ? false : this.emit('message', `Power: ${state ? 'ON' : 'OFF'}`);
                                        return state;
                                    })
                                    .onSet(async (state) => {
                                        try {
                                            deviceState.Power = state;
                                            deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power;
                                            await this.melCloudAta.send(deviceState);
                                            const info = this.disableLogInfo ? false : this.emit('message', `Set power: ${state ? 'ON' : 'OFF'}`);
                                        } catch (error) {
                                            this.emit('error', `Set power error: ${error}`);
                                            ataMelCloudService.updateCharacteristic(Characteristic.Active, false)
                                        };
                                    });
                                ataMelCloudService.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
                                    .onGet(async () => {
                                        const value = this.currentOperationMode;
                                        const operationModeText = !this.power ? CONSTANS.AirConditioner.System[0] : CONSTANS.AirConditioner.DriveMode[deviceState.OperationMode];
                                        const info = this.disableLogInfo ? false : this.emit('message', `Operation mode: ${operationModeText}`);
                                        return value;
                                    });
                                ataMelCloudService.getCharacteristic(Characteristic.TargetHeaterCoolerState)
                                    .setProps({
                                        minValue: this.operationModeSetPropsMinValue,
                                        maxValue: this.operationModeSetPropsMaxValue,
                                        validValues: this.operationModeSetPropsValidValues
                                    })
                                    .onGet(async () => {
                                        const value = this.targetOperationMode; //1 = HEAT, 2 = DRY 3 = COOL, 7 = FAN, 8 = AUTO
                                        return value;
                                    })
                                    .onSet(async (value) => {
                                        try {
                                            switch (value) {
                                                case 0: //AUTO - AUTO
                                                    deviceState.Power = true;
                                                    deviceState.OperationMode = ataModelSupportsAuto ? 8 : ataAutoDryFan;
                                                    deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
                                                    break;
                                                case 1: //HEAT - HEAT
                                                    deviceState.Power = true;
                                                    deviceState.OperationMode = ataModelSupportsHeat ? 1 : ataHeatFanDry;
                                                    deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
                                                    break;
                                                case 2: //COOL - COOL
                                                    deviceState.Power = true;
                                                    deviceState.OperationMode = 3;
                                                    deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
                                                    break;
                                            };

                                            await this.melCloudAta.send(deviceState);
                                            const operationModeText = CONSTANS.AirConditioner.DriveMode[deviceState.OperationMode];
                                            const info = this.disableLogInfo ? false : this.emit('message', `Set operation mode: ${operationModeText}`);
                                        } catch (error) {
                                            this.emit('error', `Set operation mode error: ${error}`);
                                        };
                                    });
                                if (ataModelSupportsFanSpeed) {
                                    ataMelCloudService.getCharacteristic(Characteristic.RotationSpeed)
                                        .setProps({
                                            minValue: 0,
                                            maxValue: this.fanSpeedSetPropsMaxValue,
                                            minStep: 1
                                        })
                                        .onGet(async () => {
                                            const value = this.fanSpeed; //AUTO, 1, 2, 3, 4, 5, 6, OFF
                                            const info = this.disableLogInfo ? false : this.emit('message', `Fan speed mode: ${CONSTANS.AirConditioner.FanSpeed[this.setFanSpeed]}`);
                                            return value;
                                        })
                                        .onSet(async (value) => {
                                            try {
                                                let fanSpeed = 0; //AUTO, 1, 2, 3, 4, 5, 6
                                                let fanSpeedModeText = 0; //AUTO, 1, 2, 3, 4, 5, 6, OFF
                                                switch (ataNumberOfFanSpeeds) {
                                                    case 2: //Fan speed mode 2
                                                        fanSpeed = ataHasAutomaticFanSpeed ? [0, 1, 2, 0][value] : [1, 1, 2][value];
                                                        fanSpeedModeText = ataHasAutomaticFanSpeed ? [7, 1, 2, 0][value] : [7, 1, 2][value];
                                                        break;
                                                    case 3: //Fan speed mode 3
                                                        fanSpeed = ataHasAutomaticFanSpeed ? [0, 1, 2, 3, 0][value] : [1, 1, 2, 3][value];
                                                        fanSpeedModeText = ataHasAutomaticFanSpeed ? [7, 1, 2, 3, 0][value] : [7, 1, 2, 3][value];
                                                        break;
                                                    case 4: //Fan speed mode 4
                                                        fanSpeed = ataHasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 0][value] : [1, 1, 2, 3, 4][value];
                                                        fanSpeedModeText = ataHasAutomaticFanSpeed ? [7, 1, 2, 3, 4, 0][value] : [7, 1, 2, 3, 4][value];
                                                        break;
                                                    case 5: //Fan speed mode 5
                                                        fanSpeed = ataHasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 0][value] : [1, 1, 2, 3, 4, 5][value];
                                                        fanSpeedModeText = ataHasAutomaticFanSpeed ? [7, 1, 2, 3, 4, 5, 0][value] : [7, 1, 2, 3, 4, 5][value];
                                                        break;
                                                    case 6: //Fan speed mode 6
                                                        fanSpeed = ataHasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 6, 0][value] : [1, 1, 2, 3, 4, 5, 6][value];
                                                        fanSpeedModeText = ataHasAutomaticFanSpeed ? [7, 1, 2, 3, 4, 5, 6, 0][value] : [7, 1, 2, 3, 4, 5, 6][value];
                                                        break;
                                                };

                                                deviceState.SetFanSpeed = fanSpeed;
                                                deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
                                                await this.melCloudAta.send(deviceState);
                                                const info = this.disableLogInfo ? false : this.emit('message', `Set fan speed mode: ${CONSTANS.AirConditioner.FanSpeed[fanSpeedModeText]}`);
                                            } catch (error) {
                                                this.emit('error', `Set fan speed mode error: ${error}`);
                                            };
                                        });
                                };
                                if (ataSwingFunction) {
                                    ataMelCloudService.getCharacteristic(Characteristic.SwingMode)
                                        .onGet(async () => {
                                            //Vane Horizontal: Auto, 1, 2, 3, 4, 5, 12 = Swing //Vertical: Auto, 1, 2, 3, 4, 5, 7 = Swing
                                            const value = this.swingMode;
                                            const info = this.disableLogInfo ? false : this.emit('message', `Vane swing mode: ${CONSTANS.AirConditioner.AirDirection[value ? 6 : 0]}`);
                                            return value;
                                        })
                                        .onSet(async (value) => {
                                            try {
                                                deviceState.VaneHorizontal = value ? 12 : 0;
                                                deviceState.VaneVertical = value ? 7 : 0;
                                                deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
                                                await this.melCloudAta.send(deviceState);
                                                const info = this.disableLogInfo ? false : this.emit('message', `Set vane swing mode: ${CONSTANS.AirConditioner.AirDirection[value ? 6 : 0]}`);
                                            } catch (error) {
                                                this.emit('error', `Set vane swing mode error: ${error}`);
                                            };
                                        });
                                };
                                ataMelCloudService.getCharacteristic(Characteristic.CurrentTemperature)
                                    .onGet(async () => {
                                        const value = this.roomTemperature;
                                        const info = this.disableLogInfo ? false : this.emit('message', `Room temperature: ${value}${temperatureUnit}`);
                                        return value;
                                    });
                                ataMelCloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
                                    .setProps({
                                        minValue: [0, 32][this.useFahrenheit],
                                        maxValue: [31, 88][this.useFahrenheit],
                                        minStep: this.ataTemperatureIncrement
                                    })
                                    .onGet(async () => {
                                        const value = this.setTemperature;
                                        const info = this.disableLogInfo ? false : this.emit('message', `Heating threshold temperature: ${value}${temperatureUnit}`);
                                        return value;
                                    })
                                    .onSet(async (value) => {
                                        try {
                                            deviceState.SetTemperature = value;
                                            deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.SetTemperature;
                                            await this.melCloudAta.send(deviceState);
                                            const info = this.disableLogInfo ? false : this.emit('message', `Set heating threshold temperature: ${value}${temperatureUnit}`);
                                        } catch (error) {
                                            this.emit('error', `Set heating threshold temperature error: ${error}`);
                                        };
                                    });
                                ataMelCloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
                                    .setProps({
                                        minValue: [10, 50][this.useFahrenheit],
                                        maxValue: [31, 88][this.useFahrenheit],
                                        minStep: this.ataTemperatureIncrement
                                    })
                                    .onGet(async () => {
                                        const value = this.setTemperature;
                                        const info = this.disableLogInfo ? false : this.emit('message', `Cooling threshold temperature: ${value}${temperatureUnit}`);
                                        return value;
                                    })
                                    .onSet(async (value) => {
                                        try {
                                            deviceState.SetTemperature = value;
                                            deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.SetTemperature;
                                            await this.melCloudAta.send(deviceState);
                                            const info = this.disableLogInfo ? false : this.emit('message', `Set cooling threshold temperature: ${value}${temperatureUnit}`);
                                        } catch (error) {
                                            this.emit('error', `Set cooling threshold temperature error: ${error}`);
                                        };
                                    });
                                ataMelCloudService.getCharacteristic(Characteristic.LockPhysicalControls)
                                    .onGet(async () => {
                                        const value = this.lockPhysicalControls;
                                        const info = this.disableLogInfo ? false : this.emit('message', `Lock physical controls: ${value ? 'LOCKED' : 'UNLOCKED'}`);
                                        return value;
                                    })
                                    .onSet(async (value) => {
                                        try {
                                            value = value ? true : false;
                                            deviceState.ProhibitSetTemperature = value;
                                            deviceState.ProhibitOperationMode = value;
                                            deviceState.ProhibitPower = value;
                                            deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Prohibit;
                                            await this.melCloudAta.send(deviceState);
                                            const info = this.disableLogInfo ? false : this.emit('message', `Set locl physical controls: ${value ? 'LOCK' : 'UNLOCK'}`);
                                        } catch (error) {
                                            this.emit('error', `Set lock physical controls error: ${error}`);
                                        };
                                    });
                                ataMelCloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
                                    .onGet(async () => {
                                        const value = this.useFahrenheit;
                                        const info = this.disableLogInfo ? false : this.emit('message', `Temperature display unit: ${temperatureUnit}`);
                                        return value;
                                    })
                                    .onSet(async (value) => {
                                        try {
                                            accountInfo.UseFahrenheit = value ? true : false;
                                            await this.melCloud.send(accountInfo);
                                            this.useFahrenheit = accountInfo.UseFahrenheit;
                                            const info = this.disableLogInfo ? false : this.emit('message', `Set temperature display unit: ${CONSTANS.TemperatureDisplayUnits[value]}`);
                                        } catch (error) {
                                            this.emit('error', `Set temperature display unit error: ${error}`);
                                        };
                                    });

                                this.ataMelCloudServices.push(ataMelCloudService);
                                break;
                            case 1: //Thermostat
                                const ataMelCloudServiceT = accessory.addService(Service.Thermostat, ataServiceName, `Thermostat ${deviceId}`);
                                ataMelCloudServiceT.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
                                    .onGet(async () => {
                                        const value = this.currentOperationMode;
                                        const operationModeText = !this.power ? CONSTANS.HeatPump.System[0] : CONSTANS.HeatPump.OperationMode[deviceState.OperationMode];
                                        const info = this.disableLogInfo ? false : this.emit('message', `Operation mode: ${operationModeText}`);
                                        return value;
                                    });
                                ataMelCloudServiceT.getCharacteristic(Characteristic.TargetHeatingCoolingState)
                                    .setProps({
                                        minValue: this.operationModeSetPropsMinValue,
                                        maxValue: this.operationModeSetPropsMaxValue,
                                        validValues: this.operationModeSetPropsValidValues
                                    })
                                    .onGet(async () => {
                                        const value = this.targetOperationMode; //1 = HEAT, 2 = DRY 3 = COOL, 7 = FAN, 8 = AUTO
                                        return value;
                                    })
                                    .onSet(async (value) => {
                                        try {
                                            switch (value) {
                                                case 0: //OFF - POWER OFF
                                                    deviceState.Power = false;
                                                    deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power;
                                                    break;
                                                case 1: //HEAT - HEAT
                                                    deviceState.Power = true;
                                                    deviceState.OperationMode = ataModelSupportsHeat ? 1 : ataHeatFanDry;
                                                    deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
                                                    break;
                                                case 2: //COOL - COOL
                                                    deviceState.Power = true;
                                                    deviceState.OperationMode = 3;
                                                    deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
                                                    break;
                                                case 3: //AUTO - AUTO
                                                    deviceState.Power = true;
                                                    deviceState.OperationMode = ataModelSupportsAuto ? 8 : ataAutoDryFan;
                                                    deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
                                                    break;
                                            };

                                            await this.melCloudAta.send(deviceState);
                                            const operationModeText = CONSTANS.AirConditioner.DriveMode[deviceState.OperationMode];
                                            const info = this.disableLogInfo ? false : this.emit('message', `Set operation mode: ${operationModeText}`);
                                        } catch (error) {
                                            this.emit('error', `Set operation mode error: ${error}`);
                                        };
                                    });
                                ataMelCloudServiceT.getCharacteristic(Characteristic.CurrentTemperature)
                                    .onGet(async () => {
                                        const value = this.roomTemperature;
                                        const info = this.disableLogInfo ? false : this.emit('message', `Room temperature: ${value}${temperatureUnit}`);
                                        return value;
                                    });
                                ataMelCloudServiceT.getCharacteristic(Characteristic.TargetTemperature)
                                    .setProps({
                                        minValue: [0, 32][this.useFahrenheit],
                                        maxValue: [31, 88][this.useFahrenheit],
                                        minStep: this.ataTemperatureIncrement
                                    })
                                    .onGet(async () => {
                                        const value = this.setTemperature;
                                        const info = this.disableLogInfo ? false : this.emit('message', `Target temperature: ${value}${temperatureUnit}`);
                                        return value;
                                    })
                                    .onSet(async (value) => {
                                        try {
                                            deviceState.SetTemperature = value;
                                            deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.SetTemperature;
                                            await this.melCloudAta.send(deviceState);
                                            const info = this.disableLogInfo ? false : this.emit('message', `Set temperature: ${value}${temperatureUnit}`);
                                        } catch (error) {
                                            this.emit('error', `Set temperature error: ${error}`);
                                        };
                                    });
                                ataMelCloudServiceT.getCharacteristic(Characteristic.TemperatureDisplayUnits)
                                    .onGet(async () => {
                                        const value = this.useFahrenheit;
                                        const info = this.disableLogInfo ? false : this.emit('message', `Temperature display unit: ${temperatureUnit}`);
                                        return value;
                                    })
                                    .onSet(async (value) => {
                                        try {
                                            accountInfo.UseFahrenheit = value ? true : false;
                                            await this.melCloud.send(accountInfo);
                                            this.useFahrenheit = accountInfo.UseFahrenheit;
                                            const info = this.disableLogInfo ? false : this.emit('message', `Set temperature display unit: ${CONSTANS.TemperatureDisplayUnits[value]}`);
                                        } catch (error) {
                                            this.emit('error', `Set temperature display unit error: ${error}`);
                                        };
                                    });
                                this.ataMelCloudServices.push(ataMelCloudServiceT);
                                break;
                        };

                        //temperature sensor services
                        if (ataTemperatureSensor) {
                            const debug = this.enableDebugMode ? this.emit('debug', `Prepare room temperature sensor service`) : false;
                            this.ataRoomTemperatureSensorService = new Service.TemperatureSensor(`${ataServiceName} Room`, `Temperature Sensor ${deviceId}`);
                            this.ataRoomTemperatureSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.ataRoomTemperatureSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Room`);
                            this.ataRoomTemperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                .onGet(async () => {
                                    const state = this.roomTemperature;
                                    return state;
                                })
                            accessory.addService(this.ataRoomTemperatureSensorService);

                            if (this.hasOutdoorTemperature) {
                                const debug = this.enableDebugMode ? this.emit('debug', `Prepare Outdoor temperature sensor service`) : false;
                                this.ataOutdoorTemperatureSensorService = new Service.TemperatureSensor(`${ataServiceName} Outdoor`, `Temperature Sensor ${deviceId}`);
                                this.ataOutdoorTemperatureSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                this.ataOutdoorTemperatureSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Outdoor`);
                                this.ataOutdoorTemperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                    .onGet(async () => {
                                        const state = this.outdoorTemperature;
                                        return state;
                                    })
                                accessory.addService(this.ataOutdoorTemperatureSensorService);
                            };
                        };

                        //buttons services
                        if (ataButtonsConfiguredCount > 0) {
                            const debug = this.enableDebugMode ? this.emit('debug', `Prepare buttons/sensors service`) : false;
                            this.ataButtonsServices = [];

                            for (let i = 0; i < ataButtonsConfiguredCount; i++) {
                                const button = ataButtonsConfigured[i];

                                //get button mode
                                const buttonMode = button.mode;

                                //get button display type
                                const buttonDisplayType = button.displayType;

                                //get button name
                                const buttonName = button.name || ['', `Button ${i}`, `Button ${i}`, `Sensor ${i}`, `Sensor ${i}`, `Sensor ${i}`][buttonDisplayType];

                                //get button name prefix
                                const buttonNamePrefix = button.namePrefix ?? false;

                                const buttonServiceName = buttonNamePrefix ? `${accessoryName} ${buttonName}` : buttonName;
                                const buttonServiceType = ['', Service.Outlet, Service.Switch, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][buttonDisplayType];
                                const characteristicType = ['', Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][buttonDisplayType];
                                const buttonService = new buttonServiceType(buttonServiceName, `Button ${deviceId} ${i}`);
                                buttonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                buttonService.setCharacteristic(Characteristic.ConfiguredName, buttonServiceName);
                                buttonService.getCharacteristic(characteristicType)
                                    .onGet(async () => {
                                        const state = button.buttonState;
                                        return state;
                                    })
                                    .onSet(async (state) => {
                                        if (buttonDisplayType <= 1) {
                                            try {
                                                switch (buttonMode) {
                                                    case 0: //POWER ON,OFF
                                                        deviceState.Power = state;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power;
                                                        break;
                                                    case 1: //OPERATING MODE HEAT
                                                        deviceState.Power = true;
                                                        deviceState.OperationMode = 1;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
                                                        break;
                                                    case 2: //OPERATING MODE DRY
                                                        deviceState.Power = true;
                                                        deviceState.OperationMode = 2;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
                                                        break
                                                    case 3: //OPERATING MODE COOL
                                                        deviceState.Power = true;
                                                        deviceState.OperationMode = 3;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
                                                        break;
                                                    case 4: //OPERATING MODE FAN
                                                        deviceState.Power = true;
                                                        deviceState.OperationMode = 7;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
                                                        break;
                                                    case 5: //OPERATING MODE AUTO
                                                        deviceState.Power = true;
                                                        deviceState.OperationMode = 8;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
                                                        break;
                                                    case 6: //OPERATING MODE PURIFY
                                                        deviceState.Power = true;
                                                        deviceState.OperationMode = 9;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
                                                        break;
                                                    case 7: //OPERATING MODE DRY CONTROL HIDE
                                                        deviceState.HideDryModeControl = state;
                                                        break;
                                                    case 10: //VANE H SWING MODE AUTO
                                                        deviceState.Power = true;
                                                        deviceState.VaneHorizontal = 0;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal;
                                                        break;
                                                    case 11: //VANE H SWING MODE 1
                                                        deviceState.Power = true;
                                                        deviceState.VaneHorizontal = 1;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal;
                                                        break;
                                                    case 12: //VANE H SWING MODE 2
                                                        deviceState.Power = true;
                                                        deviceState.VaneHorizontal = 2;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal;
                                                        break;
                                                    case 13: //VANE H SWING MODE 3
                                                        deviceState.Power = true;
                                                        deviceState.VaneHorizontal = 3;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal;
                                                        break;
                                                    case 14: //VANE H SWING MODE 4
                                                        deviceState.Power = true;
                                                        deviceState.VaneHorizontal = 4;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal;
                                                        break;
                                                    case 15: //VANE H SWING MODE 5
                                                        deviceState.Power = true;
                                                        deviceState.VaneHorizontal = 5;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal;
                                                        break;
                                                    case 16: //VANE H SWING MODE SPLIT
                                                        deviceState.Power = true;
                                                        deviceState.VaneHorizontal = 8;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal;
                                                        break;
                                                    case 17: //VANE H SWING MODE SWING
                                                        deviceState.Power = true;
                                                        deviceState.VaneHorizontal = 12;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal;
                                                        break;
                                                    case 20: //VANE V SWING MODE AUTO
                                                        deviceState.Power = true;
                                                        deviceState.VaneVertical = 0;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
                                                        break;
                                                    case 21: //VANE V SWING MODE 1
                                                        deviceState.Power = true;
                                                        deviceState.VaneVertical = 1;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
                                                        break;
                                                    case 22: //VANE V SWING MODE 2
                                                        deviceState.Power = true;
                                                        deviceState.VaneVertical = 2;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
                                                        break;
                                                    case 23: //VANE V SWING MODE 3
                                                        deviceState.Power = true;
                                                        deviceState.VaneVertical = 3;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
                                                        break;
                                                    case 24: //VANE V SWING MODE 4
                                                        deviceState.Power = true;
                                                        deviceState.VaneVertical = 4;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
                                                        break;
                                                    case 25: //VANE V SWING MODE 5
                                                        deviceState.Power = true;
                                                        deviceState.VaneVertical = 5;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
                                                        break;
                                                    case 26: //VANE V SWING MODE SWING
                                                        deviceState.Power = true;
                                                        deviceState.VaneVertical = 7;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
                                                        break;
                                                    case 27: //VANE H/V CONTROLS HIDE
                                                        deviceState.HideVaneControls = state;
                                                        break;
                                                    case 30: //FAN SPEED MODE AUTO
                                                        deviceState.Power = true;
                                                        deviceState.SetFanSpeed = 0;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
                                                        break;
                                                    case 31: //FAN SPEED MODE 1
                                                        deviceState.Power = true;
                                                        deviceState.SetFanSpeed = 1;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
                                                        break;
                                                    case 32: //FAN SPEED MODE 2
                                                        deviceState.Power = true;
                                                        deviceState.SetFanSpeed = 2;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
                                                        break;
                                                    case 33: //FAN SPEED MODE 3
                                                        deviceState.Power = true;
                                                        deviceState.SetFanSpeed = 3;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
                                                        break;
                                                    case 34: //FAN MODE 4
                                                        deviceState.Power = true;
                                                        deviceState.SetFanSpeed = 4;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
                                                        break;
                                                    case 35: //FAN SPEED MODE 5
                                                        deviceState.Power = true;
                                                        deviceState.SetFanSpeed = 5;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
                                                        break;
                                                    case 36: //FAN SPEED MODE 6
                                                        deviceState.Power = true;
                                                        deviceState.SetFanSpeed = 6;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
                                                        break;
                                                    case 37: //PHYSICAL LOCK CONTROLS
                                                        deviceState.ProhibitSetTemperature = state;
                                                        deviceState.ProhibitOperationMode = state;
                                                        deviceState.ProhibitPower = state;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Prohibit;
                                                        break;
                                                    case 38: //PHYSICAL LOCK CONTROLS POWER
                                                        deviceState.ProhibitPower = state;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Prohibit;
                                                        break;
                                                    case 39: //PHYSICAL LOCK CONTROLS MODE
                                                        deviceState.ProhibitOperationMode = state;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Prohibit;
                                                        break;
                                                    case 40: //PHYSICAL LOCK CONTROLS TTEMP
                                                        deviceState.ProhibitSetTemperature = state;
                                                        deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Prohibit;
                                                        break;
                                                    default:
                                                        deviceState = deviceState;
                                                        break;
                                                };

                                                await this.melCloudAta.send(deviceState);
                                                const info = this.disableLogInfo ? false : this.emit('message', `Set: ${buttonName}`);
                                            } catch (error) {
                                                this.emit('error', `Set button error: ${error}`);
                                            };
                                        };
                                    });
                                this.ataButtonsServices.push(buttonService);
                                accessory.addService(buttonService);
                            };
                        };

                        //presets services
                        if (ataPresetsCount > 0) {
                            const debug = this.enableDebugMode ? this.emit('debug', `Prepare presets service`) : false;
                            this.ataPresetsServices = [];
                            const ataPreviousPresets = [];

                            for (let i = 0; i < ataPresetsCount; i++) {
                                const preset = ataPresets[i];
                                const presetName = preset.NumberDescription;

                                const presetService = new Service.Outlet(`${accessoryName} ${presetName}`, `Preset ${deviceId} ${i}`);
                                presetService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                presetService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${presetName}`);
                                presetService.getCharacteristic(Characteristic.On)
                                    .onGet(async () => {
                                        const state = this.ataPresetsStates[i];
                                        return state;
                                    })
                                    .onSet(async (state) => {
                                        try {
                                            switch (state) {
                                                case true:
                                                    ataPreviousPresets[i] = deviceState;
                                                    deviceState.SetTemperature = preset.SetTemperature;
                                                    deviceState.Power = preset.Power;
                                                    deviceState.OperationMode = preset.OperationMode;
                                                    deviceState.VaneHorizontal = preset.VaneHorizontal;
                                                    deviceState.VaneVertical = preset.VaneVertical;
                                                    deviceState.SetFanSpeed = preset.FanSpeed;
                                                    deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power;
                                                    break;
                                                case false:
                                                    deviceState = ataPreviousPresets[i];
                                                    break;
                                            };

                                            await this.melCloudAta.send(deviceState);
                                            const info = this.disableLogInfo ? false : this.emit('message', `Set: ${presetName}`);
                                        } catch (error) {
                                            this.emit('error', `Set preset error: ${error}`);
                                        };
                                    });
                                ataPreviousPresets.push(deviceState);
                                this.ataPresetsServices.push(presetService);
                                accessory.addService(presetService);
                            };
                        };
                        resolve(accessory);
                        break;
                    case 1: //heat pump
                        const debug1 = this.enableDebugMode ? this.emit('debug', `Prepare atw service`) : false;
                        const atwZonesCount = this.atwZonesCount;
                        const atwTemperatureSensor = this.atwTemperatureSensor;
                        const atwButtonsConfigured = this.atwButtonsConfigured;
                        const atwButtonsConfiguredCount = this.atwButtonsConfiguredCount;
                        const atwPresets = this.atwPresets;
                        const atwPresetsCount = this.atwPresetsCount;
                        const atwDisplayMode = this.atwDisplayMode;
                        const atwCaseHotWater = this.atwCaseHotWater;
                        const atwCaseZone2 = this.atwCaseZone2;

                        this.atwMelCloudServices = [];
                        this.atwTemperatureSensorServices = atwTemperatureSensor ? [] : false;
                        for (let i = 0; i < atwZonesCount; i++) {
                            const zoneName = [this.atwHeatPumpName, this.atwZone1Name, this.atwHotWaterName, this.atwZone2Name][i];
                            const atwServiceName = `${deviceTypeText} ${accessoryName}: ${zoneName}`;
                            switch (atwDisplayMode) {
                                case 0: //Heater Cooler
                                    const atwMelCloudService = new Service.HeaterCooler(atwServiceName, `HeaterCooler ${deviceId} ${i}`);
                                    atwMelCloudService.getCharacteristic(Characteristic.Active)
                                        .onGet(async () => {
                                            const state = this.power;
                                            const info = this.disableLogInfo || i > 0 ? false : this.emit('message', `${zoneName}, Power: ${state ? 'ON' : 'OFF'}`);
                                            return state;
                                        })
                                        .onSet(async (state) => {
                                            try {
                                                switch (i) {
                                                    case 0: //Heat Pump
                                                        deviceState.Power = state;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power;
                                                        await this.melCloudAtw.send(deviceState);
                                                        const info = this.disableLogInfo ? false : this.emit('message', `${zoneName}, Set power: ${state ? 'ON' : 'OFF'}`);
                                                        break;
                                                };
                                            } catch (error) {
                                                this.emit('error', `Set power error: ${error}`);
                                                atwMelCloudService.updateCharacteristic(Characteristic.Active, false)
                                            };
                                        });
                                    atwMelCloudService.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
                                        .onGet(async () => {
                                            const value = this.currentOperationModes[i];
                                            let operationModeText = '';
                                            switch (i) {
                                                case 0: //Heat Pump - HEAT, COOL, OFF
                                                    operationModeText = CONSTANS.HeatPump.System[deviceState.UnitStatus];
                                                    break;
                                                case 1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
                                                    operationModeText = this.idleZone1 ? CONSTANS.HeatPump.ZoneOperation[6] : CONSTANS.HeatPump.ZoneOperation[deviceState.OperationModeZone1];
                                                    break;
                                                case atwCaseHotWater: //Hot Water - AUTO, HEAT NOW
                                                    operationModeText = deviceState.OperationMode === 1 ? CONSTANS.HeatPump.ForceDhw[1] : CONSTANS.HeatPump.ForceDhw[deviceState.ForcedHotWaterMode ? 1 : 0];
                                                    break;
                                                case atwCaseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
                                                    operationModeText = this.idleZone2 ? CONSTANS.HeatPump.ZoneOperation[6] : CONSTANS.HeatPump.ZoneOperation[deviceState.OperationModeZone2];
                                                    break;
                                            };

                                            operationModeText = !this.power ? CONSTANS.HeatPump.System[0] : operationModeText;
                                            const info = this.disableLogInfo && i >= atwZonesCount ? false : this.emit('message', `${zoneName}, Operation mode: ${operationModeText}`);
                                            return value;
                                        });
                                    atwMelCloudService.getCharacteristic(Characteristic.TargetHeaterCoolerState)
                                        .setProps({
                                            minValue: this.operationModesSetPropsMinValue[i],
                                            maxValue: this.operationModesSetPropsMaxValue[i],
                                            validValues: this.operationModesSetPropsValidValues[i]
                                        })
                                        .onGet(async () => {
                                            const value = this.targetOperationModes[i];
                                            return value;
                                        })
                                        .onSet(async (value) => {
                                            try {
                                                let operationModeText = '';
                                                switch (i) {
                                                    case 0: //Heat Pump - ON, HEAT, COOL
                                                        switch (value) {
                                                            case 0: //AUTO
                                                                deviceState.Power = true;
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power;
                                                                break;
                                                            case 1: //HEAT
                                                                deviceState.Power = true;
                                                                deviceState.UnitStatus = 0;
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
                                                                break;
                                                            case 2: //COOL
                                                                deviceState.Power = true;
                                                                deviceState.UnitStatus = 1;
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
                                                                break;
                                                        };
                                                        operationModeText = !this.power ? CONSTANS.HeatPump.System[0] : CONSTANS.HeatPump.System[deviceState.UnitStatus];
                                                        break;
                                                    case 1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
                                                        switch (value) {
                                                            case 0: //AUTO - HEAT CURVE
                                                                deviceState.OperationModeZone1 = 2;
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
                                                                break;
                                                            case 1: //HEAT - HEAT THERMOSTAT / COOL THERMOSTAT
                                                                deviceState.OperationModeZone1 = [0, 3][this.unitStatus];
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
                                                                break;
                                                            case 2: //COOL - HEAT FLOOW / COOL FLOW
                                                                deviceState.OperationModeZone1 = [1, 4][this.unitStatus];
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
                                                                break;
                                                        };
                                                        operationModeText = CONSTANS.HeatPump.ZoneOperation[deviceState.OperationModeZone1];
                                                        break;
                                                    case atwCaseHotWater: //Hot Water - AUTO, HEAT NOW
                                                        switch (value) {
                                                            case 0: //AUTO
                                                                deviceState.ForcedHotWaterMode = false;
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                                break;
                                                            case 1: //HEAT
                                                                deviceState.ForcedHotWaterMode = true;
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                                break;
                                                            case 2: //COOL
                                                                deviceState.ForcedHotWaterMode = false;
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                                break
                                                        };
                                                        operationModeText = deviceState.OperationMode === 1 ? CONSTANS.HeatPump.ForceDhw[1] : CONSTANS.HeatPump.ForceDhw[deviceState.ForcedHotWaterMode ? 1 : 0];
                                                        break;
                                                    case atwCaseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
                                                        switch (value) {
                                                            case 0: //AUTO
                                                                deviceState.OperationModeZone2 = 2;
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
                                                                break;
                                                            case 1: //HEAT - HEAT THERMOSTAT / COOL THERMOSTAT
                                                                deviceState.OperationModeZone2 = [0, 3][this.unitStatus];
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
                                                                break;
                                                            case 2: //COOL - HEAT FLOOW / COOL FLOW
                                                                deviceState.OperationModeZone2 = [1, 4][this.unitStatus];
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
                                                                break;
                                                        };
                                                        operationModeText = CONSTANS.HeatPump.ZoneOperation[deviceState.OperationModeZone2];
                                                        break;
                                                };

                                                await this.melCloudAtw.send(deviceState);
                                                const info = this.disableLogInfo ? false : this.emit('message', `${zoneName}, Set operation mode: ${operationModeText}`);
                                            } catch (error) {
                                                this.emit('error', `${zoneName}, Set operation mode error: ${error}`);
                                            };
                                        });
                                    atwMelCloudService.getCharacteristic(Characteristic.CurrentTemperature)
                                        .setProps({
                                            minValue: -35,
                                            maxValue: 150,
                                            minStep: 0.5
                                        })
                                        .onGet(async () => {
                                            const value = this.roomTemperatures[i];
                                            const info = this.disableLogInfo ? false : this.emit('message', `${zoneName}, ${i === 0 ? 'Outdoor temperature:' : 'Temperature:'} ${value}${temperatureUnit}`);
                                            return value;
                                        });
                                    //device can heat/cool or only heat
                                    if (this.atwHeatCoolModes === 0 || this.atwHeatCoolModes === 1) {
                                        atwMelCloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
                                            .setProps({
                                                minValue: [0, 32][this.useFahrenheit],
                                                maxValue: this.temperaturesSetPropsMaxValue[i],
                                                minStep: this.atwTemperatureIncrement
                                            })
                                            .onGet(async () => {
                                                const value = this.setTemperatures[i];
                                                const info = this.disableLogInfo || i === 0 ? false : this.emit('message', `${zoneName}, Heating threshold temperature: ${value}${temperatureUnit}`);
                                                return value;
                                            })
                                            .onSet(async (value) => {
                                                try {
                                                    switch (i) {
                                                        case 0: //Heat Pump
                                                            //deviceState.SetTemperatureZone1 = value;
                                                            //deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                            break;
                                                        case 1: //Zone 1
                                                            deviceState.SetTemperatureZone1 = value;
                                                            deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                            break;
                                                        case atwCaseHotWater: //Hot Water
                                                            deviceState.SetTankWaterTemperature = value;
                                                            deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTankWaterTemperature;
                                                            break;
                                                        case atwCaseZone2: //Zone 2
                                                            deviceState.SetTemperatureZone2 = value;
                                                            deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone2;
                                                            break;
                                                    };

                                                    const set = i > 0 ? await this.melCloudAtw.send(deviceState) : false;
                                                    const info = this.disableLogInfo || i === 0 ? false : this.emit('message', `${zoneName}, Set heating threshold temperature: ${value}${temperatureUnit}`);
                                                } catch (error) {
                                                    this.emit('error', `${zoneName}, Set heating threshold temperature error: ${error}`);
                                                };
                                            });
                                    };
                                    //only for heat/cool, only cool and not for hot water tank
                                    if ((this.atwHeatCoolModes === 0 || this.atwHeatCoolModes === 2) && i !== atwCaseHotWater) {
                                        atwMelCloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
                                            .setProps({
                                                minValue: [10, 50][this.useFahrenheit],
                                                maxValue: this.temperaturesSetPropsMaxValue[i],
                                                minStep: this.atwTemperatureIncrement
                                            })
                                            .onGet(async () => {
                                                const value = this.setTemperatures[i];
                                                const info = this.disableLogInfo || i === 0 ? false : this.emit('message', `${zoneName}, Cooling threshold temperature: ${value}${temperatureUnit}`);
                                                return value;
                                            })
                                            .onSet(async (value) => {
                                                try {
                                                    switch (i) {
                                                        case 0: //Heat Pump
                                                            //deviceState.SetTemperatureZone1 = value;
                                                            //deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                            break;
                                                        case 1: //Zone 1
                                                            deviceState.SetTemperatureZone1 = value;
                                                            deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                            break;
                                                        case atwCaseHotWater: //Hot Water
                                                            deviceState.SetTankWaterTemperature = value;
                                                            deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTankWaterTemperature;
                                                            break;
                                                        case atwCaseZone2: //Zone 2
                                                            deviceState.SetTemperatureZone2 = value;
                                                            deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone2;
                                                            break;
                                                    };

                                                    const set = i > 0 ? await this.melCloudAtw.send(deviceState) : false;
                                                    const info = this.disableLogInfo || i === 0 ? false : this.emit('message', `${zoneName}, Set cooling threshold temperature: ${value}${temperatureUnit}`);
                                                } catch (error) {
                                                    this.emit('error', `${zoneName}, Set cooling threshold temperature error: ${error}`);
                                                };
                                            });
                                    };
                                    atwMelCloudService.getCharacteristic(Characteristic.LockPhysicalControls)
                                        .onGet(async () => {
                                            const value = this.lockPhysicalsControls[i];
                                            const info = this.disableLogInfo ? false : this.emit('message', `${zoneName}, Lock physical controls: ${value ? 'LOCKED' : 'UNLOCKED'}`);
                                            return value;
                                        })
                                        .onSet(async (value) => {
                                            try {
                                                value = value ? true : false;
                                                switch (i) {
                                                    case 0: //Heat Pump
                                                        deviceState.ProhibitZone1 = value;
                                                        deviceState.ProhibitHotWater = value;
                                                        deviceState.ProhibitZone2 = value;
                                                        CONSTANS.HeatPump.EffectiveFlags.ProhibitHeatingZone1 + CONSTANS.HeatPump.EffectiveFlags.ProhibitHotWater + CONSTANS.HeatPump.EffectiveFlags.ProhibitHeatingZone2;
                                                        break;
                                                    case 1: //Zone 1
                                                        deviceState.ProhibitZone1 = value;
                                                        CONSTANS.HeatPump.EffectiveFlags.ProhibitHeatingZone1;
                                                        break;
                                                    case atwCaseHotWater: //Hot Water
                                                        deviceState.ProhibitHotWater = value;
                                                        CONSTANS.HeatPump.EffectiveFlags.ProhibitHotWater;
                                                        break;
                                                    case atwCaseZone2: //Zone 2
                                                        deviceState.ProhibitZone2 = value;
                                                        CONSTANS.HeatPump.EffectiveFlags.ProhibitHeatingZone2;
                                                        break;
                                                };

                                                await this.melCloudAtw.send(deviceState);
                                                const info = this.disableLogInfo ? false : this.emit('message', `${zoneName}, Set lock physical controls: ${value ? 'LOCK' : 'UNLOCK'}`);
                                            } catch (error) {
                                                this.emit('error', `${zoneName}, Set lock physical controls error: ${error}`);
                                            };
                                        });
                                    atwMelCloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
                                        .onGet(async () => {
                                            const value = this.useFahrenheit;
                                            const info = this.disableLogInfo ? false : this.emit('message', `Temperature display unit: ${temperatureUnit}`);
                                            return value;
                                        })
                                        .onSet(async (value) => {
                                            try {
                                                accountInfo.UseFahrenheit = value ? true : false;
                                                await this.melCloud.send(accountInfo);
                                                this.useFahrenheit = accountInfo.UseFahrenheit;
                                                const info = this.disableLogInfo ? false : this.emit('message', `Set temperature display unit: ${CONSTANS.TemperatureDisplayUnits[value]}`);
                                            } catch (error) {
                                                this.emit('error', `Set temperature display unit error: ${error}`);
                                            };
                                        });
                                    this.atwMelCloudServices.push(atwMelCloudService);
                                    accessory.addService(atwMelCloudService);
                                    break;
                                case 1: //Thermostat
                                    const atwMelCloudServiceT = new Service.Thermostat(atwServiceName, `Thermostat ${deviceId} ${i}`);
                                    atwMelCloudServiceT.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
                                        .onGet(async () => {
                                            let operationModeText = '';
                                            switch (i) {
                                                case 0: //Heat Pump - IDLE, HOT WATER, HEATING ZONES, COOLING, "FREZE STAT, LEGIONELLA, HEATING ECO, MODE 1, MODE 2, MODE 3, HEATING UP
                                                    operationModeText = CONSTANS.HeatPump.System[deviceState.UnitStatus];
                                                    break;
                                                case 1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
                                                    operationModeText = CONSTANS.HeatPump.ZoneOperation[deviceState.OperationModeZone1];
                                                    break;
                                                case atwCaseHotWater: //Hot Water - AUTO, HEAT NOW
                                                    operationModeText = deviceState.OperationMode === 1 ? CONSTANS.HeatPump.ForceDhw[1] : CONSTANS.HeatPump.ForceDhw[deviceState.ForcedHotWaterMode ? 1 : 0];
                                                    break;
                                                case atwCaseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
                                                    operationModeText = CONSTANS.HeatPump.ZoneOperation[deviceState.OperationModeZone2];
                                                    break;
                                            };

                                            const value = this.currentOperationModes[i];
                                            operationModeText = !this.power ? CONSTANS.HeatPump.System[0] : operationModeText;
                                            const info = this.disableLogInfo ? false : this.emit('message', `${zoneName}, Operation mode: ${operationModeText}`);
                                            return value;
                                        });
                                    atwMelCloudServiceT.getCharacteristic(Characteristic.TargetHeatingCoolingState)
                                        .setProps({
                                            minValue: this.operationModesSetPropsMinValue[i],
                                            maxValue: this.operationModesSetPropsMaxValue[i],
                                            validValues: this.operationModesSetPropsValidValues[i]
                                        })
                                        .onGet(async () => {
                                            const value = this.targetOperationModes[i];
                                            return value;
                                        })
                                        .onSet(async (value) => {
                                            try {
                                                let operationModeText = '';
                                                switch (i) {
                                                    case 0: //Heat Pump - HEAT, COOL
                                                        switch (value) {
                                                            case 0: //OFF
                                                                deviceState.Power = false;
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power;
                                                                break;
                                                            case 1: //HEAT
                                                                deviceState.Power = true;
                                                                deviceState.UnitStatus = 0;
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
                                                                break;
                                                            case 2: //COOL
                                                                deviceState.Power = true;
                                                                deviceState.UnitStatus = 1;
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
                                                                break;
                                                            case 3: //AUTO
                                                                deviceState.Power = true;
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power;
                                                                break;
                                                        };
                                                        operationModeText = !this.power ? CONSTANS.HeatPump.System[0] : CONSTANS.HeatPump.System[deviceState.UnitStatus];
                                                        break;
                                                    case 1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
                                                        switch (value) {
                                                            case 0: //OFF - HEAT CURVE
                                                                deviceState.OperationModeZone1 = 2;
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
                                                                break;
                                                            case 1: //HEAT - HEAT THERMOSTAT / COOL THERMOSTAT
                                                                deviceState.OperationModeZone1 = [0, 3][this.unitStatus];
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
                                                                break;
                                                            case 2: //COOL - HEAT FLOOW / COOL FLOW
                                                                deviceState.OperationModeZone1 = [1, 4][this.unitStatus];
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
                                                                break;
                                                            case 3: //AUTO - HEAT CURVE
                                                                deviceState.OperationModeZone1 = 2;
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
                                                                break;
                                                        };
                                                        operationModeText = CONSTANS.HeatPump.ZoneOperation[deviceState.OperationModeZone1];
                                                        break;
                                                    case atwCaseHotWater: //Hot Water - AUTO, HEAT NOW
                                                        switch (value) {
                                                            case 0: //OFF
                                                                deviceState.ForcedHotWaterMode = false;
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                                break;
                                                            case 1: //HEAT
                                                                deviceState.ForcedHotWaterMode = true;
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                                break;
                                                            case 2: //COOL
                                                                deviceState.ForcedHotWaterMode = false;
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                                break;
                                                            case 3: //AUTO
                                                                deviceState.ForcedHotWaterMode = false;
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                                break;
                                                        };
                                                        operationModeText = deviceState.OperationMode === 1 ? CONSTANS.HeatPump.ForceDhw[1] : CONSTANS.HeatPump.ForceDhw[deviceState.ForcedHotWaterMode ? 1 : 0];
                                                        break;
                                                    case atwCaseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
                                                        switch (value) {
                                                            case 0: //OFF - HEAT CURVE
                                                                deviceState.OperationModeZone2 = 2;
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
                                                                break;
                                                            case 1: //HEAT - HEAT THERMOSTAT / COOL THERMOSTAT
                                                                deviceState.OperationModeZone2 = [0, 3][this.unitStatus];
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
                                                                break;
                                                            case 2: //COOL - HEAT FLOOW / COOL FLOW
                                                                deviceState.OperationModeZone2 = [1, 4][this.unitStatus];
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
                                                                break;
                                                            case 3: //AUTO - HEAT CURVE
                                                                deviceState.OperationModeZone2 = 2;
                                                                deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
                                                                break;
                                                        };
                                                        operationModeText = CONSTANS.HeatPump.ZoneOperation[deviceState.OperationModeZone2];
                                                        break;
                                                };

                                                await this.melCloudAtw.send(deviceState);
                                                const info = this.disableLogInfo ? false : this.emit('message', `${zoneName}, Set operation mode: ${operationModeText}`);
                                            } catch (error) {
                                                this.emit('error', `${zoneName}, Set operation mode error: ${error}`);
                                            };
                                        });
                                    atwMelCloudServiceT.getCharacteristic(Characteristic.CurrentTemperature)
                                        .onGet(async () => {
                                            const value = this.roomTemperatures[i];
                                            const info = this.disableLogInfo ? false : this.emit('message', `${zoneName}, ${i === 0 ? 'Outdoor temperature:' : 'Temperature:'} ${value}${temperatureUnit}`);
                                            return value;
                                        });
                                    atwMelCloudServiceT.getCharacteristic(Characteristic.TargetTemperature)
                                        .setProps({
                                            minValue: [0, 32][this.useFahrenheit],
                                            maxValue: this.temperaturesSetPropsMaxValue[i],
                                            minStep: this.atwTemperatureIncrement
                                        })
                                        .onGet(async () => {
                                            const value = this.setTemperatures[i];
                                            const info = this.disableLogInfo || i === 0 ? false : this.emit('message', `${zoneName}, Target temperature: ${value}${temperatureUnit}`);
                                            return value;
                                        })
                                        .onSet(async (value) => {
                                            try {
                                                switch (i) {
                                                    case 0: //Heat Pump
                                                        //deviceState.SetTemperatureZone1 = value;
                                                        //deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                        break;
                                                    case 1: //Zone 1
                                                        deviceState.SetTemperatureZone1 = value;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                        break;
                                                    case atwCaseHotWater: //Hot Water
                                                        deviceState.SetTankWaterTemperature = value;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTankWaterTemperature;
                                                        break;
                                                    case atwCaseZone2: //Zone 2
                                                        deviceState.SetTemperatureZone2 = value;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone2;
                                                        break;
                                                };

                                                const set = i > 0 ? await this.melCloudAtw.send(deviceState) : false;
                                                const info = this.disableLogInfo || i === 0 ? false : this.emit('message', `${zoneName}, Set temperature: ${value}${temperatureUnit}`);
                                            } catch (error) {
                                                this.emit('error', `${zoneName}, Set temperature error: ${error}`);
                                            };
                                        });
                                    atwMelCloudServiceT.getCharacteristic(Characteristic.TemperatureDisplayUnits)
                                        .onGet(async () => {
                                            const value = this.useFahrenheit;
                                            const info = this.disableLogInfo ? false : this.emit('message', `Temperature display unit: ${temperatureUnit}`);
                                            return value;
                                        })
                                        .onSet(async (value) => {
                                            try {
                                                accountInfo.UseFahrenheit = value ? true : false;
                                                await this.melCloud.send(accountInfo);
                                                this.useFahrenheit = accountInfo.UseFahrenheit;
                                                const info = this.disableLogInfo ? false : this.emit('message', `Set temperature display unit: ${CONSTANS.TemperatureDisplayUnits[value]}`);
                                            } catch (error) {
                                                this.emit('error', `Set temperature display unit error: ${error}`);
                                            };
                                        });
                                    this.atwMelCloudServices.push(atwMelCloudServiceT);
                                    accessory.addService(atwMelCloudServiceT);
                                    break;
                            };

                            //temperature sensor services
                            if (atwTemperatureSensor) {
                                const debug = this.enableDebugMode ? this.emit('debug', `Prepare temperature sensor service`) : false;
                                this.atwTemperatureSensorServices = new Service.TemperatureSensor(`${atwServiceName}`, `Temperature Sensor ${deviceId} ${i}`);
                                this.atwTemperatureSensorServices.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                this.atwTemperatureSensorServices.setCharacteristic(Characteristic.ConfiguredName, `${atwServiceName}`);
                                this.atwTemperatureSensorServices.getCharacteristic(Characteristic.CurrentTemperature)
                                    .onGet(async () => {
                                        const state = this.roomTemperatures[i];
                                        return state;
                                    })
                                accessory.addService(this.atwTemperatureSensorServices);
                            };
                        };

                        //buttons services
                        if (atwButtonsConfiguredCount > 0) {
                            const debug = this.enableDebugMode ? this.emit('debug', `Prepare buttons service`) : false;
                            this.atwButtonsServices = [];

                            for (let i = 0; i < atwButtonsConfiguredCount; i++) {
                                const button = atwButtonsConfigured[i];

                                //get button mode
                                const buttonMode = button.mode;

                                //get button display type
                                const buttonDisplayType = button.displayType;

                                //get button name
                                const buttonName = button.name || ['', `Button ${i}`, `Button ${i}`, `Sensor ${i}`, `Sensor ${i}`, `Sensor ${i}`][buttonDisplayType];

                                //get button name prefix
                                const buttonNamePrefix = button.namePrefix ?? false;

                                const buttonServiceName = buttonNamePrefix ? `${accessoryName} ${buttonName}` : buttonName;
                                const buttonServiceType = ['', Service.Outlet, Service.Switch, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][buttonDisplayType];
                                const characteristicType = ['', Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][buttonDisplayType];
                                const buttonService = new buttonServiceType(buttonServiceName, `Button ${deviceId} ${i}`);
                                buttonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                buttonService.setCharacteristic(Characteristic.ConfiguredName, buttonServiceName);
                                buttonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                buttonService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${buttonName}`);
                                buttonService.getCharacteristic(characteristicType)
                                    .onGet(async () => {
                                        const state = button.buttonState;
                                        return state;
                                    })
                                    .onSet(async (state) => {
                                        if (buttonDisplayType <= 1) {
                                            try {
                                                switch (buttonMode) {
                                                    case 0: //POWER ON,OFF
                                                        deviceState.Power = state;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power;
                                                        break;
                                                    case 1: //HEAT PUMP HEAT
                                                        deviceState.Power = true;
                                                        deviceState.UnitStatus = 0;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
                                                        break;
                                                    case 2: //COOL
                                                        deviceState.Power = true;
                                                        deviceState.UnitStatus = 1;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
                                                        break;
                                                    case 3: //HOLIDAY
                                                        deviceState.HolidayMode = state;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.HolidayMode;
                                                        break;
                                                    case 10: //ALL ZONES PHYSICAL LOCK CONTROL
                                                        deviceState.ProhibitZone1 = state;
                                                        deviceState.ProhibitHotWater = state;
                                                        deviceState.ProhibitZone2 = state;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.ProhibitHeatingZone1 + CONSTANS.HeatPump.EffectiveFlags.ProhibitHotWater + CONSTANS.HeatPump.EffectiveFlags.ProhibitHeatingZone2;
                                                        break;
                                                    case 20: //ZONE 1 HEAT THERMOSTAT
                                                        deviceState.Power = true;
                                                        deviceState.OperationModeZone1 = 0;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                    case 21: //HEAT FLOW
                                                        deviceState.Power = true;
                                                        deviceState.OperationModeZone1 = 1;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                    case 22: //HEAT CURVE
                                                        deviceState.Power = true;
                                                        deviceState.OperationModeZone1 = 2;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                    case 23: //COOL THERMOSTAT
                                                        deviceState.Power = true;
                                                        deviceState.OperationModeZone1 = 3;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                    case 24: //COOL FLOW
                                                        deviceState.Power = true;
                                                        deviceState.OperationModeZone1 = 4;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                    case 25: //FLOOR DRYUP
                                                        deviceState.Power = true;
                                                        deviceState.OperationModeZone1 = 5;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                    case 30: //PHYSICAL LOCK CONTROL
                                                        deviceState.ProhibitZone1 = state;
                                                        CONSTANS.HeatPump.EffectiveFlags.ProhibitHeatingZone1;
                                                        break;
                                                    case 40: //HOT WATER NORMAL/FORCE HOT WATER
                                                        deviceState.Power = true;
                                                        deviceState.ForcedHotWaterMode = state;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                        break;
                                                    case 41: //NORMAL/ECO
                                                        deviceState.Power = true;
                                                        deviceState.EcoHotWater = state;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.EcoHotWater;
                                                        break;
                                                    case 50: //PHYSICAL LOCK CONTROL
                                                        deviceState.ProhibitHotWater = state;
                                                        CONSTANS.HeatPump.EffectiveFlags.ProhibitHotWater;
                                                        break;
                                                    case 60: //ZONE 2 HEAT THERMOSTAT
                                                        deviceState.Power = true;
                                                        deviceState.OperationModeZone2 = 0;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                    case 61: // HEAT FLOW
                                                        deviceState.Power = true;
                                                        deviceState.OperationModeZone2 = 1;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                    case 62: //HEAT CURVE
                                                        deviceState.Power = true;
                                                        deviceState.OperationModeZone2 = 2;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                    case 63: //COOL THERMOSTAT
                                                        deviceState.Power = true;
                                                        deviceState.OperationModeZone2 = 3;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                    case 64: //COOL FLOW
                                                        deviceState.Power = true;
                                                        deviceState.OperationModeZone2 = 4;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                    case 65: //FLOOR DRYUP
                                                        deviceState.Power = true;
                                                        deviceState.OperationModeZone2 = 5;
                                                        deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                    case 70: //PHYSICAL LOCK CONTROL
                                                        deviceState.ProhibitZone2 = state;
                                                        CONSTANS.HeatPump.EffectiveFlags.ProhibitHeatingZone2;
                                                        break;
                                                    default:
                                                        deviceState = deviceState;
                                                        break;
                                                };

                                                await this.melCloudAtw.send(deviceState);
                                                const info = this.disableLogInfo ? false : this.emit('message', `Set: ${buttonName}`);
                                            } catch (error) {
                                                this.emit('error', `Set button error: ${error}`);
                                            };
                                        };
                                    });
                                this.atwButtonsServices.push(buttonService);
                                accessory.addService(buttonService)
                            };
                        };

                        //presets services
                        if (atwPresetsCount > 0) {
                            const debug = this.enableDebugMode ? this.emit('debug', `Prepare presets service`) : false;
                            this.atwPresetsServices = [];
                            const atwPreviousPresets = [];

                            for (let i = 0; i < atwPresetsCount; i++) {
                                const preset = atwPresets[i];
                                const presetName = preset.NumberDescription;

                                const presetService = new Service.Outlet(`${accessoryName} ${presetName}`, `Preset ${deviceId} ${i}`);
                                presetService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                presetService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${presetName}`);
                                presetService.getCharacteristic(Characteristic.On)
                                    .onGet(async () => {
                                        const state = this.atwPresetsStates[i];
                                        return state;
                                    })
                                    .onSet(async (state) => {
                                        try {
                                            switch (state) {
                                                case true:
                                                    atwPreviousPresets[i] = deviceState;
                                                    deviceState.Power = preset.Power;
                                                    deviceState.EcoHotWater = preset.EcoHotWater;
                                                    deviceState.OperationModeZone1 = preset.OperationModeZone1;
                                                    deviceState.OperationModeZone2 = preset.OperationModeZone2;
                                                    deviceState.SetTankWaterTemperature = preset.SetTankWaterTemperature;
                                                    deviceState.SetTemperatureZone1 = preset.SetTemperatureZone1;
                                                    deviceState.SetTemperatureZone2 = preset.SetTemperatureZone2;
                                                    deviceState.ForcedHotWaterMode = preset.ForcedHotWaterMode;
                                                    deviceState.SetHeatFlowTemperatureZone1 = preset.SetHeatFlowTemperatureZone1;
                                                    deviceState.SetHeatFlowTemperatureZone2 = preset.SetHeatFlowTemperatureZone2;
                                                    deviceState.SetCoolFlowTemperatureZone1 = preset.SetCoolFlowTemperatureZone1;
                                                    deviceState.SetCoolFlowTemperatureZone2 = preset.SetCoolFlowTemperatureZone2;
                                                    deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power;
                                                    break;
                                                case false:
                                                    deviceState = atwPreviousPresets[i];
                                                    break;
                                            };

                                            await this.melCloudAtw.send(deviceState);
                                            const info = this.disableLogInfo ? false : this.emit('message', `Set: ${presetName}`);
                                        } catch (error) {
                                            this.emit('error', `Set preset error: ${error}`);
                                        };
                                    });
                                atwPreviousPresets.push(deviceState);
                                this.atwPresetsServices.push(presetService);
                                accessory.addService(presetService);
                            };
                        };

                        resolve(accessory);
                        break;
                    case 3: //energy recovery ventilation
                        const debug3 = this.enableDebugMode ? this.emit('debug', `Prepare erv service`) : false;
                        const ervDisplayMode = this.ervDisplayMode;
                        const ervTemperatureSensor = this.ervTemperatureSensor;
                        const ervButtonsConfigured = this.ervButtonsConfigured;
                        const ervButtonsConfiguredCount = this.ervButtonsConfiguredCount;
                        const ervPresets = this.ervPresets;
                        const ervPresetsCount = this.ervPresetsCount;
                        const ervHasCoolOperationMode = this.ervHasCoolOperationMode;
                        const ervHasHeatOperationMode = this.ervHasHeatOperationMode;
                        const ervHasCO2Sensor = this.ervHasCO2Sensor;
                        const ervHasPM25Sensor = this.ervHasPM25Sensor;
                        const ervHasAutoVentilationMode = this.ervHasAutoVentilationMode;
                        const ervHasBypassVentilationMode = this.ervHasBypassVentilationMode;
                        const ervServiceName = `${deviceTypeText} ${accessoryName}`;

                        this.ervMelCloudServices = [];
                        switch (ervDisplayMode) {
                            case 0: //Heater Cooler
                                const ervMelCloudService = accessory.addService(Service.HeaterCooler, ervServiceName, `HeaterCooler ${deviceId}`);
                                ervMelCloudService.getCharacteristic(Characteristic.Active)
                                    .onGet(async () => {
                                        const state = this.power;
                                        const info = this.disableLogInfo ? false : this.emit('message', `Power: ${state ? 'ON' : 'OFF'}`);
                                        return state;
                                    })
                                    .onSet(async (state) => {
                                        try {
                                            deviceState.Power = state;
                                            deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power;
                                            await this.melCloudErv.send(deviceState);
                                            const info = this.disableLogInfo ? false : this.emit('message', `Set power: ${state ? 'ON' : 'OFF'}`);
                                        } catch (error) {
                                            this.emit('error', `Set power error: ${error}`);
                                            ervMelCloudService.updateCharacteristic(Characteristic.Active, false)
                                        };
                                    });
                                ervMelCloudService.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
                                    .onGet(async () => {
                                        const value = this.currentOperationMode;
                                        const operationModeText = !this.power ? CONSTANS.Ventilation.System[0] : CONSTANS.Ventilation.OperationMode[deviceState.VentilationMode];
                                        const info = this.disableLogInfo ? false : this.emit('message', `Operation mode: ${operationModeText}`);
                                        return value;
                                    });
                                ervMelCloudService.getCharacteristic(Characteristic.TargetHeaterCoolerState)
                                    .setProps({
                                        minValue: this.operationModeSetPropsMinValue,
                                        maxValue: this.operationModeSetPropsMaxValue,
                                        validValues: this.operationModeSetPropsValidValues
                                    })
                                    .onGet(async () => {
                                        const value = this.targetOperationMode; //LOSSNAY, BYPASS, AUTO
                                        return value;
                                    })
                                    .onSet(async (value) => {
                                        try {
                                            switch (value) {
                                                case 0: //AUTO - AUTO
                                                    deviceState.Power = true;
                                                    deviceState.VentilationMode = ervHasAutoVentilationMode ? 2 : 0;
                                                    deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
                                                    break;
                                                case 1: //HEAT - LOSSNAY
                                                    deviceState.Power = true;
                                                    deviceState.VentilationMode = 0;
                                                    deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
                                                    break;
                                                case 2: //COOL - BYPASS
                                                    deviceState.Power = true;
                                                    deviceState.VentilationMode = ervHasBypassVentilationMode ? 1 : 0;
                                                    deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
                                                    break;
                                            };

                                            await this.melCloudErv.send(deviceState);
                                            const operationModeText = CONSTANS.Ventilation.VentilationMode[deviceState.VentilationMode];
                                            const info = this.disableLogInfo ? false : this.emit('message', `Set operation mode: ${operationModeText}`);
                                        } catch (error) {
                                            this.emit('error', `Set operation mode error: ${error}`);
                                        };
                                    });
                                ervMelCloudService.getCharacteristic(Characteristic.RotationSpeed)
                                    .setProps({
                                        minValue: 0,
                                        maxValue: this.fanSpeedSetPropsMaxValue,
                                        minStep: 1
                                    })
                                    .onGet(async () => {
                                        const value = this.fanSpeed; //STOP, 1, 2, 3, 4, OFF
                                        const info = this.disableLogInfo ? false : this.emit('message', `Fan speed mode: ${CONSTANS.Ventilation.FanSpeed[this.setFanSpeed]}`);
                                        return value;
                                    })
                                    .onSet(async (value) => {
                                        try {
                                            let fanSpeed = 0; //AUTO, 1, 2, 3, 4
                                            let fanSpeedModeText = 0; //AUTO, 1, 2, 3, 4, OFF
                                            switch (ataNumberOfFanSpeeds) {
                                                case 2: //Fan speed mode 2
                                                    fanSpeed = ataHasAutomaticFanSpeed ? [0, 1, 2, 0][value] : [1, 1, 2][value];
                                                    fanSpeedModeText = ataHasAutomaticFanSpeed ? [5, 1, 2, 0][value] : [5, 1, 2][value];
                                                    break;
                                                case 3: //Fan speed mode 3
                                                    fanSpeed = ataHasAutomaticFanSpeed ? [0, 1, 2, 3, 0][value] : [1, 1, 2, 3][value];
                                                    fanSpeedModeText = ataHasAutomaticFanSpeed ? [5, 1, 2, 3, 0][value] : [5, 1, 2, 3][value];
                                                    break;
                                                case 4: //Fan speed mode 4
                                                    fanSpeed = ataHasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 0][value] : [1, 1, 2, 3, 4][value];
                                                    fanSpeedModeText = ataHasAutomaticFanSpeed ? [5, 1, 2, 3, 4, 0][value] : [5, 1, 2, 3, 4][value];
                                                    break;
                                            };

                                            deviceState.SetFanSpeed = fanSpeed;
                                            deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
                                            await this.melCloudErv.send(deviceState);
                                            const info = this.disableLogInfo ? false : this.emit('message', `Set fan speed mode: ${CONSTANS.Ventilation.FanSpeed[fanSpeedModeText]}`);
                                        } catch (error) {
                                            this.emit('error', `Set fan speed mode error: ${error}`);
                                        };
                                    });
                                ervMelCloudService.getCharacteristic(Characteristic.CurrentTemperature)
                                    .onGet(async () => {
                                        const value = this.roomTemperature;
                                        const info = this.disableLogInfo ? false : this.emit('message', `Room temperature: ${value}${temperatureUnit}`);
                                        return value;
                                    });
                                //device can heat
                                if (ervHasHeatOperationMode) {
                                    ervMelCloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
                                        .setProps({
                                            minValue: [0, 32][this.useFahrenheit],
                                            maxValue: [31, 88][this.useFahrenheit],
                                            minStep: this.ervTemperatureIncrement
                                        })
                                        .onGet(async () => {
                                            const value = this.setTemperature;
                                            const info = this.disableLogInfo ? false : this.emit('message', `Heating threshold temperature: ${value}${temperatureUnit}`);
                                            return value;
                                        })
                                        .onSet(async (value) => {
                                            try {
                                                deviceState.SetTemperature = value;
                                                deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.SetTemperature;
                                                await this.melCloudErv.send(deviceState);
                                                const info = this.disableLogInfo ? false : this.emit('message', `Set heating threshold temperature: ${value}${temperatureUnit}`);
                                            } catch (error) {
                                                this.emit('error', `Set heating threshold temperature error: ${error}`);
                                            };
                                        });
                                };
                                //device can cool
                                if (ervHasCoolOperationMode) {
                                    ervMelCloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
                                        .setProps({
                                            minValue: [10, 50][this.useFahrenheit],
                                            maxValue: [31, 88][this.useFahrenheit],
                                            minStep: this.ervTemperatureIncrement
                                        })
                                        .onGet(async () => {
                                            const value = this.setTemperature;
                                            const info = this.disableLogInfo ? false : this.emit('message', `Cooling threshold temperature: ${value}${temperatureUnit}`);
                                            return value;
                                        })
                                        .onSet(async (value) => {
                                            try {
                                                deviceState.SetTemperature = value;
                                                deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.SetTemperature;
                                                await this.melCloudErv.send(deviceState);
                                                const info = this.disableLogInfo ? false : this.emit('message', `Set cooling threshold temperature: ${value}${temperatureUnit}`);
                                            } catch (error) {
                                                this.emit('error', `Set cooling threshold temperature error: ${error}`);
                                            };
                                        });
                                };
                                //ervMelCloudService.getCharacteristic(Characteristic.LockPhysicalControls)
                                //    .onGet(async () => {
                                //        const value = this.lockPhysicalControls;
                                //        const info = this.disableLogInfo ? false : this.emit('message', `Lock physical controls: ${value ? 'LOCKED' : 'UNLOCKED'}`);
                                //        return value;
                                //    })
                                //    .onSet(async (value) => {
                                //       try {
                                //         value = value ? true : false;
                                //         deviceState = deviceState;
                                //         deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Prohibit;
                                //         await this.melCloudErv.send(deviceState);
                                //         const info = this.disableLogInfo ? false : this.emit('message', `Set locl physical controls: ${value ? 'LOCK' : 'UNLOCK'}`);
                                //     } catch (error) {
                                //          this.emit('error', `Set lock physical controls error: ${error}`);
                                //      };
                                //   });
                                ervMelCloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
                                    .onGet(async () => {
                                        const value = this.useFahrenheit;
                                        const info = this.disableLogInfo ? false : this.emit('message', `Temperature display unit: ${temperatureUnit}`);
                                        return value;
                                    })
                                    .onSet(async (value) => {
                                        try {
                                            accountInfo.UseFahrenheit = value ? true : false;
                                            await this.melCloud.send(accountInfo);
                                            this.useFahrenheit = accountInfo.UseFahrenheit;
                                            const info = this.disableLogInfo ? false : this.emit('message', `Set temperature display unit: ${CONSTANS.TemperatureDisplayUnits[value]}`);
                                        } catch (error) {
                                            this.emit('error', `Set temperature display unit error: ${error}`);
                                        };
                                    });
                                this.ervMelCloudServices.push(ervMelCloudService);
                                break;
                            case 1: //Thermostat
                                const ervMelCloudServiceT = accessory.addService(Service.Thermostat, ervServiceName, `Thermostat ${deviceId}`);
                                ervMelCloudServiceT.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
                                    .onGet(async () => {
                                        const value = this.currentOperationMode;
                                        const operationModeText = !this.power ? CONSTANS.Ventilation.System[0] : CONSTANS.Ventilation.OperationMode[deviceState.OperationMode];
                                        const info = this.disableLogInfo ? false : this.emit('message', `Operation mode: ${operationModeText}`);
                                        return value;
                                    });
                                ervMelCloudServiceT.getCharacteristic(Characteristic.TargetHeatingCoolingState)
                                    .setProps({
                                        minValue: this.operationModeSetPropsMinValue,
                                        maxValue: this.operationModeSetPropsMaxValue,
                                        validValues: this.operationModeSetPropsValidValues
                                    })
                                    .onGet(async () => {
                                        const value = this.targetOperationMode; //LOSSNAY, BYPASS, AUTO
                                        return value;
                                    })
                                    .onSet(async (value) => {
                                        try {
                                            switch (value) {
                                                case 0: //OFF - POWER OFF
                                                    deviceState.Power = false;
                                                    deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power;
                                                    break;
                                                case 1: //HEAT - LOSSNAY
                                                    deviceState.Power = true;
                                                    deviceState.VentilationMode = 0;
                                                    deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
                                                    break;
                                                case 2: //COOL - BYPASS
                                                    deviceState.Power = true;
                                                    deviceState.VentilationMode = ervHasBypassVentilationMode ? 1 : 0;
                                                    deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
                                                    break;
                                                case 3: //AUTO - AUTO
                                                    deviceState.Power = true;
                                                    deviceState.VentilationMode = ervHasAutoVentilationMode ? 2 : 0;
                                                    deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
                                                    break;
                                            };

                                            await this.melCloudErv.send(deviceState);
                                            const operationModeText = CONSTANS.Ventilation.VentilationMode[deviceState.VentilationMode];
                                            const info = this.disableLogInfo ? false : this.emit('message', `Set operation mode: ${operationModeText}`);
                                        } catch (error) {
                                            this.emit('error', `Set operation mode error: ${error}`);
                                        };
                                    });
                                ervMelCloudServiceT.getCharacteristic(Characteristic.CurrentTemperature)
                                    .onGet(async () => {
                                        const value = this.roomTemperature;
                                        const info = this.disableLogInfo ? false : this.emit('message', `Room temperature: ${value}${temperatureUnit}`);
                                        return value;
                                    });
                                ervMelCloudServiceT.getCharacteristic(Characteristic.TargetTemperature)
                                    .setProps({
                                        minValue: [0, 32][this.useFahrenheit],
                                        maxValue: [31, 88][this.useFahrenheit],
                                        minStep: this.ervTemperatureIncrement
                                    })
                                    .onGet(async () => {
                                        const value = this.setTemperature;
                                        const info = this.disableLogInfo ? false : this.emit('message', `Target temperature: ${value}${temperatureUnit}`);
                                        return value;
                                    })
                                    .onSet(async (value) => {
                                        try {
                                            deviceState.SetTemperature = value;
                                            deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.SetTemperature;
                                            await this.melCloudErv.send(deviceState);
                                            const info = this.disableLogInfo ? false : this.emit('message', `Set temperature: ${value}${temperatureUnit}`);
                                        } catch (error) {
                                            this.emit('error', `Set temperature error: ${error}`);
                                        };
                                    });
                                ervMelCloudServiceT.getCharacteristic(Characteristic.TemperatureDisplayUnits)
                                    .onGet(async () => {
                                        const value = this.useFahrenheit;
                                        const info = this.disableLogInfo ? false : this.emit('message', `Temperature display unit: ${temperatureUnit}`);
                                        return value;
                                    })
                                    .onSet(async (value) => {
                                        try {
                                            accountInfo.UseFahrenheit = value ? true : false;
                                            await this.melCloud.send(accountInfo);
                                            this.useFahrenheit = accountInfo.UseFahrenheit;
                                            const info = this.disableLogInfo ? false : this.emit('message', `Set temperature display unit: ${CONSTANS.TemperatureDisplayUnits[value]}`);
                                        } catch (error) {
                                            this.emit('error', `Set temperature display unit error: ${error}`);
                                        };
                                    });
                                this.ervMelCloudServices.push(ervMelCloudServiceT);
                                break;
                        };

                        //temperature sensor services
                        if (ervTemperatureSensor) {
                            if (this.ervHasRoomTemperature) {
                                const debug = this.enableDebugMode ? this.emit('debug', `Prepare room temperature sensor service`) : false;
                                this.ervRoomTemperatureSensorService = new Service.TemperatureSensor(`${ervServiceName} Room`, `Room Temperature Sensor ${deviceId}`);
                                this.ervRoomTemperatureSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                this.ervRoomTemperatureSensorService.setCharacteristic(Characteristic.ConfiguredName, `${ervServiceName} Room`);
                                this.ervRoomTemperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                    .onGet(async () => {
                                        const state = this.roomTemperature;
                                        return state;
                                    })
                                accessory.addService(this.ervRoomTemperatureSensorService);
                            };

                            if (this.ervHasSupplyTemperature) {
                                const debug = this.enableDebugMode ? this.emit('debug', `Prepare supply temperature sensor service`) : false;
                                this.ervSupplyTemperatureSensorService = new Service.TemperatureSensor(`${ervServiceName} Supply`, `Supply Temperature Sensor ${deviceId}`);
                                this.ervSupplyTemperatureSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                this.ervSupplyTemperatureSensorService.setCharacteristic(Characteristic.ConfiguredName, `${ervServiceName} Supply`);
                                this.ervSupplyTemperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                    .onGet(async () => {
                                        const state = this.outdoorTemperature;
                                        return state;
                                    })
                                accessory.addService(this.ervSupplyTemperatureSensorService);
                            };

                            if (this.ervHasOutdoorTemperature) {
                                const debug = this.enableDebugMode ? this.emit('debug', `Prepare outdoor temperature sensor service`) : false;
                                this.ervOutdoorTemperatureSensorService = new Service.TemperatureSensor(`${ervServiceName} Outdoor`, `Outdoor Temperature Sensor ${deviceId}`);
                                this.ervOutdoorTemperatureSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                this.ervOutdoorTemperatureSensorService.setCharacteristic(Characteristic.ConfiguredName, `${ervServiceName} Outdoor`);
                                this.ervOutdoorTemperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                    .onGet(async () => {
                                        const state = this.supplyTemperature;
                                        return state;
                                    })
                                accessory.addService(this.ervOutdoorTemperatureSensorService);
                            };
                        };

                        //core maintenance
                        this.ervCoreMaintenanceService = new Service.FilterMaintenance(`${ervServiceName} Core Maintenance`, `CoreMaintenance ${deviceId}`);
                        this.ervCoreMaintenanceService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.ervCoreMaintenanceService.setCharacteristic(Characteristic.ConfiguredName, `${ervServiceName} Core Maintenance`);
                        this.ervCoreMaintenanceService.getCharacteristic(Characteristic.FilterChangeIndication)
                            .onGet(async () => {
                                const value = this.ervCoreMaintenanceRequired;
                                const info = this.disableLogInfo ? false : this.emit('message', `Core maintenance: ${CONSTANS.Ventilation.CoreMaintenance[value]}`);
                                return value;
                            });
                        this.ervCoreMaintenanceService.getCharacteristic(Characteristic.ResetFilterIndication)
                            .onSet(async (state) => {
                            });
                        accessory.addService(this.ervCoreMaintenanceService);

                        //filter maintenance
                        this.ervFilterMaintenanceService = new Service.FilterMaintenance(`${ervServiceName} Filter Maintenance`, `FilterMaintenance ${deviceId}`);
                        this.ervFilterMaintenanceService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.ervFilterMaintenanceService.setCharacteristic(Characteristic.ConfiguredName, `${ervServiceName} Filter Maintenance`);
                        this.ervFilterMaintenanceService.getCharacteristic(Characteristic.FilterChangeIndication)
                            .onGet(async () => {
                                const value = this.ervFilterMaintenanceRequired;
                                const info = this.disableLogInfo ? false : this.emit('message', `Filter maintenance: ${CONSTANS.Ventilation.FilterMaintenance[value]}`);
                                return value;
                            });
                        this.ervFilterMaintenanceService.getCharacteristic(Characteristic.ResetFilterIndication)
                            .onSet(async (state) => {
                            });
                        accessory.addService(this.ervFilterMaintenanceService);

                        //room CO2 sensor
                        if (ervHasCO2Sensor) {
                            this.ervCarbonDioxideSensorService = new Service.CarbonDioxideSensor(`${ervServiceName} CO2 Sensor`, `CO2Sensor ${deviceId}`);
                            this.ervCarbonDioxideSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.ervCarbonDioxideSensorService.setCharacteristic(Characteristic.ConfiguredName, `${ervServiceName} CO2 Sensor`);
                            this.ervCarbonDioxideSensorService.getCharacteristic(Characteristic.CarbonDioxideDetected)
                                .onGet(async () => {
                                    const value = this.ervRoomCO2Detected;
                                    const info = this.disableLogInfo ? false : this.emit('message', `CO2 detected: ${CONSTANS.Ventilation.Co2Detected[value]}`);
                                    return value;
                                });
                            this.ervCarbonDioxideSensorService.getCharacteristic(Characteristic.CarbonDioxideLevel)
                                .onGet(async () => {
                                    const value = this.ervRoomCO2Level;
                                    const info = this.disableLogInfo ? false : this.emit('message', `CO2 level: ${value} ppm`);
                                    return value;
                                });
                            accessory.addService(this.ervCarbonDioxideSensorService);
                        }

                        //room PM2.5 sensor
                        if (ervHasPM25Sensor) {
                            this.ervAirQualitySensorService = new Service.AirQualitySensor(`${ervServiceName} PM2.5 Sensor`, `PM25Sensor ${deviceId}`);
                            this.ervAirQualitySensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.ervAirQualitySensorService.setCharacteristic(Characteristic.ConfiguredName, `${ervServiceName} PM2.5 Sensor`);
                            this.ervAirQualitySensorService.getCharacteristic(Characteristic.AirQuality)
                                .onGet(async () => {
                                    const value = this.ervPM25AirQuality;
                                    const info = this.disableLogInfo ? false : this.emit('message', `PM2.5 air quality: ${CONSTANS.Ventilation.PM25AirQuality[value]}`);
                                    return value;
                                });
                            this.ervAirQualitySensorService.getCharacteristic(Characteristic.PM2_5Density)
                                .onGet(async () => {
                                    const value = this.ervPM25Level;
                                    const info = this.disableLogInfo ? false : this.emit('message', `PM2.5 level: ${value} µg/m`);
                                    return value;
                                });
                            accessory.addService(this.ervAirQualitySensorService);
                        }

                        //buttons services
                        if (ervButtonsConfiguredCount > 0) {
                            const debug = this.enableDebugMode ? this.emit('debug', `Prepare buttons service`) : false;
                            this.ervButtonsServices = [];

                            for (let i = 0; i < ervButtonsConfiguredCount; i++) {
                                const button = ervButtonsConfigured[i];

                                //get button mode
                                const buttonMode = button.mode;

                                //get button display type
                                const buttonDisplayType = button.displayType;

                                //get button name
                                const buttonName = button.name || ['', `Button ${i}`, `Button ${i}`, `Sensor ${i}`, `Sensor ${i}`, `Sensor ${i}`][buttonDisplayType];

                                //get button name prefix
                                const buttonNamePrefix = button.namePrefix ?? false;

                                const buttonServiceName = buttonNamePrefix ? `${accessoryName} ${buttonName}` : buttonName;
                                const buttonServiceType = ['', Service.Outlet, Service.Switch, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][buttonDisplayType];
                                const characteristicType = ['', Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][buttonDisplayType];
                                const buttonService = new buttonServiceType(buttonServiceName, `Button ${deviceId} ${i}`);
                                buttonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                buttonService.setCharacteristic(Characteristic.ConfiguredName, buttonServiceName);
                                buttonService.getCharacteristic(characteristicType)
                                    .onGet(async () => {
                                        const state = button.buttonState;
                                        return state;
                                    })
                                    .onSet(async (state) => {
                                        if (buttonDisplayType <= 1) {
                                            try {
                                                switch (buttonMode) {
                                                    case 0: //POWER ON,OFF
                                                        deviceState.Power = state;
                                                        deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power;
                                                        break;
                                                    case 1: //OPERATING MODE RECOVERY
                                                        deviceState.Power = true;
                                                        deviceState.VentilationMode = 0;
                                                        deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
                                                        break;
                                                    case 2: //OPERATING MODE BYPAS
                                                        deviceState.Power = true;
                                                        deviceState.VentilationMode = 1;
                                                        deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
                                                        break
                                                    case 3: //OPERATING MODE AUTO
                                                        deviceState.Power = true;
                                                        deviceState.VentilationMode = 2;
                                                        deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
                                                        break;
                                                    case 4: //NIGHT PURGE MODE
                                                        deviceState.Power = true;
                                                        deviceState.NightPurgeMode = state;
                                                        deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power
                                                        break;
                                                    case 10: //FAN SPEED MODE AUTO
                                                        deviceState.Power = true;
                                                        deviceState.SetFanSpeed = 0;
                                                        deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
                                                        break;
                                                    case 11: //FAN SPEED MODE 1
                                                        deviceState.Power = true;
                                                        deviceState.SetFanSpeed = 1;
                                                        deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
                                                        break;
                                                    case 12: //FAN SPEED MODE 2
                                                        deviceState.Power = true;
                                                        deviceState.SetFanSpeed = 2;
                                                        deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
                                                        break;
                                                    case 13: //FAN SPEED MODE 3
                                                        deviceState.Power = true;
                                                        deviceState.SetFanSpeed = 3;
                                                        deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
                                                        break;
                                                    case 14: //FAN MODE 4
                                                        deviceState.Power = true;
                                                        deviceState.SetFanSpeed = 4;
                                                        deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
                                                        break;
                                                    case 15: //PHYSICAL LOCK CONTROLS
                                                        deviceState = deviceState;
                                                        deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Prohibit;
                                                        break;
                                                    case 16: //ROOM TEMP HIDE
                                                        deviceState.HideRoomTemperature = state;
                                                        break;
                                                    case 17: //SUPPLY TEMP HIDE
                                                        deviceState.HideSupplyTemperature = state;
                                                        break;
                                                    case 18: //OUTDOOR EMP HIDE
                                                        deviceState.hideOutdoorTemperature = state;
                                                        break;
                                                    default:
                                                        deviceState = deviceState;
                                                        break;
                                                };

                                                await this.melCloudErv.send(deviceState);
                                                const info = this.disableLogInfo ? false : this.emit('message', `Set: ${buttonName}`);
                                            } catch (error) {
                                                this.emit('error', `Set button error: ${error}`);
                                            };
                                        };
                                    });
                                this.ervButtonsServices.push(buttonService);
                                accessory.addService(buttonService);
                            };
                        };

                        //presets services
                        if (ervPresetsCount > 0) {
                            const debug = this.enableDebugMode ? this.emit('debug', `Prepare presets service`) : false;
                            this.ervPresetsServices = [];
                            const ervPreviousPresets = [];

                            for (let i = 0; i < ervPresetsCount; i++) {
                                const preset = ervPresets[i];
                                const presetName = preset.NumberDescription;

                                const presetService = new Service.Outlet(`${accessoryName} ${presetName}`, `Preset ${deviceId} ${i}`);
                                presetService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                presetService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${presetName}`);
                                presetService.getCharacteristic(Characteristic.On)
                                    .onGet(async () => {
                                        const state = this.ervPresetsStates[i];
                                        return state;
                                    })
                                    .onSet(async (state) => {
                                        try {
                                            switch (state) {
                                                case true:
                                                    ervPreviousPresets[i] = deviceState;
                                                    deviceState.SetTemperature = preset.SetTemperature;
                                                    deviceState.Power = preset.Power;
                                                    deviceState.OperationMode = preset.OperationMode;
                                                    deviceState.VentilationMode = preset.VentilationMode;
                                                    deviceState.SetFanSpeed = preset.FanSpeed;
                                                    deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power;
                                                    break;
                                                case false:
                                                    deviceState = ervPreviousPresets[i];
                                                    break;
                                            };

                                            await this.melCloudErv.send(deviceState);
                                            const info = this.disableLogInfo ? false : this.emit('message', `Set: ${presetName}`);
                                        } catch (error) {
                                            this.emit('error', `Set preset error: ${error}`);
                                        };
                                    });
                                ervPreviousPresets.push(deviceState);
                                this.ervPresetsServices.push(presetService);
                                accessory.addService(presetService);
                            };
                        };

                        resolve(accessory);
                        break;
                    default: //unknown system detected
                        reject(`Unknown system type: ${deviceType} detected.`);
                        break;
                };
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = MelCloudDevice;