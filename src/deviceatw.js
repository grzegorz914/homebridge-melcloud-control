import EventEmitter from 'events';
import MelCloudAtw from './melcloudatw.js';
import RestFul from './restful.js';
import Mqtt from './mqtt.js';
import { TemperatureDisplayUnits, HeatPump } from './constants.js';
let Accessory, Characteristic, Service, Categories, AccessoryUUID;

class DeviceAtw extends EventEmitter {
    constructor(api, account, device, devicesFile, defaultTempsFile, useFahrenheit) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        AccessoryUUID = api.hap.uuid;

        //account config
        this.account = account;
        this.accountType = account.type;
        this.accountName = account.name;
        this.logDeviceInfo = account.log?.deviceInfo || false;
        this.logInfo = account.log?.info || false;
        this.logWarn = account.log?.warn || false;
        this.logDebug = account.log?.debug || false;

        //device config
        this.device = device;
        this.displayType = device.displayType;
        this.hideZone = device.hideZone;
        this.temperatureSensor = device.temperatureSensor || false;
        this.temperatureFlowSensor = device.temperatureFlowSensor || false;
        this.temperatureReturnSensor = device.temperatureReturnSensor || false;
        this.temperatureFlowZone1Sensor = device.temperatureFlowZone1Sensor || false;
        this.temperatureReturnZone1Sensor = device.temperatureReturnZone1Sensor || false;
        this.temperatureFlowWaterTankSensor = device.temperatureFlowWaterTankSensor || false;
        this.temperatureReturnWaterTankSensor = device.temperatureReturnWaterTankSensor || false;
        this.temperatureFlowZone2Sensor = device.temperatureFlowZone2Sensor || false;
        this.temperatureReturnZone2Sensor = device.temperatureReturnZone2Sensor || false;
        this.inStandbySensor = device.inStandbySensor || false;
        this.connectSensor = device.connectSensor || false;
        this.errorSensor = device.errorSensor || false;
        this.holidayModeSupport = device.holidayModeSupport || false;
        this.presets = this.accountType === 'melcloud' ? (device.presets || []).filter(preset => (preset.displayType ?? 0) > 0 && preset.id !== '0') : [];
        this.schedules = this.accountType === 'melcloudhome' ? (device.schedules || []).filter(schedule => (schedule.displayType ?? 0) > 0 && schedule.id !== '0') : [];
        this.scenes = this.accountType === 'melcloudhome' ? (device.scenes || []).filter(scene => (scene.displayType ?? 0) > 0 && scene.id !== '0') : [];
        this.buttons = (device.buttonsSensors || []).filter(button => (button.displayType ?? 0) > 0);
        this.deviceId = device.id;
        this.deviceName = device.name;
        this.deviceTypeText = device.typeString;
        this.devicesFile = devicesFile;
        this.defaultTempsFile = defaultTempsFile;
        this.displayDeviceInfo = true;

        //external integrations
        this.restFul = account.restFul ?? {};
        this.restFulConnected = false;
        this.mqtt = account.mqtt ?? {};
        this.mqttConnected = false;

        const serviceType = [null, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor];
        const characteristicType = [null, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState];

        //presets configured
        for (const preset of this.presets) {
            preset.name = preset.name;
            preset.serviceType = serviceType[preset.displayType];
            preset.characteristicType = characteristicType[preset.displayType];
            preset.state = false;
            preset.previousSettings = {};
        }

        //schedules configured
        for (const schedule of this.schedules) {
            schedule.name = schedule.name;
            schedule.serviceType = serviceType[schedule.displayType];
            schedule.characteristicType = characteristicType[schedule.displayType];
            schedule.state = false;
        }

        //scenes configured
        for (const scene of this.scenes) {
            scene.name = scene.name;
            scene.serviceType = serviceType[scene.displayType];
            scene.characteristicType = characteristicType[scene.displayType];
            scene.state = false;
        }

        //buttons configured
        for (const button of this.buttons) {
            button.name = button.name || 'Button'
            button.serviceType = [null, Service.Outlet, Service.Switch, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][button.displayType];
            button.characteristicType = [null, Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][button.displayType];
            button.state = false;
            button.previousValue = null;
        }

        //device data
        this.deviceData = {};

        //accessory
        this.accessory = {};
        this.useFahrenheit = useFahrenheit ? 1 : 0;
    };

    async externalIntegrations() {
        try {
            //RESTFul server
            const restFulEnabled = this.restFul.enable || false;
            if (restFulEnabled) {
                if (!this.restFulConnected) {
                    this.restFul1 = new RestFul({
                        port: this.restFul.port,
                        logWarn: this.logWarn,
                        logDebug: this.logDebug
                    })
                        .on('connected', (message) => {
                            this.restFulConnected = true;
                            this.emit('success', message);
                        })
                        .on('set', async (key, value) => {
                            try {
                                await this.setOverExternalIntegration('RESTFul', this.deviceData, key, value);
                            } catch (error) {
                                this.emit('warn', error);
                            };
                        })
                        .on('debug', (debug) => {
                            this.emit('debug', debug);
                        })
                        .on('warn', (warn) => {
                            this.emit('warn', warn);
                        })
                        .on('error', (error) => {
                            this.emit('error', error);
                        });
                }
            }

            //MQTT client
            const mqttEnabled = this.mqtt.enable || false;
            if (mqttEnabled) {
                if (!this.mqttConnected) {
                    this.mqtt1 = new Mqtt({
                        host: this.mqtt.host,
                        port: this.mqtt.port || 1883,
                        clientId: this.mqtt.clientId ? `melcloud_${this.mqtt.clientId}_${Math.random().toString(16).slice(3)}` : `melcloud_${Math.random().toString(16).slice(3)}`,
                        prefix: this.mqtt.prefix ? `melcloud/${this.mqtt.prefix}/${this.deviceTypeText}/${this.deviceName}` : `melcloud/${this.deviceTypeText}/${this.deviceName}`,
                        user: this.mqtt.auth?.user,
                        passwd: this.mqtt.auth?.passwd,
                        logWarn: this.logWarn,
                        logDebug: this.logDebug
                    })
                        .on('connected', (message) => {
                            this.mqttConnected = true;
                            this.emit('success', message);
                        })
                        .on('subscribed', (message) => {
                            this.emit('success', message);
                        })
                        .on('set', async (key, value) => {
                            try {
                                await this.setOverExternalIntegration('MQTT', this.deviceData, key, value);
                            } catch (error) {
                                this.emit('warn', error);
                            };
                        })
                        .on('debug', (debug) => {
                            this.emit('debug', debug);
                        })
                        .on('warn', (warn) => {
                            this.emit('warn', warn);
                        })
                        .on('error', (error) => {
                            this.emit('error', error);
                        });
                }
            }
        } catch (error) {
            this.emit('warn', `External integration start error: ${error}`);
        };
    }

    async setOverExternalIntegration(integration, deviceData, key, value) {
        try {
            let set = false
            let flag = null;
            switch (key) {
                case 'Power':
                    deviceData.Device[key] = value;
                    flag = HeatPump.EffectiveFlags.Power;
                    break;
                case 'OperationMode':
                    deviceData.Device[key] = value;
                    flag = HeatPump.EffectiveFlags.OperationMode;
                    break;
                case 'OperationModeZone1':
                    deviceData.Device[key] = value;
                    flag = HeatPump.EffectiveFlags.OperationModeZone1;
                    break;
                case 'OperationModeZone2':
                    deviceData.Device[key] = value;
                    flag = HeatPump.EffectiveFlags.OperationModeZone2;
                    break;
                case 'SetTemperatureZone1':
                    deviceData.Device[key] = value;
                    flag = HeatPump.EffectiveFlags.SetTemperatureZone2;
                    break;
                case 'SetTemperatureZone2':
                    deviceData.Device[key] = value;
                    flag = HeatPump.EffectiveFlags.SetTemperatureZone2;
                    break;
                case 'SetHeatFlowTemperatureZone1':
                    deviceData.Device[key] = value;
                    flag = HeatPump.EffectiveFlags.SetHeatFlowTemperatureZone1;
                    break;
                case 'SetHeatFlowTemperatureZone2':
                    deviceData.Device[key] = value;
                    flag = HeatPump.EffectiveFlags.SetHeatFlowTemperatureZone2;
                    break;
                case 'SetCoolFlowTemperatureZone1':
                    deviceData.Device[key] = value;
                    flag = HeatPump.EffectiveFlags.SetCoolFlowTemperatureZone1;
                    break;
                case 'SetCoolFlowTemperatureZone2':
                    deviceData.Device[key] = value;
                    flag = HeatPump.EffectiveFlags.SetCoolFlowTemperatureZone2;
                    break;
                case 'SetTankWaterTemperature':
                    deviceData.Device[key] = value;
                    flag = HeatPump.EffectiveFlags.SetTankWaterTemperature;
                    break;
                case 'ForcedHotWaterMode':
                    deviceData.Device[key] = value;
                    flag = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                    break;
                case 'EcoHotWater':
                    deviceData.Device[key] = value;
                    flag = HeatPump.EffectiveFlags.EcoHotWater;
                    break;
                case 'ProhibitZone1':
                    if (this.accountType === 'melcloudhome') return;

                    deviceData.Device[key] = value;
                    flag = HeatPump.EffectiveFlags.ProhibitZone1;
                    break;
                case 'ProhibitZone2':
                    if (this.accountType === 'melcloudhome') return;

                    deviceData.Device[key] = value;
                    flag = HeatPump.EffectiveFlags.ProhibitZone2;
                    break;
                case 'ProhibitHotWater':
                    if (this.accountType === 'melcloudhome') return;

                    deviceData.Device[key] = value;
                    flag = HeatPump.EffectiveFlags.ProhibitHotWater;
                    break;
                case 'ScheduleEnabled':
                    if (this.accountType === 'melcloud') return;

                    deviceData.Device[key].Enabled = value;
                    flag = 'schedule';
                    break;
                case 'HolidayMode':
                    if (this.accountType === 'melcloud') {
                        deviceData.Device[key] = value;
                        flag = HeatPump.EffectiveFlags.HolidayMode;
                    }

                    if (this.accountType === 'melcloudhome') {
                        deviceData.Device[key].Enabled = value;
                        flag = 'holidaymode';
                    }
                    break;
                default:
                    this.emit('warn', `${integration}, received key: ${key}, value: ${value}`);
                    break;
            };

            set = await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, flag);
            return set;
        } catch (error) {
            throw new Error(`${integration} set key: ${key}, value: ${value}, error: ${error.message ?? error}`);
        };
    }

    async startStopImpulseGenerator(state, timers = []) {
        try {
            //start impulse generator 
            await this.melCloudAtw.impulseGenerator.state(state, timers)
            return true;
        } catch (error) {
            throw new Error(`Impulse generator start error: ${error}`);
        }
    }

    //prepare accessory
    async prepareAccessory() {
        try {
            const deviceData = this.deviceData;
            const deviceId = this.deviceId;
            const deviceTypeText = this.deviceTypeText;
            const deviceName = this.deviceName;
            const accountName = this.accountName;
            const presetsOnServer = this.accessory.presets;
            const schedulesOnServer = this.accessory.schedules;
            const scenesOnServer = this.accessory.scenes;
            const zonesCount = this.accessory.zonesCount;
            const caseHeatPump = this.accessory.caseHeatPump;
            const caseZone1 = this.accessory.caseZone1;
            const caseHotWater = this.accessory.caseHotWater;
            const caseZone2 = this.accessory.caseZone2;
            const heatCoolModes = this.accessory.heatCoolModes;

            const zonesSensorsCount = this.accessory.sensorsCount;
            const caseHeatPumpSensor = this.accessory.caseHeatPumpSensor;
            const caseZone1Sensor = this.accessory.caseZone1Sensor;
            const caseHotWaterSensor = this.accessory.caseHotWaterSensor;
            const caseZone2Sensor = this.accessory.caseZone2Sensor;

            //accessory
            if (this.logDebug) this.emit('debug', `Prepare accessory`);
            const accessoryName = deviceName;
            const accessoryUUID = AccessoryUUID.generate(accountName + deviceId.toString());
            const accessoryCategory = Categories.AIR_HEATER;
            const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

            //information service
            if (this.logDebug) this.emit('debug', `Prepare information service`);
            this.informationService = accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
                .setCharacteristic(Characteristic.Model, this.model)
                .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
                .setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision)
                .setCharacteristic(Characteristic.ConfiguredName, accessoryName);

            //services
            const serviceName = `${deviceTypeText} ${accessoryName}`;
            if (zonesCount > 0) {
                this.melCloudServices = [];
                this.accessory.zones.forEach((zone, i) => {
                    const zoneName = zone.name
                    const serviceName = `${deviceTypeText} ${accessoryName}: ${zoneName}`;
                    switch (this.displayType) {
                        case 1: //Heater Cooler
                            if (this.logDebug) this.emit('debug', `Prepare heather/cooler ${zoneName} service`);
                            const melCloudService = new Service.HeaterCooler(serviceName, `HeaterCooler ${deviceId} ${i}`);
                            melCloudService.setPrimaryService(true);
                            melCloudService.getCharacteristic(Characteristic.Active)
                                .onGet(async () => {
                                    const state = this.accessory.power;
                                    return state;
                                })
                                .onSet(async (state) => {
                                    try {
                                        switch (i) {
                                            case 0: //Heat Pump
                                                deviceData.Device.Power = state ? true : false;
                                                await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, HeatPump.EffectiveFlags.Power);
                                                if (this.logInfo) this.emit('info', `${zoneName}, Set power: ${state ? 'On' : 'Off'}`);
                                                break;
                                        };
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `Set power error: ${error}`);
                                    };
                                });
                            melCloudService.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
                                .onGet(async () => {
                                    const value = zone.currentOperationMode;
                                    return value;
                                });
                            melCloudService.getCharacteristic(Characteristic.TargetHeaterCoolerState)
                                .setProps({
                                    minValue: zone.operationModesSetPropsMinValue,
                                    maxValue: zone.operationModesSetPropsMaxValue,
                                    validValues: zone.operationModesSetPropsValidValues
                                })
                                .onGet(async () => {
                                    const value = zone.targetOperationMode;
                                    return value;
                                })
                                .onSet(async (value) => {
                                    try {
                                        let operationModeText = '';
                                        let flag = null;
                                        switch (i) {
                                            case caseHeatPump: //Heat Pump - ON, HEAT, COOL
                                                switch (value) {
                                                    case caseHeatPump: //AUTO
                                                        deviceData.Device.Power = true;
                                                        flag = HeatPump.EffectiveFlags.Power;
                                                        break;
                                                    case 1: //HEAT
                                                        deviceData.Device.Power = true;
                                                        deviceData.Device.UnitStatus = 0;
                                                        flag = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationMode;
                                                        break;
                                                    case 2: //COOL
                                                        deviceData.Device.Power = true;
                                                        deviceData.Device.UnitStatus = 1;
                                                        flag = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationMode;
                                                        break;
                                                };
                                                operationModeText = [HeatPump.SystemMapEnumToString[0], HeatPump.SystemMapEnumToString[deviceData.Device.UnitStatus]][this.accessory.power];
                                                break;
                                            case caseZone1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                                switch (value) {
                                                    case 0: //AUTO - HEAT CURVE
                                                        deviceData.Device.OperationModeZone1 = 2;
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                    case 1: //HEAT - HEAT THERMOSTAT / COOL THERMOSTAT
                                                        deviceData.Device.OperationModeZone1 = [0, 3][this.unitStatus];
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                    case 2: //COOL - HEAT FLOW / COOL FLOW
                                                        deviceData.Device.OperationModeZone1 = [1, 4][this.unitStatus];
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                };
                                                operationModeText = HeatPump.ZoneOperation[deviceData.Device.OperationModeZone1];
                                                break;
                                            case caseHotWater: //Hot Water - AUTO, HEAT NOW
                                                switch (value) {
                                                    case 0: //AUTO
                                                        deviceData.Device.ForcedHotWaterMode = false;
                                                        flag = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                        break;
                                                    case 1: //HEAT
                                                        deviceData.Device.ForcedHotWaterMode = true;
                                                        flag = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                        break;
                                                    case 2: //COOL
                                                        deviceData.Device.ForcedHotWaterMode = false;
                                                        flag = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                        break
                                                };
                                                operationModeText = deviceData.Device.OperationMode === 1 ? HeatPump.ForceDhwMapEnumToString[1] : HeatPump.ForceDhwMapEnumToString[deviceData.Device.ForcedHotWaterMode ? 1 : 0];
                                                break;
                                            case caseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                                switch (value) {
                                                    case 0: //AUTO
                                                        deviceData.Device.OperationModeZone2 = 2;
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                    case 1: //HEAT - HEAT THERMOSTAT / COOL THERMOSTAT
                                                        deviceData.Device.OperationModeZone2 = [0, 3][this.unitStatus];
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                    case 2: //COOL - HEAT FLOW / COOL FLOW
                                                        deviceData.Device.OperationModeZone2 = [1, 4][this.unitStatus];
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                };
                                                operationModeText = HeatPump.ZoneOperationMapEnumToString[deviceData.Device.OperationModeZone2];
                                                break;
                                        };

                                        await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, flag);
                                        if (this.logInfo) this.emit('info', `${zoneName}, Set operation mode: ${operationModeText}`);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `${zoneName}, Set operation mode error: ${error}`);
                                    };
                                });
                            melCloudService.getCharacteristic(Characteristic.CurrentTemperature)
                                .setProps({
                                    minValue: -35,
                                    maxValue: 150,
                                    minStep: 0.5
                                })
                                .onGet(async () => {
                                    const value = zone.roomTemperature;
                                    return value;
                                });
                            //only for heat/cool, only cool and not for hot water tank
                            if ((heatCoolModes === 0 || heatCoolModes === 2) && i !== caseHotWater) {
                                melCloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
                                    .setProps({
                                        minValue: zone.temperaturesSetPropsMinValue,
                                        maxValue: zone.temperaturesSetPropsMaxValue,
                                        minStep: this.accessory.temperatureIncrement
                                    })
                                    .onGet(async () => {
                                        const value = zone.setTemperature;
                                        return value;
                                    })
                                    .onSet(async (value) => {
                                        try {
                                            let flag = null;
                                            switch (i) {
                                                case caseHeatPump: //Heat Pump
                                                    //deviceData.Device.SetTemperatureZone1 = value;
                                                    //flag = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                    break;
                                                case caseZone1: //Zone 1
                                                    switch (zone.operationMode) {
                                                        case 1: //HEAT FLOW
                                                            deviceData.Device.SetHeatFlowTemperatureZone1 = value;
                                                            flag = HeatPump.EffectiveFlags.SetHeatFlowTemperatureZone1;
                                                            break;
                                                        case 4: //COOL FLOW
                                                            deviceData.Device.SetCoolFlowTemperatureZone1 = value;
                                                            flag = HeatPump.EffectiveFlags.SetCoolFlowTemperatureZone1;
                                                            break;
                                                        default:
                                                            deviceData.Device.SetTemperatureZone1 = value;
                                                            flag = HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                            break
                                                    };
                                                    break;
                                                case caseHotWater: //Hot Water
                                                    deviceData.Device.SetTankWaterTemperature = value;
                                                    flag = HeatPump.EffectiveFlags.SetTankWaterTemperature;
                                                    break;
                                                case caseZone2: //Zone 2
                                                    switch (zone.operationMode) {
                                                        case 1: //HEAT FLOW
                                                            deviceData.Device.SetHeatFlowTemperatureZone2 = value;
                                                            flag = HeatPump.EffectiveFlags.SetHeatFlowTemperatureZone2;
                                                            break;
                                                        case 4: //COOL FLOW
                                                            deviceData.Device.SetCoolFlowTemperatureZone2 = value;
                                                            flag = HeatPump.EffectiveFlags.SetCoolFlowTemperatureZone2;
                                                            break;
                                                        default:
                                                            deviceData.Device.SetTemperatureZone2 = value;
                                                            flag = HeatPump.EffectiveFlags.SetTemperatureZone2;
                                                            break
                                                    };
                                                    break;
                                            };

                                            if (i > 0) await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, flag);
                                            if (this.logInfo && i !== 0) this.emit('info', `${zoneName}, Set cooling threshold temperature: ${value}${this.accessory.temperatureUnit}`);
                                        } catch (error) {
                                            if (this.logWarn) this.emit('warn', `${zoneName}, Set cooling threshold temperature error: ${error}`);
                                        };
                                    });
                            };
                            //device can heat/cool or only heat
                            if (heatCoolModes === 0 || heatCoolModes === 1) {
                                melCloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
                                    .setProps({
                                        minValue: zone.temperaturesSetPropsMinValue,
                                        maxValue: zone.temperaturesSetPropsMaxValue,
                                        minStep: this.accessory.temperatureIncrement
                                    })
                                    .onGet(async () => {
                                        const value = zone.setTemperature;
                                        return value;
                                    })
                                    .onSet(async (value) => {
                                        try {
                                            let flag = null;
                                            switch (i) {
                                                case caseHeatPump: //Heat Pump
                                                    //deviceData.Device.SetTemperatureZone1 = value;
                                                    //flag = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                    break;
                                                case caseZone1: //Zone 1
                                                    switch (zone.operationMode) {
                                                        case 1: //HEAT FLOW
                                                            deviceData.Device.SetHeatFlowTemperatureZone1 = value;
                                                            flag = HeatPump.EffectiveFlags.SetHeatFlowTemperatureZone1;
                                                            break;
                                                        case 4: //COOL FLOW
                                                            deviceData.Device.SetCoolFlowTemperatureZone1 = value;
                                                            flag = HeatPump.EffectiveFlags.SetCoolFlowTemperatureZone1;
                                                            break;
                                                        default:
                                                            deviceData.Device.SetTemperatureZone1 = value;
                                                            flag = HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                            break
                                                    };
                                                    break;
                                                case caseHotWater: //Hot Water
                                                    deviceData.Device.SetTankWaterTemperature = value;
                                                    flag = HeatPump.EffectiveFlags.SetTankWaterTemperature;
                                                    break;
                                                case caseZone2: //Zone 2
                                                    switch (zone.operationMode) {
                                                        case 1: //HEAT FLOW
                                                            deviceData.Device.SetHeatFlowTemperatureZone2 = value;
                                                            flag = HeatPump.EffectiveFlags.SetHeatFlowTemperatureZone2;
                                                            break;
                                                        case 4: //COOL FLOW
                                                            deviceData.Device.SetCoolFlowTemperatureZone2 = value;
                                                            flag = HeatPump.EffectiveFlags.SetCoolFlowTemperatureZone2;
                                                            break;
                                                        default:
                                                            deviceData.Device.SetTemperatureZone2 = value;
                                                            flag = HeatPump.EffectiveFlags.SetTemperatureZone2;
                                                            break
                                                    };
                                                    break;
                                            };

                                            if (i > 0) await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, flag);
                                            if (this.logInfo && i !== 0) this.emit('info', `${zoneName}, Set heating threshold temperature: ${value}${this.accessory.temperatureUnit}`);
                                        } catch (error) {
                                            if (this.logWarn) this.emit('warn', `${zoneName}, Set heating threshold temperature error: ${error}`);
                                        };
                                    });
                            };
                            melCloudService.getCharacteristic(Characteristic.LockPhysicalControls)
                                .onGet(async () => {
                                    const value = zone.lockPhysicalControl;
                                    return value;
                                })
                                .onSet(async (value) => {
                                    if (this.account.type === 'melcloudhome') return;

                                    try {
                                        value = value ? true : false;
                                        switch (i) {
                                            case caseHeatPump: //Heat Pump
                                                deviceData.Device.ProhibitZone1 = value;
                                                deviceData.Device.ProhibitHotWater = value;
                                                deviceData.Device.ProhibitZone2 = value;
                                                HeatPump.EffectiveFlags.ProhibitHeatingZone1 + HeatPump.EffectiveFlags.ProhibitHotWater + HeatPump.EffectiveFlags.ProhibitHeatingZone2;
                                                break;
                                            case caseZone1: //Zone 1
                                                deviceData.Device.ProhibitZone1 = value;
                                                HeatPump.EffectiveFlags.ProhibitHeatingZone1;
                                                break;
                                            case caseHotWater: //Hot Water
                                                deviceData.Device.ProhibitHotWater = value;
                                                HeatPump.EffectiveFlags.ProhibitHotWater;
                                                break;
                                            case caseZone2: //Zone 2
                                                deviceData.Device.ProhibitZone2 = value;
                                                HeatPump.EffectiveFlags.ProhibitHeatingZone2;
                                                break;
                                        };

                                        await this.melCloudAtw.send(this.accountType, this.displayType, deviceData);
                                        if (this.logInfo) this.emit('info', `${zoneName}, Set lock physical controls: ${value ? 'LOCK' : 'UNLOCK'}`);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `${zoneName}, Set lock physical controls error: ${error}`);
                                    };
                                });
                            melCloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
                                .onGet(async () => {
                                    const value = this.accessory.useFahrenheit;
                                    return value;
                                })
                                .onSet(async (value) => {
                                    if (this.account.type === 'melcloudhome') return;

                                    try {
                                        value = [false, true][value];
                                        this.accessory.useFahrenheit = value;
                                        this.emit('melCloud', 'UseFahrenheit', value);
                                        if (this.logInfo) this.emit('info', `Set temperature display unit: ${TemperatureDisplayUnits[value]}`);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `Set temperature display unit error: ${error}`);
                                    };
                                });
                            this.melCloudServices.push(melCloudService);
                            accessory.addService(melCloudService);
                            break;
                        case 2: //Thermostat
                            if (this.logDebug) this.emit('debug', `Prepare thermostat ${zoneName} service`);
                            const melCloudServiceT = new Service.Thermostat(serviceName, `Thermostat ${deviceId} ${i}`);
                            melCloudServiceT.setPrimaryService(true);
                            melCloudServiceT.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
                                .onGet(async () => {
                                    const value = zone.currentOperationMode;
                                    return value;
                                });
                            melCloudServiceT.getCharacteristic(Characteristic.TargetHeatingCoolingState)
                                .setProps({
                                    minValue: zone.operationModesSetPropsMinValue,
                                    maxValue: zone.operationModesSetPropsMaxValue,
                                    validValues: zone.operationModesSetPropsValidValues
                                })
                                .onGet(async () => {
                                    const value = zone.targetOperationMode;
                                    return value;
                                })
                                .onSet(async (value) => {
                                    try {
                                        let operationModeText = '';
                                        let flag = null;
                                        switch (i) {
                                            case caseHeatPump: //Heat Pump - HEAT, COOL
                                                switch (value) {
                                                    case 0: //OFF
                                                        deviceData.Device.Power = false;
                                                        flag = HeatPump.EffectiveFlags.Power;
                                                        break;
                                                    case 1: //HEAT
                                                        deviceData.Device.Power = true;
                                                        deviceData.Device.UnitStatus = 0;
                                                        flag = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationMode;
                                                        break;
                                                    case 2: //COOL
                                                        deviceData.Device.Power = true;
                                                        deviceData.Device.UnitStatus = 1;
                                                        flag = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationMode;
                                                        break;
                                                    case 3: //AUTO
                                                        deviceData.Device.Power = true;
                                                        flag = HeatPump.EffectiveFlags.Power;
                                                        break;
                                                };
                                                operationModeText = [HeatPump.SystemMapEnumToString[0], HeatPump.SystemMapEnumToString[deviceData.Device.UnitStatus]][this.accessory.power];
                                                break;
                                            case caseZone1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                                switch (value) {
                                                    case 0: //OFF - HEAT CURVE
                                                        deviceData.Device.OperationModeZone1 = 2;
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                    case 1: //HEAT - HEAT THERMOSTAT / COOL THERMOSTAT
                                                        deviceData.Device.OperationModeZone1 = [0, 3][this.unitStatus];
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                    case 2: //COOL - HEAT FLOW / COOL FLOW
                                                        deviceData.Device.OperationModeZone1 = [1, 4][this.unitStatus];
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                    case 3: //AUTO - HEAT CURVE
                                                        deviceData.Device.OperationModeZone1 = 2;
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                };
                                                operationModeText = HeatPump.ZoneOperationMapEnumToString[deviceData.Device.OperationModeZone1];
                                                break;
                                            case caseHotWater: //Hot Water - AUTO, HEAT NOW
                                                switch (value) {
                                                    case 0: //OFF
                                                        deviceData.Device.ForcedHotWaterMode = false;
                                                        flag = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                        break;
                                                    case 1: //HEAT
                                                        deviceData.Device.ForcedHotWaterMode = true;
                                                        flag = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                        break;
                                                    case 2: //COOL
                                                        deviceData.Device.ForcedHotWaterMode = false;
                                                        flag = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                        break;
                                                    case 3: //AUTO
                                                        deviceData.Device.ForcedHotWaterMode = false;
                                                        flag = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                        break;
                                                };
                                                operationModeText = deviceData.Device.OperationMode === 1 ? HeatPump.ForceDhwMapEnumToString[1] : HeatPump.ForceDhwMapEnumToString[deviceData.Device.ForcedHotWaterMode ? 1 : 0];
                                                break;
                                            case caseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                                switch (value) {
                                                    case 0: //OFF - HEAT CURVE
                                                        deviceData.Device.OperationModeZone2 = 2;
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                    case 1: //HEAT - HEAT THERMOSTAT / COOL THERMOSTAT
                                                        deviceData.Device.OperationModeZone2 = [0, 3][this.unitStatus];
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                    case 2: //COOL - HEAT FLOW / COOL FLOW
                                                        deviceData.Device.OperationModeZone2 = [1, 4][this.unitStatus];
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                    case 3: //AUTO - HEAT CURVE
                                                        deviceData.Device.OperationModeZone2 = 2;
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                };
                                                operationModeText = HeatPump.ZoneOperationMapEnumToString[deviceData.Device.OperationModeZone2];
                                                break;
                                        };

                                        await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, flag);
                                        if (this.logInfo) this.emit('info', `${zoneName}, Set operation mode: ${operationModeText}`);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `${zoneName}, Set operation mode error: ${error}`);
                                    };
                                });
                            melCloudServiceT.getCharacteristic(Characteristic.CurrentTemperature)
                                .setProps({
                                    minValue: -35,
                                    maxValue: 150,
                                    minStep: 0.5
                                })
                                .onGet(async () => {
                                    const value = zone.roomTemperature;
                                    return value;
                                });
                            melCloudServiceT.getCharacteristic(Characteristic.TargetTemperature)
                                .setProps({
                                    minValue: zone.temperaturesSetPropsMinValue,
                                    maxValue: zone.temperaturesSetPropsMaxValue,
                                    minStep: this.accessory.temperatureIncrement
                                })
                                .onGet(async () => {
                                    const value = zone.setTemperature;
                                    return value;
                                })
                                .onSet(async (value) => {
                                    try {
                                        let flag = null;
                                        switch (i) {
                                            case caseHeatPump: //Heat Pump
                                                //deviceData.Device.SetTemperatureZone1 = value;
                                                //flag = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                break;
                                            case caseZone1: //Zone 1
                                                deviceData.Device.SetTemperatureZone1 = value;
                                                flag = HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                break;
                                            case caseHotWater: //Hot Water
                                                deviceData.Device.SetTankWaterTemperature = value;
                                                flag = HeatPump.EffectiveFlags.SetTankWaterTemperature;
                                                break;
                                            case caseZone2: //Zone 2
                                                deviceData.Device.SetTemperatureZone2 = value;
                                                flag = HeatPump.EffectiveFlags.SetTemperatureZone2;
                                                break;
                                        };

                                        if (i > 0) await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, flag);
                                        if (this.logInfo && i !== 0) this.emit('info', `${zoneName}, Set temperature: ${value}${this.accessory.temperatureUnit}`);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `${zoneName}, Set temperature error: ${error}`);
                                    };
                                });
                            melCloudServiceT.getCharacteristic(Characteristic.TemperatureDisplayUnits)
                                .onGet(async () => {
                                    const value = this.accessory.useFahrenheit;
                                    return value;
                                })
                                .onSet(async (value) => {
                                    if (this.account.type === 'melcloudhome') return;

                                    try {
                                        value = [false, true][value];
                                        this.accessory.useFahrenheit = value;
                                        this.emit('melCloud', 'UseFahrenheit', value);
                                        if (this.logInfo) this.emit('info', `Set temperature display unit: ${TemperatureDisplayUnits[value]}`);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `Set temperature display unit error: ${error}`);
                                    };
                                });
                            this.melCloudServices.push(melCloudServiceT);
                            accessory.addService(melCloudServiceT);
                            break;
                    };
                });
            };

            //sensor services
            if (zonesSensorsCount > 0) {
                this.accessory.zonesSensors.forEach((zone, i) => {
                    const zoneName = zone.name
                    const serviceName = `${deviceTypeText} ${accessoryName}: ${zoneName}`;
                    switch (i) {
                        case caseHeatPumpSensor: //Heat Pump
                            if (zone.roomTemperature !== null) {
                                if (this.logDebug) this.emit('debug', `${zoneName}, Prepare temperature sensor service`);
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
                                        const state = zone.roomTemperature;
                                        return state;
                                    })
                                accessory.addService(this.roomTemperatureSensorService);
                            };

                            if (zone.flowTemperature !== null) {
                                if (this.logDebug) this.emit('debug', `Prepare flow temperature sensor service`);
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
                                        const state = zone.flowTemperature;
                                        return state;
                                    })
                                accessory.addService(this.flowTemperatureSensorService);

                            };

                            if (zone.returnTemperature !== null) {
                                if (this.logDebug) this.emit('debug', `Prepare return temperature sensor service`);
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
                                        const state = zone.returnTemperature;
                                        return state;
                                    })
                                accessory.addService(this.returnTemperatureSensorService);
                            };
                            break;
                        case caseZone1Sensor: //Zone 1
                            if (zone.roomTemperature !== null) {
                                if (this.logDebug) this.emit('debug', `${zoneName}, Prepare temperature sensor service`);
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
                                        const state = zone.roomTemperature;
                                        return state;
                                    })
                                accessory.addService(this.roomTemperatureZone1SensorService);
                            };

                            if (zone.flowTemperature !== null) {
                                if (this.logDebug) this.emit('debug', `Prepare flow temperature zone 1 sensor service`);
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
                                        const state = zone.flowTemperature;
                                        return state;
                                    })
                                accessory.addService(this.flowTemperatureZone1SensorService);
                            };

                            if (zone.returnTemperature !== null) {
                                if (this.logDebug) this.emit('debug', `Prepare return temperature zone 1 sensor service`);
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
                                        const state = zone.returnTemperature;
                                        return state;
                                    })
                                accessory.addService(this.returnTemperatureZone1SensorService);
                            };
                            break;
                        case caseHotWaterSensor: //Hot Water
                            if (zone.roomTemperature !== null) {
                                if (this.logDebug) this.emit('debug', `${zoneName}, Prepare temperature sensor service`);
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
                                        const state = zone.roomTemperature;
                                        return state;
                                    })
                                accessory.addService(this.roomTemperatureWaterTankSensorService);
                            };

                            if (zone.flowTemperature !== null) {
                                if (this.logDebug) this.emit('debug', `Prepare flow temperature water tank sensor service`);
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
                                        const state = zone.flowTemperature;
                                        return state;
                                    })
                                accessory.addService(this.flowTemperatureWaterTankSensorService);
                            };

                            if (zone.returnTemperature !== null) {
                                if (this.logDebug) this.emit('debug', `Prepare return temperature water tank sensor service`);
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
                                        const state = zone.returnTemperature;
                                        return state;
                                    })
                                accessory.addService(this.returnTemperatureWaterTankSensorService);
                            };
                            break;
                        case caseZone2Sensor: //Zone 2
                            if (zone.roomTemperature !== null) {
                                if (this.logDebug) this.emit('debug', `${zoneName}, Prepare temperature sensor service`);
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
                                        const state = zone.roomTemperature;
                                        return state;
                                    })
                                accessory.addService(this.roomTemperatureZone2SensorService);
                            };

                            if (zone.flowTemperature !== null) {
                                if (this.logDebug) this.emit('debug', `Prepare flow temperature zone 2 sensor service`);
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
                                        const state = zone.flowTemperature;
                                        return state;
                                    })
                                accessory.addService(this.flowTemperatureZone2SensorService);
                            };

                            if (zone.returnTemperature !== null) {
                                if (this.logDebug) this.emit('debug', `Prepare return temperature zone 2 sensor service`);
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
                                        const state = zone.returnTemperature;
                                        return state;
                                    })
                                accessory.addService(this.returnTemperatureZone2SensorService);
                            };
                            break;
                    };
                });
            };

            if (this.inStandbySensor && this.accessory.inStandbyMode !== null) {
                if (this.logDebug) this.emit('debug', `Prepare in standby mode service`);
                this.inStandbyService = new Service.ContactSensor(`${serviceName} In Standby`, `inStandbyService${deviceId}`);
                this.inStandbyService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.inStandbyService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} In Standby`);
                this.inStandbyService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.accessory.inStandbyMode;
                        return state;
                    })
                accessory.addService(this.inStandbyService);
            }

            //connect sensor
            if (this.connectSensor && this.accessory.isConnected !== null) {
                if (this.logDebug) this.emit('debug', `Prepare connect service`);
                this.connectService = new Service.ContactSensor(`${serviceName} Connected`, `connectService${deviceId}`);
                this.connectService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.connectService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Connected`);
                this.connectService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.accessory.isConnected;
                        return state;
                    })
                accessory.addService(this.connectService);
            }

            //error sensor
            if (this.errorSensor && this.accessory.isInError !== null) {
                if (this.logDebug) this.emit('debug', `Prepare error service`);
                this.errorService = new Service.ContactSensor(`${serviceName} Error`, `errorService${deviceId}`);
                this.errorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.errorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Error`);
                this.errorService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.accessory.isInError;
                        return state;
                    })
                accessory.addService(this.errorService);
            }

            //holiday mode
            if (this.holidayModeSupport && this.accessory.holidayModeEnabled !== null) {
                //control
                if (this.logDebug) this.emit('debug', `Prepare holiday mode control service`);
                this.holidayModeControlService = new Service.Switch(`${serviceName} Holiday Mode`, `holidayModeControlService${deviceId}`);
                this.holidayModeControlService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.holidayModeControlService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Holiday Mode`);
                this.holidayModeControlService.getCharacteristic(Characteristic.On)
                    .onGet(async () => {
                        const state = this.accessory.holidayModeEnabled;
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            deviceData.HolidayMode.Enabled = state;
                            await this.melCloudAta.send(this.accountType, this.displayType, deviceData, 'holidaymode');
                            if (this.logInfo) this.emit('info', `Holiday mode: ${state ? 'Enabled' : 'Disabled'}`);
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `Set holiday mode error: ${error}`);
                        };
                    });
                accessory.addService(this.holidayModeControlService);

                if (this.logDebug) this.emit('debug', `Prepare holiday mode control sensor service`);
                this.holidayModeControlSensorService = new Service.ContactSensor(`${serviceName} Holiday Mode Control`, `holidayModeControlSensorService${deviceId}`);
                this.holidayModeControlSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.holidayModeControlSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Holiday Mode Control`);
                this.holidayModeControlSensorService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.accessory.holidayModeEnabled;
                        return state;
                    })
                accessory.addService(this.holidayModeControlSensorService);

                //sensors
                if (this.logDebug) this.emit('debug', `Prepare holiday mode sensor service`);
                this.holidayModeSensorService = new Service.ContactSensor(`${serviceName} Holiday Mode`, `holidayModeSensorService${deviceId}`);
                this.holidayModeSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.holidayModeSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Holiday Mode State`);
                this.holidayModeSensorService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.accessory.holidayModeActive;
                        return state;
                    })
                accessory.addService(this.holidayModeSensorService);
            }

            //presets services
            if (this.presets.length > 0) {
                if (this.logDebug) this.emit('debug', `Prepare presets services`);
                this.presetControlServices = [];
                this.presetControlSensorServices = [];
                this.presets.forEach((preset, i) => {
                    const presetData = presetsOnServer.find(p => p.ID === preset.id);

                    //get preset name
                    const name = preset.name;

                    //get preset name prefix
                    const namePrefix = preset.namePrefix;

                    const serviceName1 = namePrefix ? `${accessoryName} ${name}` : name;
                    const serviceType = preset.serviceType;
                    const characteristicType = preset.characteristicType;

                    if (preset.displayType > 3) {
                        if (this.logDebug) this.emit('debug', `Prepare preset control ${name} service`);
                        const presetControlService = new Service.Switch(serviceName1, `presetControlService${deviceId} ${i}`);
                        presetControlService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        presetControlService.setCharacteristic(Characteristic.ConfiguredName, serviceName1);
                        presetControlService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = preset.state;
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    switch (state) {
                                        case true:
                                            preset.previousSettings = deviceData.Device;
                                            deviceData.Device.Power = presetData.Power;
                                            deviceData.Device.OperationMode = presetData.OperationMode;
                                            deviceData.Device.SetTemperature = presetData.SetTemperature;
                                            deviceData.Device.VaneHorizontalDirection = presetData.VaneHorizontalDirection;
                                            deviceData.Device.VaneVerticalDirection = presetData.VaneVerticalDirection;
                                            deviceData.Device.SetFanSpeed = presetData.SetFanSpeed;
                                            break;
                                        case false:
                                            deviceData.Device.Power = preset.previousSettings.Power;
                                            deviceData.Device.OperationMode = preset.previousSettings.OperationMode;
                                            deviceData.Device.SetTemperature = preset.previousSettings.SetTemperature;
                                            deviceData.Device.VaneHorizontalDirection = preset.previousSettings.VaneHorizontalDirection;
                                            deviceData.Device.VaneVerticalDirection = preset.previousSettings.VaneVerticalDirection;
                                            deviceData.Device.SetFanSpeed = preset.previousSettings.SetFanSpeed;
                                            break;
                                    };

                                    await this.melCloudAta.send(this.accountType, this.displayType, deviceData, AirConditioner.EffectiveFlags.Presets);
                                    if (this.logInfo) this.emit('info', `Preset ${name}: ${state ? 'Set:' : 'Unset:'} ${name}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `Set preset error: ${error}`);
                                };
                            });
                        this.presetControlServices.push(presetControlService);
                        accessory.addService(presetControlService);
                    }

                    //sensor
                    if (this.logDebug) this.emit('debug', `Prepare preset control sensor s${name}  ervice`);
                    const presetControlSensorService = new serviceType(serviceName1, `presetControlSensorService${deviceId} ${i}`);
                    presetControlSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    presetControlSensorService.setCharacteristic(Characteristic.ConfiguredName, `${serviceName1} Control`);
                    presetControlSensorService.getCharacteristic(characteristicType)
                        .onGet(async () => {
                            const state = this.accessory.scheduleEnabled;
                            return state;
                        })
                    this.presetControlSensorServices.push(presetControlSensorService);
                    accessory.addService(presetControlSensorService);
                });
            };

            //schedules services
            if (this.schedules.length > 0 && this.accessory.scheduleEnabled !== null) {
                if (this.logDebug) this.emit('debug', `Prepare schedules services`);
                this.scheduleSensorServices = [];
                this.schedules.forEach((schedule, i) => {
                    //get preset name
                    const name = schedule.name;

                    //get preset name prefix
                    const namePrefix = schedule.namePrefix;

                    //control sensor
                    const serviceName1 = namePrefix ? `${accessoryName} ${name}` : name;
                    const serviceName2 = namePrefix ? `${accessoryName} Schedules` : 'Schedules';
                    const serviceType = schedule.serviceType;
                    const characteristicType = schedule.characteristicType;

                    //control
                    if (i === 0) {
                        if (schedule.displayType > 3) {
                            if (this.logDebug) this.emit('debug', `Prepare schedule control ${name} service`);
                            this.scheduleControlService = new Service.Switch(serviceName2, `scheduleControlService${deviceId} ${i}`);
                            this.scheduleControlService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            this.scheduleControlService.setCharacteristic(Characteristic.ConfiguredName, serviceName2);
                            this.scheduleControlService.getCharacteristic(Characteristic.On)
                                .onGet(async () => {
                                    const state = this.accessory.scheduleEnabled;
                                    return state;
                                })
                                .onSet(async (state) => {
                                    try {
                                        deviceData.ScheduleEnabled = state;
                                        await this.melCloudAta.send(this.accountType, this.displayType, deviceData, 'schedule');
                                        if (this.logInfo) this.emit('info', `Schedule ${name}: ${state ? 'Enabled' : 'Disabled'}`);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `Set schedule error: ${error}`);
                                    };
                                });
                            accessory.addService(this.scheduleControlService);
                        }

                        //sensor
                        if (this.logDebug) this.emit('debug', `Prepare schedule control sensor ${name} service`);
                        this.scheduleControlSensorService = new serviceType(`${serviceName2} Control`, `scheduleControlSensorService${deviceId} ${i}`);
                        this.scheduleControlSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        this.scheduleControlSensorService.setCharacteristic(Characteristic.ConfiguredName, `${serviceName2} Control`);
                        this.scheduleControlSensorService.getCharacteristic(characteristicType)
                            .onGet(async () => {
                                const state = this.accessory.scheduleEnabled;
                                return state;
                            })
                        accessory.addService(this.scheduleControlSensorService);
                    }

                    //sensors
                    if (this.logDebug) this.emit('debug', `Prepare schedule sensor ${name} service`);
                    const scheduleSensorService = new serviceType(serviceName1, `scheduleSensorService${deviceId} ${i}`);
                    scheduleSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    scheduleSensorService.setCharacteristic(Characteristic.ConfiguredName, serviceName1);
                    scheduleSensorService.getCharacteristic(characteristicType)
                        .onGet(async () => {
                            const state = schedule.state;
                            return state;
                        });
                    this.scheduleSensorServices.push(scheduleSensorService);
                    accessory.addService(scheduleSensorService);
                });
            };

            //scenes
            if (this.scenes.length > 0) {
                if (this.logDebug) this.emit('debug', `Prepare scenes services`);
                this.sceneControlServices = [];
                this.sceneControlSensorServices = [];
                this.scenes.forEach((scene, i) => {
                    const sceneData = scenesOnServer.find(s => s.Id === scene.id);

                    //get preset name
                    const name = scene.name;

                    //get preset name prefix
                    const namePrefix = scene.namePrefix;

                    const serviceName1 = namePrefix ? `${accessoryName} ${name}` : name;
                    const serviceType = scene.serviceType;
                    const characteristicType = scene.characteristicType;

                    //control
                    if (scene.displayType > 3) {
                        if (this.logDebug) this.emit('debug', `Prepare scene control ${name}  service`);
                        const sceneControlService = new Service.Switch(serviceName1, `sceneControlService${deviceId} ${i}`);
                        sceneControlService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        sceneControlService.setCharacteristic(Characteristic.ConfiguredName, serviceName1);
                        sceneControlService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = scene.state;
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    sceneData.Enabled = state;
                                    await this.melCloudAta.send(this.accountType, this.displayType, deviceData, 'scene', sceneData);
                                    if (this.logInfo) this.emit('info', `Scene ${name}: ${state ? 'Enabled' : 'Disabled'}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `Set scene error: ${error}`);
                                };
                            });
                        this.sceneControlServices.push(sceneControlService);
                        accessory.addService(sceneControlService);
                    }

                    if (this.logDebug) this.emit('debug', `Prepare scene control sensor ${name} service`);
                    const sceneControlSensorService = new serviceType(`${serviceName1} Control`, `sceneControlSensorService${deviceId} ${i}`);
                    sceneControlSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    sceneControlSensorService.setCharacteristic(Characteristic.ConfiguredName, `${serviceName1} Control`);
                    sceneControlSensorService.getCharacteristic(characteristicType)
                        .onGet(async () => {
                            const state = scene.state;
                            return state;
                        })
                    this.sceneControlSensorServices.push(sceneControlSensorService);
                    accessory.addService(sceneControlSensorService);
                });
            };

            //buttons services
            if (this.buttons.length > 0) {
                if (this.logDebug) this.emit('debug', `Prepare buttons services`);
                this.buttonsServices = [];
                this.buttons.lengthforEach((button, i) => {
                    //get button mode
                    const mode = button.mode;

                    //get button display type
                    const displayType = button.displayType;

                    //get button name
                    const name = button.name;

                    //get button name prefix
                    const namePrefix = button.namePrefix;

                    const serviceName1 = namePrefix ? `${accessoryName} ${name}` : name;
                    const serviceType = button.serviceType;
                    const characteristicType = button.characteristicType;
                    const buttonService = new serviceType(serviceName, `Button ${deviceId} ${i}`);
                    buttonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    buttonService.setCharacteristic(Characteristic.ConfiguredName, serviceName1);
                    buttonService.getCharacteristic(characteristicType)
                        .onGet(async () => {
                            const state = button.state;
                            return state;
                        })
                        .onSet(async (state) => {
                            if (displayType > 0 && displayType < 3) {
                                try {
                                    let flag = null;
                                    switch (mode) {
                                        case 0: //POWER ON,OFF
                                            deviceData.Device.Power = state;
                                            flag = HeatPump.EffectiveFlags.Power;
                                            break;
                                        case 1: //HEAT PUMP HEAT
                                            button.previousValue = state ? deviceData.Device.UnitStatus : button.previousValue ?? deviceData.Device.UnitStatus;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.UnitStatus = state ? 0 : button.previousValue;
                                            flag = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationMode;
                                            break;
                                        case 2: //COOL
                                            button.previousValue = state ? deviceData.Device.UnitStatus : button.previousValue ?? deviceData.Device.UnitStatus;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.UnitStatus = state ? 1 : button.previousValue;
                                            flag = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationMode;
                                            break;
                                        case 3: //HOLIDAY
                                            if (this.accountType === 'melcloud') {
                                                deviceData.Device.HolidayMode = state;
                                                flag = HeatPump.EffectiveFlags.HolidayMode;
                                            }

                                            if (this.accountType === 'melcloudhome') {
                                                deviceData.Device.HolidayMode.Enabled = state;
                                                flag = 'holidaymode';
                                            }
                                            break;
                                        case 10: //ALL ZONES PHYSICAL LOCK CONTROL
                                            deviceData.Device.ProhibitZone1 = state;
                                            deviceData.Device.ProhibitHotWater = state;
                                            deviceData.Device.ProhibitZone2 = state;
                                            flag = HeatPump.EffectiveFlags.ProhibitHeatingZone1 + HeatPump.EffectiveFlags.ProhibitHotWater + HeatPump.EffectiveFlags.ProhibitHeatingZone2;
                                            break;
                                        case 20: //ZONE 1 HEAT THERMOSTAT
                                            button.previousValue = state ? deviceData.Device.OperationModeZone1 : button.previousValue ?? deviceData.Device.OperationModeZone1;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone1 = state ? 0 : button.previousValue;
                                            flag = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone1;
                                            break;
                                        case 21: //HEAT FLOW
                                            button.previousValue = state ? deviceData.Device.OperationModeZone1 : button.previousValue ?? deviceData.Device.OperationModeZone1;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone1 = state ? 1 : button.previousValue;
                                            flag = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone1;
                                            break;
                                        case 22: //HEAT CURVE
                                            button.previousValue = state ? deviceData.Device.OperationModeZone1 : button.previousValue ?? deviceData.Device.OperationModeZone1;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone1 = state ? 2 : button.previousValue;
                                            flag = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone1;
                                            break;
                                        case 23: //COOL THERMOSTAT
                                            button.previousValue = state ? deviceData.Device.OperationModeZone1 : button.previousValue ?? deviceData.Device.OperationModeZone1;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone1 = state ? 3 : button.previousValue;
                                            flag = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone1;
                                            break;
                                        case 24: //COOL FLOW
                                            button.previousValue = state ? deviceData.Device.OperationModeZone1 : button.previousValue ?? deviceData.Device.OperationModeZone1;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone1 = state ? 4 : button.previousValue;
                                            flag = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone1;
                                            break;
                                        case 25: //FLOOR DRY UP
                                            button.previousValue = state ? deviceData.Device.OperationModeZone1 : button.previousValue ?? deviceData.Device.OperationModeZone1;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone1 = state ? 5 : button.previousValue;
                                            flag = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone1;
                                            break;
                                        case 30: //PHYSICAL LOCK CONTROL
                                            deviceData.Device.ProhibitZone1 = state;
                                            flag = HeatPump.EffectiveFlags.ProhibitHeatingZone1;
                                            break;
                                        case 40: //HOT WATER NORMAL/FORCE HOT WATER
                                            deviceData.Device.Power = true;
                                            deviceData.Device.ForcedHotWaterMode = state;
                                            flag = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                            break;
                                        case 41: //NORMAL/ECO
                                            deviceData.Device.Power = true;
                                            deviceData.Device.EcoHotWater = state;
                                            flag = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.EcoHotWater;
                                            break;
                                        case 50: //PHYSICAL LOCK CONTROL
                                            deviceData.Device.ProhibitHotWater = state;
                                            flag = HeatPump.EffectiveFlags.ProhibitHotWater;
                                            break;
                                        case 60: //ZONE 2 HEAT THERMOSTAT
                                            button.previousValue = state ? deviceData.Device.OperationModeZone2 : button.previousValue ?? deviceData.Device.OperationModeZone2;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone2 = state ? 0 : button.previousValue;
                                            flag = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone2;
                                            break;
                                        case 61: // HEAT FLOW
                                            button.previousValue = state ? deviceData.Device.OperationModeZone2 : button.previousValue ?? deviceData.Device.OperationModeZone2;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone2 = state ? 1 : button.previousValue;
                                            flag = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone2;
                                            break;
                                        case 62: //HEAT CURVE
                                            button.previousValue = state ? deviceData.Device.OperationModeZone2 : button.previousValue ?? deviceData.Device.OperationModeZone2;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone2 = state ? 2 : button.previousValue;
                                            flag = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone2;
                                            break;
                                        case 63: //COOL THERMOSTAT
                                            button.previousValue = state ? deviceData.Device.OperationModeZone2 : button.previousValue ?? deviceData.Device.OperationModeZone2;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone2 = state ? 3 : button.previousValue;
                                            flag = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone2;
                                            break;
                                        case 64: //COOL FLOW
                                            button.previousValue = state ? deviceData.Device.OperationModeZone2 : button.previousValue ?? deviceData.Device.OperationModeZone2;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone2 = state ? 4 : button.previousValue;
                                            flag = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone2;
                                            break;
                                        case 65: //FLOOR DRY UP
                                            button.previousValue = state ? deviceData.Device.OperationModeZone2 : button.previousValue ?? deviceData.Device.OperationModeZone2;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone2 = state ? 5 : button.previousValue;
                                            flag = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone2;
                                            break;
                                        case 70: //PHYSICAL LOCK CONTROL
                                            deviceData.Device.ProhibitZone2 = state;
                                            HeatPump.EffectiveFlags.ProhibitHeatingZone2;
                                            break;
                                        default:
                                            if (this.logWarn) this.emit('warn', `Unknown button mode: ${mode}`);
                                            break;
                                    };

                                    await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, flag);
                                    if (this.logInfo) this.emit('info', `${state ? `Set: ${name}` : `Unset: ${name}, Set: ${button.previousValue}`}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `Set button error: ${error}`);
                                };
                            };
                        });
                    this.buttonsServices.push(buttonService);
                    accessory.addService(buttonService)
                });
            };

            return accessory;
        } catch (error) {
            throw new Error(`Prepare accessory error: ${error}`);
        };
    };

    //start
    async start() {
        try {
            //melcloud device
            this.melCloudAtw = new MelCloudAtw(this.account, this.device, this.devicesFile, this.defaultTempsFile)
                .on('deviceInfo', (modelIndoor, modelOutdoor, serialNumber, firmwareAppVersion, supportsHotWaterTank, supportsZone2) => {
                    if (this.logDeviceInfo && this.displayDeviceInfo) {
                        this.emit('devInfo', `---- ${this.deviceTypeText}: ${this.deviceName} ----`);
                        this.emit('devInfo', `Account: ${this.accountName}`);
                        if (modelIndoor) this.emit('devInfo', `Indoor: ${modelIndoor}`);
                        if (modelOutdoor) this.emit('devInfo', `Outdoor: ${modelOutdoor}`);
                        this.emit('devInfo', `Serial: ${serialNumber}`)
                        this.emit('devInfo', `Firmware: ${firmwareAppVersion}`);
                        this.emit('devInfo', `Manufacturer: Mitsubishi`);
                        this.emit('devInfo', '----------------------------------');
                        this.emit('devInfo', `Zone 1: Yes`);
                        this.emit('devInfo', `Hot Water Tank: ${supportsHotWaterTank ? 'Yes' : 'No'}`);
                        this.emit('devInfo', `Zone 2: ${supportsZone2 ? 'Yes' : 'No'}`);
                        this.emit('devInfo', '----------------------------------');
                        this.displayDeviceInfo = false;
                    }

                    //accessory info
                    this.manufacturer = 'Mitsubishi';
                    this.model = modelIndoor ? modelIndoor : modelOutdoor ? modelOutdoor : `${this.deviceTypeText} ${this.deviceId}`;
                    this.serialNumber = serialNumber.toString();
                    this.firmwareRevision = firmwareAppVersion.toString();

                    this.informationService?.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);
                })
                .on('deviceState', async (deviceData) => {
                    this.deviceData = deviceData;

                    //keys
                    const accountTypeMelcloud = this.accountType === 'melcloud';
                    const tempStepKey = this.accountType === 'melcloud' ? 'TemperatureIncrement' : 'HasHalfDegreeIncrements';
                    const connectKey = this.accountType === 'melcloud' ? 'Offline' : 'IsConnected';
                    const errorKey = this.accountType === 'melcloud' ? 'HasError' : 'IsInError';
                    const supportStandbyKey = accountTypeMelcloud ? 'ModelSupportsStandbyMode' : 'HasStandby';

                    //presets schedule
                    const presetsOnServer = deviceData.Presets ?? [];
                    const scheduleEnabled = deviceData.ScheduleEnabled;
                    const schedulesOnServer = deviceData.Schedule ?? [];
                    const scenesOnServer = deviceData.Scenes ?? [];
                    const holidayMode = deviceData.Device.HolidayMode;
                    const holidayModeEnabled = accountTypeMelcloud ? holidayMode : deviceData.HolidayMode?.Enabled;
                    const holidayModeActive = deviceData.HolidayMode?.Active ?? false;

                    //device info
                    const supportsStanbyMode = deviceData.Device[supportStandbyKey];
                    const supportsHeatPump = ![1, 2, 3, 4, 5, 6, 7, 15].includes(this.hideZone);
                    const supportsZone1 = ![2, 3, 4, 8, 9, 10, 11, 15].includes(this.hideZone);
                    const supportsHotWaterTank = ![3, 5, 6, 9, 10, 12, 13, 15].includes(this.hideZone) && deviceData.Device.HasHotWaterTank;
                    const supportsZone2 = ![4, 6, 7, 10, 11, 13, 14, 15].includes(this.hideZone) && deviceData.Device.HasZone2;
                    const canHeat = deviceData.Device.CanHeat ?? false;
                    const canCool = deviceData.Device.CanCool ?? false;
                    const heatCoolModes = canHeat && canCool ? 0 : canHeat ? 1 : canCool ? 2 : 3;
                    const temperatureIncrement = deviceData.Device[tempStepKey] ?? 1;
                    const minSetTemperature = deviceData.Device.MinSetTemperature ?? 10;
                    const maxSetTemperature = deviceData.Device.MaxSetTemperature ?? 30;
                    const maxTankTemperature = deviceData.Device.MaxTankTemperature ?? 70;

                    //zones
                    let currentZoneCase = 0;
                    const caseHeatPump = supportsHeatPump ? currentZoneCase++ : -1;
                    const caseZone1 = supportsZone1 ? currentZoneCase++ : -1;
                    const caseHotWater = supportsHotWaterTank ? currentZoneCase++ : -1;
                    const caseZone2 = supportsZone2 ? currentZoneCase++ : -1;
                    const zonesCount = currentZoneCase;

                    //zones sensors
                    let currentZoneSensorCase = 0;
                    const caseHeatPumpSensor = this.temperatureSensor || this.temperatureFlowSensor || this.temperatureReturnSensor ? currentZoneSensorCase++ : -1;
                    const caseZone1Sensor = this.temperatureFlowZone1Sensor || this.temperatureReturnZone1Sensor ? currentZoneSensorCase++ : -1;
                    const caseHotWaterSensor = (this.temperatureFlowWaterTankSensor || this.temperatureReturnWaterTankSensor) && deviceData.Device.HasHotWaterTank ? currentZoneSensorCase++ : -1;
                    const caseZone2Sensor = (this.temperatureFlowZone2Sensor || this.temperatureReturnZone2Sensor) && deviceData.Device.HasZone2 ? currentZoneSensorCase++ : -1;
                    const zonesSensorsCount = currentZoneSensorCase;

                    //heat pump
                    const heatPumpName = 'Heat Pump';
                    const power = deviceData.Device.Power;
                    const inStandbyMode = deviceData.Device.InStandbyMode;
                    const unitStatus = deviceData.Device.UnitStatus ?? 0;
                    const operationMode = deviceData.Device.OperationMode;
                    const outdoorTemperature = deviceData.Device.OutdoorTemperature;
                    const flowTemperatureHeatPump = deviceData.Device.FlowTemperature;
                    const returnTemperatureHeatPump = deviceData.Device.ReturnTemperature;
                    const isConnected = accountTypeMelcloud ? !deviceData.Device[connectKey] : deviceData.Device[connectKey];
                    const isInError = deviceData.Device[errorKey];

                    //zone 1
                    const zone1Name = deviceData.Zone1Name ?? 'Zone 1';
                    const roomTemperatureZone1 = deviceData.Device.RoomTemperatureZone1;
                    const operationModeZone1 = deviceData.Device.OperationModeZone1;
                    const setTemperatureZone1 = deviceData.Device.SetTemperatureZone1;
                    const setHeatFlowTemperatureZone1 = deviceData.Device.SetHeatFlowTemperatureZone1;
                    const setCoolFlowTemperatureZone1 = deviceData.Device.SetCoolFlowTemperatureZone1;
                    const prohibitZone1 = deviceData.Device.ProhibitZone1 ?? false;
                    const idleZone1 = deviceData.Device.IdleZone1 ?? false;
                    const flowTemperatureZone1 = deviceData.Device.FlowTemperatureZone1;
                    const returnTemperatureZone1 = deviceData.Device.ReturnTemperatureZone1;

                    //hot water
                    const hotWaterName = 'Hot Water';
                    const tankWaterTemperature = deviceData.Device.TankWaterTemperature;
                    const setTankWaterTemperature = deviceData.Device.SetTankWaterTemperature;
                    const forcedHotWaterMode = deviceData.Device.ForcedHotWaterMode ? 1 : 0;
                    const ecoHotWater = deviceData.Device.EcoHotWater ?? false;
                    const prohibitHotWater = deviceData.Device.ProhibitHotWater ?? false;
                    const flowTemperatureWaterTank = deviceData.Device.FlowTemperatureBoiler;
                    const returnTemperatureWaterTank = deviceData.Device.ReturnTemperatureBoiler;

                    //zone 2
                    const zone2Name = deviceData.Zone2Name ?? 'Zone 2';
                    const roomTemperatureZone2 = deviceData.Device.RoomTemperatureZone2;
                    const operationModeZone2 = deviceData.Device.OperationModeZone2;
                    const setTemperatureZone2 = deviceData.Device.SetTemperatureZone2;
                    const setHeatFlowTemperatureZone2 = deviceData.Device.SetHeatFlowTemperatureZone2;
                    const setCoolFlowTemperatureZone2 = deviceData.Device.SetCoolFlowTemperatureZone2;
                    const prohibitZone2 = deviceData.Device.ProhibitZone2 ?? false;
                    const idleZone2 = deviceData.Device.IdleZone2 ?? false;
                    const flowTemperatureZone2 = deviceData.Device.FlowTemperatureZone2;
                    const returnTemperatureZone2 = deviceData.Device.ReturnTemperatureZone2;

                    //accessory
                    const obj = {
                        presets: presetsOnServer,
                        schedules: schedulesOnServer,
                        scenes: scenesOnServer,
                        power: power,
                        inStandbyMode: inStandbyMode,
                        unitStatus: unitStatus,
                        idleZone1: idleZone1,
                        idleZone2: idleZone2,
                        temperatureIncrement: temperatureIncrement,
                        supportsHeatPump: supportsHeatPump,
                        supportsZone1: supportsZone1,
                        supportsHotWaterTank: supportsHotWaterTank,
                        supportsZone2: supportsZone2,
                        heatCoolModes: heatCoolModes,
                        supportsStanbyMode: supportsStanbyMode,
                        caseHeatPump: caseHeatPump,
                        caseZone1: caseZone1,
                        caseHotWater: caseHotWater,
                        caseZone2: caseZone2,
                        zonesCount: zonesCount,
                        caseHeatPumpSensor: caseHeatPumpSensor,
                        caseZone1Sensor: caseZone1Sensor,
                        caseHotWaterSensor: caseHotWaterSensor,
                        caseZone2Sensor: caseZone2Sensor,
                        sensorsCount: zonesSensorsCount,
                        useFahrenheit: this.useFahrenheit,
                        temperatureUnit: TemperatureDisplayUnits[this.useFahrenheit],
                        isConnected: isConnected,
                        isInError: isInError,
                        scheduleEnabled: scheduleEnabled,
                        holidayModeEnabled: holidayModeEnabled,
                        holidayModeActive: holidayModeActive,
                        scheduleEnabled: scheduleEnabled,
                        zones: [],
                        zonesSensors: []
                    };

                    //default values
                    let name = 'Heat Pump'
                    let operationModeZone = 0;
                    let currentOperationMode = 0;
                    let targetOperationMode = 0;
                    let roomTemperature = 20;
                    let setTemperature = 20;
                    let lockPhysicalControl = 0;
                    let flowTemperature = 0;
                    let returnTemperature = 0;
                    let operationModeSetPropsMinValue = 0;
                    let operationModeSetPropsMaxValue = 3;
                    let operationModeSetPropsValidValues = [0];
                    let temperatureSetPropsMinValue = -35;
                    let temperatureSetPropsMaxValue = 100;

                    for (let i = 0; i < zonesCount; i++) {
                        switch (this.displayType) {
                            case 1: //Heater Cooler
                                switch (i) {
                                    case caseHeatPump: //Heat Pump Operation Mode - IDLE, HOT WATER, HEATING ZONES, COOLING, HOT WATER STORAGE, FREEZE STAT, LEGIONELLA, HEATING ECO, MODE 1, MODE 2, MODE 3, HEATING UP /// Unit Status - HEAT, COOL
                                        name = heatPumpName;
                                        operationModeZone = operationMode;
                                        currentOperationMode = !power ? 0 : (inStandbyMode ? 1 : [1, 2, 2, 3, 2, 1, 1, 2, 1, 1, 1, 2][operationMode]); //INACTIVE, IDLE, HEATING, COOLING
                                        targetOperationMode = [1, 2][unitStatus]; //AUTO, HEAT, COOL
                                        roomTemperature = outdoorTemperature;
                                        setTemperature = outdoorTemperature;

                                        lockPhysicalControl = supportsHotWaterTank && supportsZone2 ? (prohibitZone1 && prohibitHotWater && prohibitZone2 ? 1 : 0) : supportsHotWaterTank ? (prohibitZone1 && prohibitHotWater ? 1 : 0) : supportsZone2 ? (prohibitZone1 && prohibitZone2 ? 1 : 0) : 0;
                                        operationModeSetPropsMinValue = [1, 1, 2, 0][heatCoolModes];
                                        operationModeSetPropsMaxValue = [2, 1, 2, 0][heatCoolModes];
                                        operationModeSetPropsValidValues = [[1, 2], [1], [2], [0]][heatCoolModes];
                                        temperatureSetPropsMinValue = -35;
                                        temperatureSetPropsMaxValue = 100;
                                        break;
                                    case caseZone1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                        name = zone1Name;
                                        operationModeZone = operationMode;
                                        currentOperationMode = !power ? 0 : (idleZone1 ? 1 : [2, 2, 2, 3, 3, 2][operationModeZone1]); //INACTIVE, IDLE, HEATING, COOLING
                                        targetOperationMode = [1, 2, 0, 1, 2, 1][operationModeZone1]; //AUTO, HEAT, COOL

                                        switch (operationModeZone1) {
                                            case 1: //HEAT FLOW
                                                setTemperature = setHeatFlowTemperatureZone1;
                                                roomTemperature = flowTemperatureZone1;
                                                temperatureSetPropsMinValue = 25;
                                                temperatureSetPropsMaxValue = 60;
                                                break;
                                            case 4: //COOL FLOW
                                                setTemperature = setCoolFlowTemperatureZone1;
                                                roomTemperature = flowTemperatureZone1;
                                                temperatureSetPropsMinValue = 16;
                                                temperatureSetPropsMaxValue = 31;
                                                break;
                                            default:
                                                setTemperature = setTemperatureZone1;
                                                roomTemperature = roomTemperatureZone1;
                                                temperatureSetPropsMinValue = 10;
                                                temperatureSetPropsMaxValue = 31;
                                                break
                                        };

                                        lockPhysicalControl = prohibitZone1 ? 1 : 0;
                                        operationModeSetPropsMinValue = [0, 0, 1, 0][heatCoolModes];
                                        operationModeSetPropsMaxValue = [2, 2, 2, 0][heatCoolModes];
                                        operationModeSetPropsValidValues = [[0, 1, 2], [0, 1, 2], [1, 2], [0]][heatCoolModes];
                                        break;
                                    case caseHotWater: //Hot Water - NORMAL, HEAT NOW
                                        name = hotWaterName;
                                        operationModeZone = operationMode;
                                        currentOperationMode = !power ? 0 : (operationMode === 1 ? 2 : [1, 2][forcedHotWaterMode]); //INACTIVE, IDLE, HEATING, COOLING
                                        targetOperationMode = [0, 1][forcedHotWaterMode] //AUTO, HEAT, COOL
                                        roomTemperature = tankWaterTemperature;
                                        setTemperature = setTankWaterTemperature;

                                        lockPhysicalControl = prohibitHotWater ? 1 : 0;
                                        operationModeSetPropsMinValue = 0;
                                        operationModeSetPropsMaxValue = 1;
                                        operationModeSetPropsValidValues = [0, 1];
                                        temperatureSetPropsMinValue = 0;
                                        temperatureSetPropsMaxValue = maxTankTemperature;
                                        break;
                                    case caseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                        name = zone2Name;
                                        operationModeZone = operationMode;
                                        currentOperationMode = !power ? 0 : (idleZone2 ? 1 : [2, 2, 2, 3, 3, 2][operationModeZone2]); //INACTIVE, IDLE, HEATING, COOLING
                                        targetOperationMode = [1, 2, 0, 1, 2, 1][operationModeZone2]; //AUTO, HEAT, COOL

                                        switch (operationModeZone2) {
                                            case 1: //HEAT FLOW
                                                setTemperature = setHeatFlowTemperatureZone2;
                                                roomTemperature = flowTemperatureZone2;
                                                temperatureSetPropsMinValue = 25;
                                                temperatureSetPropsMaxValue = 60;
                                                break;
                                            case 4: //COOL FLOW
                                                setTemperature = setCoolFlowTemperatureZone2;
                                                roomTemperature = flowTemperatureZone2;
                                                temperatureSetPropsMinValue = 16;
                                                temperatureSetPropsMaxValue = 31;
                                                break;
                                            default:
                                                setTemperature = setTemperatureZone2;
                                                roomTemperature = roomTemperatureZone2;
                                                temperatureSetPropsMinValue = 10;
                                                temperatureSetPropsMaxValue = 31;
                                                break
                                        };

                                        lockPhysicalControl = prohibitZone2 ? 1 : 0;
                                        operationModeSetPropsMinValue = [0, 0, 1, 0][heatCoolModes];
                                        operationModeSetPropsMaxValue = [2, 2, 2, 0][heatCoolModes];
                                        operationModeSetPropsValidValues = [[0, 1, 2], [0, 1, 2], [1, 2], [0]][heatCoolModes];
                                        break;
                                };

                                //update characteristics
                                this.melCloudServices?.[i]
                                    ?.updateCharacteristic(Characteristic.Active, power)
                                    .updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentOperationMode)
                                    .updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetOperationMode)
                                    .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                                    .updateCharacteristic(Characteristic.LockPhysicalControls, lockPhysicalControl)
                                    .updateCharacteristic(Characteristic.TemperatureDisplayUnits, obj.useFahrenheit);
                                const updateDefCool = heatCoolModes === 0 || heatCoolModes === 2 ? this.melCloudServices?.[i]?.updateCharacteristic(Characteristic.CoolingThresholdTemperature, setTemperature) : false;
                                break;
                            case 2: //Thermostat
                                switch (i) {
                                    case caseHeatPump: //Heat Pump Operation Mode - IDLE, HOT WATER, HEATING ZONES, COOLING, HOT WATER STORAGE, FREEZE STAT, LEGIONELLA, HEATING ECO, MODE 1, MODE 2, MODE 3, HEATING UP /// Unit Status - HEAT, COOL
                                        name = heatPumpName;
                                        operationModeZone = operationMode;
                                        currentOperationMode = !power ? 0 : [0, 1, 1, 2, 1, 0, 0, 1, 0, 0, 0, 1][operationMode]; //OFF, HEAT, COOL
                                        targetOperationMode = !power ? 0 : [1, 2][unitStatus]; //OFF, HEAT, COOL, AUTO
                                        roomTemperature = outdoorTemperature;
                                        setTemperature = outdoorTemperature;

                                        operationModeSetPropsMinValue = [0, 0, 0, 0][heatCoolModes];
                                        operationModeSetPropsMaxValue = [2, 1, 2, 0][heatCoolModes];
                                        operationModeSetPropsValidValues = [[0, 1, 2], [0, 1], [0, 2], [0]][heatCoolModes];
                                        temperatureSetPropsMinValue = 10;
                                        temperatureSetPropsMaxValue = 70;
                                        break;
                                    case caseZone1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP 
                                        name = zone1Name;
                                        operationModeZone = operationMode;
                                        currentOperationMode = !power ? 0 : idleZone1 ? 0 : [1, 1, 1, 2, 2, 1][operationModeZone1]; //OFF, HEAT, COOL
                                        targetOperationMode = [1, 2, 3, 1, 2, 1][operationModeZone1]; //OFF, HEAT, COOL, AUTO

                                        switch (operationModeZone1) {
                                            case 1: //HEAT FLOW
                                                setTemperature = setHeatFlowTemperatureZone1;
                                                roomTemperature = flowTemperatureZone1;
                                                temperatureSetPropsMinValue = 25;
                                                temperatureSetPropsMaxValue = 60;
                                                break;
                                            case 4: //COOL FLOW
                                                setTemperature = setCoolFlowTemperatureZone1;
                                                roomTemperature = flowTemperatureZone1;
                                                temperatureSetPropsMinValue = 16;
                                                temperatureSetPropsMaxValue = 31;
                                                break;
                                            default:
                                                setTemperature = setTemperatureZone1;
                                                roomTemperature = roomTemperatureZone1;
                                                temperatureSetPropsMinValue = 10;
                                                temperatureSetPropsMaxValue = 31;
                                                break
                                        };

                                        operationModeSetPropsMinValue = [1, 1, 1, 0][heatCoolModes];
                                        operationModeSetPropsMaxValue = [3, 3, 2, 0][heatCoolModes];
                                        operationModeSetPropsValidValues = [[1, 2, 3], [1, 2, 3], [1, 2], [0]][heatCoolModes];
                                        break;
                                    case caseHotWater: //Hot Water - NORMAL, HEAT NOW
                                        name = hotWaterName;
                                        operationModeZone = operationMode;
                                        currentOperationMode = !power ? 0 : (operationMode === 1 ? 1 : [0, 1][forcedHotWaterMode]); //OFF, HEAT, COOL
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
                                        name = zone2Name;
                                        operationModeZone = operationMode;
                                        currentOperationMode = !power ? 0 : (idleZone2 ? 0 : [1, 1, 1, 2, 2, 1][operationModeZone2]); //OFF, HEAT, COOL
                                        targetOperationMode = [1, 2, 3, 1, 2, 1][operationModeZone2]; //OFF, HEAT, COOL, AUTO

                                        switch (operationModeZone2) {
                                            case 1: //HEAT FLOW
                                                setTemperature = setHeatFlowTemperatureZone2;
                                                roomTemperature = flowTemperatureZone2;
                                                temperatureSetPropsMinValue = 25;
                                                temperatureSetPropsMaxValue = 60;
                                                break;
                                            case 4: //COOL FLOW
                                                setTemperature = setCoolFlowTemperatureZone2;
                                                roomTemperature = flowTemperatureZone2;
                                                temperatureSetPropsMinValue = 16;
                                                temperatureSetPropsMaxValue = 31;
                                                break;
                                            default:
                                                setTemperature = setTemperatureZone2;
                                                roomTemperature = roomTemperatureZone2;
                                                temperatureSetPropsMinValue = 10;
                                                temperatureSetPropsMaxValue = 31;
                                                break
                                        };

                                        operationModeSetPropsMinValue = [1, 1, 1, 0][heatCoolModes];
                                        operationModeSetPropsMaxValue = [3, 3, 2, 0][heatCoolModes];
                                        operationModeSetPropsValidValues = [[1, 2, 3], [1, 2, 3], [1, 2], [0]][heatCoolModes];
                                        break;
                                };

                                //update characteristics
                                this.melCloudServices?.[i]
                                    ?.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, currentOperationMode)
                                    .updateCharacteristic(Characteristic.TargetHeatingCoolingState, targetOperationMode)
                                    .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                                    .updateCharacteristic(Characteristic.TargetTemperature, setTemperature)
                                    .updateCharacteristic(Characteristic.TemperatureDisplayUnits, obj.useFahrenheit);
                                break;
                        };

                        //add every zone to array
                        const zone = {
                            name: name,
                            operationMode: operationModeZone,
                            currentOperationMode: currentOperationMode,
                            targetOperationMode: targetOperationMode,
                            roomTemperature: roomTemperature,
                            setTemperature: setTemperature,
                            lockPhysicalControl: lockPhysicalControl,
                            temperaturesSetPropsMinValue: temperatureSetPropsMinValue,
                            temperaturesSetPropsMaxValue: temperatureSetPropsMaxValue,
                            operationModesSetPropsMinValue: operationModeSetPropsMinValue,
                            operationModesSetPropsMaxValue: operationModeSetPropsMaxValue,
                            operationModesSetPropsValidValues: operationModeSetPropsValidValues
                        };
                        obj.zones.push(zone);

                        //log current state
                        if (this.logInfo) {
                            let operationModeText = '';
                            switch (i) {
                                case caseHeatPump: //Heat Pump - HEAT, COOL, OFF
                                    this.emit('info', `${heatPumpName}, Power: ${power ? 'On' : 'Off'}`)
                                    this.emit('info', `${heatPumpName}, Operation mode: ${HeatPump.SystemMapEnumToString[unitStatus]}`);
                                    this.emit('info', `${heatPumpName},'Outdoor temperature: ${roomTemperature}${obj.temperatureUnit}`);
                                    this.emit('info', `${heatPumpName}, Temperature display unit: ${obj.temperatureUnit}`);
                                    this.emit('info', `${heatPumpName}, Lock physical controls: ${lockPhysicalControl ? 'Locked' : 'Unlocked'}`);
                                    break;
                                case caseZone1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                    operationModeText = idleZone1 ? HeatPump.ZoneOperationMapEnumToString[6] : HeatPump.ZoneOperationMapEnumToString[operationModeZone1];
                                    this.emit('info', `${zone1Name}, Operation mode: ${operationModeText}`);
                                    this.emit('info', `${zone1Name}, Temperature: ${roomTemperature}${obj.temperatureUnit}`);
                                    this.emit('info', `${zone1Name}, Target temperature: ${setTemperature}${obj.temperatureUnit}`)
                                    this.emit('info', `${zone1Name}, Temperature display unit: ${obj.temperatureUnit}`);
                                    this.emit('info', `${zone1Name}, Lock physical controls: ${lockPhysicalControl ? 'Locked' : 'Unlocked'}`);
                                    break;
                                case caseHotWater: //Hot Water - AUTO, HEAT NOW
                                    operationModeText = operationMode === 1 ? HeatPump.ForceDhwMapEnumToString[1] : HeatPump.ForceDhwMapEnumToString[forcedHotWaterMode ? 1 : 0];
                                    this.emit('info', `${hotWaterName}, Operation mode: ${operationModeText}`);
                                    this.emit('info', `${hotWaterName}, Temperature: ${roomTemperature}${obj.temperatureUnit}`);
                                    this.emit('info', `${hotWaterName}, Target temperature: ${setTemperature}${obj.temperatureUnit}`)
                                    this.emit('info', `${hotWaterName}, Temperature display unit: ${obj.temperatureUnit}`);
                                    this.emit('info', `${hotWaterName}, Lock physical controls: ${lockPhysicalControl ? 'Locked' : 'Unlocked'}`);
                                    break;
                                case caseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                    operationModeText = idleZone2 ? HeatPump.ZoneOperationMapEnumToString[6] : HeatPump.ZoneOperationMapEnumToString[operationModeZone2];
                                    this.emit('info', `${zone2Name}, Operation mode: ${operationModeText}`);
                                    this.emit('info', `${zone2Name}, Temperature: ${roomTemperature}${obj.temperatureUnit}`);
                                    this.emit('info', `${zone2Name}, Target temperature: ${setTemperature}${obj.temperatureUnit}`)
                                    this.emit('info', `${zone2Name}, Temperature display unit: ${obj.temperatureUnit}`);
                                    this.emit('info', `${zone2Name}, Lock physical controls: ${lockPhysicalControl ? 'Locked' : 'Unlocked'}`);
                                    break;
                            };
                        };
                    };

                    //update sensors characteristics
                    for (let i = 0; i < zonesSensorsCount; i++) {
                        switch (i) {
                            case caseHeatPumpSensor: //Heat Pump
                                name = heatPumpName;
                                roomTemperature = outdoorTemperature;
                                flowTemperature = flowTemperatureHeatPump;
                                returnTemperature = returnTemperatureHeatPump;

                                //updte characteristics
                                this.roomTemperatureSensorService?.updateCharacteristic(Characteristic.CurrentTemperature, outdoorTemperature);
                                this.flowTemperatureSensorService?.updateCharacteristic(Characteristic.CurrentTemperature, flowTemperatureHeatPump);
                                this.returnTemperatureSensorService?.updateCharacteristic(Characteristic.CurrentTemperature, returnTemperatureHeatPump);
                                break;
                            case caseZone1Sensor: //Zone 1
                                name = zone1Name;
                                roomTemperature = roomTemperatureZone1;
                                flowTemperature = flowTemperatureZone1;
                                returnTemperature = returnTemperatureZone1;

                                //updte characteristics
                                this.roomTemperatureZone1SensorService?.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperatureZone1);
                                this.flowTemperatureZone1SensorService?.updateCharacteristic(Characteristic.CurrentTemperature, flowTemperatureZone1);
                                this.returnTemperatureZone1SensorService?.updateCharacteristic(Characteristic.CurrentTemperature, returnTemperatureZone1);
                                break;
                            case caseHotWaterSensor: //Hot Water
                                name = hotWaterName;
                                roomTemperature = tankWaterTemperature;
                                flowTemperature = flowTemperatureWaterTank;
                                returnTemperature = returnTemperatureWaterTank;

                                //updte characteristics
                                this.roomTemperatureWaterTankSensorService?.updateCharacteristic(Characteristic.CurrentTemperature, tankWaterTemperature);
                                this.flowTemperatureWaterTankSensorService?.updateCharacteristic(Characteristic.CurrentTemperature, flowTemperatureWaterTank);
                                this.returnTemperatureWaterTankSensorService?.updateCharacteristic(Characteristic.CurrentTemperature, returnTemperatureWaterTank);
                                break;
                            case caseZone2Sensor: //Zone 2
                                name = zone2Name;
                                roomTemperature = roomTemperatureZone2;
                                flowTemperature = flowTemperatureZone2;
                                returnTemperature = returnTemperatureZone2;

                                //updte characteristics
                                this.roomTemperatureZone2SensorService?.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperatureZone2);
                                this.flowTemperatureZone2SensorService?.updateCharacteristic(Characteristic.CurrentTemperature, flowTemperatureZone2);
                                this.returnTemperatureZone2SensorService?.updateCharacteristic(Characteristic.CurrentTemperature, returnTemperatureZone2);
                                break;
                        };

                        //add every sensor to array
                        const sensor = {
                            name: name,
                            roomTemperature: roomTemperature,
                            flowTemperature: flowTemperature,
                            returnTemperature: returnTemperature
                        };
                        obj.zonesSensors.push(sensor);

                        //log current state
                        if (this.logInfo) {
                            switch (i) {
                                case caseHeatPumpSensor: //Heat Pump - HEAT, COOL, OFF
                                    const info = outdoorTemperature !== null ? this.emit('info', `${heatPumpName}, Outdoor temperature: ${outdoorTemperature}${obj.temperatureUnit}`) : false;
                                    const info0 = flowTemperatureHeatPump !== null ? this.emit('info', `${heatPumpName}, Flow temperature: ${flowTemperatureHeatPump}${obj.temperatureUnit}`) : false;
                                    const info1 = returnTemperatureHeatPump !== null ? this.emit('info', `${heatPumpName}, Return temperature: ${returnTemperatureHeatPump}${obj.temperatureUnit}`) : false;
                                    break;
                                case caseZone1Sensor: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                    const info2 = roomTemperatureZone1 !== null ? this.emit('info', `${zone1Name}, Room temperature: ${roomTemperatureZone1}${obj.temperatureUnit}`) : false;
                                    const info3 = flowTemperatureZone1 !== null ? this.emit('info', `${zone1Name}, Flow temperature: ${flowTemperatureZone1}${obj.temperatureUnit}`) : false;
                                    const info4 = returnTemperatureZone1 !== null ? this.emit('info', `${zone1Name}, Return temperature: ${returnTemperatureZone1}${obj.temperatureUnit}`) : false;
                                    break;
                                case caseHotWaterSensor: //Hot Water - AUTO, HEAT NOW
                                    const info5 = tankWaterTemperature !== null ? this.emit('info', `${hotWaterName}, Temperature: ${tankWaterTemperature}${obj.temperatureUnit}`) : false;
                                    const info6 = flowTemperatureWaterTank !== null ? this.emit('info', `${hotWaterName}, Flow temperature: ${flowTemperatureWaterTank}${obj.temperatureUnit}`) : false;
                                    const info7 = returnTemperatureWaterTank !== null ? this.emit('info', `${hotWaterName}, Return temperature: ${returnTemperatureWaterTank}${obj.temperatureUnit}`) : false;
                                    break;
                                case caseZone2Sensor: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                    const info8 = roomTemperatureZone2 !== null ? this.emit('info', `${zone2Name}, Room temperature: ${roomTemperatureZone2}${obj.temperatureUnit}`) : false;
                                    const info9 = flowTemperatureZone2 !== null ? this.emit('info', `${zone2Name}, Flow temperature: ${flowTemperatureZone2}${obj.temperatureUnit}`) : false;
                                    const info10 = returnTemperatureZone2 !== null ? this.emit('info', `${zone2Name}, Return temperature: ${returnTemperatureZone2}${obj.temperatureUnit}`) : false;
                                    break;
                            };
                        };
                    };
                    this.accessory = obj;

                    //other sensors
                    this.inStandbyService?.updateCharacteristic(Characteristic.ContactSensorState, inStandbyMode);
                    this.connectService?.updateCharacteristic(Characteristic.ContactSensorState, isConnected);
                    this.errorService?.updateCharacteristic(Characteristic.ContactSensorState, isInError);

                    //holiday mode
                    if (this.holidayModeSupport && holidayModeEnabled !== null) {
                        this.holidayModeControlService?.updateCharacteristic(Characteristic.On, holidayModeEnabled);
                        this.holidayModeControlSensorService?.updateCharacteristic(Characteristic.ContactSensorState, holidayModeEnabled);
                        this.holidayModeSensorService?.updateCharacteristic(Characteristic.ContactSensorState, holidayModeActive);
                    }

                    //presets
                    if (this.presets.length > 0) {
                        this.presets.forEach((preset, i) => {
                            const presetData = presetsOnServer.find(p => p.ID === preset.id);
                            const characteristicType = preset.characteristicType;

                            preset.state = presetData ? (presetData.Power === power
                                && presetData.EcoHotWater === ecoHotWater
                                && presetData.OperationModeZone1 === operationModeZone1
                                && presetData.OperationModeZone2 === operationModeZone2
                                && presetData.SetTankWaterTemperature === setTankWaterTemperature
                                && presetData.SetTemperatureZone1 === setTemperatureZone1
                                && presetData.SetTemperatureZone2 === setTemperatureZone2
                                && presetData.ForcedHotWaterMode === forcedHotWaterMode
                                && presetData.SetHeatFlowTemperatureZone1 === setHeatFlowTemperatureZone1
                                && presetData.SetHeatFlowTemperatureZone2 === setHeatFlowTemperatureZone2
                                && presetData.SetCoolFlowTemperatureZone1 === setCoolFlowTemperatureZone1
                                && presetData.SetCoolFlowTemperatureZone2 === setCoolFlowTemperatureZone2) : false;

                            //control
                            if (preset.displayType > 3) {
                                this.presetControlServices?.[i]?.updateCharacteristic(Characteristic.On, preset.state);
                            }

                            //sencor
                            this.presetControlSensorServices?.[i]?.updateCharacteristic(characteristicType, preset.state);
                        });
                    };

                    //schedules
                    if (this.schedules.length > 0 && scheduleEnabled !== null) {
                        this.schedules.forEach((schedule, i) => {
                            const scheduleData = schedulesOnServer.find(s => s.Id === schedule.id);
                            const characteristicType = schedule.characteristicType;
                            schedule.state = scheduleEnabled ? scheduleData.Enabled ?? false : false;

                            //control
                            if (i === 0) {
                                if (schedule.displayType > 3) {
                                    this.scheduleControlService?.updateCharacteristic(Characteristic.On, scheduleEnabled);
                                }
                                this.scheduleControlSensorService?.updateCharacteristic(characteristicType, scheduleEnabled);
                            }

                            //sensor
                            this.scheduleSensorServices?.[i]?.updateCharacteristic(characteristicType, schedule.state);
                        });
                    };

                    //schedules
                    if (this.scenes.length > 0) {
                        this.scenes.forEach((scene, i) => {
                            const sceneData = scenesOnServer.find(s => s.Id === scene.id);
                            scene.state = sceneData.Enabled;

                            //control
                            if (scene.displayType > 3) {
                                this.sceneControlServices?.[i]?.updateCharacteristic(Characteristic.On, scene.state);
                            }

                            //sensor
                            const characteristicType = scene.characteristicType;
                            this.sceneControlSensorServices?.[i]?.updateCharacteristic(characteristicType, scene.state);
                        });
                    };

                    //buttons
                    if (this.buttons.length > 0) {
                        this.buttons.forEach((button, i) => {
                            const mode = button.mode;
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
                                    button.state = power ? (holidayModeEnabled === true) : false;
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
                                    if (this.logWarn) this.emit('warn', `Unknown button mode: ${mode} detected`);
                                    break;
                            };

                            //update services
                            const characteristicType = button.characteristicType;
                            this.buttonsServices?.[i]?.updateCharacteristic(characteristicType, button.state);
                        });
                    };
                })
                .on('success', (success) => this.emit('success', success))
                .on('info', (info) => this.emit('info', info))
                .on('debug', (debug) => this.emit('debug', debug))
                .on('warn', (warn) => this.emit('warn', warn))
                .on('error', (error) => this.emit('error', error))
                .on('restFul', (path, data) => {
                    if (this.restFulConnected) this.restFul1.update(path, data);
                })
                .on('mqtt', (topic, message) => {
                    if (this.mqttConnected) this.mqtt1.emit('publish', topic, message);
                });

            //start external integrations
            if (this.restFul.enable || this.mqtt.enable) await this.externalIntegrations();

            //check state
            await this.melCloudAtw.checkState();

            //prepare accessory
            const accessory = await this.prepareAccessory();
            return accessory;
        } catch (error) {
            throw new Error(`Start error: ${error}`);
        };
    };
};
export default DeviceAtw;
