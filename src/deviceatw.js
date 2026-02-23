import EventEmitter from 'events';
import MelCloudAtw from './melcloudatw.js';
import RestFul from './restful.js';
import Mqtt from './mqtt.js';
import Functions from './functions.js';
import { TemperatureDisplayUnits, HeatPump, DeviceType } from './constants.js';
let Accessory, Characteristic, Service, Categories, AccessoryUUID;

class DeviceAtw extends EventEmitter {
    constructor(api, account, device, presets, schedules, scenes, buttons, defaultTempsFile, melCloudClass, melCloudAccountData, melCloudDeviceData) {
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
        this.accountTypeMelCloud = account.type === 'melcloud';
        this.logDeviceInfo = account.log?.deviceInfo || false;
        this.logInfo = account.log?.info || false;
        this.logWarn = account.log?.warn || false;
        this.logDebug = account.log?.debug || false;

        //device config
        this.device = device;
        this.deviceId = device.id;
        this.deviceName = device.name;
        this.deviceTypeString = DeviceType[device.type];
        this.displayType = device.displayType;
        this.hideZone = device.hideZone;
        this.temperatureOutdoorSensor = device.temperatureOutdoorSensor || false;
        this.temperatureRoomSensor = device.temperatureRoomSensor || false;
        this.temperatureFlowSensor = device.temperatureFlowSensor || false;
        this.temperatureReturnSensor = device.temperatureReturnSensor || false;
        this.temperatureRoomZone1Sensor = device.temperatureRoomZone1Sensor || false;
        this.temperatureFlowZone1Sensor = device.temperatureFlowZone1Sensor || false;
        this.temperatureReturnZone1Sensor = device.temperatureReturnZone1Sensor || false;
        this.temperatureWaterTankSensor = device.temperatureWaterTankSensor || false;
        this.temperatureFlowWaterTankSensor = device.temperatureFlowWaterTankSensor || false;
        this.temperatureReturnWaterTankSensor = device.temperatureReturnWaterTankSensor || false;
        this.temperatureRoomZone2Sensor = device.temperatureRoomZone2Sensor || false;
        this.temperatureFlowZone2Sensor = device.temperatureFlowZone2Sensor || false;
        this.temperatureReturnZone2Sensor = device.temperatureReturnZone2Sensor || false;
        this.inStandbySensor = device.inStandbySensor || false;
        this.connectSensor = device.connectSensor || false;
        this.errorSensor = device.errorSensor || false;
        this.frostProtectionSupport = device.frostProtectionSupport || false;
        this.holidayModeSupport = device.holidayModeSupport || false;
        this.presets = presets;
        this.schedules = schedules;
        this.scenes = scenes;
        this.buttons = buttons;

        //files
        this.defaultTempsFile = defaultTempsFile;

        //melcloud
        this.melCloudClass = melCloudClass;
        this.melCloudDeviceData = melCloudDeviceData;
        this.melCloudAccountData = melCloudAccountData;

        //external integrations
        this.restFul = account.restFul ?? {};
        this.restFulConnected = false;
        this.mqtt = account.mqtt ?? {};
        this.mqttConnected = false;

        const serviceType = [null, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor, null];
        const characteristicType = [null, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState, null];

        //presets configured
        for (const preset of this.presets) {
            preset.serviceType = serviceType[preset.displayType];
            preset.characteristicType = characteristicType[preset.displayType];
            preset.state = false;
            preset.previousSettings = {};
        }

        //schedules configured
        for (const schedule of this.schedules) {
            schedule.serviceType = serviceType[schedule.displayType];
            schedule.characteristicType = characteristicType[schedule.displayType];
            schedule.state = false;
        }

        //scenes configured
        for (const scene of this.scenes) {
            scene.serviceType = serviceType[scene.displayType];
            scene.characteristicType = characteristicType[scene.displayType];
            scene.state = false;
        }

        //buttons configured
        for (const button of this.buttons) {
            button.serviceType = serviceType[button.displayType];
            button.characteristicType = characteristicType[button.displayType];
            button.state = false;
            button.previousValue = null;
        }

        this.functions = new Functions(this.logWarn, this.logError, this.logDebug)
            .on('warn', warn => this.emit('warn', warn))
            .on('error', error => this.emit('error', error))
            .on('debug', debug => this.emit('debug', debug));

        //other variables
        this.displayDeviceInfo = true;
        this.deviceData = {};
        this.accessory = {};
    }

    async externalIntegrations() {
        //RESTFul server
        const restFulEnabled = this.restFul.enable || false;
        if (restFulEnabled) {
            try {

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
            } catch (error) {
                if (this.logWarn) this.emit('warn', `RESTFul integration start error: ${error}`);
            };
        }

        //MQTT client
        const mqttEnabled = this.mqtt.enable || false;
        if (mqttEnabled) {
            try {
                this.mqtt1 = new Mqtt({
                    host: this.mqtt.host,
                    port: this.mqtt.port || 1883,
                    clientId: this.mqtt.clientId ? `melcloud_${this.mqtt.clientId}_${Math.random().toString(16).slice(3)}` : `melcloud_${Math.random().toString(16).slice(3)}`,
                    prefix: this.mqtt.prefix ? `melcloud/${this.mqtt.prefix}/${this.deviceTypeString}/${this.deviceName}` : `melcloud/${this.deviceTypeString}/${this.deviceName}`,
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
            } catch (error) {
                if (this.logWarn) this.emit('warn', `MQTT integration start error: ${error}`);
            };
        }
    }

    async setOverExternalIntegration(integration, deviceData, key, value) {
        try {
            const accountTypeMelCloud = this.accountTypeMelCloud;
            let set = false
            let payload = {};
            let flag = null;
            switch (key) {
                case 'Power':
                    payload.power = value;
                    break;
                case 'OperationModeZone1':
                    payload.operationModeZone1 = value;
                    flag = HeatPump.EffectiveFlags.OperationModeZone1;
                    break;
                case 'SetTemperatureZone1':
                    payload.setTemperatureZone1 = value;
                    flag = HeatPump.EffectiveFlags.SetTemperatureZone2;
                    break;
                case 'SetHeatFlowTemperatureZone1':
                    payload.setHeatFlowTemperatureZone1 = value;
                    flag = HeatPump.EffectiveFlags.SetHeatFlowTemperatureZone1;
                    break;
                case 'SetCoolFlowTemperatureZone1':
                    payload.setCoolFlowTemperatureZone1 = value;
                    flag = HeatPump.EffectiveFlags.SetCoolFlowTemperatureZone1;
                    break;
                case 'ProhibitZone1':
                    if (!accountTypeMelCloud) return;
                    payload.prohibitZone1 = value;
                    flag = HeatPump.EffectiveFlags.ProhibitZone1;
                    break;
                case 'ForcedHotWaterMode':
                    payload.forcedHotWaterMode = value;
                    flag = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                    break;
                case 'EcoHotWater':
                    if (!accountTypeMelCloud) return;
                    payload.ecoHotWater = value;
                    flag = HeatPump.EffectiveFlags.EcoHotWater;
                    break;
                case 'SetTankWaterTemperature':
                    payload.setTankWaterTemperature = value;
                    flag = HeatPump.EffectiveFlags.SetTankWaterTemperature;
                    break;
                case 'ProhibitHotWater':
                    payload.prohibitHotWater = value;
                    flag = HeatPump.EffectiveFlags.ProhibitHotWater;
                    break;
                case 'OperationModeZone2':
                    payload.operationModeZone2 = value;
                    flag = HeatPump.EffectiveFlags.OperationModeZone2;
                    break;
                case 'SetTemperatureZone2':
                    payload.setTemperatureZone2 = value;
                    flag = HeatPump.EffectiveFlags.SetTemperatureZone2;
                    break;
                case 'SetHeatFlowTemperatureZone2':
                    payload.setHeatFlowTemperatureZone2 = value;
                    flag = HeatPump.EffectiveFlags.SetHeatFlowTemperatureZone2;
                    break;
                case 'SetCoolFlowTemperatureZone2':
                    payload.setCoolFlowTemperatureZone2 = value;
                    flag = HeatPump.EffectiveFlags.SetCoolFlowTemperatureZone2;
                    break;
                case 'ProhibitZone2':
                    if (!accountTypeMelCloud) return;
                    payload.prohibitZone2 = value;
                    flag = HeatPump.EffectiveFlags.ProhibitZone2;
                    break;
                case 'FrostProtection':
                    if (accountTypeMelCloud) return;
                    payload.enabled = value;
                    flag = 'frostprotection';
                    break;
                case 'Schedules':
                    if (accountTypeMelCloud) return;
                    payload.enabled = value;
                    flag = 'schedule';
                    break;
                case 'HolidayMode':
                    if (accountTypeMelCloud) {
                        payload.holidayMode = value;
                        flag = HeatPump.EffectiveFlags.HolidayMode;
                    }

                    if (!accountTypeMelCloud) {
                        payload.enabled = value;
                        flag = 'holidaymode';
                    }
                    break;
                default:
                    this.emit('warn', `${integration}, received unknown key: ${key}, value: ${value}`);
                    return;
            };

            set = await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, payload, flag);
            return set;
        } catch (error) {
            throw new Error(`${integration} set key: ${key}, value: ${value}, error: ${error.message ?? error}`);
        };
    }

    //prepare accessory
    async prepareAccessory() {
        try {
            const accountTypeMelCloud = this.accountTypeMelCloud;
            const deviceData = this.deviceData;
            const deviceId = this.deviceId;
            const deviceTypeString = this.deviceTypeString;
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
            const supportsOutdoorTemperature = this.accessory.supportsOutdoorTemperature;

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
            if (zonesCount > 0) {
                this.melCloudServices = [];
                this.accessory.zones.forEach((zone, i) => {
                    const zoneName = zone.name
                    const serviceName = `${deviceTypeString} ${accessoryName}: ${zoneName}`;
                    switch (this.displayType) {
                        case 1: //Heater Cooler
                            if (this.logDebug) this.emit('debug', `Prepare heater/cooler ${zoneName} service`);
                            const melCloudService = new Service.HeaterCooler(serviceName, `HeaterCooler ${deviceId} ${i}`);
                            if (i === caseHeatPump) melCloudService.setPrimaryService(true);
                            melCloudService.getCharacteristic(Characteristic.Active)
                                .onGet(async () => {
                                    const state = zone.state;
                                    return state;
                                })
                                .onSet(async (state) => {
                                    if (i !== caseHeatPump) return;

                                    // Only heat pump
                                    try {
                                        const payload = { power: state ? true : false };
                                        if (this.logInfo) this.emit('info', `${zoneName}, Set power: ${state ? 'On' : 'Off'}`);
                                        await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, payload);
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
                                        const payload = {};
                                        let operationModeText = '';
                                        let flag = null;
                                        switch (i) {
                                            case caseHeatPump: //Heat Pump - Operation Mode - IDLE, HOT WATER, HEATING, COOLING, HOT WATER STORAGE, FREEZE STAT, LEGIONELLA, HEATING ECO, MODE 1, MODE 2, MODE 3, HEATING UP // Unit Status - HEAT, COOL
                                                switch (value) {
                                                    case 0: //AUTO Power OFF
                                                        payload.power = false;
                                                        break;
                                                    case 1: //HEAT
                                                        if (accountTypeMelCloud) deviceData.Device.UnitStatus = 0;
                                                        payload.power = true;
                                                        //payload.operationMode = 2;
                                                        break;
                                                    case 2: //COOL
                                                        if (accountTypeMelCloud) deviceData.Device.UnitStatus = 1;
                                                        payload.power = true;
                                                        //payload.operationMode = 3;
                                                        break;
                                                };
                                                operationModeText = HeatPump.OperationModeHeatPumpMapEnumToStringInfo[value];
                                                break;
                                            case caseZone1: //Zone 1 - HEAT ROOM, HEAT FLOW, HEAT CURVE, COOL ROOM, COOL FLOW, FLOOR DRY UP, IDLE
                                                switch (value) {
                                                    case 0: //AUTO - HEAT CURVE / FLOOR DRY UP
                                                        payload.operationModeZone1 = [2, 5][zone.operationModeHeatPump];
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                    case 1: //HEAT - HEAT ROOM / COOL ROOM
                                                        payload.operationModeZone1 = [0, 3][zone.operationModeHeatPump];
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                    case 2: //COOL - HEAT FLOW / COOL FLOW
                                                        payload.operationModeZone1 = [1, 4][zone.operationModeHeatPump];
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                };
                                                operationModeText = HeatPump.OperationModeZoneMapEnumToStringInfo[payload.operationModeZone1];
                                                break;
                                            case caseHotWater: //Hot Water - AUTO, HEAT NOW
                                                switch (value) {
                                                    case 0: //AUTO
                                                        //payload.forcedHotWaterMode = false;
                                                        //flag = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                        return;
                                                    case 1: //HEAT
                                                        payload.forcedHotWaterMode = true;
                                                        flag = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                        break;
                                                    case 2: //COOL
                                                        //payload.forcedHotWaterMode = false;
                                                        //flag = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                        return
                                                };
                                                operationModeText = HeatPump.ForceDhwMapEnumToStringInfo[payload.forcedHotWaterMode ? 1 : 0];
                                                break;
                                            case caseZone2: //Zone 2 - HEAT ROOM, HEAT FLOW, HEAT CURVE, COOL ROOM, COOL FLOW, FLOOR DRY UP, IDLE
                                                switch (value) {
                                                    case 0: //AUTO - HEAT CURVE / FLOOR DRY UP
                                                        payload.operationModeZone2 = [2, 5][zone.operationModeHeatPump];
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                    case 1: //HEAT - HEAT ROOM / COOL ROOM
                                                        payload.operationModeZone2 = [0, 3][zone.operationModeHeatPump];
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                    case 2: //COOL - HEAT FLOW / COOL FLOW
                                                        payload.operationModeZone2 = [1, 4][zone.operationModeHeatPump];
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                };
                                                operationModeText = HeatPump.OperationModeZoneMapEnumToStringInfo[payload.operationModeZone2];
                                                break;
                                        };

                                        if (this.logInfo) this.emit('info', `${zoneName}, Set operation mode: ${operationModeText}`);
                                        await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, payload, flag);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `${zoneName}, Set operation mode error: ${error}`);
                                    };
                                });
                            melCloudService.getCharacteristic(Characteristic.CurrentTemperature)
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
                                            const payload = {};
                                            let flag = null;
                                            switch (this.accountType) {
                                                case 'melcloud': //Melcloud
                                                    switch (i) {
                                                        case caseHeatPump: //Heat Pump
                                                            //flag = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                            return;
                                                        case caseZone1: //Zone 1
                                                            switch (zone.operationModeRaw) {
                                                                case 1: //HEAT FLOW
                                                                    payload.setHeatFlowTemperatureZone1 = value;
                                                                    flag = HeatPump.EffectiveFlags.SetHeatFlowTemperatureZone1;
                                                                    break;
                                                                case 4: //COOL FLOW
                                                                    payload.setCoolFlowTemperatureZone1 = value;
                                                                    flag = HeatPump.EffectiveFlags.SetCoolFlowTemperatureZone1;
                                                                    break;
                                                                default:
                                                                    payload.setTemperatureZone1 = value;
                                                                    flag = HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                                    break
                                                            };
                                                            break;
                                                        case caseHotWater: //Hot Water
                                                            payload.setTankWaterTemperature = value;
                                                            flag = HeatPump.EffectiveFlags.SetTankWaterTemperature;
                                                            break;
                                                        case caseZone2: //Zone 2
                                                            switch (zone.operationModeRaw) {
                                                                case 1: //HEAT FLOW
                                                                    payload.setHeatFlowTemperatureZone2 = value;
                                                                    flag = HeatPump.EffectiveFlags.SetHeatFlowTemperatureZone2;
                                                                    break;
                                                                case 4: //COOL FLOW
                                                                    payload.setCoolFlowTemperatureZone2 = value;
                                                                    flag = HeatPump.EffectiveFlags.SetCoolFlowTemperatureZone2;
                                                                    break;
                                                                default:
                                                                    payload.setTemperatureZone2 = value;
                                                                    flag = HeatPump.EffectiveFlags.SetTemperatureZone2;
                                                                    break
                                                            };
                                                            break;
                                                    };
                                                    break;
                                                case 'melcloudhome':
                                                    switch (i) {
                                                        case caseHeatPump: //Heat Pump
                                                            //flag = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                            return;
                                                        case caseZone1: //Zone 1
                                                            payload.setTemperatureZone1 = value;
                                                            break;
                                                        case caseHotWater: //Hot Water
                                                            payload.setTankWaterTemperature = value;
                                                            break;
                                                        case caseZone2: //Zone 2
                                                            payload.setTemperatureZone2 = value;
                                                            break;
                                                    };
                                                    break;
                                                default:
                                                    if (this.logWarn) this.emit('warn', `Received unknown account type: ${this.accountType}`);
                                                    return;
                                            }

                                            if (this.logInfo) this.emit('info', `${zoneName}, Set cooling threshold temperature: ${value}${this.accessory.temperatureUnit}`);
                                            await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, payload, flag);
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
                                            const payload = {};
                                            let flag = null;
                                            switch (this.accountType) {
                                                case 'melcloud': //Melcloud
                                                    switch (i) {
                                                        case caseHeatPump: //Heat Pump
                                                            //flag = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                            return;
                                                        case caseZone1: //Zone 1
                                                            switch (zone.operationModeRaw) {
                                                                case 1: //HEAT FLOW
                                                                    payload.setHeatFlowTemperatureZone1 = value;
                                                                    flag = HeatPump.EffectiveFlags.SetHeatFlowTemperatureZone1;
                                                                    break;
                                                                case 4: //COOL FLOW
                                                                    payload.setCoolFlowTemperatureZone1 = value;
                                                                    flag = HeatPump.EffectiveFlags.SetCoolFlowTemperatureZone1;
                                                                    break;
                                                                default:
                                                                    payload.setTemperatureZone1 = value;
                                                                    flag = HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                                    break
                                                            };
                                                            break;
                                                        case caseHotWater: //Hot Water
                                                            payload.setTankWaterTemperature = value;
                                                            flag = HeatPump.EffectiveFlags.SetTankWaterTemperature;
                                                            break;
                                                        case caseZone2: //Zone 2
                                                            switch (zone.operationModeRaw) {
                                                                case 1: //HEAT FLOW
                                                                    payload.setHeatFlowTemperatureZone2 = value;
                                                                    flag = HeatPump.EffectiveFlags.SetHeatFlowTemperatureZone2;
                                                                    break;
                                                                case 4: //COOL FLOW
                                                                    payload.setCoolFlowTemperatureZone2 = value;
                                                                    flag = HeatPump.EffectiveFlags.SetCoolFlowTemperatureZone2;
                                                                    break;
                                                                default:
                                                                    payload.setTemperatureZone2 = value;
                                                                    flag = HeatPump.EffectiveFlags.SetTemperatureZone2;
                                                                    break
                                                            };
                                                            break;
                                                    };
                                                    break;
                                                case 'melcloudhome':
                                                    switch (i) {
                                                        case caseHeatPump: //Heat Pump
                                                            //flag = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                            return;
                                                        case caseZone1: //Zone 1
                                                            payload.setTemperatureZone1 = value;
                                                            break;
                                                        case caseHotWater: //Hot Water
                                                            payload.setTankWaterTemperature = value;
                                                            break;
                                                        case caseZone2: //Zone 2
                                                            payload.setTemperatureZone2 = value;
                                                            break;
                                                    };
                                                    break;
                                                default:
                                                    if (this.logWarn) this.emit('warn', `Received unknown account type: ${this.accountType}`);
                                                    return;
                                            }

                                            if (this.logInfo) this.emit('info', `${zoneName}, Set heating threshold temperature: ${value}${this.accessory.temperatureUnit}`);
                                            await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, payload, flag);
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
                                    try {
                                        value = value ? true : false;
                                        const payload = {};
                                        let flag = null;
                                        switch (i) {
                                            case caseHeatPump: //Heat Pump
                                                if (accountTypeMelCloud) payload.prohibitZone1 = value;
                                                payload.prohibitHotWater = value;
                                                if (accountTypeMelCloud) payload.prohibitZone2 = value;
                                                flag = HeatPump.EffectiveFlags.ProhibitHeatingZone1 + HeatPump.EffectiveFlags.ProhibitHotWater + HeatPump.EffectiveFlags.ProhibitHeatingZone2;
                                                break;
                                            case caseZone1: //Zone 1
                                                if (!accountTypeMelCloud) return;
                                                payload.prohibitZone1 = value;
                                                flag = HeatPump.EffectiveFlags.ProhibitHeatingZone1;
                                                break;
                                            case caseHotWater: //Hot Water
                                                payload.prohibitHotWater = value;
                                                flag = HeatPump.EffectiveFlags.ProhibitHotWater;
                                                break;
                                            case caseZone2: //Zone 2
                                                if (!accountTypeMelCloud) return;
                                                payload.prohibitZone2 = value;
                                                flag = HeatPump.EffectiveFlags.ProhibitHeatingZone2;
                                                break;
                                        };

                                        if (this.logInfo) this.emit('info', `${zoneName}, Set lock physical controls: ${value ? 'Lock' : 'Unlock'}`);
                                        await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, payload, flag);
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
                                    if (!accountTypeMelCloud) return;

                                    try {
                                        this.accessory.useFahrenheit = value ? true : false;
                                        this.melCloudAccountData.UseFahrenheit = value ? true : false;
                                        this.melCloudAccountData.Account.LoginData.UseFahrenheit = value ? true : false;
                                        const payload = this.melCloudAccountData;
                                        if (this.logInfo) this.emit('info', `Set temperature display unit: ${TemperatureDisplayUnits[value]}`);
                                        await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, payload, 'account');
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
                            if (i === caseHeatPump) melCloudServiceT.setPrimaryService(true);
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
                                        const payload = {};
                                        let flag = null;
                                        switch (i) {
                                            case caseHeatPump: //Heat Pump - Operation Mode - IDLE, HOT WATER, HEATING, COOLING, HOT WATER STORAGE, FREEZE STAT, LEGIONELLA, HEATING ECO, MODE 1, MODE 2, MODE 3, HEATING UP // Unit Status - HEAT, COOL
                                                switch (value) {
                                                    case 0: //OFF
                                                        payload.power = false;
                                                        break;
                                                    case 1: //HEAT
                                                        if (accountTypeMelCloud) deviceData.Device.UnitStatus = 0;
                                                        payload.power = true;
                                                        //payload.operationMode = 2;
                                                        break;
                                                    case 2: //COOL
                                                        if (accountTypeMelCloud) deviceData.Device.UnitStatus = 1;
                                                        payload.power = true;
                                                        //payload.operationMode = 3;
                                                        break;
                                                    case 3: //AUTO - not used
                                                        return;
                                                };
                                                operationModeText = HeatPump.OperationModeHeatPumpMapEnumToStringInfo[value];
                                                break;
                                            case caseZone1: //Zone 1 - HEAT ROOM, HEAT FLOW, HEAT CURVE, COOL ROOM, COOL FLOW, FLOOR DRY UP, IDLE
                                                switch (value) {
                                                    case 0: //OFF
                                                        //payload.operationModeZone1 = 2;
                                                        //flag = HeatPump.EffectiveFlags.OperationModeZone1;
                                                        return;
                                                    case 1: //HEAT - HEAT ROOM / COOL ROOM
                                                        payload.operationModeZone1 = [0, 3][zone.operationModeHeatPump];
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                    case 2: //COOL - HEAT FLOW / COOL FLOW
                                                        payload.operationModeZone1 = [1, 4][zone.operationModeHeatPump];
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                    case 3: //AUTO - HEAT CURVE / FLOOR DRY UP
                                                        payload.operationModeZone1 = [2, 5][zone.operationModeHeatPump];
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                };
                                                operationModeText = HeatPump.OperationModeZoneMapEnumToStringInfo[payload.operationModeZone1];
                                                break;
                                            case caseHotWater: //Hot Water - AUTO, HEAT NOW
                                                switch (value) {
                                                    case 0: //OFF
                                                        //payload.forcedHotWaterMode = false;
                                                        //flag = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                        return;
                                                    case 1: //HEAT
                                                        payload.forcedHotWaterMode = true;
                                                        flag = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                        break;
                                                    case 2: //COOL
                                                        //payload.forcedHotWaterMode = false;
                                                        //flag = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                        return;
                                                    case 3: //AUTO
                                                        payload.forcedHotWaterMode = false;
                                                        flag = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                        break;
                                                };
                                                operationModeText = HeatPump.ForceDhwMapEnumToStringInfo[payload.forcedHotWaterMode ? 1 : 0];
                                                break;
                                            case caseZone2: //Zone 2 - HEAT ROOM, HEAT FLOW, HEAT CURVE, COOL ROOM, COOL FLOW, FLOOR DRY UP, IDLE
                                                switch (value) {
                                                    case 0: //OFF
                                                        //payload.operationModeZone2 = 2;
                                                        //flag = HeatPump.EffectiveFlags.OperationModeZone2;
                                                        return;
                                                    case 1: //HEAT - HEAT ROOM / COOL ROOM
                                                        payload.operationModeZone2 = [0, 3][zone.operationModeHeatPump];
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                    case 2: //COOL - HEAT FLOW / COOL FLOW
                                                        payload.operationModeZone2 = [1, 4][zone.operationModeHeatPump];
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                    case 3: //AUTO - HEAT CURVE / FLOOR DRY UP
                                                        payload.operationModeZone2 = [2, 5][zone.operationModeHeatPump];
                                                        flag = HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                };
                                                operationModeText = HeatPump.OperationModeZoneMapEnumToStringInfo[payload.operationModeZone2];
                                                break;
                                        };

                                        if (this.logInfo) this.emit('info', `${zoneName}, Set operation mode: ${operationModeText}`);
                                        await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, payload, flag);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `${zoneName}, Set operation mode error: ${error}`);
                                    };
                                });
                            melCloudServiceT.getCharacteristic(Characteristic.CurrentTemperature)
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
                                        const payload = {};
                                        let flag = null;
                                        switch (this.accountType) {
                                            case 'melcloud': //Melcloud
                                                switch (i) {
                                                    case caseHeatPump: //Heat Pump
                                                        //flag = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                        return;
                                                    case caseZone1: //Zone 1
                                                        switch (zone.operationModeRaw) {
                                                            case 1: //HEAT FLOW
                                                                payload.setHeatFlowTemperatureZone1 = value;
                                                                flag = HeatPump.EffectiveFlags.SetHeatFlowTemperatureZone1;
                                                                break;
                                                            case 4: //COOL FLOW
                                                                payload.setCoolFlowTemperatureZone1 = value;
                                                                flag = HeatPump.EffectiveFlags.SetCoolFlowTemperatureZone1;
                                                                break;
                                                            default:
                                                                payload.setTemperatureZone1 = value;
                                                                flag = HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                                break
                                                        };
                                                        break;
                                                    case caseHotWater: //Hot Water
                                                        payload.setTankWaterTemperature = value;
                                                        flag = HeatPump.EffectiveFlags.SetTankWaterTemperature;
                                                        break;
                                                    case caseZone2: //Zone 2
                                                        switch (zone.operationModeRaw) {
                                                            case 1: //HEAT FLOW
                                                                payload.setHeatFlowTemperatureZone2 = value;
                                                                flag = HeatPump.EffectiveFlags.SetHeatFlowTemperatureZone2;
                                                                break;
                                                            case 4: //COOL FLOW
                                                                payload.setCoolFlowTemperatureZone2 = value;
                                                                flag = HeatPump.EffectiveFlags.SetCoolFlowTemperatureZone2;
                                                                break;
                                                            default:
                                                                payload.setTemperatureZone2 = value;
                                                                flag = HeatPump.EffectiveFlags.SetTemperatureZone2;
                                                                break
                                                        };
                                                        break;
                                                };
                                                break;
                                            case 'melcloudhome':
                                                switch (i) {
                                                    case caseHeatPump: //Heat Pump
                                                        //flag = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                        return;
                                                    case caseZone1: //Zone 1
                                                        payload.setTemperatureZone1 = value;
                                                        break;
                                                    case caseHotWater: //Hot Water
                                                        payload.setTankWaterTemperature = value;
                                                        break;
                                                    case caseZone2: //Zone 2
                                                        payload.setTemperatureZone2 = value;
                                                        break;
                                                };
                                                break;
                                            default:
                                                if (this.logWarn) this.emit('warn', `Received unknown account type: ${this.accountType}`);
                                                return;
                                        }

                                        if (this.logInfo) this.emit('info', `${zoneName}, Set temperature: ${value}${this.accessory.temperatureUnit}`);
                                        await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, payload, flag);
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
                                    if (!accountTypeMelCloud) return;

                                    try {
                                        this.accessory.useFahrenheit = value ? true : false;
                                        this.melCloudAccountData.UseFahrenheit = value ? true : false;
                                        this.melCloudAccountData.Account.LoginData.UseFahrenheit = value ? true : false;
                                        const payload = this.melCloudAccountData;
                                        if (this.logInfo) this.emit('info', `Set temperature display unit: ${TemperatureDisplayUnits[value]}`);
                                        await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, payload, 'account');
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `Set temperature display unit error: ${error}`);
                                    };
                                });
                            this.melCloudServices.push(melCloudServiceT);
                            accessory.addService(melCloudServiceT);
                            break;
                        default:
                            if (this.logWarn) this.emit('warn', `Received unknown display type: ${this.displayType}`);
                            return;
                    };
                });
            }

            //sensor services
            if (zonesSensorsCount > 0) {
                this.accessory.zonesSensors.forEach((zone, i) => {
                    const zoneName = zone.name
                    const serviceName = `${deviceTypeString} ${accessoryName}: ${zoneName}`;
                    switch (i) {
                        case caseHeatPumpSensor: //Heat Pump
                            if (zone.roomTemperature !== null && this.temperatureRoomSensor) {
                                if (this.logDebug) this.emit('debug', `${zoneName}, Prepare temperature sensor service`);
                                this.roomTemperatureSensorService = new Service.TemperatureSensor(`${serviceName}`, `roomTemperatureSensorService${deviceId}`);
                                this.roomTemperatureSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                this.roomTemperatureSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName}`);
                                this.roomTemperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                    .onGet(async () => {
                                        const state = zone.roomTemperature;
                                        return state;
                                    })
                                accessory.addService(this.roomTemperatureSensorService);
                            };

                            if (zone.flowTemperature !== null && this.temperatureFlowSensor) {
                                if (this.logDebug) this.emit('debug', `Prepare flow temperature sensor service`);
                                this.flowTemperatureSensorService = new Service.TemperatureSensor(`${serviceName} Flow`, `flowTemperatureSensorService${deviceId}`);
                                this.flowTemperatureSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                this.flowTemperatureSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName} Flow`);
                                this.flowTemperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                    .onGet(async () => {
                                        const state = zone.flowTemperature;
                                        return state;
                                    })
                                accessory.addService(this.flowTemperatureSensorService);

                            };

                            if (zone.returnTemperature !== null && this.temperatureReturnSensor) {
                                if (this.logDebug) this.emit('debug', `Prepare return temperature sensor service`);
                                this.returnTemperatureSensorService = new Service.TemperatureSensor(`${serviceName} Return`, `returnTemperatureSensorService${deviceId}`);
                                this.returnTemperatureSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                this.returnTemperatureSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName} Return`);
                                this.returnTemperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                    .onGet(async () => {
                                        const state = zone.returnTemperature;
                                        return state;
                                    })
                                accessory.addService(this.returnTemperatureSensorService);
                            };
                            break;
                        case caseZone1Sensor: //Zone 1
                            if (zone.roomTemperature !== null && this.temperatureRoomZone1Sensor) {
                                if (this.logDebug) this.emit('debug', `${zoneName}, Prepare temperature sensor service`);
                                this.roomTemperatureZone1SensorService = new Service.TemperatureSensor(`${serviceName}`, `roomTemperatureZone1SensorService${deviceId}`);
                                this.roomTemperatureZone1SensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                this.roomTemperatureZone1SensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName}`);
                                this.roomTemperatureZone1SensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                    .onGet(async () => {
                                        const state = zone.roomTemperature;
                                        return state;
                                    })
                                accessory.addService(this.roomTemperatureZone1SensorService);
                            };

                            if (zone.flowTemperature !== null && this.temperatureFlowZone1Sensor) {
                                if (this.logDebug) this.emit('debug', `Prepare flow temperature zone 1 sensor service`);
                                this.flowTemperatureZone1SensorService = new Service.TemperatureSensor(`${serviceName} Flow`, `flowTemperatureZone1SensorService${deviceId}`);
                                this.flowTemperatureZone1SensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                this.flowTemperatureZone1SensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName} Flow`);
                                this.flowTemperatureZone1SensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                    .onGet(async () => {
                                        const state = zone.flowTemperature;
                                        return state;
                                    })
                                accessory.addService(this.flowTemperatureZone1SensorService);
                            };

                            if (zone.returnTemperature !== null && this.temperatureReturnZone1Sensor) {
                                if (this.logDebug) this.emit('debug', `Prepare return temperature zone 1 sensor service`);
                                this.returnTemperatureZone1SensorService = new Service.TemperatureSensor(`${serviceName} Return`, `returnTemperatureZone1SensorService${deviceId}`);
                                this.returnTemperatureZone1SensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                this.returnTemperatureZone1SensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName} Return`);
                                this.returnTemperatureZone1SensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                    .onGet(async () => {
                                        const state = zone.returnTemperature;
                                        return state;
                                    })
                                accessory.addService(this.returnTemperatureZone1SensorService);
                            };
                            break;
                        case caseHotWaterSensor: //Hot Water
                            if (zone.roomTemperature !== null && this.temperatureWaterTankSensor) {
                                if (this.logDebug) this.emit('debug', `${zoneName}, Prepare temperature sensor service`);
                                this.roomTemperatureWaterTankSensorService = new Service.TemperatureSensor(`${serviceName}`, `roomTemperatureWaterTankSensorService${deviceId}`);
                                this.roomTemperatureWaterTankSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                this.roomTemperatureWaterTankSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName}`);
                                this.roomTemperatureWaterTankSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                    .onGet(async () => {
                                        const state = zone.roomTemperature;
                                        return state;
                                    })
                                accessory.addService(this.roomTemperatureWaterTankSensorService);
                            };

                            if (zone.flowTemperature !== null && this.temperatureFlowWaterTankSensor) {
                                if (this.logDebug) this.emit('debug', `Prepare flow temperature water tank sensor service`);
                                this.flowTemperatureWaterTankSensorService = new Service.TemperatureSensor(`${serviceName} Flow`, `flowTemperatureWaterTankSensorService${deviceId}`);
                                this.flowTemperatureWaterTankSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                this.flowTemperatureWaterTankSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName} Flow`);
                                this.flowTemperatureWaterTankSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                    .onGet(async () => {
                                        const state = zone.flowTemperature;
                                        return state;
                                    })
                                accessory.addService(this.flowTemperatureWaterTankSensorService);
                            };

                            if (zone.returnTemperature !== null && this.temperatureReturnWaterTankSensor) {
                                if (this.logDebug) this.emit('debug', `Prepare return temperature water tank sensor service`);
                                this.returnTemperatureWaterTankSensorService = new Service.TemperatureSensor(`${serviceName} Return`, `returnTemperatureWaterTankSensorService${deviceId}`);
                                this.returnTemperatureWaterTankSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                this.returnTemperatureWaterTankSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName} Return`);
                                this.returnTemperatureWaterTankSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                    .onGet(async () => {
                                        const state = zone.returnTemperature;
                                        return state;
                                    })
                                accessory.addService(this.returnTemperatureWaterTankSensorService);
                            };
                            break;
                        case caseZone2Sensor: //Zone 2
                            if (zone.roomTemperature !== null && this.temperatureRoomZone2Sensor) {
                                if (this.logDebug) this.emit('debug', `${zoneName}, Prepare temperature sensor service`);
                                this.roomTemperatureZone2SensorService = new Service.TemperatureSensor(`${serviceName}`, `roomTemperatureZone2SensorService${deviceId}`);
                                this.roomTemperatureZone2SensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                this.roomTemperatureZone2SensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName}`);
                                this.roomTemperatureZone2SensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                    .onGet(async () => {
                                        const state = zone.roomTemperature;
                                        return state;
                                    })
                                accessory.addService(this.roomTemperatureZone2SensorService);
                            };

                            if (zone.flowTemperature !== null && this.temperatureFlowZone2Sensor) {
                                if (this.logDebug) this.emit('debug', `Prepare flow temperature zone 2 sensor service`);
                                this.flowTemperatureZone2SensorService = new Service.TemperatureSensor(`${serviceName} Flow`, `flowTemperatureZone2SensorService${deviceId}`);
                                this.flowTemperatureZone2SensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                this.flowTemperatureZone2SensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName} Flow`);
                                this.flowTemperatureZone2SensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                    .onGet(async () => {
                                        const state = zone.flowTemperature;
                                        return state;
                                    })
                                accessory.addService(this.flowTemperatureZone2SensorService);
                            };

                            if (zone.returnTemperature !== null && this.temperatureReturnZone2Sensor) {
                                if (this.logDebug) this.emit('debug', `Prepare return temperature zone 2 sensor service`);
                                this.returnTemperatureZone2SensorService = new Service.TemperatureSensor(`${serviceName} Return`, `returnTemperatureZone2SensorService${deviceId}`);
                                this.returnTemperatureZone2SensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                this.returnTemperatureZone2SensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} ${zoneName} Return`);
                                this.returnTemperatureZone2SensorService.getCharacteristic(Characteristic.CurrentTemperature)
                                    .onGet(async () => {
                                        const state = zone.returnTemperature;
                                        return state;
                                    })
                                accessory.addService(this.returnTemperatureZone2SensorService);
                            };
                            break;
                    };
                });
            }

            //sensors
            const serviceName = `${deviceTypeString} ${accessoryName}`;

            //outdoor temperature
            if (this.temperatureOutdoorSensor && supportsOutdoorTemperature) {
                if (this.logDebug) this.emit('debug', `Prepare outdoor temperature sensor service`);
                this.outdoorTemperatureSensorService = new Service.TemperatureSensor(`${serviceName} Outdoor`, `outdoorTemperatureSensorService${deviceId}`);
                this.outdoorTemperatureSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.outdoorTemperatureSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Outdoor`);
                this.outdoorTemperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                    .onGet(async () => {
                        const state = this.accessory.outdoorTemperature;
                        return state;
                    })
                accessory.addService(this.outdoorTemperatureSensorService);
            }

            //in standby sensor
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

            //frost protection
            if (this.frostProtectionSupport && this.accessory.frostProtectionEnabled !== null) {
                //control
                if (this.logDebug) this.emit('debug', `Prepare frost protection control service`);
                const frostProtectionControlService = new Service.HeaterCooler(`${serviceName} Frost Protection`, `frostProtectionControlService${deviceId}`);
                frostProtectionControlService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                frostProtectionControlService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Frost Protection`);
                frostProtectionControlService.getCharacteristic(Characteristic.Active)
                    .onGet(async () => {
                        const state = this.accessory.frostProtectionEnabled;
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            const payload = { enabled: state ? true : false, min: deviceData.FrostProtection.Min, max: deviceData.FrostProtection.Max };
                            if (this.logInfo) this.emit('info', `Frost protection: ${state ? 'Enabled' : 'Disabled'}`);
                            await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload, 'frostprotection');
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `Set frost protection error: ${error}`);
                        };
                    });
                frostProtectionControlService.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
                    .onGet(async () => {
                        const value = this.accessory.frostProtection.Active ? 2 : 1;
                        return value;
                    })
                frostProtectionControlService.getCharacteristic(Characteristic.TargetHeaterCoolerState)
                    .setProps({
                        minValue: 0,
                        maxValue: 0,
                        validValues: [0]
                    })
                    .onGet(async () => {
                        const value = 0
                        return value;
                    })
                    .onSet(async (state) => {
                        try {
                            const payload = { enabled: true, min: deviceData.FrostProtection.Min, max: deviceData.FrostProtection.Max };
                            if (this.logInfo) this.emit('info', `Frost protection: Enabled`);
                            await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload, 'frostprotection');
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `Set frost protection error: ${error}`);
                        };
                    });
                frostProtectionControlService.getCharacteristic(Characteristic.CurrentTemperature)
                    .onGet(async () => {
                        const value = this.accessory.roomTemperature;
                        return value;
                    });
                frostProtectionControlService.getCharacteristic(Characteristic.CoolingThresholdTemperature) //max
                    .setProps({
                        minValue: 6,
                        maxValue: 16,
                        minStep: 1
                    })
                    .onGet(async () => {
                        const value = this.accessory.frostProtection.Max;
                        return value;
                    })
                    .onSet(async (value) => {
                        try {
                            let { min, max } = await this.functions.adjustTempProtection(deviceData.FrostProtection.Min, deviceData.FrostProtection.Max, value, 'max', 4, 14, 6, 16);
                            const payload = { enabled: deviceData.FrostProtection.Enabled, min: min, max: max };
                            if (this.logInfo) this.emit('info', `Set frost protection max. temperature: ${max}${this.accessory.temperatureUnit}`);
                            await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload, 'frostprotection');
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `Set frost protection max. temperature error: ${error}`);
                        };
                    });
                frostProtectionControlService.getCharacteristic(Characteristic.HeatingThresholdTemperature) //min
                    .setProps({
                        minValue: 4,
                        maxValue: 14,
                        minStep: 1
                    })
                    .onGet(async () => {
                        const value = this.accessory.frostProtection.Min;
                        return value;
                    })
                    .onSet(async (value) => {
                        try {
                            let { min, max } = await this.functions.adjustTempProtection(deviceData.FrostProtection.Min, deviceData.FrostProtection.Max, value, 'min', 4, 14, 6, 16);
                            const payload = { enabled: deviceData.FrostProtection.Enabled, min: min, max: max };
                            if (this.logInfo) this.emit('info', `Set frost protection min. temperature: ${min}${this.accessory.temperatureUnit}`);
                            await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload, 'frostprotection');
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `Set frost protection min. temperature error: ${error}`);
                        };
                    });
                this.frostProtectionControlService = frostProtectionControlService;
                accessory.addService(frostProtectionControlService);

                if (this.logDebug) this.emit('debug', `Prepare frost protection control sensor service`);
                this.frostProtectionControlSensorService = new Service.ContactSensor(`${serviceName} Frost Protection Control`, `frostProtectionControlSensorService${deviceId}`);
                this.frostProtectionControlSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.frostProtectionControlSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Frost Protection Control`);
                this.frostProtectionControlSensorService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.accessory.frostProtectionEnabled;
                        return state;
                    })
                accessory.addService(this.frostProtectionControlSensorService);

                //sensor
                if (this.logDebug) this.emit('debug', `Prepare frost protection service`);
                this.frostProtectionSensorService = new Service.ContactSensor(`${serviceName} Frost Protection`, `frostProtectionSensorService${deviceId}`);
                this.frostProtectionSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.frostProtectionSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Frost Protection`);
                this.frostProtectionSensorService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.accessory.frostProtection.Active;
                        return state;
                    })
                accessory.addService(this.frostProtectionSensorService);
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
                            const payload = { enabled: state };
                            if (this.logInfo) this.emit('info', `Holiday mode: ${state ? 'Enabled' : 'Disabled'}`);
                            await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, payload, 'holidaymode');
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
                        const state = this.accessory.holidayMode.Active;
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

                    //get name
                    const name = preset.name || `Preset ${i}`;

                    //get name prefix
                    const namePrefix = preset.namePrefix;

                    const serviceName1 = namePrefix ? `${accessoryName} ${name}` : name;
                    const serviceType = preset.serviceType;
                    const characteristicType = preset.characteristicType;

                    //control
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
                                    let payload = {};
                                    switch (state) {
                                        case true:
                                            preset.previousSettings = deviceData.Device;

                                            const presetData = presetsOnServer.find(p => String(p.ID) === preset.id);
                                            payload = {
                                                power: presetData.Power,
                                                operationModeZone1: presetData.OperationModeZone1,
                                                setTemperatureZone1: presetData.SetTemperatureZone1,
                                                setHeatFlowTemperatureZone1: presetData.SetHeatFlowTemperatureZone1,
                                                setCoolFlowTemperatureZone1: presetData.SetCoolFlowTemperatureZone1,
                                                forcedHotWaterMode: presetData.ForcedHotWaterMode,
                                                ecoHotWater: presetData.EcoHotWater,
                                                setTankWaterTemperature: presetData.SetTankWaterTemperature,
                                                operationModeZone2: presetData.OperationModeZone2,
                                                setTemperatureZone2: presetData.SetTemperatureZone2,
                                                setHeatFlowTemperatureZone2: presetData.SetHeatFlowTemperatureZone2,
                                                setCoolFlowTemperatureZone2: presetData.SetCoolFlowTemperatureZone2,
                                            }
                                            break;
                                        case false:
                                            payload = {
                                                power: preset.previousSettings.Power,
                                                operationModeZone1: preset.previousSettings.OperationModeZone1,
                                                setTemperatureZone1: preset.previousSettings.SetTemperatureZone1,
                                                setHeatFlowTemperatureZone1: preset.previousSettings.SetHeatFlowTemperatureZone1,
                                                setCoolFlowTemperatureZone1: preset.previousSettings.SetCoolFlowTemperatureZone1,
                                                forcedHotWaterMode: preset.previousSettings.ForcedHotWaterMode,
                                                ecoHotWater: preset.previousSettings.EcoHotWater,
                                                setTankWaterTemperature: preset.previousSettings.SetTankWaterTemperature,
                                                operationModeZone2: preset.previousSettings.OperationModeZone2,
                                                setTemperatureZone2: preset.previousSettings.SetTemperatureZone2,
                                                setHeatFlowTemperatureZone2: preset.previousSettings.SetHeatFlowTemperatureZone2,
                                                setCoolFlowTemperatureZone2: preset.previousSettings.SetCoolFlowTemperatureZone2,
                                            }
                                            break;
                                    };

                                    if (this.logInfo) this.emit('info', `Preset ${name}: ${state ? 'Set' : 'Unset'}`);
                                    await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, payload, AirConditioner.EffectiveFlags.Presets);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `Set preset error: ${error}`);
                                };
                            });
                        this.presetControlServices.push(presetControlService);
                        accessory.addService(presetControlService);
                    }

                    //sensor
                    if (preset.displayType < 7) {
                        if (this.logDebug) this.emit('debug', `Prepare preset control sensor s${name}  ervice`);
                        const presetControlSensorService = new serviceType(serviceName1, `presetControlSensorService${deviceId} ${i}`);
                        presetControlSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        presetControlSensorService.setCharacteristic(Characteristic.ConfiguredName, `${serviceName1} Control`);
                        presetControlSensorService.getCharacteristic(characteristicType)
                            .onGet(async () => {
                                const state = preset.state;
                                return state;
                            })
                        this.presetControlSensorServices.push(presetControlSensorService);
                        accessory.addService(presetControlSensorService);
                    }
                });
            }

            //schedules services
            if (this.schedules.length > 0 && this.accessory.scheduleEnabled !== null) {
                if (this.logDebug) this.emit('debug', `Prepare schedules services`);
                this.scheduleSensorServices = [];
                this.schedules.forEach((schedule, i) => {

                    //get name
                    const name = schedule.name || `Schedule ${i}`;

                    //get name prefix
                    const namePrefix = schedule.namePrefix;

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
                                        const payload = { enabled: state };
                                        const scheduleData = schedulesOnServer.find(s => s.Id === schedule.id);
                                        if (this.logInfo) this.emit('info', `Schedules: ${state ? 'Enabled' : 'Disabled'}`);
                                        await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, payload, 'schedule', scheduleData);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `Set schedules error: ${error}`);
                                    };
                                });
                            accessory.addService(this.scheduleControlService);
                        }

                        //sensor
                        if (schedule.displayType < 7) {
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
                    }

                    //sensors
                    if (schedule.displayType < 7) {
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
                    }
                });
            }

            //scenes
            if (this.scenes.length > 0) {
                if (this.logDebug) this.emit('debug', `Prepare scenes services`);
                this.sceneControlServices = [];
                this.sceneControlSensorServices = [];
                this.scenes.forEach((scene, i) => {

                    //get name
                    const name = scene.name || `Scens ${i}`;

                    //get name prefix
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
                                    const sceneData = scenesOnServer.find(s => s.Id === scene.id);
                                    const payload = { id: sceneData.Id, enabled: state };
                                    if (this.logInfo) this.emit('info', `Scene ${name}: ${state ? 'Set' : 'Unset'}`);
                                    await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, payload, 'scene');
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `Set scene error: ${error}`);
                                };
                            });
                        this.sceneControlServices.push(sceneControlService);
                        accessory.addService(sceneControlService);
                    }

                    //sensor
                    if (scene.displayType < 7) {
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
                    }
                });
            }

            //buttons services
            if (this.buttons.length > 0) {
                if (this.logDebug) this.emit('debug', `Prepare buttons / sensors services`);
                this.buttonControlServices = [];
                this.buttonControlSensorServices = [];
                this.buttons.lengthforEach((button, i) => {
                    //get mode
                    const mode = button.mode;

                    //get name
                    const name = button.name || `Button ${i}`;

                    //get name prefix
                    const namePrefix = button.namePrefix;

                    const serviceName1 = namePrefix ? `${accessoryName} ${name}` : name;
                    const serviceType = button.serviceType;
                    const characteristicType = button.characteristicType;

                    //control
                    if (button.displayType > 3) {
                        if (this.logDebug) this.emit('debug', `Prepare button control ${name} service`);
                        const buttonControlService = new Service.Switch(serviceName1, `buttonControlService${deviceId} ${i}`);
                        buttonControlService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        buttonControlService.setCharacteristic(Characteristic.ConfiguredName, serviceName1);
                        buttonControlService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = button.state;
                                return state;
                            })
                            .onSet(async (state) => {
                                if (displayType > 0 && displayType < 3) {
                                    try {
                                        const payload = {};
                                        let flag = null;
                                        switch (mode) {
                                            case 0: //HP POWER
                                                payload.power = state;
                                                break;
                                            case 1: //HEAT
                                                button.previousValue = state ? deviceData.Device.UnitStatus : button.previousValue ?? deviceData.Device.UnitStatus;
                                                if (accountTypeMelCloud) deviceData.Device.UnitStatus = state ? 0 : button.previousValue;
                                                flag = HeatPump.EffectiveFlags.OperationMode;
                                                break;
                                            case 2: //COOL
                                                button.previousValue = state ? deviceData.Device.UnitStatus : button.previousValue ?? deviceData.Device.UnitStatus;
                                                if (accountTypeMelCloud) deviceData.Device.UnitStatus = state ? 1 : button.previousValue;
                                                flag = HeatPump.EffectiveFlags.OperationMode;
                                                break;
                                            case 3: //HOLIDAY
                                                if (accountTypeMelCloud) {
                                                    payload.holidayMode = state;
                                                    flag = HeatPump.EffectiveFlags.HolidayMode;
                                                }

                                                if (!accountTypeMelCloud) {
                                                    payload.holidayMode.enabled = state;
                                                    flag = 'holidaymode';
                                                }
                                                break;
                                            case 10: //ALL PHYSICAL LOCK CONTROL
                                                if (accountTypeMelCloud) payload.prohibitZone1 = state;
                                                payload.prohibitHotWater = state;
                                                if (accountTypeMelCloud) payload.prohibitZone2 = state;
                                                flag = HeatPump.EffectiveFlags.ProhibitHeatingZone1 + HeatPump.EffectiveFlags.ProhibitHotWater + HeatPump.EffectiveFlags.ProhibitHeatingZone2;
                                                break;
                                            case 20: //ZONE 1 HEAT ROOM
                                                button.previousValue = state ? deviceData.Device.OperationModeZone1 : button.previousValue ?? deviceData.Device.OperationModeZone1;
                                                payload.operationModeZone1 = state ? 0 : button.previousValue;
                                                flag = HeatPump.EffectiveFlags.OperationModeZone1;
                                                break;
                                            case 21: //HEAT FLOW
                                                button.previousValue = state ? deviceData.Device.OperationModeZone1 : button.previousValue ?? deviceData.Device.OperationModeZone1;
                                                payload.operationModeZone1 = state ? 1 : button.previousValue;
                                                flag = HeatPump.EffectiveFlags.OperationModeZone1;
                                                break;
                                            case 22: //HEAT CURVE
                                                button.previousValue = state ? deviceData.Device.OperationModeZone1 : button.previousValue ?? deviceData.Device.OperationModeZone1;
                                                payload.operationModeZone1 = state ? 2 : button.previousValue;
                                                flag = HeatPump.EffectiveFlags.OperationModeZone1;
                                                break;
                                            case 23: //COOL ROOM
                                                button.previousValue = state ? deviceData.Device.OperationModeZone1 : button.previousValue ?? deviceData.Device.OperationModeZone1;
                                                payload.operationModeZone1 = state ? 3 : button.previousValue;
                                                flag = HeatPump.EffectiveFlags.OperationModeZone1;
                                                break;
                                            case 24: //COOL FLOW
                                                button.previousValue = state ? deviceData.Device.OperationModeZone1 : button.previousValue ?? deviceData.Device.OperationModeZone1;
                                                payload.operationModeZone1 = state ? 4 : button.previousValue;
                                                flag = HeatPump.EffectiveFlags.OperationModeZone1;
                                                break;
                                            case 25: //FLOOR DRY UP
                                                button.previousValue = state ? deviceData.Device.OperationModeZone1 : button.previousValue ?? deviceData.Device.OperationModeZone1;
                                                payload.operationModeZone1 = state ? 5 : button.previousValue;
                                                flag = HeatPump.EffectiveFlags.OperationModeZone1;
                                                break;
                                            case 30: //PHYSICAL LOCK CONTROL
                                                if (!accountTypeMelCloud) return;
                                                payload.prohibitZone1 = state;
                                                flag = HeatPump.EffectiveFlags.ProhibitHeatingZone1;
                                                break;
                                            case 40: //HOT WATER NORMAL/FORCE HOT WATER
                                                payload.forcedHotWaterMode = state;
                                                flag = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                break;
                                            case 41: //NORMAL/ECO
                                                if (!accountTypeMelCloud) return;
                                                payload.ecoHotWater = state;
                                                flag = HeatPump.EffectiveFlags.EcoHotWater;
                                                break;
                                            case 50: //PHYSICAL LOCK CONTROL
                                                payload.prohibitHotWater = state;
                                                flag = HeatPump.EffectiveFlags.ProhibitHotWater;
                                                break;
                                            case 60: //ZONE 2 HEAT ROOM
                                                button.previousValue = state ? deviceData.Device.OperationModeZone2 : button.previousValue ?? deviceData.Device.OperationModeZone2;
                                                payload.operationModeZone2 = state ? 0 : button.previousValue;
                                                flag = HeatPump.EffectiveFlags.OperationModeZone2;
                                                break;
                                            case 61: // HEAT FLOW
                                                button.previousValue = state ? deviceData.Device.OperationModeZone2 : button.previousValue ?? deviceData.Device.OperationModeZone2;
                                                payload.operationModeZone2 = state ? 1 : button.previousValue;
                                                flag = HeatPump.EffectiveFlags.OperationModeZone2;
                                                break;
                                            case 62: //HEAT CURVE
                                                button.previousValue = state ? deviceData.Device.OperationModeZone2 : button.previousValue ?? deviceData.Device.OperationModeZone2;
                                                payload.operationModeZone2 = state ? 2 : button.previousValue;
                                                flag = HeatPump.EffectiveFlags.OperationModeZone2;
                                                break;
                                            case 63: //COOL ROOM
                                                button.previousValue = state ? deviceData.Device.OperationModeZone2 : button.previousValue ?? deviceData.Device.OperationModeZone2;
                                                payload.operationModeZone2 = state ? 3 : button.previousValue;
                                                flag = HeatPump.EffectiveFlags.OperationModeZone2;
                                                break;
                                            case 64: //COOL FLOW
                                                button.previousValue = state ? deviceData.Device.OperationModeZone2 : button.previousValue ?? deviceData.Device.OperationModeZone2;
                                                payload.operationModeZone2 = state ? 4 : button.previousValue;
                                                flag = HeatPump.EffectiveFlags.OperationModeZone2;
                                                break;
                                            case 65: //FLOOR DRY UP
                                                button.previousValue = state ? deviceData.Device.OperationModeZone2 : button.previousValue ?? deviceData.Device.OperationModeZone2;
                                                payload.operationModeZone2 = state ? 5 : button.previousValue;
                                                flag = HeatPump.EffectiveFlags.OperationModeZone2;
                                                break;
                                            case 70: //PHYSICAL LOCK CONTROL
                                                if (!accountTypeMelCloud) return;
                                                payload.prohibitZone2 = state;
                                                flag = HeatPump.EffectiveFlags.ProhibitHeatingZone2;
                                                break;
                                            default:
                                                if (this.logWarn) this.emit('warn', `Received unknown button mode: ${mode}`);
                                                return;
                                        };

                                        if (this.logInfo) this.emit('info', `Button ${name}: ${state ? `Enabled` : `Disabled`}`);
                                        await this.melCloudAtw.send(this.accountType, this.displayType, deviceData, payload, flag);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `Set button error: ${error}`);
                                    };
                                };
                            });
                        this.buttonControlServices.push(buttonControlService);
                        accessory.addService(buttonControlService)
                    }

                    //sensor
                    if (button.displayType < 7) {
                        if (this.logDebug) this.emit('debug', `Prepare button control sensor ${name} service`);
                        const buttonControlSensorService = new serviceType(serviceName1, `buttonControlSensorService${deviceId} ${i}`);
                        buttonControlSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        buttonControlSensorService.setCharacteristic(Characteristic.ConfiguredName, serviceName1);
                        buttonControlSensorService.getCharacteristic(characteristicType)
                            .onGet(async () => {
                                const state = button.state;
                                return state;
                            })
                        this.buttonControlSensorServices.push(buttonControlSensorService);
                        accessory.addService(buttonControlSensorService);
                    }
                });
            }

            return accessory;
        } catch (error) {
            throw new Error(`Prepare accessory error: ${error}`);
        };
    }

    //start
    async start() {
        try {
            //melcloud device
            this.melCloudAtw = new MelCloudAtw(this.account, this.device, this.defaultTempsFile, this.melCloudClass)
                .on('deviceInfo', (modelIndoor, modelOutdoor, serialNumber, firmwareAppVersion, supportsHotWaterTank, supportsZone2, ftcModel) => {
                    if (this.logDeviceInfo && this.displayDeviceInfo) {
                        this.emit('devInfo', `---- ${this.deviceTypeString}: ${this.deviceName} ----`);
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
                        if (ftcModel >= 0) this.emit('devInfo', `FTC Model: ${ftcModel}`);
                        this.emit('devInfo', '----------------------------------');
                        this.displayDeviceInfo = false;
                    }

                    //accessory info
                    this.manufacturer = 'Mitsubishi';
                    this.model = modelIndoor ? modelIndoor : modelOutdoor ? modelOutdoor : `${this.deviceTypeString} ${this.deviceId}`;
                    this.serialNumber = serialNumber.toString();
                    this.firmwareRevision = firmwareAppVersion.toString();

                    this.informationService?.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);
                })
                .on('deviceState', async (deviceData) => {
                    this.deviceData = deviceData;

                    //keys
                    const accountTypeMelCloud = this.accountTypeMelCloud;
                    const tempStepKey = accountTypeMelCloud ? 'TemperatureIncrement' : 'HasHalfDegreeIncrements';
                    const connectKey = accountTypeMelCloud ? 'Offline' : 'IsConnected';
                    const errorKey = accountTypeMelCloud ? 'HasError' : 'IsInError';
                    const supportHeatKey = accountTypeMelCloud ? 'CanHeat' : 'HasHeatMode';
                    const supportCoolKey = accountTypeMelCloud ? 'CanCool' : 'HasCoolingMode';
                    const supportHotWaterKey = accountTypeMelCloud ? 'HasHotWaterTank' : 'HasHotWater';

                    //presets schedule
                    const presetsOnServer = deviceData.Presets ?? [];
                    const scheduleEnabled = deviceData.ScheduleEnabled ?? null;
                    const schedulesOnServer = deviceData.Schedule ?? [];
                    const scenesOnServer = deviceData.Scenes ?? [];

                    //protection
                    const frostProtection = deviceData.FrostProtection ?? {};
                    const frostProtectionEnabled = frostProtection.Enabled ?? null;
                    const holidayMode = deviceData.HolidayMode ?? {};
                    const holidayModeEnabled = holidayMode.Enabled ?? null;

                    //device info
                    const supportsStandbyMode = deviceData.Device.ModelSupportsStandbyMode ?? (deviceData.Device.InStandbyMode !== null && deviceData.Device.InStandbyMode !== undefined);
                    const supportsHeatPump = ![1, 2, 3, 4, 5, 6, 7, 15].includes(this.hideZone);
                    const supportsZone1 = ![2, 3, 4, 8, 9, 10, 11, 15].includes(this.hideZone);
                    const supportsHotWaterTank = ![3, 5, 6, 9, 10, 12, 13, 15].includes(this.hideZone) && !!deviceData.Device[supportHotWaterKey];
                    const supportsZone2 = ![4, 6, 7, 10, 11, 13, 14, 15].includes(this.hideZone) && deviceData.Device.HasZone2;

                    const supportsHeat = !!deviceData.Device[supportHeatKey];
                    const supportsCool = !!deviceData.Device[supportCoolKey];
                    const supportsOutdoorTemperature = !!deviceData.Device.HasOutdoorTemperature && this.functions.isValidValue(deviceData.Device.OutdoorTemperature);
                    const heatCoolModes = supportsHeat && supportsCool ? 0 : supportsHeat ? 1 : supportsCool ? 2 : 3;
                    const temperatureIncrement = deviceData.Device[tempStepKey] ?? 1;
                    const minSetHeatFlowTemperature = 25;
                    const maxSetHeatFlowTemperature = 60;
                    const minSetCoolFlowTemperature = 16
                    const maxSetCoolFlowTemperature = 30;
                    const minSetHeatRoomTemperature = 10;
                    const minSetCoolRoomTemperature = 16;
                    const maxSetHeatCoolRoomTemperature = 30;
                    const minSetTankTemperature = deviceData.Device.MinTankTemperature ?? 10;
                    const maxSetTankTemperature = deviceData.Device.MaxTankTemperature ?? 60;

                    //zones
                    let currentZoneCase = 0;
                    const caseHeatPump = supportsHeatPump ? currentZoneCase++ : -1;
                    const caseZone1 = supportsZone1 ? currentZoneCase++ : -1;
                    const caseHotWater = supportsHotWaterTank ? currentZoneCase++ : -1;
                    const caseZone2 = supportsZone2 ? currentZoneCase++ : -1;
                    const zonesCount = currentZoneCase;

                    //zones sensors
                    let currentZoneSensorCase = 0;
                    const caseHeatPumpSensor = (this.temperatureRoomSensor || this.temperatureFlowSensor || this.temperatureReturnSensor) && supportsHeatPump ? currentZoneSensorCase++ : -1;
                    const caseZone1Sensor = (this.temperatureRoomZone1Sensor || this.temperatureFlowZone1Sensor || this.temperatureReturnZone1Sensor) && supportsZone1 ? currentZoneSensorCase++ : -1;
                    const caseHotWaterSensor = (this.temperatureWaterTankSensor || this.temperatureFlowWaterTankSensor || this.temperatureReturnWaterTankSensor) && supportsHotWaterTank ? currentZoneSensorCase++ : -1;
                    const caseZone2Sensor = (this.temperatureRoomZone2Sensor || this.temperatureFlowZone2Sensor || this.temperatureReturnZone2Sensor) && supportsZone2 ? currentZoneSensorCase++ : -1;
                    const zonesSensorsCount = currentZoneSensorCase;

                    //heat pump
                    const heatPumpName = 'Heat Pump';
                    const power = !!deviceData.Device.Power;
                    const unitStatus = deviceData.Device.UnitStatus ?? 0; //HEAT, COOL
                    const operationMode = deviceData.Device.OperationMode; //VALVE 3D
                    const operationModeHeatPump = accountTypeMelCloud ? unitStatus : (operationMode === 3 ? 1 : 0); //HEAT, COOL
                    const inStandbyMode = deviceData.Device.InStandbyMode ?? operationMode === 0;
                    const outdoorTemperature = deviceData.Device.OutdoorTemperature;
                    const roomTemperatureHeatPump = accountTypeMelCloud && supportsOutdoorTemperature ? outdoorTemperature : deviceData.Device.RoomTemperatureZone1; // fallback to room temp zone 1
                    const flowTemperatureHeatPump = deviceData.Device.FlowTemperature;
                    const returnTemperatureHeatPump = deviceData.Device.ReturnTemperature;

                    //zone 1
                    const zone1Name = deviceData.Zone1Name ?? 'Zone 1';
                    const roomTemperatureZone1 = deviceData.Device.RoomTemperatureZone1;
                    const operationModeZone1 = deviceData.Device.OperationModeZone1;
                    const setTemperatureZone1 = deviceData.Device.SetTemperatureZone1;
                    const setHeatFlowTemperatureZone1 = deviceData.Device.SetHeatFlowTemperatureZone1;
                    const setCoolFlowTemperatureZone1 = deviceData.Device.SetCoolFlowTemperatureZone1;
                    const prohibitZone1 = deviceData.Device.ProhibitZone1;
                    const idleZone1 = deviceData.Device.IdleZone1 ?? operationModeZone1 === 6;
                    const flowTemperatureZone1 = deviceData.Device.FlowTemperatureZone1;
                    const returnTemperatureZone1 = deviceData.Device.ReturnTemperatureZone1;

                    //hot water
                    const hotWaterName = 'Hot Water';
                    const tankWaterTemperature = deviceData.Device.TankWaterTemperature;
                    const setTankWaterTemperature = deviceData.Device.SetTankWaterTemperature;
                    const forcedHotWaterMode = deviceData.Device.ForcedHotWaterMode ? 1 : 0;
                    const ecoHotWater = deviceData.Device.EcoHotWater;
                    const prohibitHotWater = deviceData.Device.ProhibitHotWater;
                    const flowTemperatureWaterTank = deviceData.Device.FlowTemperatureBoiler;
                    const returnTemperatureWaterTank = deviceData.Device.ReturnTemperatureBoiler;

                    //zone 2
                    const zone2Name = deviceData.Zone2Name ?? 'Zone 2';
                    const roomTemperatureZone2 = deviceData.Device.RoomTemperatureZone2;
                    const operationModeZone2 = deviceData.Device.OperationModeZone2;
                    const setTemperatureZone2 = deviceData.Device.SetTemperatureZone2;
                    const setHeatFlowTemperatureZone2 = deviceData.Device.SetHeatFlowTemperatureZone2;
                    const setCoolFlowTemperatureZone2 = deviceData.Device.SetCoolFlowTemperatureZone2;
                    const prohibitZone2 = deviceData.Device.ProhibitZone2;
                    const idleZone2 = deviceData.Device.IdleZone2 ?? operationModeZone2 === 6;
                    const flowTemperatureZone2 = deviceData.Device.FlowTemperatureZone2;
                    const returnTemperatureZone2 = deviceData.Device.ReturnTemperatureZone2;

                    //device
                    const isConnected = accountTypeMelCloud ? !deviceData.Device[connectKey] : deviceData.Device[connectKey];
                    const isInError = deviceData.Device[errorKey];

                    //accessory
                    const obj = {
                        presets: presetsOnServer,
                        schedules: schedulesOnServer,
                        scheduleEnabled: scheduleEnabled,
                        scenes: scenesOnServer,
                        frostProtection: frostProtection,
                        frostProtectionEnabled: frostProtectionEnabled,
                        holidayMode: holidayMode,
                        holidayModeEnabled: holidayModeEnabled,
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
                        supportsStandbyMode: supportsStandbyMode,
                        supportsOutdoorTemperature: supportsOutdoorTemperature,
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
                        useFahrenheit: this.melCloudAccountData.useFahrenheit ? 1 : 0,
                        temperatureUnit: TemperatureDisplayUnits[this.melCloudAccountData.useFahrenheit ? 1 : 0],
                        isConnected: isConnected,
                        isInError: isInError,
                        zones: [],
                        zonesSensors: []
                    };

                    //zones
                    for (let i = 0; i < zonesCount; i++) {
                        //characteristics array
                        const characteristics = [];

                        let name = '';
                        let state = false;
                        let operationModeRaw = 0;
                        let currentOperationMode = 0;
                        let targetOperationMode = 0;
                        let roomTemperature = null;
                        let setTemperature = null;
                        let lockPhysicalControl = 0;
                        let operationModeSetPropsMinValue = 0;
                        let operationModeSetPropsMaxValue = 0;
                        let operationModeSetPropsValidValues = [];
                        let temperatureSetPropsMinValue = 0;
                        let temperatureSetPropsMaxValue = 0;

                        switch (this.displayType) {
                            case 1: //Heater Cooler
                                switch (i) {
                                    case caseHeatPump: //Heat Pump Operation Mode - IDLE/STOP, HOT WATER, HEATING, COOLING, HOT WATER STORAGE, FREEZE STAT, LEGIONELLA, HEATING ECO, MODE 1, MODE 2, MODE 3, HEATING UP /// Unit Status - HEAT, COOL
                                        name = heatPumpName;
                                        state = power;
                                        operationModeRaw = operationMode;
                                        currentOperationMode = !power ? 0 : (inStandbyMode ? 1 : [2, 3][operationModeHeatPump]); //INACTIVE, IDLE, HEATING, COOLING
                                        targetOperationMode = !power ? 0 : [1, 2][operationModeHeatPump]; //AUTO OFF, HEAT, COOL
                                        roomTemperature = roomTemperatureHeatPump;
                                        setTemperature = roomTemperatureHeatPump;

                                        lockPhysicalControl = supportsHotWaterTank && supportsZone2 ? (prohibitZone1 && prohibitHotWater && prohibitZone2 ? 1 : 0) : supportsHotWaterTank ? (prohibitZone1 && prohibitHotWater ? 1 : 0) : supportsZone2 ? (prohibitZone1 && prohibitZone2 ? 1 : 0) : 0;
                                        operationModeSetPropsMinValue = [0, 0, 0, 0][heatCoolModes];
                                        operationModeSetPropsMaxValue = [2, 1, 2, 0][heatCoolModes];
                                        operationModeSetPropsValidValues = [[0, 1, 2], [0, 1], [0, 2], [0]][heatCoolModes];
                                        temperatureSetPropsMinValue = -35;
                                        temperatureSetPropsMaxValue = 100;
                                        break;
                                    case caseZone1: //Zone 1 - HEAT ROOM, HEAT FLOW, HEAT CURVE, COOL ROOM, COOL FLOW, FLOOR DRY UP, IDLE
                                        name = zone1Name;
                                        state = true;
                                        operationModeRaw = operationModeZone1;
                                        currentOperationMode = !power ? 0 : (idleZone1 ? 1 : [2, 2, 2, 3, 3, 3, 1][operationModeZone1]); //INACTIVE, IDLE, HEATING, COOLING
                                        if (operationModeZone1 < 6) targetOperationMode = [1, 1, 0, 2, 2, 0][operationModeZone1]; //AUTO, HEAT, COOL

                                        switch (this.accountType) {
                                            case 'melcloud': //Melcloud
                                                switch (operationModeZone1) {
                                                    case 1: //HEAT FLOW
                                                        setTemperature = setHeatFlowTemperatureZone1;
                                                        roomTemperature = flowTemperatureZone1;
                                                        temperatureSetPropsMinValue = minSetHeatFlowTemperature;
                                                        temperatureSetPropsMaxValue = maxSetHeatFlowTemperature;
                                                        break;
                                                    case 4: //COOL FLOW
                                                        setTemperature = setCoolFlowTemperatureZone1;
                                                        roomTemperature = flowTemperatureZone1;
                                                        temperatureSetPropsMinValue = minSetCoolFlowTemperature;
                                                        temperatureSetPropsMaxValue = maxSetCoolFlowTemperature;
                                                        break;
                                                    default:
                                                        setTemperature = setTemperatureZone1;
                                                        roomTemperature = roomTemperatureZone1;
                                                        temperatureSetPropsMinValue = minSetHeatRoomTemperature;
                                                        temperatureSetPropsMaxValue = maxSetHeatCoolRoomTemperature;
                                                        break
                                                };
                                                break;
                                            case 'melcloudhome': //Melcloud Home
                                                switch (operationModeZone1) {
                                                    case 3: //COOL ROOM TEMPERATURE
                                                        setTemperature = setTemperatureZone1;
                                                        roomTemperature = roomTemperatureZone1;
                                                        temperatureSetPropsMinValue = minSetCoolRoomTemperature;
                                                        temperatureSetPropsMaxValue = maxSetHeatCoolRoomTemperature;
                                                        break;
                                                    default:
                                                        setTemperature = setTemperatureZone1;
                                                        roomTemperature = roomTemperatureZone1;
                                                        temperatureSetPropsMinValue = minSetHeatRoomTemperature;
                                                        temperatureSetPropsMaxValue = maxSetHeatCoolRoomTemperature;
                                                        break
                                                };
                                                break;
                                            default:
                                                if (this.logDebug) this.emit('debug', `Received unknown account type: ${this.accountType}`);
                                                return;
                                        }

                                        lockPhysicalControl = prohibitZone1 ? 1 : 0;
                                        operationModeSetPropsMinValue = [0, 0, 1, 0][heatCoolModes];
                                        operationModeSetPropsMaxValue = [2, 2, 2, 0][heatCoolModes];
                                        operationModeSetPropsValidValues = [[0, 1, 2], [0, 1, 2], [1, 2], [0]][heatCoolModes];
                                        break;
                                    case caseHotWater: //Hot Water - NORMAL, HEAT NOW
                                        name = hotWaterName;
                                        state = true;
                                        operationModeRaw = forcedHotWaterMode;
                                        currentOperationMode = !power ? 0 : (operationMode === 1 ? 2 : [1, 2][forcedHotWaterMode]); //INACTIVE, IDLE, HEATING, COOLING
                                        targetOperationMode = [0, 1][forcedHotWaterMode] //AUTO, HEAT, COOL
                                        roomTemperature = tankWaterTemperature;
                                        setTemperature = setTankWaterTemperature;

                                        lockPhysicalControl = prohibitHotWater ? 1 : 0;
                                        operationModeSetPropsMinValue = 0;
                                        operationModeSetPropsMaxValue = 1;
                                        operationModeSetPropsValidValues = [0, 1];
                                        temperatureSetPropsMinValue = minSetTankTemperature;
                                        temperatureSetPropsMaxValue = maxSetTankTemperature;
                                        break;
                                    case caseZone2: //Zone 2 - HEAT ROOM, HEAT FLOW, HEAT CURVE, COOL ROOM, COOL FLOW, FLOOR DRY UP, IDLE
                                        name = zone2Name;
                                        state = true;
                                        operationModeRaw = operationModeZone2;
                                        currentOperationMode = !power ? 0 : (idleZone2 ? 1 : [2, 2, 2, 3, 3, 3, 1][operationModeZone2]); //INACTIVE, IDLE, HEATING, COOLING
                                        if (operationModeZone1 < 6) targetOperationMode = [1, 1, 0, 2, 2, 0][operationModeZone2]; //AUTO, HEAT, COOL

                                        switch (this.accountType) {
                                            case 'melcloud': //Melcloud
                                                switch (operationModeZone2) {
                                                    case 1: //HEAT FLOW
                                                        setTemperature = setHeatFlowTemperatureZone2;
                                                        roomTemperature = flowTemperatureZone2;
                                                        temperatureSetPropsMinValue = minSetHeatFlowTemperature;
                                                        temperatureSetPropsMaxValue = maxSetHeatFlowTemperature;
                                                        break;
                                                    case 4: //COOL FLOW
                                                        setTemperature = setCoolFlowTemperatureZone2;
                                                        roomTemperature = flowTemperatureZone2;
                                                        temperatureSetPropsMinValue = minSetCoolFlowTemperature;
                                                        temperatureSetPropsMaxValue = maxSetCoolFlowTemperature;
                                                        break;
                                                    default:
                                                        setTemperature = setTemperatureZone2;
                                                        roomTemperature = roomTemperatureZone2;
                                                        temperatureSetPropsMinValue = minSetHeatRoomTemperature;
                                                        temperatureSetPropsMaxValue = maxSetHeatCoolRoomTemperature;
                                                        break
                                                };
                                                break;
                                            case 'melcloudhome': //Melcloud Home
                                                switch (operationModeZone2) {
                                                    case 3: //COOL ROOM TEMPERATURE
                                                        setTemperature = setTemperatureZone2;
                                                        roomTemperature = roomTemperatureZone2;
                                                        temperatureSetPropsMinValue = minSetCoolRoomTemperature;
                                                        temperatureSetPropsMaxValue = maxSetHeatCoolRoomTemperature;
                                                        break;
                                                    default:
                                                        setTemperature = setTemperatureZone2;
                                                        roomTemperature = roomTemperatureZone2;
                                                        temperatureSetPropsMinValue = minSetHeatRoomTemperature;
                                                        temperatureSetPropsMaxValue = maxSetHeatCoolRoomTemperature;
                                                        break
                                                };
                                                break;
                                            default:
                                                if (this.logDebug) this.emit('debug', `Received unknown account type: ${this.accountType}`);
                                                return;
                                        }

                                        lockPhysicalControl = prohibitZone2 ? 1 : 0;
                                        operationModeSetPropsMinValue = [0, 0, 1, 0][heatCoolModes];
                                        operationModeSetPropsMaxValue = [2, 2, 2, 0][heatCoolModes];
                                        operationModeSetPropsValidValues = [[0, 1, 2], [0, 1, 2], [1, 2], [0]][heatCoolModes];
                                        break;
                                    default:
                                        if (this.logDebug) this.emit('debug', `Received unknown zone: ${i}`);
                                        return;
                                };

                                //create characteristics
                                characteristics.push(
                                    { type: Characteristic.Active, value: power },
                                    { type: Characteristic.CurrentHeaterCoolerState, value: currentOperationMode },
                                    { type: Characteristic.TargetHeaterCoolerState, value: targetOperationMode },
                                    { type: Characteristic.CurrentTemperature, value: roomTemperature },
                                    { type: Characteristic.LockPhysicalControls, value: lockPhysicalControl },
                                    { type: Characteristic.TemperatureDisplayUnits, value: obj.useFahrenheit }
                                );

                                if (heatCoolModes === 0 || heatCoolModes === 1) characteristics.push({ type: Characteristic.HeatingThresholdTemperature, value: setTemperature });
                                if ((heatCoolModes === 0 || heatCoolModes === 2) && i !== caseHotWater) characteristics.push({ type: Characteristic.CoolingThresholdTemperature, value: setTemperature });
                                break;
                            case 2: //Thermostat
                                switch (i) {
                                    case caseHeatPump: //Heat Pump Operation Mode - IDLE, HOT WATER, HEATING, COOLING, HOT WATER STORAGE, FREEZE STAT, LEGIONELLA, HEATING ECO, MODE 1, MODE 2, MODE 3, HEATING UP /// Unit Status - HEAT, COOL
                                        name = heatPumpName;
                                        state = power;
                                        operationModeRaw = operationMode;
                                        currentOperationMode = !power ? 0 : (inStandbyMode ? 0 : [1, 2][operationModeHeatPump]); //OFF, HEATING, COOLING
                                        targetOperationMode = !power ? 0 : [1, 2][operationModeHeatPump]; //OFF, HEAT, COOL, AUTO - not used
                                        roomTemperature = roomTemperatureHeatPump;
                                        setTemperature = roomTemperatureHeatPump;

                                        operationModeSetPropsMinValue = [0, 0, 0, 0][heatCoolModes];
                                        operationModeSetPropsMaxValue = [2, 1, 2, 0][heatCoolModes];
                                        operationModeSetPropsValidValues = [[0, 1, 2], [0, 1], [0, 2], [0]][heatCoolModes];
                                        temperatureSetPropsMinValue = -35;
                                        temperatureSetPropsMaxValue = 100;
                                        break;
                                    case caseZone1: //Zone 1 - HEAT ROOM, HEAT FLOW, HEAT CURVE, COOL ROOM, COOL FLOW, FLOOR DRY UP, IDLE
                                        name = zone1Name;
                                        state = true;
                                        operationModeRaw = operationModeZone1;
                                        currentOperationMode = !power ? 0 : idleZone1 ? 0 : [1, 1, 1, 2, 2, 2, 0][operationModeZone1]; //OFF, HEAT, COOL
                                        if (operationModeZone1 < 6) targetOperationMode = [1, 1, 3, 2, 2, 3][operationModeZone1]; //OFF, HEAT, COOL, AUTO

                                        switch (this.accountType) {
                                            case 'melcloud': //Melcloud
                                                switch (operationModeZone1) {
                                                    case 1: //HEAT FLOW
                                                        setTemperature = setHeatFlowTemperatureZone1;
                                                        roomTemperature = flowTemperatureZone1;
                                                        temperatureSetPropsMinValue = minSetHeatFlowTemperature;
                                                        temperatureSetPropsMaxValue = maxSetHeatFlowTemperature;
                                                        break;
                                                    case 4: //COOL FLOW
                                                        setTemperature = setCoolFlowTemperatureZone1;
                                                        roomTemperature = flowTemperatureZone1;
                                                        temperatureSetPropsMinValue = minSetCoolFlowTemperature;
                                                        temperatureSetPropsMaxValue = maxSetCoolFlowTemperature;
                                                        break;
                                                    default:
                                                        setTemperature = setTemperatureZone1;
                                                        roomTemperature = roomTemperatureZone1;
                                                        temperatureSetPropsMinValue = minSetHeatRoomTemperature;
                                                        temperatureSetPropsMaxValue = maxSetHeatCoolRoomTemperature;
                                                        break
                                                };
                                                break;
                                            case 'melcloudhome': //Melcloud Home
                                                switch (operationModeZone1) {
                                                    case 3: //COOL ROOM TEMPERATURE
                                                        setTemperature = setTemperatureZone1;
                                                        roomTemperature = roomTemperatureZone1;
                                                        temperatureSetPropsMinValue = minSetCoolRoomTemperature;
                                                        temperatureSetPropsMaxValue = maxSetHeatCoolRoomTemperature;
                                                        break;
                                                    default:
                                                        setTemperature = setTemperatureZone1;
                                                        roomTemperature = roomTemperatureZone1;
                                                        temperatureSetPropsMinValue = minSetHeatRoomTemperature;
                                                        temperatureSetPropsMaxValue = maxSetHeatCoolRoomTemperature;
                                                        break
                                                };
                                                break;
                                            default:
                                                if (this.logDebug) this.emit('debug', `Received unknown account type: ${this.accountType}`);
                                                return;
                                        }

                                        operationModeSetPropsMinValue = [1, 1, 1, 0][heatCoolModes];
                                        operationModeSetPropsMaxValue = [3, 3, 2, 0][heatCoolModes];
                                        operationModeSetPropsValidValues = [[1, 2, 3], [1, 2, 3], [1, 2], [0]][heatCoolModes];
                                        break;
                                    case caseHotWater: //Hot Water - NORMAL, HEAT NOW
                                        name = hotWaterName;
                                        state = true;
                                        operationModeRaw = forcedHotWaterMode;
                                        currentOperationMode = !power ? 0 : (operationMode === 1 ? 1 : [0, 1][forcedHotWaterMode]); //OFF, HEAT, COOL
                                        targetOperationMode = [3, 1][forcedHotWaterMode] //OFF, HEAT, COOL, AUTO
                                        roomTemperature = tankWaterTemperature;
                                        setTemperature = setTankWaterTemperature;

                                        operationModeSetPropsMinValue = 1;
                                        operationModeSetPropsMaxValue = 3;
                                        operationModeSetPropsValidValues = [1, 3];
                                        temperatureSetPropsMinValue = minSetTankTemperature;
                                        temperatureSetPropsMaxValue = maxSetTankTemperature;
                                        break;
                                    case caseZone2: //Zone 2 - HEAT ROOM, HEAT FLOW, HEAT CURVE, COOL ROOM, COOL FLOW, FLOOR DRY UP, IDLE
                                        name = zone2Name;
                                        state = true;
                                        operationModeRaw = operationModeZone2;
                                        currentOperationMode = !power ? 0 : idleZone2 ? 0 : [1, 1, 1, 2, 2, 2, 0][operationModeZone2]; //OFF, HEAT, COOL
                                        if (operationModeZone1 < 6) targetOperationMode = [1, 1, 3, 2, 2, 3][operationModeZone2]; //OFF, HEAT, COOL, AUTO

                                        switch (this.accountType) {
                                            case 'melcloud': //Melcloud
                                                switch (operationModeZone2) {
                                                    case 1: //HEAT FLOW
                                                        setTemperature = setHeatFlowTemperatureZone2;
                                                        roomTemperature = flowTemperatureZone2;
                                                        temperatureSetPropsMinValue = minSetHeatFlowTemperature;
                                                        temperatureSetPropsMaxValue = maxSetHeatFlowTemperature;
                                                        break;
                                                    case 4: //COOL FLOW
                                                        setTemperature = setCoolFlowTemperatureZone2;
                                                        roomTemperature = flowTemperatureZone2;
                                                        temperatureSetPropsMinValue = minSetCoolFlowTemperature;
                                                        temperatureSetPropsMaxValue = maxSetCoolFlowTemperature;
                                                        break;
                                                    default:
                                                        setTemperature = setTemperatureZone2;
                                                        roomTemperature = roomTemperatureZone2;
                                                        temperatureSetPropsMinValue = minSetHeatRoomTemperature;
                                                        temperatureSetPropsMaxValue = maxSetHeatCoolRoomTemperature;
                                                        break
                                                };
                                                break;
                                            case 'melcloudhome': //Melcloud Home
                                                switch (operationModeZone2) {
                                                    case 3: //COOL ROOM TEMPERATURE
                                                        setTemperature = setTemperatureZone2;
                                                        roomTemperature = roomTemperatureZone2;
                                                        temperatureSetPropsMinValue = minSetCoolRoomTemperature;
                                                        temperatureSetPropsMaxValue = maxSetHeatCoolRoomTemperature;
                                                        break;
                                                    default:
                                                        setTemperature = setTemperatureZone2;
                                                        roomTemperature = roomTemperatureZone2;
                                                        temperatureSetPropsMinValue = minSetHeatRoomTemperature;
                                                        temperatureSetPropsMaxValue = maxSetHeatCoolRoomTemperature;
                                                        break
                                                };
                                                break;
                                            default:
                                                if (this.logDebug) this.emit('debug', `Received unknown account type: ${this.accountType}`);
                                                return;
                                        }

                                        operationModeSetPropsMinValue = [1, 1, 1, 0][heatCoolModes];
                                        operationModeSetPropsMaxValue = [3, 3, 2, 0][heatCoolModes];
                                        operationModeSetPropsValidValues = [[1, 2, 3], [1, 2, 3], [1, 2], [0]][heatCoolModes];
                                        break;
                                    default:
                                        if (this.logDebug) this.emit('debug', `Received unknown zone: ${i}`);
                                        return;
                                };

                                //create characteristics
                                characteristics.push(
                                    { type: Characteristic.CurrentHeatingCoolingState, value: currentOperationMode },
                                    { type: Characteristic.TargetHeatingCoolingState, value: targetOperationMode },
                                    { type: Characteristic.CurrentTemperature, value: roomTemperature },
                                    { type: Characteristic.TargetTemperature, value: setTemperature },
                                    { type: Characteristic.TemperatureDisplayUnits, value: obj.useFahrenheit }
                                );
                                break;
                            default:
                                if (this.logDebug) this.emit('debug', `Received unknown display type: ${this.displayType}`);
                                return;
                        };

                        //add every zone to array
                        const zone = {
                            name: name,
                            state: state,
                            operationModeRaw: operationModeRaw,
                            operationModeHeatPump: operationModeHeatPump,
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

                        //update services
                        for (const { type, value } of characteristics) {
                            if (!this.functions.isValidValue(value)) continue;
                            this.melCloudServices?.[i]?.updateCharacteristic(type, value);
                        }

                        //log current state
                        if (this.logInfo) {
                            let operationModeText = '';
                            switch (i) {
                                case caseHeatPump: //Heat Pump - HEAT, COOL, OFF
                                    this.emit('info', `${name}, Status: ${!power ? 'Off' : (inStandbyMode ? 'Idle' : HeatPump.UnitStatusMapEnumToString[operationModeHeatPump])}`);
                                    this.emit('info', `${name}, Operation mode: ${HeatPump.OperationModeMapEnumToStringInfo[operationMode]}`);
                                    if (supportsOutdoorTemperature) this.emit('info', `${name}, Outdoor temperature: ${outdoorTemperature}${obj.temperatureUnit}`);
                                    this.emit('info', `${name}, Temperature display unit: ${obj.temperatureUnit}`);
                                    this.emit('info', `${name}, Lock physical controls: ${lockPhysicalControl ? 'Locked' : 'Unlocked'}`);
                                    if (!accountTypeMelCloud) this.emit('info', `${name}, WiFi signal strength: ${deviceData.Rssi}dBm`);
                                    break;
                                case caseZone1: //Zone 1 - HEAT ROOM, HEAT FLOW, HEAT CURVE, COOL ROOM, COOL FLOW, FLOOR DRY UP
                                    operationModeText = idleZone1 ? HeatPump.OperationModeZoneMapEnumToStringInfo[6] : HeatPump.OperationModeZoneMapEnumToStringInfo[operationModeZone1];
                                    this.emit('info', `${name}, Operation mode: ${operationModeText}`);
                                    this.emit('info', `${name}, Temperature: ${roomTemperature}${obj.temperatureUnit}`);
                                    this.emit('info', `${name}, Target temperature: ${setTemperature}${obj.temperatureUnit}`)
                                    this.emit('info', `${name}, Temperature display unit: ${obj.temperatureUnit}`);
                                    this.emit('info', `${name}, Lock physical controls: ${lockPhysicalControl ? 'Locked' : 'Unlocked'}`);
                                    break;
                                case caseHotWater: //Hot Water - AUTO, HEAT NOW
                                    operationModeText = operationMode === 1 ? HeatPump.ForceDhwMapEnumToStringInfo[1] : HeatPump.ForceDhwMapEnumToStringInfo[forcedHotWaterMode ? 1 : 0];
                                    this.emit('info', `${name}, Operation mode: ${operationModeText}`);
                                    this.emit('info', `${name}, Temperature: ${roomTemperature}${obj.temperatureUnit}`);
                                    this.emit('info', `${name}, Target temperature: ${setTemperature}${obj.temperatureUnit}`)
                                    this.emit('info', `${name}, Temperature display unit: ${obj.temperatureUnit}`);
                                    this.emit('info', `${name}, Lock physical controls: ${lockPhysicalControl ? 'Locked' : 'Unlocked'}`);
                                    break;
                                case caseZone2: //Zone 2 - HEAT ROOM, HEAT FLOW, HEAT CURVE, COOL ROOM, COOL FLOW, FLOOR DRY UP
                                    operationModeText = idleZone2 ? HeatPump.OperationModeZoneMapEnumToStringInfo[6] : HeatPump.OperationModeZoneMapEnumToStringInfo[operationModeZone2];
                                    this.emit('info', `${name}, Operation mode: ${operationModeText}`);
                                    this.emit('info', `${name}, Temperature: ${roomTemperature}${obj.temperatureUnit}`);
                                    this.emit('info', `${name}, Target temperature: ${setTemperature}${obj.temperatureUnit}`)
                                    this.emit('info', `${name}, Temperature display unit: ${obj.temperatureUnit}`);
                                    this.emit('info', `${name}, Lock physical controls: ${lockPhysicalControl ? 'Locked' : 'Unlocked'}`);
                                    break;
                            };
                        }
                    }

                    //zones sensors
                    for (let i = 0; i < zonesSensorsCount; i++) {

                        // helper function to update sensor characteristics
                        const updateSensorCharacteristics = (service, value) => {
                            if (this.functions.isValidValue(value)) service?.updateCharacteristic(Characteristic.CurrentTemperature, value);
                        };

                        // default values
                        let name = '';
                        let roomTemperature = null;
                        let flowTemperature = null;
                        let returnTemperature = null;

                        switch (i) {
                            case caseHeatPumpSensor: // Heat Pump
                                name = heatPumpName;
                                roomTemperature = roomTemperatureHeatPump;
                                flowTemperature = flowTemperatureHeatPump;
                                returnTemperature = returnTemperatureHeatPump;

                                updateSensorCharacteristics(this.roomTemperatureSensorService, roomTemperature);
                                updateSensorCharacteristics(this.flowTemperatureSensorService, flowTemperature);
                                updateSensorCharacteristics(this.returnTemperatureSensorService, returnTemperature);
                                break;
                            case caseZone1Sensor: // Zone 1
                                name = zone1Name;
                                roomTemperature = roomTemperatureZone1;
                                flowTemperature = flowTemperatureZone1;
                                returnTemperature = returnTemperatureZone1;

                                updateSensorCharacteristics(this.roomTemperatureZone1SensorService, roomTemperature);
                                updateSensorCharacteristics(this.flowTemperatureZone1SensorService, flowTemperature);
                                updateSensorCharacteristics(this.returnTemperatureZone1SensorService, returnTemperature);
                                break;
                            case caseHotWaterSensor: // Hot Water
                                name = hotWaterName;
                                roomTemperature = tankWaterTemperature;
                                flowTemperature = flowTemperatureWaterTank;
                                returnTemperature = returnTemperatureWaterTank;

                                updateSensorCharacteristics(this.roomTemperatureWaterTankSensorService, roomTemperature);
                                updateSensorCharacteristics(this.flowTemperatureWaterTankSensorService, flowTemperature);
                                updateSensorCharacteristics(this.returnTemperatureWaterTankSensorService, returnTemperature);
                                break;
                            case caseZone2Sensor: // Zone 2
                                name = zone2Name;
                                roomTemperature = roomTemperatureZone2;
                                flowTemperature = flowTemperatureZone2;
                                returnTemperature = returnTemperatureZone2;

                                updateSensorCharacteristics(this.roomTemperatureZone2SensorService, roomTemperature);
                                updateSensorCharacteristics(this.flowTemperatureZone2SensorService, flowTemperature);
                                updateSensorCharacteristics(this.returnTemperatureZone2SensorService, returnTemperature);
                                break;
                        }

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
                            const sensorTupe = (supportsOutdoorTemperature && i === caseHeatPumpSensor) ? 'Outdoor' : 'Room';
                            if (roomTemperature) this.emit('info', `${name}, Sensor ${sensorTupe} temperature: ${roomTemperature}${obj.temperatureUnit}`);
                            if (flowTemperature) this.emit('info', `${name}, Sensor Flow temperature: ${flowTemperature}${obj.temperatureUnit}`);
                            if (returnTemperature) this.emit('info', `${name}, Sensor Return temperature: ${returnTemperature}${obj.temperatureUnit}`);
                        };
                    }
                    this.accessory = obj;

                    //other sensors
                    if (this.temperatureOutdoorSensor) this.outdoorTemperatureSensorService?.updateCharacteristic(Characteristic.CurrentTemperature, outdoorTemperature);
                    if (this.inStandbySensor) this.inStandbyService?.updateCharacteristic(Characteristic.ContactSensorState, inStandbyMode);
                    if (this.connectSensor) this.connectService?.updateCharacteristic(Characteristic.ContactSensorState, isConnected);
                    if (this.errorSensor) this.errorService?.updateCharacteristic(Characteristic.ContactSensorState, isInError);

                    //frost protection
                    if (this.frostProtectionSupport && frostProtectionEnabled !== null) {
                        this.frostProtectionControlService
                            ?.updateCharacteristic(Characteristic.Active, frostProtectionEnabled)
                            .updateCharacteristic(Characteristic.CurrentHeaterCoolerState, frostProtection.Active ? 2 : 1)
                            .updateCharacteristic(Characteristic.TargetHeaterCoolerState, 0)
                            .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperatureZone1)
                            .updateCharacteristic(Characteristic.CoolingThresholdTemperature, frostProtection.Max)
                            .updateCharacteristic(Characteristic.HeatingThresholdTemperature, frostProtection.Min);
                        this.frostProtectionControlSensorService?.updateCharacteristic(Characteristic.ContactSensorState, frostProtectionEnabled);
                        this.frostProtectionSensorService?.updateCharacteristic(Characteristic.ContactSensorState, frostProtection.Active);
                    }

                    //holiday mode
                    if (this.holidayModeSupport && holidayModeEnabled !== null) {
                        this.holidayModeControlService?.updateCharacteristic(Characteristic.On, holidayModeEnabled);
                        this.holidayModeControlSensorService?.updateCharacteristic(Characteristic.ContactSensorState, holidayModeEnabled);
                        this.holidayModeSensorService?.updateCharacteristic(Characteristic.ContactSensorState, holidayMode.Active);
                    }

                    //presets
                    if (this.presets.length > 0) {
                        this.presets.forEach((preset, i) => {
                            const presetData = presetsOnServer.find(p => String(p.ID) === preset.id);
                            if (!presetData) return;

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
                            if (preset.displayType > 3) this.presetControlServices?.[i]?.updateCharacteristic(Characteristic.On, preset.state);

                            //sensor
                            if (preset.displayType < 7) this.presetControlSensorServices?.[i]?.updateCharacteristic(characteristicType, preset.state);
                        });
                    }

                    ///schedules
                    if (this.schedules.length > 0 && scheduleEnabled !== null) {
                        this.schedules.forEach((schedule, i) => {
                            const scheduleData = schedulesOnServer.find(s => s.Id === schedule.id);
                            if (!scheduleData) return;

                            const characteristicType = schedule.characteristicType;
                            schedule.state = scheduleEnabled ? !!scheduleData.Enabled : false;

                            //control
                            if (i === 0) {
                                if (schedule.displayType > 3) this.scheduleControlService?.updateCharacteristic(Characteristic.On, scheduleEnabled);
                                if (schedule.displayType < 7) this.scheduleControlSensorService?.updateCharacteristic(characteristicType, scheduleEnabled);
                            }

                            //sensor
                            if (schedule.displayType < 7) this.scheduleSensorServices?.[i]?.updateCharacteristic(characteristicType, schedule.state);
                        });
                    }

                    //scenes
                    if (this.scenes.length > 0) {
                        this.scenes.forEach((scene, i) => {
                            const sceneData = scenesOnServer.find(s => s.Id === scene.id);
                            if (!sceneData) return;

                            const characteristicType = scene.characteristicType;
                            scene.state = sceneData.Enabled;

                            //control
                            if (scene.displayType > 3) this.sceneControlServices?.[i]?.updateCharacteristic(Characteristic.On, scene.state);

                            //sensor
                            if (scene.displayType < 7) this.sceneControlSensorServices?.[i]?.updateCharacteristic(characteristicType, scene.state);
                        });
                    }

                    //buttons
                    if (this.buttons.length > 0) {
                        this.buttons.forEach((button, i) => {
                            // helper function to update sensor characteristics
                            const updateSensorCharacteristics = (service, characteristic, value) => {
                                if (this.functions.isValidValue(value)) service?.[i]?.updateCharacteristic(characteristic, value);
                            };

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
                                    button.state = power ? holidayMode.Enabled : false;
                                    break;
                                case 10: //ALL ZONES PHYSICAL LOCK CONTROL
                                    button.state = power ? (prohibitZone1 && prohibitHotWater && prohibitZone2) : false;
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
                                case 40: //ZONE 1 HEAT ROOM
                                    button.state = power ? (operationModeZone1 === 0) : false;
                                    break;
                                case 41: //HEAT FLOW
                                    button.state = power ? (operationModeZone1 === 1) : false;
                                    break;
                                case 42: //HEAT CURVE
                                    button.state = power ? (operationModeZone1 === 2) : false;
                                    break;
                                case 43: //COOL ROOM
                                    button.state = power ? (operationModeZone1 === 3) : false;
                                    break;
                                case 44: //COOL FLOW
                                    button.state = power ? (operationModeZone1 === 4) : false;
                                    break;
                                case 45: //FLOOR DRY UP
                                    button.state = power ? (operationModeZone1 === 5) : false;
                                    break;
                                case 50: //PHYSICAL LOCK CONTROL
                                    button.state = prohibitZone1;
                                    break;
                                case 60: //ZONE 2 HEAT ROOM
                                    button.state = power ? (operationModeZone2 === 0) : false;
                                    break;
                                case 61: //HEAT FLOW
                                    button.state = power ? (operationModeZone2 === 1) : false;
                                    break;
                                case 62: //HEAT CURVE
                                    button.state = power ? (operationModeZone2 === 2) : false;
                                    break;
                                case 63: //COOL ROOM
                                    button.state = power ? (operationModeZone2 === 3) : false;
                                    break;
                                case 64: //COOL FLOW
                                    button.state = power ? (operationModeZone2 === 4) : false;
                                    break;
                                case 65: //FLOOR DRY UP
                                    button.state = power ? (operationModeZone2 === 5) : false;
                                    break;
                                case 70: //PHYSICAL LOCK CONTROL
                                    button.state = prohibitZone2;
                                    break;
                                default: //Unknown button
                                    if (this.logDebug) this.emit('debug', `Received unknown button mode: ${mode} detected`);
                                    return;
                            };

                            //control
                            if (button.displayType > 3) updateSensorCharacteristics(this.buttonControlServices, Characteristic.On, button.state);

                            //sensor
                            const characteristicType = button.characteristicType;
                            if (button.displayType < 7) updateSensorCharacteristics(this.buttonControlSensorServices, characteristicType, button.state);
                        });
                    }
                })
                .on('success', (success) => this.emit('success', success))
                .on('info', (info) => this.emit('info', info))
                .on('debug', (debug) => this.emit('debug', debug))
                .on('warn', (warn) => this.emit('warn', warn))
                .on('error', (error) => this.emit('error', error))
                .on('restFul', (path, data) => {
                    if (this.restFulConnected) this.restFul1.update(path, data);
                })
                .on('mqtt', async (topic, message) => {
                    if (this.mqttConnected) await this.mqtt1.publish(topic, message);
                });

            //start external integrations
            if (this.restFul.enable || this.mqtt.enable) await this.externalIntegrations();

            //check state
            await this.melCloudAtw.updateState('request', this.melCloudDeviceData);

            //prepare accessory
            const accessory = await this.prepareAccessory();
            return accessory;
        } catch (error) {
            throw new Error(`Start error: ${error}`);
        };
    }
}

export default DeviceAtw;
