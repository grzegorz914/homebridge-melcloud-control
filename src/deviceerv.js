"use strict";
const EventEmitter = require('events');
const MelCloudErv = require('./melclouderv.js');
const RestFul = require('./restful.js');
const Mqtt = require('./mqtt.js');
const CONSTANTS = require('./constants.json');
let Accessory, Characteristic, Service, Categories, UUID;

class MelCloudDevice extends EventEmitter {
    constructor(api, account, melCloud, accountInfo, accountName, contextKey, deviceId, deviceName, deviceTypeText, useFahrenheit, deviceInfoFile) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        UUID = api.hap.uuid;

        //account config
        this.displayMode = account.ervDisplayMode || 0;
        this.temperatureSensor = account.ervTemperatureSensor || false;
        this.presetsEnabled = account.ervPresets || false;
        this.buttons = account.ervButtons || [];
        this.buttonsCount = this.buttons.length;
        this.disableLogInfo = account.disableLogInfo || false;
        this.disableLogDeviceInfo = account.disableLogDeviceInfo || false;
        this.enableDebugMode = account.enableDebugMode || false;

        //RESTFul
        const restFulEnabled = account.enableRestFul || false;

        //MQTT client
        const mqttEnabled = account.enableMqtt || false;
        const mqttHost = account.mqttHost;
        const mqttPort = account.mqttPort || 1883;
        const mqttClientId = `${account.mqttClientId}_${deviceId}` || `${deviceTypeText}_${deviceName}_${deviceId}`;
        const mqttUser = account.mqttUser;
        const mqttPasswd = account.mqttPass;
        const mqttPrefix = `${account.mqttPrefix}/${deviceTypeText}/${deviceName}`;
        const mqttDebug = account.mqttDebug || false;

        //variables
        this.melCloud = melCloud; //function
        this.startPrepareAccessory = true;
        this.restFulConnected = false;
        this.mqttConnected = false;

        //temp unit
        this.useFahrenheit = useFahrenheit;

        //melcloud device
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
            const displayMode = this.displayMode;
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

            this.hasCoolOperationMode = hasCoolOperationMode;
            this.hasHeatOperationMode = hasHeatOperationMode;
            this.hasAutoOperationMode = hasAutoOperationMode;
            this.hasRoomTemperature = hasRoomTemperature;
            this.hasSupplyTemperature = hasSupplyTemperature;
            this.hasOutdoorTemperature = hasOutdoorTemperature;
            this.hasCO2Sensor = hasCO2Sensor;
            this.roomCO2Level = roomCO2Level;
            this.roomCO2Detected = roomCO2Detected;
            this.hasPM25Sensor = hasPM25Sensor;
            this.pM25SensorStatus = pM25SensorStatus;
            this.pM25Level = pM25Level;
            this.pM25AirQuality = pM25AirQuality;
            this.hasAutoVentilationMode = hasAutoVentilationMode;
            this.hasBypassVentilationMode = hasBypassVentilationMode;
            this.hasAutomaticFanSpeed = hasAutomaticFanSpeed;
            this.coreMaintenanceRequired = coreMaintenanceRequired;
            this.filterMaintenanceRequired = filterMaintenanceRequired;
            this.actualVentilationMode = actualVentilationMode;
            this.numberOfFanSpeeds = numberOfFanSpeeds;
            this.temperatureIncrement = temperatureIncrement;

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
            this.presets = presets;
            this.presetsCount = this.presetsEnabled ? presets.length : 0;

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
                    //actual ventilation mode - LOSSNAY, BYPASS
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
                    if (this.melCloudServices) {
                        this.melCloudServices[0]
                            .updateCharacteristic(Characteristic.Active, power)
                            .updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentOperationMode)
                            .updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetOperationMode)
                            .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                            .updateCharacteristic(Characteristic.RotationSpeed, fanSpeed)
                            .updateCharacteristic(Characteristic.LockPhysicalControls, lockPhysicalControls)
                            .updateCharacteristic(Characteristic.TemperatureDisplayUnits, this.useFahrenheit);
                        if (hasHeatOperationMode) {
                            this.melCloudServices[0].updateCharacteristic(Characteristic.HeatingThresholdTemperature, targetTemperature)
                        }
                        if (hasCoolOperationMode) {
                            this.melCloudServices[0].updateCharacteristic(Characteristic.CoolingThresholdTemperature, targetTemperature)
                        }
                    };
                    break;
                case 1: //Thermostat
                    //operation mode - 0, HEAT, 2, COOL, 4, 5, 6, FAN, AUTO
                    //ventilation mode - LOSSNAY, BYPASS, AUTO
                    //actual ventilation mode - LOSSNAY, BYPASS
                    currentOperationMode = !power ? 0 : [1, 2, [1, 2][actualVentilationMode]][ventilationMode]; //OFF, HEAT, COOL
                    targetOperationMode = !power ? 0 : [1, 2, 3][ventilationMode]; //OFF, HEAT, COOL, AUTO
                    operationModeSetPropsMinValue = hasAutoVentilationMode ? 0 : 0;
                    operationModeSetPropsMaxValue = hasAutoVentilationMode ? 3 : 2;
                    operationModeSetPropsValidValues = hasAutoVentilationMode ? (hasBypassVentilationMode ? [0, 1, 2, 3] : [0, 2, 3]) : (hasBypassVentilationMode ? [0, 1, 2] : [0, 2]);

                    //update characteristics
                    if (this.melCloudServices) {
                        this.melCloudServices[0]
                            .updateCharacteristic(Characteristic.CurrentHeatingCoolingState, currentOperationMode)
                            .updateCharacteristic(Characteristic.TargetHeatingCoolingState, targetOperationMode)
                            .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                            .updateCharacteristic(Characteristic.TargetTemperature, targetTemperature)
                            .updateCharacteristic(Characteristic.TemperatureDisplayUnits, this.useFahrenheit);
                    };
                    break;
            };

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

            //update temperature sensors
            if (this.roomTemperatureSensorService) {
                this.roomTemperatureSensorService
                    .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
            };

            //update temperature sensors
            if (this.temperatureSensor) {
                if (hasRoomTemperature && this.roomTemperatureSensorService) {
                    this.roomTemperatureSensorService
                        .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                };

                if (hasOutdoorTemperature && this.outdoorTemperatureSensorService) {
                    this.outdoorTemperatureSensorService
                        .updateCharacteristic(Characteristic.CurrentTemperature, outdoorTemperature)
                };

                if (hasSupplyTemperature && this.supplyTemperatureSensorService) {
                    this.supplyTemperatureSensorService
                        .updateCharacteristic(Characteristic.CurrentTemperature, supplyTemperature)
                };
            }

            //update core maintenance
            if (this.coreMaintenanceService) {
                this.coreMaintenanceService
                    .updateCharacteristic(Characteristic.FilterChangeIndication, coreMaintenanceRequired)
            }

            //update filter maintenance
            if (this.filterMaintenanceService) {
                this.filterMaintenanceService
                    .updateCharacteristic(Characteristic.FilterChangeIndication, filterMaintenanceRequired)
            }

            //update CO2 sensor
            if (hasCO2Sensor && this.carbonDioxideSensorService) {
                this.carbonDioxideSensorService
                    .updateCharacteristic(Characteristic.CarbonDioxideDetected, roomCO2Detected)
                    .updateCharacteristic(Characteristic.CarbonDioxideLevel, roomCO2Level)
            }

            //update PM2.5 sensor
            if (hasPM25Sensor && this.airQualitySensorService) {
                this.airQualitySensorService
                    .updateCharacteristic(Characteristic.AirQuality, pM25AirQuality)
                    .updateCharacteristic(Characteristic.PM2_5Density, pM25Level)
            }

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
                            case 1: //OPERATION MODE RECOVERY
                                button.state = power ? (ventilationMode === 0) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 2: //OPERATION MODE BYPASS
                                button.state = power ? (ventilationMode === 1) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 3: //OPERATION MODE AUTO
                                button.state = power ? (ventilationMode === 2) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 4: //NIGHT PURGE MODE
                                button.state = power ? (nightPurgeMode === true) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 10: //FAN SPEED MODE AUTO
                                button.state = power ? (setFanSpeed === 0) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 11: //FAN SPEED MODE 1
                                button.state = power ? (setFanSpeed === 1) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 12: //FAN SPEED MODE 2
                                button.state = power ? (setFanSpeed === 2) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 13: //FAN SPEED MODE 3
                                button.state = power ? (setFanSpeed === 3) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 14: //FAN SPEED MODE 4
                                button.state = power ? (setFanSpeed === 4) : false;
                                this.buttonsConfigured.push(button);
                                break;
                            case 15: //PHYSICAL LOCK CONTROLS
                                button.state = (lockPhysicalControls === 1);
                                this.buttonsConfigured.push(button);
                                break;
                            case 16: //ROOM TEMP HIDE
                                button.state = (hideRoomTemperature === true);
                                this.buttonsConfigured.push(button);
                                break;
                            case 17: //SUPPLY TEMP HIDE
                                button.state = (hideSupplyTemperature === true);
                                this.buttonsConfigured.push(button);
                                break;
                            case 18: //OUTDOOR TEMP HIDE
                                button.state = (hideOutdoorTemperature === true);
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
                    if (this.buttonsServices) {
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
                    const presetState =
                        preset.SetTemperature === targetTemperature
                        && preset.Power === power
                        && preset.OperationMode === operationMode
                        && preset.VentilationMode === ventilationMode
                        && preset.FanSpeed === setFanSpeed;
                    this.presetsStates.push(presetState);

                    if (this.presetsServices) {
                        this.presetsServices[i]
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
                    const accessory = await this.prepareAccessory(accountInfo, deviceState, deviceId, deviceTypeText, deviceName);

                    //RESTFul server
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
                    if (mqttEnabled) {
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
                            .on('changeState', (data) => {
                                const key = Object.keys(data)[0];
                                const value = Object.values(data)[0];
                                switch (key) {
                                    case 'Power':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Power;
                                        this.melCloudErv.send(deviceState);
                                        break;
                                    case 'OperationMode':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.OperationMode;
                                        this.melCloudErv.send(deviceState);
                                        break;
                                    case 'VentilationMode':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.VentilationMode;
                                        this.melCloudErv.send(deviceState);
                                        break;
                                    case 'SetTemperature':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.SetTemperature;
                                        this.melCloudErv.send(deviceState);
                                        break;
                                    case 'DefaultCoolingSetTemperature':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.SetTemperature;
                                        this.melCloudErv.send(deviceState);
                                        break;
                                    case 'DefaultHeatingSetTemperature':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.SetTemperature;
                                        this.melCloudErv.send(deviceState);
                                        break;
                                    case 'NightPurgeMode':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.NightPurgeMode;
                                        this.melCloudErv.send(deviceState);
                                        break;
                                    case 'SetFanSpeed':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.SetFanSpeed;
                                        this.melCloudErv.send(deviceState);
                                        break;
                                    case 'HideRoomTemperature':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Prohibit;
                                        this.melCloudErv.send(deviceState);
                                        break;
                                    case 'HideSupplyTemperature':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Prohibit;
                                        this.melCloudErv.send(deviceState);
                                        break;
                                    case 'HideOutdoorTemperature':
                                        deviceState[key] = value;
                                        deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Prohibit;
                                        this.melCloudErv.send(deviceState);
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

                    await new Promise(resolve => setTimeout(resolve, 150));
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
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare erv accessory`) : false;
                const accessoryName = deviceName;
                const accessoryUUID = UUID.generate(deviceId.toString());
                const accessoryCategory = Categories.AIR_PURIFIER;
                const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

                //information service
                const debug1 = this.enableDebugMode ? this.emit('debug', `Prepare information service`) : false;
                accessory.getService(Service.AccessoryInformation)
                    .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
                    .setCharacteristic(Characteristic.Model, this.model)
                    .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
                    .setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

                //melcloud services
                const temperatureUnit = CONSTANTS.TemperatureDisplayUnits[this.useFahrenheit];
                const displayMode = this.displayMode;
                const temperatureSensor = this.temperatureSensor;
                const buttonsConfigured = this.buttonsConfigured;
                const buttonsConfiguredCount = this.buttonsConfiguredCount;
                const presets = this.presets;
                const presetsCount = this.presetsCount;
                const hasCoolOperationMode = this.hasCoolOperationMode;
                const hasHeatOperationMode = this.hasHeatOperationMode;
                const hasCO2Sensor = this.hasCO2Sensor;
                const hasPM25Sensor = this.hasPM25Sensor;
                const hasAutoVentilationMode = this.hasAutoVentilationMode;
                const hasBypassVentilationMode = this.hasBypassVentilationMode;
                const serviceName = `${deviceTypeText} ${accessoryName}`;

                this.melCloudServices = [];
                switch (displayMode) {
                    case 0: //Heater Cooler
                        const debug = this.enableDebugMode ? this.emit('debug', `Prepare heather/cooler service`) : false;
                        const melCloudService = accessory.addService(Service.HeaterCooler, serviceName, `HeaterCooler ${deviceId}`);
                        melCloudService.getCharacteristic(Characteristic.Active)
                            .onGet(async () => {
                                const state = this.power;
                                const info = this.disableLogInfo ? false : this.emit('message', `Power: ${state ? 'ON' : 'OFF'}`);
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    deviceState.Power = state;
                                    deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Power;
                                    await this.melCloudErv.send(deviceState);
                                    const info = this.disableLogInfo ? false : this.emit('message', `Set power: ${state ? 'ON' : 'OFF'}`);
                                } catch (error) {
                                    this.emit('error', `Set power error: ${error}`);
                                    melCloudService.updateCharacteristic(Characteristic.Active, false)
                                };
                            });
                        melCloudService.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
                            .onGet(async () => {
                                const value = this.currentOperationMode;
                                const operationModeText = !this.power ? CONSTANTS.Ventilation.System[0] : CONSTANTS.Ventilation.OperationMode[deviceState.VentilationMode];
                                const info = this.disableLogInfo ? false : this.emit('message', `Operation mode: ${operationModeText}`);
                                return value;
                            });
                        melCloudService.getCharacteristic(Characteristic.TargetHeaterCoolerState)
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
                                            deviceState.VentilationMode = hasAutoVentilationMode ? 2 : 0;
                                            deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Power + CONSTANTS.Ventilation.EffectiveFlags.VentilationMode;
                                            break;
                                        case 1: //HEAT - LOSSNAY
                                            deviceState.Power = true;
                                            deviceState.VentilationMode = 0;
                                            deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Power + CONSTANTS.Ventilation.EffectiveFlags.VentilationMode;
                                            break;
                                        case 2: //COOL - BYPASS
                                            deviceState.Power = true;
                                            deviceState.VentilationMode = hasBypassVentilationMode ? 1 : 0;
                                            deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Power + CONSTANTS.Ventilation.EffectiveFlags.VentilationMode;
                                            break;
                                    };

                                    await this.melCloudErv.send(deviceState);
                                    const operationModeText = CONSTANTS.Ventilation.VentilationMode[deviceState.VentilationMode];
                                    const info = this.disableLogInfo ? false : this.emit('message', `Set operation mode: ${operationModeText}`);
                                } catch (error) {
                                    this.emit('error', `Set operation mode error: ${error}`);
                                };
                            });
                        melCloudService.getCharacteristic(Characteristic.RotationSpeed)
                            .setProps({
                                minValue: 0,
                                maxValue: this.fanSpeedSetPropsMaxValue,
                                minStep: 1
                            })
                            .onGet(async () => {
                                const value = this.fanSpeed; //STOP, 1, 2, 3, 4, OFF
                                const info = this.disableLogInfo ? false : this.emit('message', `Fan speed mode: ${CONSTANTS.Ventilation.FanSpeed[this.setFanSpeed]}`);
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
                                    deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.SetFanSpeed;
                                    await this.melCloudErv.send(deviceState);
                                    const info = this.disableLogInfo ? false : this.emit('message', `Set fan speed mode: ${CONSTANTS.Ventilation.FanSpeed[fanSpeedModeText]}`);
                                } catch (error) {
                                    this.emit('error', `Set fan speed mode error: ${error}`);
                                };
                            });
                        melCloudService.getCharacteristic(Characteristic.CurrentTemperature)
                            .onGet(async () => {
                                const value = this.roomTemperature;
                                const info = this.disableLogInfo ? false : this.emit('message', `Room temperature: ${value}${temperatureUnit}`);
                                return value;
                            });
                        //device can heat
                        if (hasHeatOperationMode) {
                            melCloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
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
                                        deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.SetTemperature;
                                        await this.melCloudErv.send(deviceState);
                                        const info = this.disableLogInfo ? false : this.emit('message', `Set heating threshold temperature: ${value}${temperatureUnit}`);
                                    } catch (error) {
                                        this.emit('error', `Set heating threshold temperature error: ${error}`);
                                    };
                                });
                        };
                        //device can cool
                        if (hasCoolOperationMode) {
                            melCloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
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
                                        deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.SetTemperature;
                                        await this.melCloudErv.send(deviceState);
                                        const info = this.disableLogInfo ? false : this.emit('message', `Set cooling threshold temperature: ${value}${temperatureUnit}`);
                                    } catch (error) {
                                        this.emit('error', `Set cooling threshold temperature error: ${error}`);
                                    };
                                });
                        };
                        //melCloudService.getCharacteristic(Characteristic.LockPhysicalControls)
                        //    .onGet(async () => {
                        //        const value = this.lockPhysicalControls;
                        //        const info = this.disableLogInfo ? false : this.emit('message', `Lock physical controls: ${value ? 'LOCKED' : 'UNLOCKED'}`);
                        //        return value;
                        //    })
                        //    .onSet(async (value) => {
                        //       try {
                        //         value = value ? true : false;
                        //         deviceState = deviceState;
                        //         deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Prohibit;
                        //         await this.melCloudErv.send(deviceState);
                        //         const info = this.disableLogInfo ? false : this.emit('message', `Set local physical controls: ${value ? 'LOCK' : 'UNLOCK'}`);
                        //     } catch (error) {
                        //          this.emit('error', `Set lock physical controls error: ${error}`);
                        //      };
                        //   });
                        melCloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
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
                                    const info = this.disableLogInfo ? false : this.emit('message', `Set temperature display unit: ${CONSTANTS.TemperatureDisplayUnits[value]}`);
                                } catch (error) {
                                    this.emit('error', `Set temperature display unit error: ${error}`);
                                };
                            });
                        this.melCloudServices.push(melCloudService);
                        break;
                    case 1: //Thermostat
                        const debug1 = this.enableDebugMode ? this.emit('debug', `Prepare thermostat service`) : false;
                        const melCloudServiceT = accessory.addService(Service.Thermostat, serviceName, `Thermostat ${deviceId}`);
                        melCloudServiceT.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
                            .onGet(async () => {
                                const value = this.currentOperationMode;
                                const operationModeText = !this.power ? CONSTANTS.Ventilation.System[0] : CONSTANTS.Ventilation.OperationMode[deviceState.OperationMode];
                                const info = this.disableLogInfo ? false : this.emit('message', `Operation mode: ${operationModeText}`);
                                return value;
                            });
                        melCloudServiceT.getCharacteristic(Characteristic.TargetHeatingCoolingState)
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
                                            deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Power;
                                            break;
                                        case 1: //HEAT - LOSSNAY
                                            deviceState.Power = true;
                                            deviceState.VentilationMode = 0;
                                            deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Power + CONSTANTS.Ventilation.EffectiveFlags.VentilationMode;
                                            break;
                                        case 2: //COOL - BYPASS
                                            deviceState.Power = true;
                                            deviceState.VentilationMode = hasBypassVentilationMode ? 1 : 0;
                                            deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Power + CONSTANTS.Ventilation.EffectiveFlags.VentilationMode;
                                            break;
                                        case 3: //AUTO - AUTO
                                            deviceState.Power = true;
                                            deviceState.VentilationMode = hasAutoVentilationMode ? 2 : 0;
                                            deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Power + CONSTANTS.Ventilation.EffectiveFlags.VentilationMode;
                                            break;
                                    };

                                    await this.melCloudErv.send(deviceState);
                                    const operationModeText = CONSTANTS.Ventilation.VentilationMode[deviceState.VentilationMode];
                                    const info = this.disableLogInfo ? false : this.emit('message', `Set operation mode: ${operationModeText}`);
                                } catch (error) {
                                    this.emit('error', `Set operation mode error: ${error}`);
                                };
                            });
                        melCloudServiceT.getCharacteristic(Characteristic.CurrentTemperature)
                            .onGet(async () => {
                                const value = this.roomTemperature;
                                const info = this.disableLogInfo ? false : this.emit('message', `Room temperature: ${value}${temperatureUnit}`);
                                return value;
                            });
                        melCloudServiceT.getCharacteristic(Characteristic.TargetTemperature)
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
                                    deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.SetTemperature;
                                    await this.melCloudErv.send(deviceState);
                                    const info = this.disableLogInfo ? false : this.emit('message', `Set temperature: ${value}${temperatureUnit}`);
                                } catch (error) {
                                    this.emit('error', `Set temperature error: ${error}`);
                                };
                            });
                        melCloudServiceT.getCharacteristic(Characteristic.TemperatureDisplayUnits)
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
                                    const info = this.disableLogInfo ? false : this.emit('message', `Set temperature display unit: ${CONSTANTS.TemperatureDisplayUnits[value]}`);
                                } catch (error) {
                                    this.emit('error', `Set temperature display unit error: ${error}`);
                                };
                            });
                        this.melCloudServices.push(melCloudServiceT);
                        break;
                };

                //temperature sensor services
                if (temperatureSensor) {
                    if (this.hasRoomTemperature && this.roomTemperature !== null) {
                        const debug = this.enableDebugMode ? this.emit('debug', `Prepare room temperature sensor service`) : false;
                        this.roomTemperatureSensorService = new Service.TemperatureSensor(`${serviceName} Room`, `Room Temperature Sensor ${deviceId}`);
                        this.roomTemperatureSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.roomTemperatureSensorService.setCharacteristic(Characteristic.ConfiguredName, `${serviceName} Room`);
                        this.roomTemperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                            .onGet(async () => {
                                const state = this.roomTemperature;
                                return state;
                            })
                        accessory.addService(this.roomTemperatureSensorService);
                    };

                    if (this.hasSupplyTemperature && this.supplyTemperature !== null) {
                        const debug = this.enableDebugMode ? this.emit('debug', `Prepare supply temperature sensor service`) : false;
                        this.supplyTemperatureSensorService = new Service.TemperatureSensor(`${serviceName} Supply`, `Supply Temperature Sensor ${deviceId}`);
                        this.supplyTemperatureSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.supplyTemperatureSensorService.setCharacteristic(Characteristic.ConfiguredName, `${serviceName} Supply`);
                        this.supplyTemperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                            .onGet(async () => {
                                const state = this.supplyTemperature;
                                return state;
                            })
                        accessory.addService(this.supplyTemperatureSensorService);
                    };

                    if (this.hasOutdoorTemperature && this.outdoorTemperature !== null) {
                        const debug = this.enableDebugMode ? this.emit('debug', `Prepare outdoor temperature sensor service`) : false;
                        this.outdoorTemperatureSensorService = new Service.TemperatureSensor(`${serviceName} Outdoor`, `Outdoor Temperature Sensor ${deviceId}`);
                        this.outdoorTemperatureSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.outdoorTemperatureSensorService.setCharacteristic(Characteristic.ConfiguredName, `${serviceName} Outdoor`);
                        this.outdoorTemperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                            .onGet(async () => {
                                const state = this.outdoorTemperature;
                                return state;
                            })
                        accessory.addService(this.outdoorTemperatureSensorService);
                    };
                };

                //core maintenance
                this.coreMaintenanceService = new Service.FilterMaintenance(`${serviceName} Core Maintenance`, `CoreMaintenance ${deviceId}`);
                this.coreMaintenanceService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.coreMaintenanceService.setCharacteristic(Characteristic.ConfiguredName, `${serviceName} Core Maintenance`);
                this.coreMaintenanceService.getCharacteristic(Characteristic.FilterChangeIndication)
                    .onGet(async () => {
                        const value = this.coreMaintenanceRequired;
                        const info = this.disableLogInfo ? false : this.emit('message', `Core maintenance: ${CONSTANTS.Ventilation.CoreMaintenance[value]}`);
                        return value;
                    });
                this.coreMaintenanceService.getCharacteristic(Characteristic.ResetFilterIndication)
                    .onSet(async (state) => {
                    });
                accessory.addService(this.coreMaintenanceService);

                //filter maintenance
                this.filterMaintenanceService = new Service.FilterMaintenance(`${serviceName} Filter Maintenance`, `FilterMaintenance ${deviceId}`);
                this.filterMaintenanceService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.filterMaintenanceService.setCharacteristic(Characteristic.ConfiguredName, `${serviceName} Filter Maintenance`);
                this.filterMaintenanceService.getCharacteristic(Characteristic.FilterChangeIndication)
                    .onGet(async () => {
                        const value = this.filterMaintenanceRequired;
                        const info = this.disableLogInfo ? false : this.emit('message', `Filter maintenance: ${CONSTANTS.Ventilation.FilterMaintenance[value]}`);
                        return value;
                    });
                this.filterMaintenanceService.getCharacteristic(Characteristic.ResetFilterIndication)
                    .onSet(async (state) => {
                    });
                accessory.addService(this.filterMaintenanceService);

                //room CO2 sensor
                if (hasCO2Sensor) {
                    this.carbonDioxideSensorService = new Service.CarbonDioxideSensor(`${serviceName} CO2 Sensor`, `CO2Sensor ${deviceId}`);
                    this.carbonDioxideSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.carbonDioxideSensorService.setCharacteristic(Characteristic.ConfiguredName, `${serviceName} CO2 Sensor`);
                    this.carbonDioxideSensorService.getCharacteristic(Characteristic.CarbonDioxideDetected)
                        .onGet(async () => {
                            const value = this.roomCO2Detected;
                            const info = this.disableLogInfo ? false : this.emit('message', `CO2 detected: ${CONSTANTS.Ventilation.Co2Detected[value]}`);
                            return value;
                        });
                    this.carbonDioxideSensorService.getCharacteristic(Characteristic.CarbonDioxideLevel)
                        .onGet(async () => {
                            const value = this.roomCO2Level;
                            const info = this.disableLogInfo ? false : this.emit('message', `CO2 level: ${value} ppm`);
                            return value;
                        });
                    accessory.addService(this.carbonDioxideSensorService);
                }

                //room PM2.5 sensor
                if (hasPM25Sensor) {
                    this.airQualitySensorService = new Service.AirQualitySensor(`${serviceName} PM2.5 Sensor`, `PM25Sensor ${deviceId}`);
                    this.airQualitySensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    this.airQualitySensorService.setCharacteristic(Characteristic.ConfiguredName, `${serviceName} PM2.5 Sensor`);
                    this.airQualitySensorService.getCharacteristic(Characteristic.AirQuality)
                        .onGet(async () => {
                            const value = this.pM25AirQuality;
                            const info = this.disableLogInfo ? false : this.emit('message', `PM2.5 air quality: ${CONSTANTS.Ventilation.PM25AirQuality[value]}`);
                            return value;
                        });
                    this.airQualitySensorService.getCharacteristic(Characteristic.PM2_5Density)
                        .onGet(async () => {
                            const value = this.pM25Level;
                            const info = this.disableLogInfo ? false : this.emit('message', `PM2.5 level: ${value} µg/m`);
                            return value;
                        });
                    accessory.addService(this.airQualitySensorService);
                }

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
                        const buttonName = button.name || ['', `Button ${i}`, `Button ${i}`, `Sensor ${i}`, `Sensor ${i}`, `Sensor ${i}`][displayType];

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
                                                deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Power;
                                                break;
                                            case 1: //OPERATING MODE RECOVERY
                                                deviceState.Power = true;
                                                deviceState.VentilationMode = 0;
                                                deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Power + CONSTANTS.Ventilation.EffectiveFlags.VentilationMode;
                                                break;
                                            case 2: //OPERATING MODE BYPASS
                                                deviceState.Power = true;
                                                deviceState.VentilationMode = 1;
                                                deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Power + CONSTANTS.Ventilation.EffectiveFlags.VentilationMode;
                                                break
                                            case 3: //OPERATING MODE AUTO
                                                deviceState.Power = true;
                                                deviceState.VentilationMode = 2;
                                                deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Power + CONSTANTS.Ventilation.EffectiveFlags.VentilationMode;
                                                break;
                                            case 4: //NIGHT PURGE MODE
                                                deviceState.Power = true;
                                                deviceState.NightPurgeMode = state;
                                                deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Power
                                                break;
                                            case 10: //FAN SPEED MODE AUTO
                                                deviceState.Power = true;
                                                deviceState.SetFanSpeed = 0;
                                                deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Power + CONSTANTS.Ventilation.EffectiveFlags.SetFanSpeed;
                                                break;
                                            case 11: //FAN SPEED MODE 1
                                                deviceState.Power = true;
                                                deviceState.SetFanSpeed = 1;
                                                deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Power + CONSTANTS.Ventilation.EffectiveFlags.SetFanSpeed;
                                                break;
                                            case 12: //FAN SPEED MODE 2
                                                deviceState.Power = true;
                                                deviceState.SetFanSpeed = 2;
                                                deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Power + CONSTANTS.Ventilation.EffectiveFlags.SetFanSpeed;
                                                break;
                                            case 13: //FAN SPEED MODE 3
                                                deviceState.Power = true;
                                                deviceState.SetFanSpeed = 3;
                                                deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Power + CONSTANTS.Ventilation.EffectiveFlags.SetFanSpeed;
                                                break;
                                            case 14: //FAN MODE 4
                                                deviceState.Power = true;
                                                deviceState.SetFanSpeed = 4;
                                                deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Power + CONSTANTS.Ventilation.EffectiveFlags.SetFanSpeed;
                                                break;
                                            case 15: //PHYSICAL LOCK CONTROLS
                                                deviceState = deviceState;
                                                deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Prohibit;
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
                                            deviceState.VentilationMode = preset.VentilationMode;
                                            deviceState.SetFanSpeed = preset.FanSpeed;
                                            deviceState.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Power;
                                            break;
                                        case false:
                                            deviceState = previousPresets[i];
                                            break;
                                    };

                                    await this.melCloudErv.send(deviceState);
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