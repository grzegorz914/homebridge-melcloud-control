"use strict";
const EventEmitter = require('events');
const MelCloudAtw = require('./melcloudatw.js');
const RestFul = require('./restful.js');
const Mqtt = require('./mqtt.js');
const CONSTANTS = require('./constants.json');
let Accessory, Characteristic, Service, Categories, AccessoryUUID;

class DeviceAtw extends EventEmitter {
    constructor(api, account, melCloud, accountInfo, accountName, contextKey, deviceId, deviceName, deviceTypeText, accountInfoFile, deviceInfoFile) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        AccessoryUUID = api.hap.uuid;

        //account config
        this.displayMode = account.atwDisplayMode || 0;
        this.temperatureSensor = account.atwTemperatureSensor || false;
        this.temperatureSensorFlow = account.atwTemperatureSensorFlow || false;
        this.temperatureSensorReturn = account.atwTemperatureSensorReturn || false;
        this.temperatureSensorFlowZone1 = account.atwTemperatureSensorFlowZone1 || false;
        this.temperatureSensorReturnZone1 = account.atwTemperatureSensorFlowWaterTank || false;
        this.temperatureSensorFlowWaterTank = account.atwTemperatureSensorFlowZone1 || false;
        this.temperatureSensorReturnWaterTank = account.atwTemperatureSensorReturnWaterTank || false;
        this.temperatureSensorFlowZone2 = account.atwTemperatureSensorFlowZone2 || false;
        this.temperatureSensorReturnZone2 = account.atwTemperatureSensorReturnZone2 || false;
        this.presetsEnabled = account.atwPresets || false;
        this.buttons = account.atwButtons || [];
        this.disableLogInfo = account.disableLogInfo || false;
        this.disableLogDeviceInfo = account.disableLogDeviceInfo || false;
        this.enableDebugMode = account.enableDebugMode || false;

        //external integrations
        //restFull
        const restFul = account.restFul || {};
        const restFulEnabled = restFul.enable || false;
        this.restFulConnected = false;

        //mqtt
        const mqtt = account.mqtt || {};
        const mqttEnabled = mqtt.enable || false;
        this.mqttConnected = false;

        //variables
        this.melCloud = melCloud; //function
        this.startPrepareAccessory = true;

        //buttons configured
        this.buttonsConfigured = [];
        for (const button of this.buttons) {
            const buttonName = button.name ?? false;
            const buttonMode = button.mode ?? false;
            const buttonDisplayType = button.displayType ?? 0;
            const buttonNamePrefix = button.namePrefix ?? false;
            if (buttonName && buttonMode && buttonDisplayType > 0) {
                const buttonServiceType = ['', Service.Outlet, Service.Switch, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][buttonDisplayType];
                const buttonCharacteristicType = ['', Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][buttonDisplayType];
                button.namePrefix = buttonNamePrefix;
                button.serviceType = buttonServiceType;
                button.characteristicType = buttonCharacteristicType;
                button.state = false;
                this.buttonsConfigured.push(button);
            } else {
                const log = buttonDisplayType === 0 ? false : this.emit('message', `Button Name: ${buttonName ? buttonName : 'Missing'}, Mode: ${buttonMode ? buttonMode : 'Missing'}.`);
            };
        }
        this.buttonsConfiguredCount = this.buttonsConfigured.length || 0;

        //melcloud device
        this.melCloudAtw = new MelCloudAtw({
            contextKey: contextKey,
            accountInfoFile: accountInfoFile,
            deviceInfoFile: deviceInfoFile,
            debugLog: account.enableDebugMode
        });

        this.melCloudAtw.on('externalIntegrations', (deviceData, deviceState) => {
            //RESTFul server
            if (restFulEnabled) {
                if (!this.restFulConnected) {
                    this.restFul = new RestFul({
                        port: deviceId.slice(-4),
                        debug: restFul.debug || false
                    });

                    this.restFul.on('connected', (message) => {
                        this.restFulConnected = true;
                        this.emit('message', message);
                    })
                        .on('debug', (debug) => {
                            this.emit('debug', debug);
                        })
                        .on('error', (error) => {
                            this.emit('error', error);
                        });
                }
                const restFul = this.restFulConnected ? this.restFul.update('info', deviceData) : false;
                const restFul1 = this.restFulConnected ? this.restFul.update('state', deviceState) : false;
            }

            //MQTT client
            if (mqttEnabled) {
                if (!this.mqttConnected) {
                    this.mqtt = new Mqtt({
                        host: mqtt.host,
                        port: mqtt.port || 1883,
                        clientId: `${mqtt.clientId}_${deviceId}` || `${deviceTypeText}_${deviceName}_${deviceId}`,
                        prefix: `${mqtt.prefix}/${deviceTypeText}/${deviceName}`,
                        user: mqtt.user,
                        passwd: mqtt.passwd,
                        debug: mqtt.debug || false
                    });

                    this.mqtt.on('connected', (message) => {
                        this.mqttConnected = true;
                        this.emit('message', message);
                    })
                        .on('subscribed', (message) => {
                            this.emit('message', message);
                        })
                        .on('subscribedMessage', async (key, value) => {
                            try {
                                switch (key) {
                                    case 'Power':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power;
                                        await this.melCloudAtw.send(deviceState);
                                        break;
                                    case 'OperationMode':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.OperationMode;
                                        await this.melCloudAtw.send(deviceState);
                                        break;
                                    case 'OperationModeZone1':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone1;
                                        await this.melCloudAtw.send(deviceState);
                                        break;
                                    case 'OperationModeZone2':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone2;
                                        await this.melCloudAtw.send(deviceState);
                                        break;
                                    case 'SetTemperatureZone1':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone2;
                                        await this.melCloudAtw.send(deviceState);
                                        break;
                                    case 'SetTemperatureZone2':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone2;
                                        await this.melCloudAtw.send(deviceState);
                                        break;
                                    case 'SetHeatFlowTemperatureZone1':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.SetHeatFlowTemperatureZone1;
                                        await this.melCloudAtw.send(deviceState);
                                        break;
                                    case 'SetHeatFlowTemperatureZone2':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.SetHeatFlowTemperatureZone2;
                                        await this.melCloudAtw.send(deviceState);
                                        break;
                                    case 'SetCoolFlowTemperatureZone1':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.SetCoolFlowTemperatureZone1;
                                        await this.melCloudAtw.send(deviceState);
                                        break;
                                    case 'SetCoolFlowTemperatureZone2':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.SetCoolFlowTemperatureZone2;
                                        await this.melCloudAtw.send(deviceState);
                                        break;
                                    case 'SetTankWaterTemperature':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.SetTankWaterTemperature;
                                        await this.melCloudAtw.send(deviceState);
                                        break;
                                    case 'ForcedHotWaterMode':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                        await this.melCloudAtw.send(deviceState);
                                        break;
                                    case 'EcoHotWater':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.EcoHotWater;
                                        await this.melCloudAtw.send(deviceState);
                                        break;
                                    case 'HolidayMode':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.HolidayMode;
                                        await this.melCloudAtw.send(deviceState);
                                        break;
                                    case 'ProhibitZone1':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.ProhibitZone1;
                                        await this.melCloudAtw.send(deviceState);
                                        break;
                                    case 'ProhibitZone2':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.ProhibitZone2;
                                        await this.melCloudAtw.send(deviceState);
                                        break;
                                    case 'ProhibitHotWater':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.ProhibitHotWater;
                                        await this.melCloudAtw.send(deviceState);
                                        break;
                                    default:
                                        this.emit('message', `MQTT Received unknown key: ${key}, value: ${value}`);
                                        break;
                                };
                            } catch (error) {
                                this.emit('error', `MQTT send error: ${error}.`);
                            };
                        })
                        .on('debug', (debug) => {
                            this.emit('debug', debug);
                        })
                        .on('error', (error) => {
                            this.emit('error', error);
                        });
                }
                const mqtt = this.mqttConnected ? this.mqtt.emit('publish', `Info`, deviceData) : false;
                const mqtt1 = this.mqttConnected ? this.mqtt.emit('publish', `State`, deviceState) : false;
            }
        })
            .on('deviceInfo', (manufacturer, modelIndoor, modelOutdoor, serialNumber, firmwareAppVersion, hasHotWaterTank, hasZone2) => {
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
            })
            .on('deviceState', async (deviceData, deviceState, useFahrenheit) => {
                //device info
                const displayMode = this.displayMode;
                const heatPumpName = 'Heat Pump';
                const hotWaterName = 'Hot Water';
                const zone1Name = deviceData.Zone1Name ?? 'Zone 1';
                const zone2Name = deviceData.Zone2Name ?? 'Zone 2';
                const hasHotWaterTank = deviceData.Device.HasHotWaterTank ?? false;
                const hasZone2 = deviceData.Device.HasZone2 ?? false;
                const canHeat = deviceData.Device.CanHeat ?? false;
                const canCool = deviceData.Device.CanCool ?? false;
                const heatCoolModes = canHeat && canCool ? 0 : canHeat ? 1 : canCool ? 2 : 3;
                const temperatureIncrement = deviceData.Device.TemperatureIncrement ?? 1;
                const minSetTemperature = deviceData.Device.MinSetTemperature ?? 10;
                const maxSetTemperature = deviceData.Device.MaxSetTemperature ?? 30;
                const maxTankTemperature = deviceData.Device.MaxTankTemperature ?? 70;
                const flowTemperature = deviceData.Device.FlowTemperature;
                const flowTemperatureZone1 = deviceData.Device.FlowTemperatureZone1;
                const flowTemperatureZone2 = deviceData.Device.FlowTemperatureZone2;
                const flowTemperatureWaterTank = deviceData.Device.FlowTemperatureBoiler;
                const returnTemperature = deviceData.Device.ReturnTemperature;
                const returnTemperatureZone1 = deviceData.Device.ReturnTemperatureZone1;
                const returnTemperatureZone2 = deviceData.Device.ReturnTemperatureZone2;
                const returnTemperatureWaterTank = deviceData.Device.ReturnTemperatureBoiler;

                this.hasHotWaterTank = hasHotWaterTank;
                this.hasZone2 = hasZone2;
                this.flowTemperature = flowTemperature;
                this.flowTemperatureZone1 = flowTemperatureZone1;
                this.flowTemperatureZone2 = flowTemperatureZone2;
                this.flowTemperatureWaterTank = flowTemperatureWaterTank;
                this.returnTemperature = returnTemperature;
                this.returnTemperatureZone1 = returnTemperatureZone1;
                this.returnTemperatureZone2 = returnTemperatureZone2;
                this.returnTemperatureWaterTank = returnTemperatureWaterTank;

                //zones
                const hotWater = hasHotWaterTank ? 1 : 0;
                const zone2 = hasZone2 ? 1 : 0;
                const zonesCount = 2 + hotWater + zone2;
                const caseHotWater = hasHotWaterTank ? 2 : -1;
                const caseZone2 = hasZone2 ? hasHotWaterTank ? 3 : 2 : -1;

                this.zonesCount = zonesCount;
                this.heatPumpName = heatPumpName;
                this.hotWaterName = hotWaterName;
                this.zone1Name = zone1Name
                this.zone2Name = zone2Name;
                this.heatCoolModes = heatCoolModes;
                this.caseHotWater = caseHotWater;
                this.caseZone2 = caseZone2;
                this.temperatureIncrement = temperatureIncrement;
                this.temperatureUnit = CONSTANTS.TemperatureDisplayUnits[useFahrenheit];
                this.useFahrenheit = useFahrenheit;

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
                const forcedHotWaterMode = deviceState.ForcedHotWaterMode ? 1 : 0;
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
                this.presets = presets;
                this.presetsCount = this.presetsEnabled ? presets.length : 0;

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
                                case 0: //Heat Pump Operation Mode - IDLE, HOT WATER, HEATING ZONES, COOLING, HOT WATER STORAGE, FREEZE STAT, LEGIONELLA, HEATING ECO, MODE 1, MODE 2, MODE 3, HEATING UP /// Unit Status - HEAT, COOL
                                    currentOperationMode = !power ? 0 : [1, 2, 2, 3, 2, 1, 1, 2, 1, 1, 1, 2][operationMode]; //INACTIVE, IDLE, HEATING, COOLING
                                    targetOperationMode = [1, 2][unitStatus]; //AUTO, HEAT, COOL
                                    roomTemperature = outdoorTemperature;
                                    setTemperature = outdoorTemperature;
                                    lockPhysicalControls = hasHotWaterTank && hasZone2 ? (prohibitZone1 && prohibitHotWater && prohibitZone2 ? 1 : 0) : hasHotWaterTank ? (prohibitZone1 && prohibitHotWater ? 1 : 0) : hasZone2 ? (prohibitZone1 && prohibitZone2 ? 1 : 0) : 0;

                                    operationModeSetPropsMinValue = [1, 1, 2, 0][heatCoolModes];
                                    operationModeSetPropsMaxValue = [2, 1, 2, 0][heatCoolModes];
                                    operationModeSetPropsValidValues = [[1, 2], [1], [2], [0]][heatCoolModes];
                                    temperatureSetPropsMinValue = -35;
                                    temperatureSetPropsMaxValue = 100;
                                    break;
                                case 1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                    currentOperationMode = !power ? 0 : idleZone1 ? 1 : [2, 2, 2, 3, 3, 2][operationModeZone1]; //INACTIVE, IDLE, HEATING, COOLING
                                    targetOperationMode = [1, 2, 0, 1, 2, 1][operationModeZone1]; //AUTO, HEAT, COOL
                                    roomTemperature = roomTemperatureZone1;
                                    setTemperature = setTemperatureZone1;
                                    lockPhysicalControls = prohibitZone1 ? 1 : 0;

                                    operationModeSetPropsMinValue = [0, 0, 1, 0][heatCoolModes];
                                    operationModeSetPropsMaxValue = [2, 2, 2, 0][heatCoolModes];
                                    operationModeSetPropsValidValues = [[0, 1, 2], [0, 1, 2], [1, 2], [0]][heatCoolModes];
                                    temperatureSetPropsMinValue = 0;
                                    temperatureSetPropsMaxValue = 31;
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
                                    temperatureSetPropsMinValue = 0;
                                    temperatureSetPropsMaxValue = maxTankTemperature;
                                    break;
                                case caseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                    currentOperationMode = !power ? 0 : idleZone2 ? 1 : [2, 2, 2, 3, 3, 2][operationModeZone2]; //INACTIVE, IDLE, HEATING, COOLING
                                    targetOperationMode = [1, 2, 0, 1, 2, 1][operationModeZone2]; //AUTO, HEAT, COOL
                                    roomTemperature = roomTemperatureZone2;
                                    setTemperature = setTemperatureZone2;
                                    lockPhysicalControls = prohibitZone2 ? 1 : 0;

                                    operationModeSetPropsMinValue = [0, 0, 1, 0][heatCoolModes];
                                    operationModeSetPropsMaxValue = [2, 2, 2, 0][heatCoolModes];
                                    operationModeSetPropsValidValues = [[0, 1, 2], [0, 1, 2], [1, 2], [0]][heatCoolModes];
                                    temperatureSetPropsMinValue = 0;
                                    temperatureSetPropsMaxValue = 31;
                                    break;
                                default: //unknown zone detected
                                    this.emit('message', `Unknown zone: ${i} detected.`);
                                    break;
                            };

                            //update characteristics
                            if (this.melCloudServices && currentOperationMode !== undefined && targetOperationMode !== undefined) {
                                this.melCloudServices[i]
                                    .updateCharacteristic(Characteristic.Active, power)
                                    .updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentOperationMode)
                                    .updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetOperationMode)
                                    .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                                    .updateCharacteristic(Characteristic.LockPhysicalControls, lockPhysicalControls)
                                    .updateCharacteristic(Characteristic.TemperatureDisplayUnits, useFahrenheit);
                                const updateHT = heatCoolModes === 0 || heatCoolModes === 1 ? this.melCloudServices[i].updateCharacteristic(Characteristic.HeatingThresholdTemperature, setTemperature) : false;
                                const updateCT = heatCoolModes === 0 || heatCoolModes === 2 ? this.melCloudServices[i].updateCharacteristic(Characteristic.CoolingThresholdTemperature, setTemperature) : false;
                            }
                            break;
                        case 1: //Thermostat
                            switch (i) {
                                case 0: //Heat Pump Operation Mode - IDLE, HOT WATER, HEATING ZONES, COOLING, HOT WATER STORAGE, FREEZE STAT, LEGIONELLA, HEATING ECO, MODE 1, MODE 2, MODE 3, HEATING UP /// Unit Status - HEAT, COOL
                                    currentOperationMode = !power ? 0 : [0, 1, 1, 2, 1, 0, 0, 1, 0, 0, 0, 1][operationMode]; //OFF, HEAT, COOL
                                    targetOperationMode = !power ? 0 : [1, 2][unitStatus]; //OFF, HEAT, COOL, AUTO
                                    roomTemperature = outdoorTemperature;
                                    setTemperature = outdoorTemperature;

                                    operationModeSetPropsMinValue = [0, 0, 0, 0][heatCoolModes];
                                    operationModeSetPropsMaxValue = [2, 1, 2, 0][heatCoolModes];
                                    operationModeSetPropsValidValues = [[0, 1, 2], [0, 1], [0, 2], [0]][heatCoolModes];
                                    temperatureSetPropsMinValue = -35;
                                    temperatureSetPropsMaxValue = 100;
                                    break;
                                case 1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                    currentOperationMode = !power ? 0 : idleZone1 ? 0 : [1, 1, 1, 2, 2, 1][operationModeZone1]; //OFF, HEAT, COOL
                                    targetOperationMode = [1, 2, 3, 1, 2, 1][operationModeZone1]; //OFF, HEAT, COOL, AUTO
                                    roomTemperature = roomTemperatureZone1;
                                    setTemperature = setTemperatureZone1;

                                    operationModeSetPropsMinValue = [1, 1, 1, 0][heatCoolModes];
                                    operationModeSetPropsMaxValue = [3, 3, 2, 0][heatCoolModes];
                                    operationModeSetPropsValidValues = [[1, 2, 3], [1, 2, 3], [1, 2], [0]][heatCoolModes];
                                    temperatureSetPropsMinValue = 0;
                                    temperatureSetPropsMaxValue = 31;
                                    break;
                                case caseHotWater: //Hot Water - NORMAL, HEAT NOW
                                    currentOperationMode = !power ? 0 : operationMode === 1 ? 1 : [0, 1][forcedHotWaterMode]; //OFF, HEAT, COOL
                                    targetOperationMode = [3, 1][forcedHotWaterMode] //OFF, HEAT, COOL, AUTO
                                    roomTemperature = tankWaterTemperature;
                                    setTemperature = setTankWaterTemperature;

                                    operationModeSetPropsMinValue = 1;
                                    operationModeSetPropsMaxValue = 3;
                                    operationModeSetPropsValidValues = [1, 3];
                                    temperatureSetPropsMinValue = 0;
                                    temperatureSetPropsMaxValue = 60;
                                    break;
                                case caseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                    currentOperationMode = !power ? 0 : idleZone2 ? 0 : [1, 1, 1, 2, 2, 1][operationModeZone2]; //OFF, HEAT, COOL
                                    targetOperationMode = [1, 2, 3, 1, 2, 1][operationModeZone2]; //OFF, HEAT, COOL, AUTO
                                    roomTemperature = roomTemperatureZone2;
                                    setTemperature = setTemperatureZone2;

                                    operationModeSetPropsMinValue = [1, 1, 1, 0][heatCoolModes];
                                    operationModeSetPropsMaxValue = [3, 3, 2, 0][heatCoolModes];
                                    operationModeSetPropsValidValues = [[1, 2, 3], [1, 2, 3], [1, 2], [0]][heatCoolModes];
                                    temperatureSetPropsMinValue = 0;
                                    temperatureSetPropsMaxValue = 31;
                                    break;
                                default: //unknown zone detected
                                    this.emit('message', `Unknown zone: ${i} detected.`);
                                    break;
                            };

                            //update characteristics
                            if (this.melCloudServices && currentOperationMode !== undefined && targetOperationMode !== undefined) {
                                this.melCloudServices[i]
                                    .updateCharacteristic(Characteristic.CurrentHeatingCoolingState, currentOperationMode)
                                    .updateCharacteristic(Characteristic.TargetHeatingCoolingState, targetOperationMode)
                                    .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                                    .updateCharacteristic(Characteristic.TargetTemperature, setTemperature)
                                    .updateCharacteristic(Characteristic.TemperatureDisplayUnits, useFahrenheit);
                            }
                            break;
                        default: //unknown display type detected
                            this.emit('message', `Unknown display type: ${displayType} detected.`);
                            break;
                    };

                    //push value to arrays
                    this.currentOperationModes.push(currentOperationMode);
                    this.targetOperationModes.push(targetOperationMode);
                    this.roomTemperatures.push(roomTemperature);
                    this.setTemperatures.push(setTemperature);
                    this.lockPhysicalsControls.push(lockPhysicalControls);

                    //push only 1 time for every zone
                    const push = this.startPrepareAccessory ? this.operationModesSetPropsMinValue.push(operationModeSetPropsMinValue) : false;
                    const push1 = this.startPrepareAccessory ? this.operationModesSetPropsMaxValue.push(operationModeSetPropsMaxValue) : false;
                    const push2 = this.startPrepareAccessory ? this.operationModesSetPropsValidValues.push(operationModeSetPropsValidValues) : false;
                    const push3 = this.startPrepareAccessory ? this.temperaturesSetPropsMinValue.push(temperatureSetPropsMinValue) : false;
                    const push4 = this.startPrepareAccessory ? this.temperaturesSetPropsMaxValue.push(temperatureSetPropsMaxValue) : false;

                    //update temperature sensors
                    switch (i) {
                        case 0: //Heat Pump
                            if (this.roomTemperatureSensorService) {
                                this.roomTemperatureSensorService
                                    .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                            };

                            if (this.flowTemperatureSensorService) {
                                this.flowTemperatureSensorService
                                    .updateCharacteristic(Characteristic.CurrentTemperature, flowTemperature)
                            };

                            if (this.returnTemperatureSensorService) {
                                this.returnTemperatureSensorService
                                    .updateCharacteristic(Characteristic.CurrentTemperature, returnTemperature)
                            };
                            break;
                        case 1: //Zone 1
                            if (this.roomTemperatureZone1SensorService) {
                                this.roomTemperatureZone1SensorService
                                    .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                            };

                            if (this.flowTemperatureZone1SensorService) {
                                this.flowTemperatureZone1SensorService
                                    .updateCharacteristic(Characteristic.CurrentTemperature, flowTemperatureZone1)
                            };

                            if (this.returnTemperatureZone1SensorService) {
                                this.returnTemperatureZone1SensorService
                                    .updateCharacteristic(Characteristic.CurrentTemperature, returnTemperatureZone1)
                            };
                            break;
                        case caseHotWater: //Hot Water
                            if (this.roomTemperatureWaterTankSensorService) {
                                this.roomTemperatureWaterTankSensorService
                                    .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                            };

                            if (this.flowTemperatureWaterTankSensorService) {
                                this.flowTemperatureWaterTankSensorService
                                    .updateCharacteristic(Characteristic.CurrentTemperature, flowTemperatureWaterTank)
                            };

                            if (this.returnTemperatureWaterTankSensorService) {
                                this.returnTemperatureWaterTankSensorService
                                    .updateCharacteristic(Characteristic.CurrentTemperature, returnTemperatureWaterTank)
                            };
                            break;
                        case caseZone2: //Zone 2
                            if (this.roomTemperatureZone2SensorService) {
                                this.roomTemperatureZone2SensorService
                                    .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                            };

                            if (this.flowTemperatureZone2SensorService) {
                                this.flowTemperatureZone2SensorService
                                    .updateCharacteristic(Characteristic.CurrentTemperature, flowTemperatureZone2)
                            };

                            if (this.returnTemperatureZone2SensorService) {
                                this.returnTemperatureZone2SensorService
                                    .updateCharacteristic(Characteristic.CurrentTemperature, returnTemperatureZone2)
                            };
                            break;
                    };

                    //log current state
                    if (!this.disableLogInfo) {
                        let operationModeText = '';
                        switch (i) {
                            case 0: //Heat Pump - HEAT, COOL, OFF
                                this.emit('message', `${heatPumpName}, Power: ${power ? 'ON' : 'OFF'}`)
                                this.emit('message', `${heatPumpName}, Operation mode: ${!power ? CONSTANTS.HeatPump.System[0] : CONSTANTS.HeatPump.System[unitStatus]}`);
                                this.emit('message', `${heatPumpName},'Outdoor temperature: ${roomTemperature}${this.temperatureUnit}`);
                                const info = flowTemperature !== null ? this.emit('message', `${heatPumpName}, Flow temperature: ${flowTemperature}${this.temperatureUnit}`) : false;
                                const info1 = returnTemperature !== null ? this.emit('message', `${heatPumpName}, Return temperature: ${returnTemperature}${this.temperatureUnit}`) : false;
                                this.emit('message', `${heatPumpName}, Temperature display unit: ${this.temperatureUnit}`);
                                this.emit('message', `${heatPumpName}, Lock physical controls: ${lockPhysicalControls ? 'LOCKED' : 'UNLOCKED'}`);
                                break;
                            case 1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                operationModeText = idleZone1 ? CONSTANTS.HeatPump.ZoneOperation[6] : CONSTANTS.HeatPump.ZoneOperation[operationModeZone1];
                                this.emit('message', `${zone1Name}, Operation mode: ${!power ? CONSTANTS.HeatPump.System[0] : operationModeText}`);
                                this.emit('message', `${zone1Name}, Temperature: ${roomTemperature}${this.temperatureUnit}`);
                                this.emit('message', `${zone1Name}, Target temperature: ${setTemperature}${this.temperatureUnit}`)
                                const info2 = flowTemperatureZone1 !== null ? this.emit('message', `${zone1Name}, Flow temperature: ${flowTemperatureZone1}${this.temperatureUnit}`) : false;
                                const info3 = returnTemperatureZone1 !== null ? this.emit('message', `${zone1Name}, Return temperature: ${returnTemperatureZone1}${this.temperatureUnit}`) : false;
                                this.emit('message', `${zone1Name}, Temperature display unit: ${this.temperatureUnit}`);
                                this.emit('message', `${zone1Name}, Lock physical controls: ${lockPhysicalControls ? 'LOCKED' : 'UNLOCKED'}`);
                                break;
                            case caseHotWater: //Hot Water - AUTO, HEAT NOW
                                operationModeText = operationMode === 1 ? CONSTANTS.HeatPump.ForceDhw[1] : CONSTANTS.HeatPump.ForceDhw[forcedHotWaterMode ? 1 : 0];
                                this.emit('message', `${hotWaterName}, Operation mode: ${!power ? CONSTANTS.HeatPump.System[0] : operationModeText}`);
                                this.emit('message', `${hotWaterName}, Temperature: ${roomTemperature}${this.temperatureUnit}`);
                                this.emit('message', `${hotWaterName}, Target temperature: ${setTemperature}${this.temperatureUnit}`)
                                const info4 = flowTemperatureWaterTank !== null ? this.emit('message', `${hotWaterName}, Flow temperature: ${flowTemperatureWaterTank}${this.temperatureUnit}`) : false;
                                const info5 = returnTemperatureWaterTank !== null ? this.emit('message', `${hotWaterName}, Return temperature: ${returnTemperatureWaterTank}${this.temperatureUnit}`) : false;
                                this.emit('message', `${hotWaterName}, Temperature display unit: ${this.temperatureUnit}`);
                                this.emit('message', `${hotWaterName}, Lock physical controls: ${lockPhysicalControls ? 'LOCKED' : 'UNLOCKED'}`);
                                break;
                            case caseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                operationModeText = idleZone2 ? CONSTANTS.HeatPump.ZoneOperation[6] : CONSTANTS.HeatPump.ZoneOperation[operationModeZone2];
                                this.emit('message', `${zone2Name}, Operation mode: ${!power ? CONSTANTS.HeatPump.System[0] : operationModeText}`);
                                this.emit('message', `${zone2Name}, Temperature: ${roomTemperature}${this.temperatureUnit}`);
                                this.emit('message', `${zone2Name}, Target temperature: ${setTemperature}${this.temperatureUnit}`)
                                const info6 = flowTemperatureZone2 !== null ? this.emit('message', `${zone2Name}, Flow temperature: ${flowTemperatureZone2}${this.temperatureUnit}`) : false;
                                const info7 = roomTemperatureZone2 !== null ? this.emit('message', `${zone2Name}, Return temperature: ${roomTemperatureZone2}${this.temperatureUnit}`) : false;
                                this.emit('message', `${zone2Name}, Temperature display unit: ${this.temperatureUnit}`);
                                this.emit('message', `${zone2Name}, Lock physical controls: ${lockPhysicalControls ? 'LOCKED' : 'UNLOCKED'}`);
                                break;
                        };
                    };
                };

                this.unitStatus = unitStatus;
                this.idleZone1 = idleZone1;
                this.idleZone2 = idleZone2;
                this.power = power;
                this.offline = offline;

                //update buttons state
                if (this.buttonsConfiguredCount > 0) {
                    for (let i = 0; i < this.buttonsConfiguredCount; i++) {
                        const button = this.buttonsConfigured[i];
                        const mode = this.buttonsConfigured[i].mode;
                        switch (mode) {
                            case 0: //POWER ON,OFF
                                button.state = (power === true);
                                break;
                            case 1: //HEAT PUMP HEAT
                                button.state = power ? (operationMode === 0) : false;
                                break;
                            case 2: //COOL
                                button.state = power ? (operationMode === 1) : false;
                                break;
                            case 53: //HOLIDAY
                                button.state = power ? (holidayMode === true) : false;
                                break;
                            case 10: //ALL ZONES PHYSICAL LOCK CONTROL
                                button.state = power ? (prohibitZone1 === true && prohibitHotWater === true && prohibitZone2 === true) : false;
                                break;
                            case 20: //HOT WATER AUTO
                                button.state = power ? (forcedHotWaterMode === false) : false;
                                break;
                            case 21: //ECO
                                button.state = power ? (ecoHotWater === true) : false;
                                break;
                            case 22: //FORCE HEAT
                                button.state = power ? (forcedHotWaterMode === true) : false;
                                break;
                            case 30: //PHYSICAL LOCK CONTROL
                                button.state = (prohibitHotWater === true);
                                break;
                            case 40: //ZONE 1 HEAT THERMOSTAT
                                button.state = power ? (operationModeZone1 === 0) : false;
                                break;
                            case 41: //HEAT FLOW
                                button.state = power ? (operationModeZone1 === 1) : false;
                                break;
                            case 42: //HEAT CURVE
                                button.state = power ? (operationModeZone1 === 2) : false;
                                break;
                            case 43: //COOL THERMOSTAT
                                button.state = power ? (operationModeZone1 === 3) : false;
                                break;
                            case 44: //COOL FLOW
                                button.state = power ? (operationModeZone1 === 4) : false;
                                break;
                            case 45: //FLOOR DRY UP
                                button.state = power ? (operationModeZone1 === 5) : false;
                                break;
                            case 50: //PHYSICAL LOCK CONTROL
                                button.state = (prohibitZone1 === true);
                                break;
                            case 60: //ZONE 2 HEAT THERMOSTAT
                                button.state = power ? (operationModeZone2 === 0) : false;
                                break;
                            case 61: //HEAT FLOW
                                button.state = power ? (operationModeZone2 === 1) : false;
                                break;
                            case 62: //HEAT CURVE
                                button.state = power ? (operationModeZone2 === 2) : false;
                                break;
                            case 63: //COOL THERMOSTAT
                                button.state = power ? (operationModeZone2 === 3) : false;
                                break;
                            case 64: //COOL FLOW
                                button.state = power ? (operationModeZone2 === 4) : false;
                                break;
                            case 65: //FLOOR DRY UP
                                button.state = power ? (operationModeZone2 === 5) : false;
                                break;
                            case 70: //PHYSICAL LOCK CONTROL
                                button.state = (prohibitZone2 === true);
                                break;
                            default: //Unknown button
                                this.emit('message', `Unknown button mode: ${mode} detected.`);
                                break;
                        };

                        //update services
                        if (this.buttonsServices) {
                            const characteristicType = button.characteristicType;
                            this.buttonsServices[i]
                                .updateCharacteristic(characteristicType, button.state)
                        };
                    };
                };

                //update presets state
                if (this.presetsCount > 0) {
                    this.presetsStates = [];

                    for (let i = 0; i < this.presetsCount; i++) {
                        const preset = presets[i];
                        const state = preset.Power === power
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
                        this.presetsStates.push(state);

                        if (this.presetsServices) {
                            this.presetsServices[i]
                                .updateCharacteristic(Characteristic.On, state)
                        };
                    };
                };

                //start prepare accessory
                if (this.startPrepareAccessory) {
                    try {
                        await new Promise(resolve => setTimeout(resolve, 150));
                        const accessory = await this.prepareAccessory(accountInfo, deviceState, deviceId, deviceTypeText, deviceName, accountName);
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
            });
    };

    //prepare accessory
    async prepareAccessory(accountInfo, deviceState, deviceId, deviceTypeText, deviceName, accountName) {
        try {
            //accessory
            const debug = this.enableDebugMode ? this.emit('debug', `Prepare accessory`) : false;
            const accessoryName = deviceName;
            const accessoryUUID = AccessoryUUID.generate(accountName + deviceId.toString());
            const accessoryCategory = Categories.AIR_HEATER;
            const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

            //information service
            const debug1 = this.enableDebugMode ? this.emit('debug', `Prepare information service`) : false;
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
                .setCharacteristic(Characteristic.Model, this.model)
                .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
                .setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

            //melcloud services
            const zonesCount = this.zonesCount;
            const temperatureSensor = this.temperatureSensor;
            const temperatureSensorFlow = this.temperatureSensorFlow;
            const temperatureSensorReturn = this.temperatureSensorReturn;
            const temperatureSensorFlowZone1 = this.temperatureSensorFlowZone1;
            const temperatureSensorReturnZone1 = this.temperatureSensorReturnZone1;
            const temperatureSensorFlowWaterTank = this.temperatureSensorFlowWaterTank;
            const temperatureSensorReturnWaterTank = this.temperatureSensorReturnWaterTank;
            const temperatureSensorFlowZone2 = this.temperatureSensorFlowZone2;
            const temperatureSensorReturnZone2 = this.temperatureSensorReturnZone2;
            const buttonsConfigured = this.buttonsConfigured;
            const buttonsConfiguredCount = this.buttonsConfiguredCount;
            const presets = this.presets;
            const presetsCount = this.presetsCount;
            const displayMode = this.displayMode;
            const caseHotWater = this.caseHotWater;
            const caseZone2 = this.caseZone2;
            const heatCoolModes = this.heatCoolModes;

            this.melCloudServices = [];
            for (let i = 0; i < zonesCount; i++) {
                const zoneName = [this.heatPumpName, this.zone1Name, this.hotWaterName, this.zone2Name][i];
                const serviceName = `${deviceTypeText} ${accessoryName}: ${zoneName}`;
                switch (displayMode) {
                    case 0: //Heater Cooler
                        const debug = this.enableDebugMode ? this.emit('debug', `Prepare heather/cooler ${zoneName} service`) : false;
                        const melCloudService = new Service.HeaterCooler(serviceName, `HeaterCooler ${deviceId} ${i}`);
                        melCloudService.getCharacteristic(Characteristic.Active)
                            .onGet(async () => {
                                const state = this.power;
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    switch (i) {
                                        case 0: //Heat Pump
                                            deviceState.Power = state;
                                            deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power;
                                            await this.melCloudAtw.send(deviceState);
                                            const info = this.disableLogInfo ? false : this.emit('message', `${zoneName}, Set power: ${state ? 'ON' : 'OFF'}`);
                                            break;
                                    };
                                } catch (error) {
                                    this.emit('error', `Set power error: ${error}`);
                                    melCloudService.updateCharacteristic(Characteristic.Active, false)
                                };
                            });
                        melCloudService.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
                            .onGet(async () => {
                                const value = this.currentOperationModes[i];
                                return value;
                            });
                        melCloudService.getCharacteristic(Characteristic.TargetHeaterCoolerState)
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
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power;
                                                    break;
                                                case 1: //HEAT
                                                    deviceState.Power = true;
                                                    deviceState.UnitStatus = 0;
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power + CONSTANTS.HeatPump.EffectiveFlags.OperationMode;
                                                    break;
                                                case 2: //COOL
                                                    deviceState.Power = true;
                                                    deviceState.UnitStatus = 1;
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power + CONSTANTS.HeatPump.EffectiveFlags.OperationMode;
                                                    break;
                                            };
                                            operationModeText = !this.power ? CONSTANTS.HeatPump.System[0] : CONSTANTS.HeatPump.System[deviceState.UnitStatus];
                                            break;
                                        case 1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                            switch (value) {
                                                case 0: //AUTO - HEAT CURVE
                                                    deviceState.OperationModeZone1 = 2;
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone1;
                                                    break;
                                                case 1: //HEAT - HEAT THERMOSTAT / COOL THERMOSTAT
                                                    deviceState.OperationModeZone1 = [0, 3][this.unitStatus];
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone1;
                                                    break;
                                                case 2: //COOL - HEAT FLOW / COOL FLOW
                                                    deviceState.OperationModeZone1 = [1, 4][this.unitStatus];
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone1;
                                                    break;
                                            };
                                            operationModeText = CONSTANTS.HeatPump.ZoneOperation[deviceState.OperationModeZone1];
                                            break;
                                        case caseHotWater: //Hot Water - AUTO, HEAT NOW
                                            switch (value) {
                                                case 0: //AUTO
                                                    deviceState.ForcedHotWaterMode = false;
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                    break;
                                                case 1: //HEAT
                                                    deviceState.ForcedHotWaterMode = true;
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                    break;
                                                case 2: //COOL
                                                    deviceState.ForcedHotWaterMode = false;
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                    break
                                            };
                                            operationModeText = deviceState.OperationMode === 1 ? CONSTANTS.HeatPump.ForceDhw[1] : CONSTANTS.HeatPump.ForceDhw[deviceState.ForcedHotWaterMode ? 1 : 0];
                                            break;
                                        case caseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                            switch (value) {
                                                case 0: //AUTO
                                                    deviceState.OperationModeZone2 = 2;
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone2;
                                                    break;
                                                case 1: //HEAT - HEAT THERMOSTAT / COOL THERMOSTAT
                                                    deviceState.OperationModeZone2 = [0, 3][this.unitStatus];
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone2;
                                                    break;
                                                case 2: //COOL - HEAT FLOW / COOL FLOW
                                                    deviceState.OperationModeZone2 = [1, 4][this.unitStatus];
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone2;
                                                    break;
                                            };
                                            operationModeText = CONSTANTS.HeatPump.ZoneOperation[deviceState.OperationModeZone2];
                                            break;
                                    };

                                    await this.melCloudAtw.send(deviceState);
                                    const info = this.disableLogInfo ? false : this.emit('message', `${zoneName}, Set operation mode: ${operationModeText}`);
                                } catch (error) {
                                    this.emit('error', `${zoneName}, Set operation mode error: ${error}`);
                                };
                            });
                        melCloudService.getCharacteristic(Characteristic.CurrentTemperature)
                            .setProps({
                                minValue: -35,
                                maxValue: 150,
                                minStep: 0.5
                            })
                            .onGet(async () => {
                                const value = this.roomTemperatures[i];
                                return value;
                            });
                        //device can heat/cool or only heat
                        if (heatCoolModes === 0 || heatCoolModes === 1) {
                            melCloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
                                .setProps({
                                    minValue: this.temperaturesSetPropsMinValue[i],
                                    maxValue: this.temperaturesSetPropsMaxValue[i],
                                    minStep: this.temperatureIncrement
                                })
                                .onGet(async () => {
                                    const value = this.setTemperatures[i];
                                    return value;
                                })
                                .onSet(async (value) => {
                                    try {
                                        switch (i) {
                                            case 0: //Heat Pump
                                                //deviceState.SetTemperatureZone1 = value;
                                                //deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                break;
                                            case 1: //Zone 1
                                                deviceState.SetTemperatureZone1 = value;
                                                deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                break;
                                            case caseHotWater: //Hot Water
                                                deviceState.SetTankWaterTemperature = value;
                                                deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.SetTankWaterTemperature;
                                                break;
                                            case caseZone2: //Zone 2
                                                deviceState.SetTemperatureZone2 = value;
                                                deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone2;
                                                break;
                                        };

                                        const set = i > 0 ? await this.melCloudAtw.send(deviceState) : false;
                                        const info = this.disableLogInfo || i === 0 ? false : this.emit('message', `${zoneName}, Set heating threshold temperature: ${value}${this.temperatureUnit}`);
                                    } catch (error) {
                                        this.emit('error', `${zoneName}, Set heating threshold temperature error: ${error}`);
                                    };
                                });
                        };
                        //only for heat/cool, only cool and not for hot water tank
                        if ((heatCoolModes === 0 || heatCoolModes === 2) && i !== caseHotWater) {
                            melCloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
                                .setProps({
                                    minValue: this.temperaturesSetPropsMinValue[i],
                                    maxValue: this.temperaturesSetPropsMaxValue[i],
                                    minStep: this.temperatureIncrement
                                })
                                .onGet(async () => {
                                    const value = this.setTemperatures[i];
                                    return value;
                                })
                                .onSet(async (value) => {
                                    try {
                                        switch (i) {
                                            case 0: //Heat Pump
                                                //deviceState.SetTemperatureZone1 = value;
                                                //deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                break;
                                            case 1: //Zone 1
                                                deviceState.SetTemperatureZone1 = value;
                                                deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                break;
                                            case caseHotWater: //Hot Water
                                                deviceState.SetTankWaterTemperature = value;
                                                deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.SetTankWaterTemperature;
                                                break;
                                            case caseZone2: //Zone 2
                                                deviceState.SetTemperatureZone2 = value;
                                                deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone2;
                                                break;
                                        };

                                        const set = i > 0 ? await this.melCloudAtw.send(deviceState) : false;
                                        const info = this.disableLogInfo || i === 0 ? false : this.emit('message', `${zoneName}, Set cooling threshold temperature: ${value}${this.temperatureUnit}`);
                                    } catch (error) {
                                        this.emit('error', `${zoneName}, Set cooling threshold temperature error: ${error}`);
                                    };
                                });
                        };
                        melCloudService.getCharacteristic(Characteristic.LockPhysicalControls)
                            .onGet(async () => {
                                const value = this.lockPhysicalsControls[i];
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
                                            CONSTANTS.HeatPump.EffectiveFlags.ProhibitHeatingZone1 + CONSTANTS.HeatPump.EffectiveFlags.ProhibitHotWater + CONSTANTS.HeatPump.EffectiveFlags.ProhibitHeatingZone2;
                                            break;
                                        case 1: //Zone 1
                                            deviceState.ProhibitZone1 = value;
                                            CONSTANTS.HeatPump.EffectiveFlags.ProhibitHeatingZone1;
                                            break;
                                        case caseHotWater: //Hot Water
                                            deviceState.ProhibitHotWater = value;
                                            CONSTANTS.HeatPump.EffectiveFlags.ProhibitHotWater;
                                            break;
                                        case caseZone2: //Zone 2
                                            deviceState.ProhibitZone2 = value;
                                            CONSTANTS.HeatPump.EffectiveFlags.ProhibitHeatingZone2;
                                            break;
                                    };

                                    await this.melCloudAtw.send(deviceState);
                                    const info = this.disableLogInfo ? false : this.emit('message', `${zoneName}, Set lock physical controls: ${value ? 'LOCK' : 'UNLOCK'}`);
                                } catch (error) {
                                    this.emit('error', `${zoneName}, Set lock physical controls error: ${error}`);
                                };
                            });
                        melCloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
                            .onGet(async () => {
                                const value = this.useFahrenheit;
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    this.useFahrenheit = value ? true : false;
                                    accountInfo.UseFahrenheit = this.useFahrenheit;
                                    await this.melCloud.send(accountInfo);
                                    const info = this.disableLogInfo ? false : this.emit('message', `Set temperature display unit: ${CONSTANTS.TemperatureDisplayUnits[value]}`);
                                } catch (error) {
                                    this.emit('error', `Set temperature display unit error: ${error}`);
                                };
                            });
                        this.melCloudServices.push(melCloudService);
                        accessory.addService(melCloudService);
                        break;
                    case 1: //Thermostat
                        const debug3 = this.enableDebugMode ? this.emit('debug', `Prepare thermostat ${zoneName} service`) : false;
                        const melCloudServiceT = new Service.Thermostat(serviceName, `Thermostat ${deviceId} ${i}`);
                        melCloudServiceT.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
                            .onGet(async () => {
                                const value = this.currentOperationModes[i];
                                return value;
                            });
                        melCloudServiceT.getCharacteristic(Characteristic.TargetHeatingCoolingState)
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
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power;
                                                    break;
                                                case 1: //HEAT
                                                    deviceState.Power = true;
                                                    deviceState.UnitStatus = 0;
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power + CONSTANTS.HeatPump.EffectiveFlags.OperationMode;
                                                    break;
                                                case 2: //COOL
                                                    deviceState.Power = true;
                                                    deviceState.UnitStatus = 1;
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power + CONSTANTS.HeatPump.EffectiveFlags.OperationMode;
                                                    break;
                                                case 3: //AUTO
                                                    deviceState.Power = true;
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power;
                                                    break;
                                            };
                                            operationModeText = !this.power ? CONSTANTS.HeatPump.System[0] : CONSTANTS.HeatPump.System[deviceState.UnitStatus];
                                            break;
                                        case 1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                            switch (value) {
                                                case 0: //OFF - HEAT CURVE
                                                    deviceState.OperationModeZone1 = 2;
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone1;
                                                    break;
                                                case 1: //HEAT - HEAT THERMOSTAT / COOL THERMOSTAT
                                                    deviceState.OperationModeZone1 = [0, 3][this.unitStatus];
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone1;
                                                    break;
                                                case 2: //COOL - HEAT FLOW / COOL FLOW
                                                    deviceState.OperationModeZone1 = [1, 4][this.unitStatus];
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone1;
                                                    break;
                                                case 3: //AUTO - HEAT CURVE
                                                    deviceState.OperationModeZone1 = 2;
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone1;
                                                    break;
                                            };
                                            operationModeText = CONSTANTS.HeatPump.ZoneOperation[deviceState.OperationModeZone1];
                                            break;
                                        case caseHotWater: //Hot Water - AUTO, HEAT NOW
                                            switch (value) {
                                                case 0: //OFF
                                                    deviceState.ForcedHotWaterMode = false;
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                    break;
                                                case 1: //HEAT
                                                    deviceState.ForcedHotWaterMode = true;
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                    break;
                                                case 2: //COOL
                                                    deviceState.ForcedHotWaterMode = false;
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                    break;
                                                case 3: //AUTO
                                                    deviceState.ForcedHotWaterMode = false;
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                    break;
                                            };
                                            operationModeText = deviceState.OperationMode === 1 ? CONSTANTS.HeatPump.ForceDhw[1] : CONSTANTS.HeatPump.ForceDhw[deviceState.ForcedHotWaterMode ? 1 : 0];
                                            break;
                                        case caseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                            switch (value) {
                                                case 0: //OFF - HEAT CURVE
                                                    deviceState.OperationModeZone2 = 2;
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone2;
                                                    break;
                                                case 1: //HEAT - HEAT THERMOSTAT / COOL THERMOSTAT
                                                    deviceState.OperationModeZone2 = [0, 3][this.unitStatus];
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone2;
                                                    break;
                                                case 2: //COOL - HEAT FLOW / COOL FLOW
                                                    deviceState.OperationModeZone2 = [1, 4][this.unitStatus];
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone2;
                                                    break;
                                                case 3: //AUTO - HEAT CURVE
                                                    deviceState.OperationModeZone2 = 2;
                                                    deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone2;
                                                    break;
                                            };
                                            operationModeText = CONSTANTS.HeatPump.ZoneOperation[deviceState.OperationModeZone2];
                                            break;
                                    };

                                    await this.melCloudAtw.send(deviceState);
                                    const info = this.disableLogInfo ? false : this.emit('message', `${zoneName}, Set operation mode: ${operationModeText}`);
                                } catch (error) {
                                    this.emit('error', `${zoneName}, Set operation mode error: ${error}`);
                                };
                            });
                        melCloudServiceT.getCharacteristic(Characteristic.CurrentTemperature)
                            .setProps({
                                minValue: -35,
                                maxValue: 150,
                                minStep: 0.5
                            })
                            .onGet(async () => {
                                const value = this.roomTemperatures[i];
                                return value;
                            });
                        melCloudServiceT.getCharacteristic(Characteristic.TargetTemperature)
                            .setProps({
                                minValue: this.temperaturesSetPropsMinValue[i],
                                maxValue: this.temperaturesSetPropsMaxValue[i],
                                minStep: this.temperatureIncrement
                            })
                            .onGet(async () => {
                                const value = this.setTemperatures[i];
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    switch (i) {
                                        case 0: //Heat Pump
                                            //deviceState.SetTemperatureZone1 = value;
                                            //deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                            break;
                                        case 1: //Zone 1
                                            deviceState.SetTemperatureZone1 = value;
                                            deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                            break;
                                        case caseHotWater: //Hot Water
                                            deviceState.SetTankWaterTemperature = value;
                                            deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.SetTankWaterTemperature;
                                            break;
                                        case caseZone2: //Zone 2
                                            deviceState.SetTemperatureZone2 = value;
                                            deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone2;
                                            break;
                                    };

                                    const set = i > 0 ? await this.melCloudAtw.send(deviceState) : false;
                                    const info = this.disableLogInfo || i === 0 ? false : this.emit('message', `${zoneName}, Set temperature: ${value}${this.temperatureUnit}`);
                                } catch (error) {
                                    this.emit('error', `${zoneName}, Set temperature error: ${error}`);
                                };
                            });
                        melCloudServiceT.getCharacteristic(Characteristic.TemperatureDisplayUnits)
                            .onGet(async () => {
                                const value = this.useFahrenheit;
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    this.useFahrenheit = value ? true : false;
                                    accountInfo.UseFahrenheit = this.useFahrenheit;
                                    await this.melCloud.send(accountInfo);
                                    const info = this.disableLogInfo ? false : this.emit('message', `Set temperature display unit: ${CONSTANTS.TemperatureDisplayUnits[value]}`);
                                } catch (error) {
                                    this.emit('error', `Set temperature display unit error: ${error}`);
                                };
                            });
                        this.melCloudServices.push(melCloudServiceT);
                        accessory.addService(melCloudServiceT);
                        break;
                };

                //temperature sensor services zones
                switch (i) {
                    case 0: //Heat Pump
                        if (temperatureSensor && this.roomTemperatures[i] !== null) {
                            const debug = this.enableDebugMode ? this.emit('debug', `${zoneName}, Prepare temperature sensor service`) : false;
                            this.roomTemperatureSensorService = new Service.TemperatureSensor(`${serviceName}`, `${zoneName} Temperature Sensor ${deviceId} ${i}`);
                            this.roomTemperatureSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.roomTemperatureSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName}`);
                            this.roomTemperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                .setProps({
                                    minValue: -35,
                                    maxValue: 150,
                                    minStep: 0.5
                                })
                                .onGet(async () => {
                                    const state = this.roomTemperatures[i];
                                    return state;
                                })
                            accessory.addService(this.roomTemperatureSensorService);
                        };

                        if (temperatureSensorFlow && this.flowTemperature !== null) {
                            const debug = this.enableDebugMode ? this.emit('debug', `Prepare flow temperature sensor service`) : false;
                            this.flowTemperatureSensorService = new Service.TemperatureSensor(`${serviceName} Flow`, `${zoneName} Temperature Sensor Flow ${deviceId} ${i}`);
                            this.flowTemperatureSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.flowTemperatureSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName} Flow`);
                            this.flowTemperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                .setProps({
                                    minValue: -35,
                                    maxValue: 150,
                                    minStep: 0.5
                                })
                                .onGet(async () => {
                                    const state = this.flowTemperature;
                                    return state;
                                })
                            accessory.addService(this.flowTemperatureSensorService);

                        };
                        if (temperatureSensorReturn && this.returnTemperature !== null) {
                            const debug1 = this.enableDebugMode ? this.emit('debug', `Prepare return temperature sensor service`) : false;
                            this.returnTemperatureSensorService = new Service.TemperatureSensor(`${serviceName} Return`, `${zoneName} Temperature Sensor Return ${deviceId} ${i}`);
                            this.returnTemperatureSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.returnTemperatureSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName} Return`);
                            this.returnTemperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                .setProps({
                                    minValue: -35,
                                    maxValue: 150,
                                    minStep: 0.5
                                })
                                .onGet(async () => {
                                    const state = this.returnTemperature;
                                    return state;
                                })
                            accessory.addService(this.returnTemperatureSensorService);
                        };
                        break;
                    case 1: //Zone 1
                        if (temperatureSensor && this.roomTemperatures[i] !== null) {
                            const debug = this.enableDebugMode ? this.emit('debug', `${zoneName}, Prepare temperature sensor service`) : false;
                            this.roomTemperatureZone1SensorService = new Service.TemperatureSensor(`${serviceName}`, `${zoneName} Temperature Sensor ${deviceId} ${i}`);
                            this.roomTemperatureZone1SensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.roomTemperatureZone1SensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName}`);
                            this.roomTemperatureZone1SensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                .setProps({
                                    minValue: -35,
                                    maxValue: 150,
                                    minStep: 0.5
                                })
                                .onGet(async () => {
                                    const state = this.roomTemperatures[i];
                                    return state;
                                })
                            accessory.addService(this.roomTemperatureZone1SensorService);
                        };

                        if (temperatureSensorFlowZone1 && this.flowTemperatureZone1 !== null) {
                            const debug2 = this.enableDebugMode ? this.emit('debug', `Prepare flow temperature zone 1 sensor service`) : false;
                            this.flowTemperatureZone1SensorService = new Service.TemperatureSensor(`${serviceName} Flow`, `${zoneName} Temperature Sensor Flow ${deviceId} ${i}`);
                            this.flowTemperatureZone1SensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.flowTemperatureZone1SensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName} Flow`);
                            this.flowTemperatureZone1SensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                .setProps({
                                    minValue: -35,
                                    maxValue: 150,
                                    minStep: 0.5
                                })
                                .onGet(async () => {
                                    const state = this.flowTemperatureZone1;
                                    return state;
                                })
                            accessory.addService(this.flowTemperatureZone1SensorService);
                        };

                        if (temperatureSensorReturnZone1 && this.returnTemperatureZone1 !== null) {
                            const debug3 = this.enableDebugMode ? this.emit('debug', `Prepare return temperature zone 1 sensor service`) : false;
                            this.returnTemperatureZone1SensorService = new Service.TemperatureSensor(`${serviceName} Return`, `${zoneName} Temperature Sensor Return ${deviceId} ${i}`);
                            this.returnTemperatureZone1SensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.returnTemperatureZone1SensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName} Return`);
                            this.returnTemperatureZone1SensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                .setProps({
                                    minValue: -35,
                                    maxValue: 150,
                                    minStep: 0.5
                                })
                                .onGet(async () => {
                                    const state = this.returnTemperatureZone1;
                                    return state;
                                })
                            accessory.addService(this.returnTemperatureZone1SensorService);
                        };
                        break;
                    case caseHotWater: //Hot Water
                        if (temperatureSensor && this.roomTemperatures[i] !== null) {
                            const debug = this.enableDebugMode ? this.emit('debug', `${zoneName}, Prepare temperature sensor service`) : false;
                            this.roomTemperatureWaterTankSensorService = new Service.TemperatureSensor(`${serviceName}`, `${zoneName} Temperature Sensor ${deviceId} ${i}`);
                            this.roomTemperatureWaterTankSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.roomTemperatureWaterTankSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName}`);
                            this.roomTemperatureWaterTankSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                .setProps({
                                    minValue: -35,
                                    maxValue: 150,
                                    minStep: 0.5
                                })
                                .onGet(async () => {
                                    const state = this.roomTemperatures[i];
                                    return state;
                                })
                            accessory.addService(this.roomTemperatureWaterTankSensorService);
                        };

                        if (temperatureSensorFlowWaterTank && this.flowTemperatureWaterTank !== null) {
                            const debug = this.enableDebugMode ? this.emit('debug', `Prepare flow temperature water tank sensor service`) : false;
                            this.flowTemperatureWaterTankSensorService = new Service.TemperatureSensor(`${serviceName} Flow`, `${zoneName} Temperature Sensor Flow ${deviceId} ${i}`);
                            this.flowTemperatureWaterTankSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.flowTemperatureWaterTankSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName} Flow`);
                            this.flowTemperatureWaterTankSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                .setProps({
                                    minValue: -35,
                                    maxValue: 150,
                                    minStep: 0.5
                                })
                                .onGet(async () => {
                                    const state = this.flowTemperatureWaterTank;
                                    return state;
                                })
                            accessory.addService(this.flowTemperatureWaterTankSensorService);
                        };

                        if (temperatureSensorReturnWaterTank && this.returnTemperatureWaterTank !== null) {
                            const debug1 = this.enableDebugMode ? this.emit('debug', `Prepare return temperature water tank sensor service`) : false;
                            this.returnTemperatureWaterTankSensorService = new Service.TemperatureSensor(`${serviceName} Return`, `${zoneName} Temperature Sensor Return ${deviceId} ${i}`);
                            this.returnTemperatureWaterTankSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.returnTemperatureWaterTankSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName} Return`);
                            this.returnTemperatureWaterTankSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                .setProps({
                                    minValue: -35,
                                    maxValue: 150,
                                    minStep: 0.5
                                })
                                .onGet(async () => {
                                    const state = this.returnTemperatureWaterTank;
                                    return state;
                                })
                            accessory.addService(this.returnTemperatureWaterTankSensorService);
                        };
                        break;
                    case caseZone2: //Zone 2
                        if (temperatureSensor && this.roomTemperatures[i] !== null) {
                            const debug = this.enableDebugMode ? this.emit('debug', `${zoneName}, Prepare temperature sensor service`) : false;
                            this.roomTemperatureZone2SensorService = new Service.TemperatureSensor(`${serviceName}`, `${zoneName} Temperature Sensor ${deviceId} ${i}`);
                            this.roomTemperatureZone2SensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.roomTemperatureZone2SensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName}`);
                            this.roomTemperatureZone2SensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                .setProps({
                                    minValue: -35,
                                    maxValue: 150,
                                    minStep: 0.5
                                })
                                .onGet(async () => {
                                    const state = this.roomTemperatures[i];
                                    return state;
                                })
                            accessory.addService(this.roomTemperatureZone2SensorService);
                        };

                        if (temperatureSensorFlowZone2 && this.flowTemperatureZone2 !== null) {
                            const debug = this.enableDebugMode ? this.emit('debug', `Prepare flow temperature zone 2 sensor service`) : false;
                            this.flowTemperatureZone2SensorService = new Service.TemperatureSensor(`${serviceName} Flow`, `${zoneName} Temperature Sensor Flow${deviceId} ${i}`);
                            this.flowTemperatureZone2SensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.flowTemperatureZone2SensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName} Flow`);
                            this.flowTemperatureZone2SensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                .setProps({
                                    minValue: -35,
                                    maxValue: 150,
                                    minStep: 0.5
                                })
                                .onGet(async () => {
                                    const state = this.flowTemperatureZone2;
                                    return state;
                                })
                            accessory.addService(this.flowTemperatureZone2SensorService);
                        };

                        if (temperatureSensorReturnZone2 && this.returnTemperatureZone2 !== null) {
                            const debug1 = this.enableDebugMode ? this.emit('debug', `Prepare return temperature zone 2 sensor service`) : false;
                            this.returnTemperatureZone2SensorService = new Service.TemperatureSensor(`${serviceName} Return`, `${zoneName} Temperature Sensor Return${deviceId} ${i}`);
                            this.returnTemperatureZone2SensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.returnTemperatureZone2SensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName} Return`);
                            this.returnTemperatureZone2SensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                .setProps({
                                    minValue: -35,
                                    maxValue: 150,
                                    minStep: 0.5
                                })
                                .onGet(async () => {
                                    const state = this.returnTemperatureZone2;
                                    return state;
                                })
                            accessory.addService(this.returnTemperatureZone2SensorService);
                        };
                        break;
                };
            };

            //buttons services
            if (buttonsConfiguredCount > 0) {
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare buttons service`) : false;
                this.buttonsServices = [];

                for (let i = 0; i < buttonsConfiguredCount; i++) {
                    const button = buttonsConfigured[i];

                    //get button mode
                    const mode = button.mode;

                    //get button display type
                    const displayType = button.displayType;

                    //get button name
                    const buttonName = button.name;

                    //get button name prefix
                    const buttonNamePrefix = button.namePrefix;

                    const buttonServiceName = buttonNamePrefix ? `${accessoryName} ${buttonName}` : buttonName;
                    const buttonServiceType = button.serviceType;
                    const buttomCharacteristicType = button.characteristicType;
                    const buttonService = new buttonServiceType(buttonServiceName, `Button ${deviceId} ${i}`);
                    buttonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    buttonService.setCharacteristic(Characteristic.ConfiguredName, buttonServiceName);
                    buttonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    buttonService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${buttonName}`);
                    buttonService.getCharacteristic(buttomCharacteristicType)
                        .onGet(async () => {
                            const state = button.state;
                            return state;
                        })
                        .onSet(async (state) => {
                            if (displayType > 2) {
                                return;
                            };

                            try {
                                switch (mode) {
                                    case 0: //POWER ON,OFF
                                        deviceState.Power = state;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power;
                                        break;
                                    case 1: //HEAT PUMP HEAT
                                        deviceState.Power = true;
                                        deviceState.UnitStatus = 0;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power + CONSTANTS.HeatPump.EffectiveFlags.OperationMode;
                                        break;
                                    case 2: //COOL
                                        deviceState.Power = true;
                                        deviceState.UnitStatus = 1;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power + CONSTANTS.HeatPump.EffectiveFlags.OperationMode;
                                        break;
                                    case 3: //HOLIDAY
                                        deviceState.HolidayMode = state;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.HolidayMode;
                                        break;
                                    case 10: //ALL ZONES PHYSICAL LOCK CONTROL
                                        deviceState.ProhibitZone1 = state;
                                        deviceState.ProhibitHotWater = state;
                                        deviceState.ProhibitZone2 = state;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.ProhibitHeatingZone1 + CONSTANTS.HeatPump.EffectiveFlags.ProhibitHotWater + CONSTANTS.HeatPump.EffectiveFlags.ProhibitHeatingZone2;
                                        break;
                                    case 20: //ZONE 1 HEAT THERMOSTAT
                                        deviceState.Power = true;
                                        deviceState.OperationModeZone1 = 0;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power + CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone1;
                                        break;
                                    case 21: //HEAT FLOW
                                        deviceState.Power = true;
                                        deviceState.OperationModeZone1 = 1;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power + CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone1;
                                        break;
                                    case 22: //HEAT CURVE
                                        deviceState.Power = true;
                                        deviceState.OperationModeZone1 = 2;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power + CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone1;
                                        break;
                                    case 23: //COOL THERMOSTAT
                                        deviceState.Power = true;
                                        deviceState.OperationModeZone1 = 3;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power + CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone1;
                                        break;
                                    case 24: //COOL FLOW
                                        deviceState.Power = true;
                                        deviceState.OperationModeZone1 = 4;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power + CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone1;
                                        break;
                                    case 25: //FLOOR DRY UP
                                        deviceState.Power = true;
                                        deviceState.OperationModeZone1 = 5;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power + CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone1;
                                        break;
                                    case 30: //PHYSICAL LOCK CONTROL
                                        deviceState.ProhibitZone1 = state;
                                        CONSTANTS.HeatPump.EffectiveFlags.ProhibitHeatingZone1;
                                        break;
                                    case 40: //HOT WATER NORMAL/FORCE HOT WATER
                                        deviceState.Power = true;
                                        deviceState.ForcedHotWaterMode = state;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power + CONSTANTS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                        break;
                                    case 41: //NORMAL/ECO
                                        deviceState.Power = true;
                                        deviceState.EcoHotWater = state;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power + CONSTANTS.HeatPump.EffectiveFlags.EcoHotWater;
                                        break;
                                    case 50: //PHYSICAL LOCK CONTROL
                                        deviceState.ProhibitHotWater = state;
                                        CONSTANTS.HeatPump.EffectiveFlags.ProhibitHotWater;
                                        break;
                                    case 60: //ZONE 2 HEAT THERMOSTAT
                                        deviceState.Power = true;
                                        deviceState.OperationModeZone2 = 0;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power + CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone2;
                                        break;
                                    case 61: // HEAT FLOW
                                        deviceState.Power = true;
                                        deviceState.OperationModeZone2 = 1;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power + CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone2;
                                        break;
                                    case 62: //HEAT CURVE
                                        deviceState.Power = true;
                                        deviceState.OperationModeZone2 = 2;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power + CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone2;
                                        break;
                                    case 63: //COOL THERMOSTAT
                                        deviceState.Power = true;
                                        deviceState.OperationModeZone2 = 3;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power + CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone2;
                                        break;
                                    case 64: //COOL FLOW
                                        deviceState.Power = true;
                                        deviceState.OperationModeZone2 = 4;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power + CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone2;
                                        break;
                                    case 65: //FLOOR DRY UP
                                        deviceState.Power = true;
                                        deviceState.OperationModeZone2 = 5;
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power + CONSTANTS.HeatPump.EffectiveFlags.OperationModeZone2;
                                        break;
                                    case 70: //PHYSICAL LOCK CONTROL
                                        deviceState.ProhibitZone2 = state;
                                        CONSTANTS.HeatPump.EffectiveFlags.ProhibitHeatingZone2;
                                        break;
                                    default:
                                        this.emit('message', `Unknown button mode: ${mode}`);
                                        break;
                                };

                                await this.melCloudAtw.send(deviceState);
                                const info = this.disableLogInfo ? false : this.emit('message', `Set: ${buttonName}`);
                            } catch (error) {
                                this.emit('error', `Set button error: ${error}`);
                            };
                        });
                    this.buttonsServices.push(buttonService);
                    accessory.addService(buttonService)
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
                                        deviceState.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.Power;
                                        break;
                                    case false:
                                        deviceState = previousPresets[i];
                                        break;
                                };

                                await this.melCloudAtw.send(deviceState);
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

            return accessory;
        } catch (error) {
            this.emit('error', error);
        };
    };
};
module.exports = DeviceAtw;
