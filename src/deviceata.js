"use strict";
const EventEmitter = require('events');
const MelCloudAta = require('./melcloudata.js');
const RestFul = require('./restful.js');
const Mqtt = require('./mqtt.js');
const CONSTANTS = require('./constants.json');
let Accessory, Characteristic, Service, Categories, AccessoryUUID;

class MelCloudDevice extends EventEmitter {
    constructor(api, account, melCloud, accountInfo, accountName, contextKey, deviceId, deviceName, deviceTypeText, useFahrenheit, deviceInfoFile) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        AccessoryUUID = api.hap.uuid;

        //account config
        this.displayMode = account.ataDisplayMode || 0;
        this.temperatureSensor = account.ataTemperatureSensor || false;
        this.presetsEnabled = account.ataPresets || false;
        this.disableAutoMode = account.ataDisableAutoMode || false;
        this.disableHeatMode = account.ataDisableHeatMode || false;
        this.autoHeatMode = account.ataAutoHeatMode || 0; //DRY, FAN
        this.buttons = account.ataButtons || [];
        this.disableLogInfo = account.disableLogInfo || false;
        this.disableLogDeviceInfo = account.disableLogDeviceInfo || false;
        this.enableDebugMode = account.enableDebugMode || false;

        //external integrations
        this.restFulConnected = false;
        this.mqttConnected = false;

        //variables
        this.melCloud = melCloud; //function
        this.buttonsCount = this.buttons.length;
        this.startPrepareAccessory = true;

        //temp unit
        this.useFahrenheit = useFahrenheit;

        //melcloud device
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
            const displayMode = this.displayMode;
            const hasAutomaticFanSpeed = deviceData.Device.HasAutomaticFanSpeed ?? false;
            const airDirectionFunction = deviceData.Device.AirDirectionFunction ?? false;
            const hasOutdoorTemperature = deviceData.Device.HasOutdoorTemperature ?? false;
            const swingFunction = deviceData.Device.SwingFunction ?? false;
            const numberOfFanSpeeds = deviceData.Device.NumberOfFanSpeeds ?? 0;
            const modelSupportsFanSpeed = deviceData.Device.ModelSupportsFanSpeed ?? false;
            const modelSupportsAuto1 = deviceData.Device.ModelSupportsAuto ?? false;
            const modelSupportsAuto = !this.disableAutoMode && modelSupportsAuto1;
            const modelSupportsHeat1 = deviceData.Device.ModelSupportsHeat ?? false;
            const modelSupportsHeat = !this.disableHeatMode && modelSupportsHeat1;
            const modelSupportsDry = deviceData.Device.ModelSupportsDry ?? false;
            const temperatureIncrement = deviceData.Device.TemperatureIncrement ?? 1;
            const outdoorTemperature = deviceData.Device.OutdoorTemperature;

            this.hasAutomaticFanSpeed = hasAutomaticFanSpeed;
            this.airDirectionFunction = airDirectionFunction;
            this.hasOutdoorTemperature = hasOutdoorTemperature;
            this.swingFunction = swingFunction;
            this.numberOfFanSpeeds = numberOfFanSpeeds;
            this.modelSupportsFanSpeed = modelSupportsFanSpeed;
            this.modelSupportsAuto = modelSupportsAuto;
            this.modelSupportsHeat = modelSupportsHeat;
            this.modelSupportsDry = modelSupportsDry;
            this.temperatureIncrement = temperatureIncrement;
            this.temperatureUnit = CONSTANTS.TemperatureDisplayUnits[this.useFahrenheit];

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
            this.presets = presets;
            this.presetsCount = this.presetsEnabled ? presets.length : 0;

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
                    autoHeatDryFanMode = !modelSupportsAuto && !modelSupportsHeat ? [operationMode === 2 ? 0 : 1, operationMode === 6 ? 0 : 1][this.autoHeatMode] : !modelSupportsAuto && modelSupportsHeat ? 0 : modelSupportsAuto && !modelSupportsHeat ? 1 : 1;
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
                    if (this.melCloudService) {
                        this.melCloudService
                            .updateCharacteristic(Characteristic.Active, power)
                            .updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentOperationMode)
                            .updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetOperationMode)
                            .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                            .updateCharacteristic(Characteristic.HeatingThresholdTemperature, setTemperature)
                            .updateCharacteristic(Characteristic.CoolingThresholdTemperature, setTemperature)
                            .updateCharacteristic(Characteristic.LockPhysicalControls, lockPhysicalControls)
                            .updateCharacteristic(Characteristic.TemperatureDisplayUnits, this.useFahrenheit);
                        const updateRotationSpeed = modelSupportsFanSpeed ? this.melCloudService.updateCharacteristic(Characteristic.RotationSpeed, fanSpeed) : false;
                        const updateSwingMode = swingFunction ? this.melCloudService.updateCharacteristic(Characteristic.SwingMode, swingMode) : false;
                    };
                    break;
                case 1: //Thermostat
                    //operating mode 0, HEAT, DRY, COOL, 4, 5, 6, FAN, AUTO, ISEE HEAT, ISEE DRY, ISEE COOL
                    autoHeatDryFanMode = !modelSupportsAuto && !modelSupportsHeat ? [operationMode === 2 ? 3 : 1, operationMode === 6 ? 3 : 1][this.autoHeatMode] : !modelSupportsAuto && modelSupportsHeat ? 3 : modelSupportsAuto && !modelSupportsHeat ? 1 : 1;
                    currentOperationMode = !power || inStandbyMode ? 0 : [0, 1, 2, 2, 2, 2, 2, 2, (setTemperature < roomTemperature) ? 2 : 1, 1, 1, 2][operationMode]; //OFF, HEAT, COOL
                    targetOperationMode = !power || inStandbyMode ? 0 : [0, 1, autoHeatDryFanMode, 2, 2, 2, 2, autoHeatDryFanMode, 3, 1, 1, 2][operationMode]; //OFF, HEAT, COOL, AUTO
                    operationModeSetPropsMinValue = 0;
                    operationModeSetPropsMaxValue = 3;
                    operationModeSetPropsValidValues = [0, 1, 2, 3];

                    //update characteristics
                    if (this.melCloudService) {
                        this.melCloudService
                            .updateCharacteristic(Characteristic.CurrentHeatingCoolingState, currentOperationMode)
                            .updateCharacteristic(Characteristic.TargetHeatingCoolingState, targetOperationMode)
                            .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                            .updateCharacteristic(Characteristic.TargetTemperature, setTemperature)
                            .updateCharacteristic(Characteristic.TemperatureDisplayUnits, this.useFahrenheit);
                    };
                    break;
            };

            this.power = power;
            this.offline = offline;
            this.currentOperationMode = currentOperationMode;
            this.targetOperationMode = targetOperationMode;
            this.roomTemperature = roomTemperature;
            this.outdoorTemperature = outdoorTemperature;
            this.setTemperature = setTemperature;
            this.fanSpeed = fanSpeed;
            this.setFanSpeed = setFanSpeed;
            this.swingMode = swingMode;
            this.vaneHorizontal = vaneHorizontal;
            this.vaneVertical = vaneVertical;
            this.lockPhysicalControls = lockPhysicalControls;

            if (this.temperatureSensor) {
                if (this.roomTemperatureSensorService) {
                    this.roomTemperatureSensorService
                        .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                };

                if (hasOutdoorTemperature && this.outdoorTemperatureSensorService) {
                    this.outdoorTemperatureSensorService
                        .updateCharacteristic(Characteristic.CurrentTemperature, outdoorTemperature)
                };
            };

            //update buttons state
            if (this.buttonsCount > 0) {
                this.buttonsConfigured = [];

                for (const button of this.buttons) {
                    const displayType = button.displayType ?? 0;

                    if (displayType > 0) {
                        const mode = button.mode ?? 100;
                        switch (mode) {
                            case 0: //POWER ON,OFF
                                button.state = (power === true);
                                this.buttonsConfigured.push(button);
                                break;
                            case 1: //OPERATING MODE HEAT
                                button.state = power ? (operationMode === 1) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 2: //OPERATING MODE DRY
                                button.state = power ? (operationMode === 2) : false;
                                this.buttonsConfigured.push(button);
                                break
                            case 3: //OPERATING MODE COOL
                                button.state = power ? (operationMode === 3) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 4: //OPERATING MODE FAN
                                button.state = power ? (operationMode === 7) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 5: //OPERATING MODE AUTO
                                button.state = power ? (operationMode === 8) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 6: //OPERATING MODE PURIFY
                                button.state = power ? (operationMode === 9) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 7: //OPERATING MODE DRY CONTROL HIDE
                                button.state = power ? (hideDryModeControl === true) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 10: //VANE H SWING MODE AUTO
                                button.state = power ? (vaneHorizontal === 0) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 11: //VANE H SWING MODE 1
                                button.state = power ? (vaneHorizontal === 1) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 12: //VANE H SWING MODE 2
                                button.state = power ? (vaneHorizontal === 2) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 13: //VANE H SWING MODE 3
                                button.state = power ? (vaneHorizontal === 3) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 14: //VANE H SWING MODE 4
                                button.state = power ? (vaneHorizontal === 4) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 15: //VANE H SWING MODE 5
                                button.state = power ? (vaneHorizontal === 5) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 16: //VANE H SWING MODE SPLIT
                                button.state = power ? (vaneHorizontal === 8) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 17: //VANE H SWING MODE SWING
                                button.state = power ? (vaneHorizontal === 12) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 20: //VANE V SWING MODE AUTO
                                button.state = power ? (vaneVertical === 0) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 21: //VANE V SWING MODE 1
                                button.state = power ? (vaneVertical === 1) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 22: //VANE V SWING MODE 2
                                button.state = power ? (vaneVertical === 2) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 23: //VANE V SWING MODE 3
                                button.state = power ? (vaneVertical === 3) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 24: //VANE V SWING MODE 4
                                button.state = power ? (vaneVertical === 4) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 25: //VANE V SWING MODE 5
                                button.state = power ? (vaneVertical === 5) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 26: //VANE V SWING MODE SWING
                                button.state = power ? (vaneVertical === 7) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 27: //VANE H/V CONTROLS HIDE
                                button.state = power ? (hideVaneControls === true) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 30: //FAN SPEED MODE AUTO
                                button.state = power ? (setFanSpeed === 0) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 31: //FAN SPEED MODE 1
                                button.state = power ? (setFanSpeed === 1) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 32: //FAN SPEED MODE 2
                                button.state = power ? (setFanSpeed === 2) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 33: //FAN SPEED MODE 3
                                button.state = power ? (setFanSpeed === 3) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 34: //FAN SPEED MODE 4
                                button.state = power ? (setFanSpeed === 4) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 35: //FAN SPEED  MODE 5
                                button.state = power ? (setFanSpeed === 5) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 36: //FAN SPEED  MODE 6
                                button.state = power ? (setFanSpeed === 6) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 37: //PHYSICAL LOCK CONTROLS ALL
                                button.state = (lockPhysicalControls === 1);
                                this.buttonsConfigured.push(button);
                                break;
                            case 38: //PHYSICAL LOCK CONTROLS POWER
                                button.state = (prohibitPower === true);
                                this.buttonsConfigured.push(button);
                                break;
                            case 39: //PHYSICAL LOCK CONTROLS MODE
                                button.state = (prohibitOperationMode === true);
                                this.buttonsConfigured.push(button);
                                break;
                            case 40: //PHYSICAL LOCK CONTROLS TEMP
                                button.state = (prohibitSetTemperature === true);
                                this.buttonsConfigured.push(button);
                                break;
                            default: //Unknown button
                                this.emit('message', `Unknown button mode: ${mode} detected.`);
                                break;
                        };
                    };
                };

                this.buttonsConfiguredCount = this.buttonsConfigured.length;
                for (let i = 0; i < this.buttonsConfiguredCount; i++) {
                    const button = this.buttonsConfigured[i];
                    const state = button.state;
                    const displayType = button.displayType;
                    const characteristicType = ['', Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][displayType];
                    if (this.buttonsServices[i]) {
                        this.buttonsServices[i]
                            .updateCharacteristic(characteristicType, state)
                    };
                };

            };

            //update presets state
            if (this.presetsCount > 0) {
                this.presetsStates = [];

                for (let i = 0; i < this.presetsCount; i++) {
                    const preset = presets[i];
                    const state = preset.Power === power
                        && preset.SetTemperature === setTemperature
                        && preset.OperationMode === operationMode
                        && preset.VaneHorizontal === vaneHorizontal
                        && preset.VaneVertical === vaneVertical
                        && preset.FanSpeed === setFanSpeed;
                    this.presetsStates.push(state);

                    if (this.presetsServices[i]) {
                        this.presetsServices[i]
                            .updateCharacteristic(Characteristic.On, state)
                    };
                };
            };

            //start prepare accessory
            if (this.startPrepareAccessory) {
                try {
                    //RESTFul server
                    const restFulEnabled = account.enableRestFul || false;
                    if (restFulEnabled) {
                        this.restFul = new RestFul({
                            port: deviceId.slice(-4),
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
                        this.mqtt = new Mqtt({
                            host: account.mqttHost,
                            port: account.mqttPort || 1883,
                            clientId: `${account.mqttClientId}_${deviceId}` || `${deviceTypeText}_${deviceName}_${deviceId}`,
                            prefix: `${account.mqttPrefix}/${deviceTypeText}/${deviceName}`,
                            user: account.mqttUser,
                            passwd: account.mqttPass,
                            debug: account.mqttDebug || false
                        });

                        this.mqtt.on('connected', (message) => {
                            this.emit('message', message);
                            this.mqttConnected = true;
                        })
                            .on('changeState', (data) => {
                                const key = Object.keys(data)[0];
                                const value = Object.values(data)[0];
                                switch (key) {
                                    case 'Power':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power;
                                        this.melCloudAta.send(deviceState);
                                        break;
                                    case 'OperationMode':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.OperationMode;
                                        this.melCloudAta.send(deviceState);
                                        break;
                                    case 'SetTemperature':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.SetTemperature;
                                        this.melCloudAta.send(deviceState);
                                        break;
                                    case 'DefaultCoolingSetTemperature':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.SetTemperature;
                                        this.melCloudAta.send(deviceState);
                                        break;
                                    case 'DefaultHeatingSetTemperature':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.SetTemperature;
                                        this.melCloudAta.send(deviceState);
                                        break;
                                    case 'SetFanSpeed':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.SetFanSpeed;
                                        this.melCloudAta.send(deviceState);
                                        break;
                                    case 'VaneHorizontal':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.VaneHorizontal;
                                        this.melCloudAta.send(deviceState);
                                        break;
                                    case 'VaneVertical':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.VaneVertical;
                                        this.melCloudAta.send(deviceState);
                                        break;
                                    case 'HideVaneControls':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Prohibit;
                                        this.melCloudAta.send(deviceState);
                                        break;
                                    case 'HideDryModeControl':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Prohibit;
                                        this.melCloudAta.send(deviceState);
                                        break;
                                    case 'ProhibitSetTemperature':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Prohibit;
                                        this.melCloudAta.send(deviceState);
                                        break;
                                    case 'ProhibitOperationMode':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Prohibit;
                                        this.melCloudAta.send(deviceState);
                                        break;
                                    case 'ProhibitPower':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Prohibit;
                                        this.melCloudAta.send(deviceState);
                                        break;
                                    default:
                                        this.emit('message', `MQTT Received unknown key: ${key}, value: ${value}`);
                                        break;
                                };
                            })
                            .on('debug', (debug) => {
                                this.emit('debug', debug);
                            })
                            .on('error', (error) => {
                                this.emit('error', error);
                            });
                    }

                    this.operationModeSetPropsMinValue = operationModeSetPropsMinValue;
                    this.operationModeSetPropsMaxValue = operationModeSetPropsMaxValue;
                    this.operationModeSetPropsValidValues = operationModeSetPropsValidValues;
                    this.fanSpeedSetPropsMaxValue = fanSpeedSetPropsMaxValue;

                    await new Promise(resolve => setTimeout(resolve, 150));
                    const accessory = await this.prepareAccessory(accountInfo, deviceState, deviceId, deviceTypeText, deviceName);
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
    };

    //prepare accessory
    prepareAccessory(accountInfo, deviceState, deviceId, deviceTypeText, deviceName) {
        return new Promise((resolve, reject) => {
            try {
                //accessory
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare accessory`) : false;
                const accessoryName = deviceName;
                const accessoryUUID = AccessoryUUID.generate(deviceId.toString());
                const accessoryCategory = Categories.AIR_CONDITIONER;
                const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

                //information service
                const debug1 = this.enableDebugMode ? this.emit('debug', `Prepare information service`) : false;
                accessory.getService(Service.AccessoryInformation)
                    .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
                    .setCharacteristic(Characteristic.Model, this.model)
                    .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
                    .setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

                //melcloud services
                const displayMode = this.displayMode;
                const temperatureSensor = this.temperatureSensor;
                const buttonsConfigured = this.buttonsConfigured;
                const buttonsConfiguredCount = this.buttonsConfiguredCount;
                const presets = this.presets;
                const presetsCount = this.presetsCount;
                const hasAutomaticFanSpeed = this.hasAutomaticFanSpeed;
                const modelSupportsFanSpeed = this.modelSupportsFanSpeed;
                const modelSupportsAuto = this.modelSupportsAuto;
                const modelSupportsHeat = this.modelSupportsHeat;
                const modelSupportsDry = this.modelSupportsDry;
                const numberOfFanSpeeds = this.numberOfFanSpeeds;
                const swingFunction = this.swingFunction;
                const hasOutdoorTemperature = this.hasOutdoorTemperature;
                const autoDryFan = [modelSupportsDry ? 2 : 7, 7][this.autoHeatMode];
                const heatFanDry = [7, modelSupportsDry ? 2 : 7][this.autoHeatMode];
                const serviceName = `${deviceTypeText} ${accessoryName}`;
                const temperatureUnit = this.temperatureUnit;

                switch (displayMode) {
                    case 0: //Heater Cooler
                        const debug = this.enableDebugMode ? this.emit('debug', `Prepare heather/cooler service`) : false;
                        this.melCloudService = accessory.addService(Service.HeaterCooler, serviceName, `HeaterCooler ${deviceId}`);
                        this.melCloudService.getCharacteristic(Characteristic.Active)
                            .onGet(async () => {
                                const state = this.power;
                                const info = this.disableLogInfo ? false : this.emit('message', `Power: ${state ? 'ON' : 'OFF'}`);
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    deviceState.Power = state;
                                    deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power;
                                    await this.melCloudAta.send(deviceState);
                                    const info = this.disableLogInfo ? false : this.emit('message', `Set power: ${state ? 'ON' : 'OFF'}`);
                                } catch (error) {
                                    this.emit('error', `Set power error: ${error}`);
                                    melCloudService.updateCharacteristic(Characteristic.Active, false)
                                };
                            });
                        this.melCloudService.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
                            .onGet(async () => {
                                const value = this.currentOperationMode;
                                const operationModeText = !this.power ? CONSTANTS.AirConditioner.System[0] : CONSTANTS.AirConditioner.DriveMode[deviceState.OperationMode];
                                const info = this.disableLogInfo ? false : this.emit('message', `Operation mode: ${operationModeText}`);
                                return value;
                            });
                        this.melCloudService.getCharacteristic(Characteristic.TargetHeaterCoolerState)
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
                                            deviceState.OperationMode = modelSupportsAuto ? 8 : autoDryFan;
                                            deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.OperationMode;
                                            break;
                                        case 1: //HEAT - HEAT
                                            deviceState.Power = true;
                                            deviceState.OperationMode = modelSupportsHeat ? 1 : heatFanDry;
                                            deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.OperationMode;
                                            break;
                                        case 2: //COOL - COOL
                                            deviceState.Power = true;
                                            deviceState.OperationMode = 3;
                                            deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.OperationMode;
                                            break;
                                    };

                                    await this.melCloudAta.send(deviceState);
                                    const operationModeText = CONSTANTS.AirConditioner.DriveMode[deviceState.OperationMode];
                                    const info = this.disableLogInfo ? false : this.emit('message', `Set operation mode: ${operationModeText}`);
                                } catch (error) {
                                    this.emit('error', `Set operation mode error: ${error}`);
                                };
                            });
                        if (modelSupportsFanSpeed) {
                            this.melCloudService.getCharacteristic(Characteristic.RotationSpeed)
                                .setProps({
                                    minValue: 0,
                                    maxValue: this.fanSpeedSetPropsMaxValue,
                                    minStep: 1
                                })
                                .onGet(async () => {
                                    const value = this.fanSpeed; //AUTO, 1, 2, 3, 4, 5, 6, OFF
                                    const info = this.disableLogInfo ? false : this.emit('message', `Fan speed mode: ${CONSTANTS.AirConditioner.FanSpeed[this.setFanSpeed]}`);
                                    return value;
                                })
                                .onSet(async (value) => {
                                    try {
                                        let fanSpeed = 0; //AUTO, 1, 2, 3, 4, 5, 6
                                        let fanSpeedModeText = 0; //AUTO, 1, 2, 3, 4, 5, 6, OFF
                                        switch (numberOfFanSpeeds) {
                                            case 2: //Fan speed mode 2
                                                fanSpeed = hasAutomaticFanSpeed ? [0, 1, 2, 0][value] : [1, 1, 2][value];
                                                fanSpeedModeText = hasAutomaticFanSpeed ? [7, 1, 2, 0][value] : [7, 1, 2][value];
                                                break;
                                            case 3: //Fan speed mode 3
                                                fanSpeed = hasAutomaticFanSpeed ? [0, 1, 2, 3, 0][value] : [1, 1, 2, 3][value];
                                                fanSpeedModeText = hasAutomaticFanSpeed ? [7, 1, 2, 3, 0][value] : [7, 1, 2, 3][value];
                                                break;
                                            case 4: //Fan speed mode 4
                                                fanSpeed = hasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 0][value] : [1, 1, 2, 3, 4][value];
                                                fanSpeedModeText = hasAutomaticFanSpeed ? [7, 1, 2, 3, 4, 0][value] : [7, 1, 2, 3, 4][value];
                                                break;
                                            case 5: //Fan speed mode 5
                                                fanSpeed = hasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 0][value] : [1, 1, 2, 3, 4, 5][value];
                                                fanSpeedModeText = hasAutomaticFanSpeed ? [7, 1, 2, 3, 4, 5, 0][value] : [7, 1, 2, 3, 4, 5][value];
                                                break;
                                            case 6: //Fan speed mode 6
                                                fanSpeed = hasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 6, 0][value] : [1, 1, 2, 3, 4, 5, 6][value];
                                                fanSpeedModeText = hasAutomaticFanSpeed ? [7, 1, 2, 3, 4, 5, 6, 0][value] : [7, 1, 2, 3, 4, 5, 6][value];
                                                break;
                                        };

                                        deviceState.SetFanSpeed = fanSpeed;
                                        deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.SetFanSpeed;
                                        await this.melCloudAta.send(deviceState);
                                        const info = this.disableLogInfo ? false : this.emit('message', `Set fan speed mode: ${CONSTANTS.AirConditioner.FanSpeed[fanSpeedModeText]}`);
                                    } catch (error) {
                                        this.emit('error', `Set fan speed mode error: ${error}`);
                                    };
                                });
                        };
                        if (swingFunction) {
                            this.melCloudService.getCharacteristic(Characteristic.SwingMode)
                                .onGet(async () => {
                                    //Vane Horizontal: Auto, 1, 2, 3, 4, 5, 12 = Swing //Vertical: Auto, 1, 2, 3, 4, 5, 7 = Swing
                                    const value = this.swingMode;
                                    const info = this.disableLogInfo ? false : this.emit('message', `Vane swing mode: ${CONSTANTS.AirConditioner.AirDirection[value ? 6 : 0]}`);
                                    return value;
                                })
                                .onSet(async (value) => {
                                    try {
                                        deviceState.VaneHorizontal = value ? 12 : 0;
                                        deviceState.VaneVertical = value ? 7 : 0;
                                        deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.VaneHorizontal + CONSTANTS.AirConditioner.EffectiveFlags.VaneVertical;
                                        await this.melCloudAta.send(deviceState);
                                        const info = this.disableLogInfo ? false : this.emit('message', `Set vane swing mode: ${CONSTANTS.AirConditioner.AirDirection[value ? 6 : 0]}`);
                                    } catch (error) {
                                        this.emit('error', `Set vane swing mode error: ${error}`);
                                    };
                                });
                        };
                        this.melCloudService.getCharacteristic(Characteristic.CurrentTemperature)
                            .setProps({
                                minValue: -35,
                                maxValue: 150,
                                minStep: 0.5
                            })
                            .onGet(async () => {
                                const value = this.roomTemperature;
                                const info = this.disableLogInfo ? false : this.emit('message', `Room temperature: ${value}${temperatureUnit}`);
                                return value;
                            });
                        this.melCloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
                            .setProps({
                                minValue: [0, 32][this.useFahrenheit],
                                maxValue: [31, 88][this.useFahrenheit],
                                minStep: this.temperatureIncrement
                            })
                            .onGet(async () => {
                                const value = this.setTemperature;
                                const info = this.disableLogInfo ? false : this.emit('message', `Heating threshold temperature: ${value}${temperatureUnit}`);
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    deviceState.SetTemperature = value;
                                    deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.SetTemperature;
                                    await this.melCloudAta.send(deviceState);
                                    const info = this.disableLogInfo ? false : this.emit('message', `Set heating threshold temperature: ${value}${temperatureUnit}`);
                                } catch (error) {
                                    this.emit('error', `Set heating threshold temperature error: ${error}`);
                                };
                            });
                        this.melCloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
                            .setProps({
                                minValue: [10, 50][this.useFahrenheit],
                                maxValue: [31, 88][this.useFahrenheit],
                                minStep: this.temperatureIncrement
                            })
                            .onGet(async () => {
                                const value = this.setTemperature;
                                const info = this.disableLogInfo ? false : this.emit('message', `Cooling threshold temperature: ${value}${temperatureUnit}`);
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    deviceState.SetTemperature = value;
                                    deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.SetTemperature;
                                    await this.melCloudAta.send(deviceState);
                                    const info = this.disableLogInfo ? false : this.emit('message', `Set cooling threshold temperature: ${value}${temperatureUnit}`);
                                } catch (error) {
                                    this.emit('error', `Set cooling threshold temperature error: ${error}`);
                                };
                            });
                        this.melCloudService.getCharacteristic(Characteristic.LockPhysicalControls)
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
                                    deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Prohibit;
                                    await this.melCloudAta.send(deviceState);
                                    const info = this.disableLogInfo ? false : this.emit('message', `Set local physical controls: ${value ? 'LOCK' : 'UNLOCK'}`);
                                } catch (error) {
                                    this.emit('error', `Set lock physical controls error: ${error}`);
                                };
                            });
                        this.melCloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
                            .onGet(async () => {
                                const value = this.useFahrenheit;
                                const info = this.disableLogInfo ? false : this.emit('message', `Temperature display unit: ${temperatureUnit}`);
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    value = value ? true : false;
                                    accountInfo.UseFahrenheit = value
                                    await this.melCloud.send(accountInfo);
                                    const info = this.disableLogInfo ? false : this.emit('message', `Set temperature display unit: ${CONSTANTS.TemperatureDisplayUnits[value]}`);
                                    this.useFahrenheit = value;
                                } catch (error) {
                                    this.emit('error', `Set temperature display unit error: ${error}`);
                                };
                            });
                        break;
                    case 1: //Thermostat
                        const debug1 = this.enableDebugMode ? this.emit('debug', `Prepare thermostat service`) : false;
                        this.melCloudService = accessory.addService(Service.Thermostat, serviceName, `Thermostat ${deviceId}`);
                        this.melCloudService.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
                            .onGet(async () => {
                                const value = this.currentOperationMode;
                                const operationModeText = !this.power ? CONSTANTS.HeatPump.System[0] : CONSTANTS.HeatPump.OperationMode[deviceState.OperationMode];
                                const info = this.disableLogInfo ? false : this.emit('message', `Operation mode: ${operationModeText}`);
                                return value;
                            });
                        this.melCloudService.getCharacteristic(Characteristic.TargetHeatingCoolingState)
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
                                            deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power;
                                            break;
                                        case 1: //HEAT - HEAT
                                            deviceState.Power = true;
                                            deviceState.OperationMode = modelSupportsHeat ? 1 : heatFanDry;
                                            deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.OperationMode;
                                            break;
                                        case 2: //COOL - COOL
                                            deviceState.Power = true;
                                            deviceState.OperationMode = 3;
                                            deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.OperationMode;
                                            break;
                                        case 3: //AUTO - AUTO
                                            deviceState.Power = true;
                                            deviceState.OperationMode = modelSupportsAuto ? 8 : autoDryFan;
                                            deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.OperationMode;
                                            break;
                                    };

                                    await this.melCloudAta.send(deviceState);
                                    const operationModeText = CONSTANTS.AirConditioner.DriveMode[deviceState.OperationMode];
                                    const info = this.disableLogInfo ? false : this.emit('message', `Set operation mode: ${operationModeText}`);
                                } catch (error) {
                                    this.emit('error', `Set operation mode error: ${error}`);
                                };
                            });
                        this.melCloudService.getCharacteristic(Characteristic.CurrentTemperature)
                            .setProps({
                                minValue: -35,
                                maxValue: 150,
                                minStep: 0.5
                            })
                            .onGet(async () => {
                                const value = this.roomTemperature;
                                const info = this.disableLogInfo ? false : this.emit('message', `Room temperature: ${value}${temperatureUnit}`);
                                return value;
                            });
                        this.melCloudService.getCharacteristic(Characteristic.TargetTemperature)
                            .setProps({
                                minValue: [0, 32][this.useFahrenheit],
                                maxValue: [31, 88][this.useFahrenheit],
                                minStep: this.temperatureIncrement
                            })
                            .onGet(async () => {
                                const value = this.setTemperature;
                                const info = this.disableLogInfo ? false : this.emit('message', `Target temperature: ${value}${temperatureUnit}`);
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    deviceState.SetTemperature = value;
                                    deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.SetTemperature;
                                    await this.melCloudAta.send(deviceState);
                                    const info = this.disableLogInfo ? false : this.emit('message', `Set temperature: ${value}${temperatureUnit}`);
                                } catch (error) {
                                    this.emit('error', `Set temperature error: ${error}`);
                                };
                            });
                        this.melCloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
                            .onGet(async () => {
                                const value = this.useFahrenheit;
                                const info = this.disableLogInfo ? false : this.emit('message', `Temperature display unit: ${temperatureUnit}`);
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    value = value ? true : false;
                                    accountInfo.UseFahrenheit = value
                                    await this.melCloud.send(accountInfo);
                                    const info = this.disableLogInfo ? false : this.emit('message', `Set temperature display unit: ${CONSTANTS.TemperatureDisplayUnits[value]}`);
                                    this.useFahrenheit = value;
                                } catch (error) {
                                    this.emit('error', `Set temperature display unit error: ${error}`);
                                };
                            });
                        break;
                };

                //temperature sensor services
                if (temperatureSensor && this.roomTemperature !== null) {
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare room temperature sensor service`) : false;
                    this.roomTemperatureSensorService = new Service.TemperatureSensor(`${serviceName} Room`, `Room Temperature Sensor ${deviceId}`);
                    this.roomTemperatureSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.roomTemperatureSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Room`);
                    this.roomTemperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                        .setProps({
                            minValue: -35,
                            maxValue: 150,
                            minStep: 0.5
                        })
                        .onGet(async () => {
                            const state = this.roomTemperature;
                            return state;
                        })
                    accessory.addService(this.roomTemperatureSensorService);

                    if (hasOutdoorTemperature && this.outdoorTemperature !== null) {
                        const debug = this.enableDebugMode ? this.emit('debug', `Prepare outdoor temperature sensor service`) : false;
                        this.outdoorTemperatureSensorService = new Service.TemperatureSensor(`${serviceName} Outdoor`, `Outdoor Temperature Sensor ${deviceId}`);
                        this.outdoorTemperatureSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.outdoorTemperatureSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Outdoor`);
                        this.outdoorTemperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                            .setProps({
                                minValue: -35,
                                maxValue: 150,
                                minStep: 0.5
                            })
                            .onGet(async () => {
                                const state = this.outdoorTemperature;
                                return state;
                            })
                        accessory.addService(this.outdoorTemperatureSensorService);
                    };
                };

                //buttons services
                if (buttonsConfiguredCount > 0) {
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare buttons/sensors service`) : false;
                    this.buttonsServices = [];

                    for (let i = 0; i < buttonsConfiguredCount; i++) {
                        const button = buttonsConfigured[i];

                        //get button mode
                        const mode = button.mode;

                        //get button display type
                        const displayType = button.displayType;

                        //get button name
                        const buttonName = button.name || `Button ${i}`;

                        //get button name prefix
                        const buttonNamePrefix = button.namePrefix ?? false;

                        const buttonServiceName = buttonNamePrefix ? `${accessoryName} ${buttonName}` : buttonName;
                        const buttonServiceType = ['', Service.Outlet, Service.Switch, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][displayType];
                        const characteristicType = ['', Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][displayType];
                        const buttonService = new buttonServiceType(buttonServiceName, `Button ${deviceId} ${i}`);
                        buttonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        buttonService.setCharacteristic(Characteristic.ConfiguredName, buttonServiceName);
                        buttonService.getCharacteristic(characteristicType)
                            .onGet(async () => {
                                const state = button.state;
                                return state;
                            })
                            .onSet(async (state) => {
                                if (displayType <= 2) {
                                    try {
                                        switch (mode) {
                                            case 0: //POWER ON,OFF
                                                deviceState.Power = state;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power;
                                                break;
                                            case 1: //OPERATING MODE HEAT
                                                deviceState.Power = true;
                                                deviceState.OperationMode = 1;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.OperationMode;
                                                break;
                                            case 2: //OPERATING MODE DRY
                                                deviceState.Power = true;
                                                deviceState.OperationMode = 2;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.OperationMode;
                                                break
                                            case 3: //OPERATING MODE COOL
                                                deviceState.Power = true;
                                                deviceState.OperationMode = 3;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.OperationMode;
                                                break;
                                            case 4: //OPERATING MODE FAN
                                                deviceState.Power = true;
                                                deviceState.OperationMode = 7;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.OperationMode;
                                                break;
                                            case 5: //OPERATING MODE AUTO
                                                deviceState.Power = true;
                                                deviceState.OperationMode = 8;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.OperationMode;
                                                break;
                                            case 6: //OPERATING MODE PURIFY
                                                deviceState.Power = true;
                                                deviceState.OperationMode = 9;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.OperationMode;
                                                break;
                                            case 7: //OPERATING MODE DRY CONTROL HIDE
                                                deviceState.HideDryModeControl = state;
                                                break;
                                            case 10: //VANE H SWING MODE AUTO
                                                deviceState.Power = true;
                                                deviceState.VaneHorizontal = 0;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.VaneHorizontal;
                                                break;
                                            case 11: //VANE H SWING MODE 1
                                                deviceState.Power = true;
                                                deviceState.VaneHorizontal = 1;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.VaneHorizontal;
                                                break;
                                            case 12: //VANE H SWING MODE 2
                                                deviceState.Power = true;
                                                deviceState.VaneHorizontal = 2;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.VaneHorizontal;
                                                break;
                                            case 13: //VANE H SWING MODE 3
                                                deviceState.Power = true;
                                                deviceState.VaneHorizontal = 3;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.VaneHorizontal;
                                                break;
                                            case 14: //VANE H SWING MODE 4
                                                deviceState.Power = true;
                                                deviceState.VaneHorizontal = 4;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.VaneHorizontal;
                                                break;
                                            case 15: //VANE H SWING MODE 5
                                                deviceState.Power = true;
                                                deviceState.VaneHorizontal = 5;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.VaneHorizontal;
                                                break;
                                            case 16: //VANE H SWING MODE SPLIT
                                                deviceState.Power = true;
                                                deviceState.VaneHorizontal = 8;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.VaneHorizontal;
                                                break;
                                            case 17: //VANE H SWING MODE SWING
                                                deviceState.Power = true;
                                                deviceState.VaneHorizontal = 12;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.VaneHorizontal;
                                                break;
                                            case 20: //VANE V SWING MODE AUTO
                                                deviceState.Power = true;
                                                deviceState.VaneVertical = 0;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.VaneVertical;
                                                break;
                                            case 21: //VANE V SWING MODE 1
                                                deviceState.Power = true;
                                                deviceState.VaneVertical = 1;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.VaneVertical;
                                                break;
                                            case 22: //VANE V SWING MODE 2
                                                deviceState.Power = true;
                                                deviceState.VaneVertical = 2;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.VaneVertical;
                                                break;
                                            case 23: //VANE V SWING MODE 3
                                                deviceState.Power = true;
                                                deviceState.VaneVertical = 3;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.VaneVertical;
                                                break;
                                            case 24: //VANE V SWING MODE 4
                                                deviceState.Power = true;
                                                deviceState.VaneVertical = 4;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.VaneVertical;
                                                break;
                                            case 25: //VANE V SWING MODE 5
                                                deviceState.Power = true;
                                                deviceState.VaneVertical = 5;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.VaneVertical;
                                                break;
                                            case 26: //VANE V SWING MODE SWING
                                                deviceState.Power = true;
                                                deviceState.VaneVertical = 7;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.VaneVertical;
                                                break;
                                            case 27: //VANE H/V CONTROLS HIDE
                                                deviceState.HideVaneControls = state;
                                                break;
                                            case 30: //FAN SPEED MODE AUTO
                                                deviceState.Power = true;
                                                deviceState.SetFanSpeed = 0;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.SetFanSpeed;
                                                break;
                                            case 31: //FAN SPEED MODE 1
                                                deviceState.Power = true;
                                                deviceState.SetFanSpeed = 1;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.SetFanSpeed;
                                                break;
                                            case 32: //FAN SPEED MODE 2
                                                deviceState.Power = true;
                                                deviceState.SetFanSpeed = 2;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.SetFanSpeed;
                                                break;
                                            case 33: //FAN SPEED MODE 3
                                                deviceState.Power = true;
                                                deviceState.SetFanSpeed = 3;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.SetFanSpeed;
                                                break;
                                            case 34: //FAN MODE 4
                                                deviceState.Power = true;
                                                deviceState.SetFanSpeed = 4;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.SetFanSpeed;
                                                break;
                                            case 35: //FAN SPEED MODE 5
                                                deviceState.Power = true;
                                                deviceState.SetFanSpeed = 5;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.SetFanSpeed;
                                                break;
                                            case 36: //FAN SPEED MODE 6
                                                deviceState.Power = true;
                                                deviceState.SetFanSpeed = 6;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power + CONSTANTS.AirConditioner.EffectiveFlags.SetFanSpeed;
                                                break;
                                            case 37: //PHYSICAL LOCK CONTROLS
                                                deviceState.ProhibitSetTemperature = state;
                                                deviceState.ProhibitOperationMode = state;
                                                deviceState.ProhibitPower = state;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Prohibit;
                                                break;
                                            case 38: //PHYSICAL LOCK CONTROLS POWER
                                                deviceState.ProhibitPower = state;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Prohibit;
                                                break;
                                            case 39: //PHYSICAL LOCK CONTROLS MODE
                                                deviceState.ProhibitOperationMode = state;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Prohibit;
                                                break;
                                            case 40: //PHYSICAL LOCK CONTROLS TEMP
                                                deviceState.ProhibitSetTemperature = state;
                                                deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Prohibit;
                                                break;
                                            default:
                                                this.emit('message', `Unknown button mode: ${mode}`);
                                                break;
                                        };

                                        await this.melCloudAta.send(deviceState);
                                        const info = this.disableLogInfo ? false : this.emit('message', `Set: ${buttonName}`);
                                    } catch (error) {
                                        this.emit('error', `Set button error: ${error}`);
                                    };
                                };
                            });
                        this.buttonsServices.push(buttonService);
                        accessory.addService(buttonService);
                    };
                };

                //presets services
                if (presetsCount > 0) {
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare presets service`) : false;
                    this.presetsServices = [];
                    const previousPresets = [];

                    for (let i = 0; i < presetsCount; i++) {
                        const preset = presets[i];
                        const presetName = preset.NumberDescription;

                        const presetService = new Service.Outlet(`${accessoryName} ${presetName}`, `Preset ${deviceId} ${i}`);
                        presetService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        presetService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${presetName}`);
                        presetService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.presetsStates[i];
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    switch (state) {
                                        case true:
                                            previousPresets[i] = deviceState;
                                            deviceState.SetTemperature = preset.SetTemperature;
                                            deviceState.Power = preset.Power;
                                            deviceState.OperationMode = preset.OperationMode;
                                            deviceState.VaneHorizontal = preset.VaneHorizontal;
                                            deviceState.VaneVertical = preset.VaneVertical;
                                            deviceState.SetFanSpeed = preset.FanSpeed;
                                            deviceState.EffectiveFlags = CONSTANTS.AirConditioner.EffectiveFlags.Power;
                                            break;
                                        case false:
                                            deviceState = previousPresets[i];
                                            break;
                                    };

                                    await this.melCloudAta.send(deviceState);
                                    const info = this.disableLogInfo ? false : this.emit('message', `Set: ${presetName}`);
                                } catch (error) {
                                    this.emit('error', `Set preset error: ${error}`);
                                };
                            });
                        previousPresets.push(deviceState);
                        this.presetsServices.push(presetService);
                        accessory.addService(presetService);
                    };
                };
                resolve(accessory);
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = MelCloudDevice;
