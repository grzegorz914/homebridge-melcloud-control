import EventEmitter from 'events';
import MelCloudAtw from './melcloudatw.js';
import RestFul from './restful.js';
import Mqtt from './mqtt.js';
import { TemperatureDisplayUnits, HeatPump } from './constants.js';
let Accessory, Characteristic, Service, Categories, AccessoryUUID;

class DeviceAtw extends EventEmitter {
    constructor(api, account, device, melCloud, accountInfo, contextKey, accountName, deviceId, deviceName, deviceTypeText, devicesFile, refreshInterval, useFahrenheit, restFul, mqtt) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        AccessoryUUID = api.hap.uuid;

        //account config
        this.displayMode = device.displayMode;
        this.hideZone = device.hideZone;
        this.temperatureSensor = device.temperatureSensor || false;
        this.temperatureSensorFlow = device.temperatureSensorFlow || false;
        this.temperatureSensorReturn = device.temperatureSensorReturn || false;
        this.temperatureSensorFlowZone1 = device.temperatureSensorFlowZone1 || false;
        this.temperatureSensorReturnZone1 = device.temperatureSensorReturnZone1 || false;
        this.temperatureSensorFlowWaterTank = device.temperatureSensorFlowWaterTank || false;
        this.temperatureSensorReturnWaterTank = device.temperatureSensorReturnWaterTank || false;
        this.temperatureSensorFlowZone2 = device.temperatureSensorFlowZone2 || false;
        this.temperatureSensorReturnZone2 = device.temperatureSensorReturnZone2 || false;
        this.presets = device.presets || [];
        this.buttons = device.buttonsSensors || [];
        this.disableLogInfo = account.disableLogInfo || false;
        this.disableLogDeviceInfo = account.disableLogDeviceInfo || false;
        this.enableDebugMode = account.enableDebugMode || false;
        this.accountInfo = accountInfo;
        this.contextKey = contextKey;
        this.accountName = accountName;
        this.deviceId = deviceId;
        this.deviceName = deviceName;
        this.deviceTypeText = deviceTypeText;
        this.devicesFile = devicesFile;
        this.refreshInterval = refreshInterval;
        this.startPrepareAccessory = true;
        this.displayDeviceInfo = true;

        //external integrations
        this.restFul = restFul;
        this.restFulConnected = false;
        this.mqtt = mqtt;
        this.mqttConnected = false;

        //variables
        this.useFahrenheit = useFahrenheit ? 1 : 0;
        this.temperatureUnit = TemperatureDisplayUnits[this.useFahrenheit];

        //function
        this.melCloud = melCloud; //function

        //presets configured
        this.presetsConfigured = [];
        for (const preset of this.presets) {
            const displayType = preset.displayType ?? 0;
            if (displayType === 0) {
                continue;
            };

            const presetyServiceType = ['', Service.Outlet, Service.Switch, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][displayType];
            const presetCharacteristicType = ['', Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][displayType];
            preset.name = preset.name || 'Preset'
            preset.serviceType = presetyServiceType;
            preset.characteristicType = presetCharacteristicType;
            preset.state = false;
            preset.previousSettings = {};
            this.presetsConfigured.push(preset);
        }
        this.presetsConfiguredCount = this.presetsConfigured.length || 0;

        //buttons configured
        this.buttonsConfigured = [];
        for (const button of this.buttons) {
            const displayType = button.displayType ?? 0;
            if (displayType === 0) {
                continue;
            };

            const buttonServiceType = ['', Service.Outlet, Service.Switch, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][displayType];
            const buttonCharacteristicType = ['', Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][displayType];
            button.name = button.name || 'Button'
            button.serviceType = buttonServiceType;
            button.characteristicType = buttonCharacteristicType;
            button.state = false;
            button.previousValue = null;
            this.buttonsConfigured.push(button);;
        }
        this.buttonsConfiguredCount = this.buttonsConfigured.length || 0;

        //device data
        this.deviceData = {};

        //accessory
        this.mielHvac = {};
    };

    async externalIntegrations() {
        try {
            //RESTFul server
            const restFulEnabled = this.restFul.enable || false;
            if (restFulEnabled) {
                if (!this.restFulConnected) {
                    this.restFul1 = new RestFul({
                        port: this.deviceId.toString().slice(-4).replace(/^0/, '9'),
                        debug: this.restFul.debug || false
                    });

                    this.restFul1.on('connected', (message) => {
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
                        .on('error', (error) => {
                            this.emit('warn', error);
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
                        clientId: `${this.mqtt.clientId}_${this.deviceId}` || `${this.deviceTypeText}_${this.deviceName}_${this.deviceId}`,
                        prefix: `${this.mqtt.prefix}/${this.deviceTypeText}/${this.deviceName}`,
                        user: this.mqtt.user,
                        passwd: this.mqtt.pass,
                        debug: this.mqtt.debug || false
                    });

                    this.mqtt1.on('connected', (message) => {
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
                        .on('error', (error) => {
                            this.emit('warn', error);
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
            switch (key) {
                case 'Power':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power;
                    set = await this.melCloudAtw.send(deviceData);
                    break;
                case 'OperationMode':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.OperationMode;
                    set = await this.melCloudAtw.send(deviceData);
                    break;
                case 'OperationModeZone1':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.OperationModeZone1;
                    set = await this.melCloudAtw.send(deviceData);
                    break;
                case 'OperationModeZone2':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.OperationModeZone2;
                    set = await this.melCloudAtw.send(deviceData);
                    break;
                case 'SetTemperatureZone1':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetTemperatureZone2;
                    set = await this.melCloudAtw.send(deviceData);
                    break;
                case 'SetTemperatureZone2':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetTemperatureZone2;
                    set = await this.melCloudAtw.send(deviceData);
                    break;
                case 'SetHeatFlowTemperatureZone1':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetHeatFlowTemperatureZone1;
                    set = await this.melCloudAtw.send(deviceData);
                    break;
                case 'SetHeatFlowTemperatureZone2':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetHeatFlowTemperatureZone2;
                    set = await this.melCloudAtw.send(deviceData);
                    break;
                case 'SetCoolFlowTemperatureZone1':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetCoolFlowTemperatureZone1;
                    set = await this.melCloudAtw.send(deviceData);
                    break;
                case 'SetCoolFlowTemperatureZone2':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetCoolFlowTemperatureZone2;
                    set = await this.melCloudAtw.send(deviceData);
                    break;
                case 'SetTankWaterTemperature':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetTankWaterTemperature;
                    set = await this.melCloudAtw.send(deviceData);
                    break;
                case 'ForcedHotWaterMode':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                    set = await this.melCloudAtw.send(deviceData);
                    break;
                case 'EcoHotWater':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.EcoHotWater;
                    set = await this.melCloudAtw.send(deviceData);
                    break;
                case 'HolidayMode':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.HolidayMode;
                    set = await this.melCloudAtw.send(deviceData);
                    break;
                case 'ProhibitZone1':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.ProhibitZone1;
                    set = await this.melCloudAtw.send(deviceData);
                    break;
                case 'ProhibitZone2':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.ProhibitZone2;
                    set = await this.melCloudAtw.send(deviceData);
                    break;
                case 'ProhibitHotWater':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.ProhibitHotWater;
                    set = await this.melCloudAtw.send(deviceData);
                    break;
                default:
                    this.emit('warn', `${integration}, received key: ${key}, value: ${value}`);
                    break;
            };
            return set;
        } catch (error) {
            throw new Error(`${integration} set key: ${key}, value: ${value}, error: ${error.message ?? error}`);
        };
    }


    async startImpulseGenerator() {
        try {
            //start impule generator
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.melCloudAtw.impulseGenerator.start([{ name: 'checkState', sampling: this.refreshInterval }]);
            return true;
        } catch (error) {
            throw new Error(`Impulse generator start error: ${error}`);
        };
    }

    //prepare accessory
    async prepareAccessory(accountInfo, deviceData, deviceId, deviceTypeText, deviceName, accountName) {
        try {
            const mielHvac = this.mielHvac;
            const presetsOnServer = mielHvac.presets;
            const zonesCount = mielHvac.zonesCount;
            const caseHeatPump = mielHvac.caseHeatPump;
            const caseZone1 = mielHvac.caseZone1;
            const caseHotWater = mielHvac.caseHotWater;
            const caseZone2 = mielHvac.caseZone2;
            const heatCoolModes = mielHvac.heatCoolModes;

            const zonesSensorsCount = mielHvac.sensorsCount;
            const caseHeatPumpSensor = mielHvac.caseHeatPumpSensor;
            const caseZone1Sensor = mielHvac.caseZone1Sensor;
            const caseHotWaterSensor = mielHvac.caseHotWaterSensor;
            const caseZone2Sensor = mielHvac.caseZone2Sensor;

            //accessory
            const debug = this.enableDebugMode ? this.emit('debug', `Prepare accessory`) : false;
            const accessoryName = deviceName;
            const accessoryUUID = AccessoryUUID.generate(accountName + deviceId.toString());
            const accessoryCategory = [Categories.OTHER, Categories.AIR_HEATER, Categories.THERMOSTAT][this.displayType];
            const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

            //information service
            const debug1 = this.enableDebugMode ? this.emit('debug', `Prepare information service`) : false;
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
                .setCharacteristic(Characteristic.Model, this.model)
                .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
                .setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision)
                .setCharacteristic(Characteristic.ConfiguredName, accessoryName);

            //services
            if (zonesCount > 0) {
                this.melCloudServices = [];
                mielHvac.zones.forEach((zone, i) => {
                    const zoneName = zone.name
                    const serviceName = `${deviceTypeText} ${accessoryName}: ${zoneName}`;
                    switch (this.displayMode) {
                        case 1: //Heater Cooler
                            const debug = this.enableDebugMode ? this.emit('debug', `Prepare heather/cooler ${zoneName} service`) : false;
                            const melCloudService = new Service.HeaterCooler(serviceName, `HeaterCooler ${deviceId} ${i}`);
                            melCloudService.setPrimaryService(true);
                            melCloudService.getCharacteristic(Characteristic.Active)
                                .onGet(async () => {
                                    const state = mielHvac.power;
                                    return state;
                                })
                                .onSet(async (state) => {
                                    try {
                                        switch (i) {
                                            case 0: //Heat Pump
                                                deviceData.Device.Power = [false, true][state];
                                                deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power;
                                                await this.melCloudAtw.send(deviceData);
                                                const info = this.disableLogInfo ? false : this.emit('message', `${zoneName}, Set power: ${state ? 'ON' : 'OFF'}`);
                                                break;
                                        };
                                    } catch (error) {
                                        this.emit('warn', `Set power error: ${error}`);
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
                                        switch (i) {
                                            case caseHeatPump: //Heat Pump - ON, HEAT, COOL
                                                switch (value) {
                                                    case caseHeatPump: //AUTO
                                                        deviceData.Device.Power = true;
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power;
                                                        break;
                                                    case 1: //HEAT
                                                        deviceData.Device.Power = true;
                                                        deviceData.Device.UnitStatus = 0;
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationMode;
                                                        break;
                                                    case 2: //COOL
                                                        deviceData.Device.Power = true;
                                                        deviceData.Device.UnitStatus = 1;
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationMode;
                                                        break;
                                                };
                                                operationModeText = [HeatPump.System[0], HeatPump.System[deviceData.Device.UnitStatus]][mielHvac.power];
                                                break;
                                            case caseZone1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                                switch (value) {
                                                    case 0: //AUTO - HEAT CURVE
                                                        deviceData.Device.OperationModeZone1 = 2;
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                    case 1: //HEAT - HEAT THERMOSTAT / COOL THERMOSTAT
                                                        deviceData.Device.OperationModeZone1 = [0, 3][this.unitStatus];
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                    case 2: //COOL - HEAT FLOW / COOL FLOW
                                                        deviceData.Device.OperationModeZone1 = [1, 4][this.unitStatus];
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                };
                                                operationModeText = HeatPump.ZoneOperation[deviceData.Device.OperationModeZone1];
                                                break;
                                            case caseHotWater: //Hot Water - AUTO, HEAT NOW
                                                switch (value) {
                                                    case 0: //AUTO
                                                        deviceData.Device.ForcedHotWaterMode = false;
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                        break;
                                                    case 1: //HEAT
                                                        deviceData.Device.ForcedHotWaterMode = true;
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                        break;
                                                    case 2: //COOL
                                                        deviceData.Device.ForcedHotWaterMode = false;
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                        break
                                                };
                                                operationModeText = deviceData.Device.OperationMode === 1 ? HeatPump.ForceDhw[1] : HeatPump.ForceDhw[deviceData.Device.ForcedHotWaterMode ? 1 : 0];
                                                break;
                                            case caseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                                switch (value) {
                                                    case 0: //AUTO
                                                        deviceData.Device.OperationModeZone2 = 2;
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                    case 1: //HEAT - HEAT THERMOSTAT / COOL THERMOSTAT
                                                        deviceData.Device.OperationModeZone2 = [0, 3][this.unitStatus];
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                    case 2: //COOL - HEAT FLOW / COOL FLOW
                                                        deviceData.Device.OperationModeZone2 = [1, 4][this.unitStatus];
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                };
                                                operationModeText = HeatPump.ZoneOperation[deviceData.Device.OperationModeZone2];
                                                break;
                                        };

                                        await this.melCloudAtw.send(deviceData);
                                        const info = this.disableLogInfo ? false : this.emit('message', `${zoneName}, Set operation mode: ${operationModeText}`);
                                    } catch (error) {
                                        this.emit('warn', `${zoneName}, Set operation mode error: ${error}`);
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
                                        minStep: mielHvac.temperatureIncrement
                                    })
                                    .onGet(async () => {
                                        const value = zone.setTemperature;
                                        return value;
                                    })
                                    .onSet(async (value) => {
                                        try {
                                            switch (i) {
                                                case caseHeatPump: //Heat Pump
                                                    //deviceData.Device.SetTemperatureZone1 = value;
                                                    //deviceData.Device.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                    break;
                                                case caseZone1: //Zone 1
                                                    switch (zone.operationMode) {
                                                        case 1: //HEAT FLOW
                                                            deviceData.Device.SetHeatFlowTemperatureZone1 = value;
                                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetHeatFlowTemperatureZone1;
                                                            break;
                                                        case 4: //COOL FLOW
                                                            deviceData.Device.SetCoolFlowTemperatureZone1 = value;
                                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetCoolFlowTemperatureZone1;
                                                            break;
                                                        default:
                                                            deviceData.Device.SetTemperatureZone1 = value;
                                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                            break
                                                    };
                                                    break;
                                                case caseHotWater: //Hot Water
                                                    deviceData.Device.SetTankWaterTemperature = value;
                                                    deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetTankWaterTemperature;
                                                    break;
                                                case caseZone2: //Zone 2
                                                    switch (zone.operationMode) {
                                                        case 1: //HEAT FLOW
                                                            deviceData.Device.SetHeatFlowTemperatureZone2 = value;
                                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetHeatFlowTemperatureZone2;
                                                            break;
                                                        case 4: //COOL FLOW
                                                            deviceData.Device.SetCoolFlowTemperatureZone2 = value;
                                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetCoolFlowTemperatureZone2;
                                                            break;
                                                        default:
                                                            deviceData.Device.SetTemperatureZone2 = value;
                                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetTemperatureZone2;
                                                            break
                                                    };
                                                    break;
                                            };

                                            const set = i > 0 ? await this.melCloudAtw.send(deviceData) : false;
                                            const info = this.disableLogInfo || i === 0 ? false : this.emit('message', `${zoneName}, Set cooling threshold temperature: ${value}${mielHvac.temperatureUnit}`);
                                        } catch (error) {
                                            this.emit('warn', `${zoneName}, Set cooling threshold temperature error: ${error}`);
                                        };
                                    });
                            };
                            //device can heat/cool or only heat
                            if (heatCoolModes === 0 || heatCoolModes === 1) {
                                melCloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
                                    .setProps({
                                        minValue: zone.temperaturesSetPropsMinValue,
                                        maxValue: zone.temperaturesSetPropsMaxValue,
                                        minStep: mielHvac.temperatureIncrement
                                    })
                                    .onGet(async () => {
                                        const value = zone.setTemperature;
                                        return value;
                                    })
                                    .onSet(async (value) => {
                                        try {
                                            switch (i) {
                                                case caseHeatPump: //Heat Pump
                                                    //deviceData.Device.SetTemperatureZone1 = value;
                                                    //deviceData.Device.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                    break;
                                                case caseZone1: //Zone 1
                                                    switch (zone.operationMode) {
                                                        case 1: //HEAT FLOW
                                                            deviceData.Device.SetHeatFlowTemperatureZone1 = value;
                                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetHeatFlowTemperatureZone1;
                                                            break;
                                                        case 4: //COOL FLOW
                                                            deviceData.Device.SetCoolFlowTemperatureZone1 = value;
                                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetCoolFlowTemperatureZone1;
                                                            break;
                                                        default:
                                                            deviceData.Device.SetTemperatureZone1 = value;
                                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                            break
                                                    };
                                                    break;
                                                case caseHotWater: //Hot Water
                                                    deviceData.Device.SetTankWaterTemperature = value;
                                                    deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetTankWaterTemperature;
                                                    break;
                                                case caseZone2: //Zone 2
                                                    switch (zone.operationMode) {
                                                        case 1: //HEAT FLOW
                                                            deviceData.Device.SetHeatFlowTemperatureZone2 = value;
                                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetHeatFlowTemperatureZone2;
                                                            break;
                                                        case 4: //COOL FLOW
                                                            deviceData.Device.SetCoolFlowTemperatureZone2 = value;
                                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetCoolFlowTemperatureZone2;
                                                            break;
                                                        default:
                                                            deviceData.Device.SetTemperatureZone2 = value;
                                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetTemperatureZone2;
                                                            break
                                                    };
                                                    break;
                                            };

                                            const set = i > 0 ? await this.melCloudAtw.send(deviceData) : false;
                                            const info = this.disableLogInfo || i === 0 ? false : this.emit('message', `${zoneName}, Set heating threshold temperature: ${value}${mielHvac.temperatureUnit}`);
                                        } catch (error) {
                                            this.emit('warn', `${zoneName}, Set heating threshold temperature error: ${error}`);
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

                                        await this.melCloudAtw.send(deviceData);
                                        const info = this.disableLogInfo ? false : this.emit('message', `${zoneName}, Set lock physical controls: ${value ? 'LOCK' : 'UNLOCK'}`);
                                    } catch (error) {
                                        this.emit('warn', `${zoneName}, Set lock physical controls error: ${error}`);
                                    };
                                });
                            melCloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
                                .onGet(async () => {
                                    const value = mielHvac.useFahrenheit;
                                    return value;
                                })
                                .onSet(async (value) => {
                                    try {
                                        accountInfo.UseFahrenheit = [false, true][value];
                                        await this.melCloud.send(accountInfo);
                                        mielHvac.useFahrenheit = value;
                                        const info = this.disableLogInfo ? false : this.emit('message', `Set temperature display unit: ${TemperatureDisplayUnits[value]}`);
                                    } catch (error) {
                                        this.emit('warn', `Set temperature display unit error: ${error}`);
                                    };
                                });
                            this.melCloudServices.push(melCloudService);
                            accessory.addService(melCloudService);
                            break;
                        case 2: //Thermostat
                            const debug3 = this.enableDebugMode ? this.emit('debug', `Prepare thermostat ${zoneName} service`) : false;
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
                                        switch (i) {
                                            case caseHeatPump: //Heat Pump - HEAT, COOL
                                                switch (value) {
                                                    case 0: //OFF
                                                        deviceData.Device.Power = false;
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power;
                                                        break;
                                                    case 1: //HEAT
                                                        deviceData.Device.Power = true;
                                                        deviceData.Device.UnitStatus = 0;
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationMode;
                                                        break;
                                                    case 2: //COOL
                                                        deviceData.Device.Power = true;
                                                        deviceData.Device.UnitStatus = 1;
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationMode;
                                                        break;
                                                    case 3: //AUTO
                                                        deviceData.Device.Power = true;
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power;
                                                        break;
                                                };
                                                operationModeText = [HeatPump.System[0], HeatPump.System[deviceData.Device.UnitStatus]][mielHvac.power];
                                                break;
                                            case caseZone1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                                switch (value) {
                                                    case 0: //OFF - HEAT CURVE
                                                        deviceData.Device.OperationModeZone1 = 2;
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                    case 1: //HEAT - HEAT THERMOSTAT / COOL THERMOSTAT
                                                        deviceData.Device.OperationModeZone1 = [0, 3][this.unitStatus];
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                    case 2: //COOL - HEAT FLOW / COOL FLOW
                                                        deviceData.Device.OperationModeZone1 = [1, 4][this.unitStatus];
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                    case 3: //AUTO - HEAT CURVE
                                                        deviceData.Device.OperationModeZone1 = 2;
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.OperationModeZone1;
                                                        break;
                                                };
                                                operationModeText = HeatPump.ZoneOperation[deviceData.Device.OperationModeZone1];
                                                break;
                                            case caseHotWater: //Hot Water - AUTO, HEAT NOW
                                                switch (value) {
                                                    case 0: //OFF
                                                        deviceData.Device.ForcedHotWaterMode = false;
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                        break;
                                                    case 1: //HEAT
                                                        deviceData.Device.ForcedHotWaterMode = true;
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                        break;
                                                    case 2: //COOL
                                                        deviceData.Device.ForcedHotWaterMode = false;
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                        break;
                                                    case 3: //AUTO
                                                        deviceData.Device.ForcedHotWaterMode = false;
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                                        break;
                                                };
                                                operationModeText = deviceData.Device.OperationMode === 1 ? HeatPump.ForceDhw[1] : HeatPump.ForceDhw[deviceData.Device.ForcedHotWaterMode ? 1 : 0];
                                                break;
                                            case caseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                                switch (value) {
                                                    case 0: //OFF - HEAT CURVE
                                                        deviceData.Device.OperationModeZone2 = 2;
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                    case 1: //HEAT - HEAT THERMOSTAT / COOL THERMOSTAT
                                                        deviceData.Device.OperationModeZone2 = [0, 3][this.unitStatus];
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                    case 2: //COOL - HEAT FLOW / COOL FLOW
                                                        deviceData.Device.OperationModeZone2 = [1, 4][this.unitStatus];
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                    case 3: //AUTO - HEAT CURVE
                                                        deviceData.Device.OperationModeZone2 = 2;
                                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.OperationModeZone2;
                                                        break;
                                                };
                                                operationModeText = HeatPump.ZoneOperation[deviceData.Device.OperationModeZone2];
                                                break;
                                        };

                                        await this.melCloudAtw.send(deviceData);
                                        const info = this.disableLogInfo ? false : this.emit('message', `${zoneName}, Set operation mode: ${operationModeText}`);
                                    } catch (error) {
                                        this.emit('warn', `${zoneName}, Set operation mode error: ${error}`);
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
                                    minStep: mielHvac.temperatureIncrement
                                })
                                .onGet(async () => {
                                    const value = zone.setTemperature;
                                    return value;
                                })
                                .onSet(async (value) => {
                                    try {
                                        switch (i) {
                                            case caseHeatPump: //Heat Pump
                                                //deviceData.Device.SetTemperatureZone1 = value;
                                                //deviceData.Device.EffectiveFlags = CONSTANTS.HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                break;
                                            case caseZone1: //Zone 1
                                                deviceData.Device.SetTemperatureZone1 = value;
                                                deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetTemperatureZone1;
                                                break;
                                            case caseHotWater: //Hot Water
                                                deviceData.Device.SetTankWaterTemperature = value;
                                                deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetTankWaterTemperature;
                                                break;
                                            case caseZone2: //Zone 2
                                                deviceData.Device.SetTemperatureZone2 = value;
                                                deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.SetTemperatureZone2;
                                                break;
                                        };

                                        const set = i > 0 ? await this.melCloudAtw.send(deviceData) : false;
                                        const info = this.disableLogInfo || i === 0 ? false : this.emit('message', `${zoneName}, Set temperature: ${value}${mielHvac.temperatureUnit}`);
                                    } catch (error) {
                                        this.emit('warn', `${zoneName}, Set temperature error: ${error}`);
                                    };
                                });
                            melCloudServiceT.getCharacteristic(Characteristic.TemperatureDisplayUnits)
                                .onGet(async () => {
                                    const value = mielHvac.useFahrenheit;
                                    return value;
                                })
                                .onSet(async (value) => {
                                    try {
                                        accountInfo.UseFahrenheit = [false, true][value];
                                        await this.melCloud.send(accountInfo);
                                        mielHvac.useFahrenheit = value;
                                        const info = this.disableLogInfo ? false : this.emit('message', `Set temperature display unit: ${TemperatureDisplayUnits[value]}`);
                                    } catch (error) {
                                        this.emit('warn', `Set temperature display unit error: ${error}`);
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
                mielHvac.zonesSensors.forEach((zone, i) => {
                    const zoneName = zone.name
                    const serviceName = `${deviceTypeText} ${accessoryName}: ${zoneName}`;
                    switch (i) {
                        case caseHeatPumpSensor: //Heat Pump
                            if (zone.roomTemperature !== null) {
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
                                        const state = zone.roomTemperature;
                                        return state;
                                    })
                                accessory.addService(this.roomTemperatureSensorService);
                            };

                            if (zone.flowTemperature !== null) {
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
                                        const state = zone.flowTemperature;
                                        return state;
                                    })
                                accessory.addService(this.flowTemperatureSensorService);

                            };

                            if (zone.returnTemperature !== null) {
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
                                        const state = zone.returnTemperature;
                                        return state;
                                    })
                                accessory.addService(this.returnTemperatureSensorService);
                            };
                            break;
                        case caseZone1Sensor: //Zone 1
                            if (zone.roomTemperature !== null) {
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
                                        const state = zone.roomTemperature;
                                        return state;
                                    })
                                accessory.addService(this.roomTemperatureZone1SensorService);
                            };

                            if (zone.flowTemperature !== null) {
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
                                        const state = zone.flowTemperature;
                                        return state;
                                    })
                                accessory.addService(this.flowTemperatureZone1SensorService);
                            };

                            if (zone.returnTemperature !== null) {
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
                                        const state = zone.returnTemperature;
                                        return state;
                                    })
                                accessory.addService(this.returnTemperatureZone1SensorService);
                            };
                            break;
                        case caseHotWaterSensor: //Hot Water
                            if (zone.roomTemperature !== null) {
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
                                        const state = zone.roomTemperature;
                                        return state;
                                    })
                                accessory.addService(this.roomTemperatureWaterTankSensorService);
                            };

                            if (zone.flowTemperature !== null) {
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
                                        const state = zone.flowTemperature;
                                        return state;
                                    })
                                accessory.addService(this.flowTemperatureWaterTankSensorService);
                            };

                            if (zone.returnTemperature !== null) {
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
                                        const state = zone.returnTemperature;
                                        return state;
                                    })
                                accessory.addService(this.returnTemperatureWaterTankSensorService);
                            };
                            break;
                        case caseZone2Sensor: //Zone 2
                            if (zone.roomTemperature !== null) {
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
                                        const state = zone.roomTemperature;
                                        return state;
                                    })
                                accessory.addService(this.roomTemperatureZone2SensorService);
                            };

                            if (zone.flowTemperature !== null) {
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
                                        const state = zone.flowTemperature;
                                        return state;
                                    })
                                accessory.addService(this.flowTemperatureZone2SensorService);
                            };

                            if (zone.returnTemperature !== null) {
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
                                        const state = zone.returnTemperature;
                                        return state;
                                    })
                                accessory.addService(this.returnTemperatureZone2SensorService);
                            };
                            break;
                    };
                });
            };

            //presets services
            if (this.presetsConfiguredCount > 0) {
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare presets services`) : false;
                this.presetsServices = [];
                this.presetsConfigured.forEach((preset, i) => {
                    const presetData = presetsOnServer.find(p => p.ID === preset.Id);

                    //get preset name
                    const name = preset.name;

                    //get preset name prefix
                    const namePrefix = preset.namePrefix;

                    const serviceName = namePrefix ? `${accessoryName} ${name}` : name;
                    const serviceType = preset.serviceType;
                    const characteristicType = preset.characteristicType;
                    const presetService = new serviceType(serviceName, `Preset ${deviceId} ${i}`);
                    presetService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    presetService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                    presetService.getCharacteristic(characteristicType)
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
                                        deviceData.Device.EcoHotWater = presetData.EcoHotWater;
                                        deviceData.Device.OperationModeZone1 = presetData.OperationModeZone1;
                                        deviceData.Device.OperationModeZone2 = presetData.OperationModeZone2;
                                        deviceData.Device.SetTankWaterTemperature = presetData.SetTankWaterTemperature;
                                        deviceData.Device.SetTemperatureZone1 = presetData.SetTemperatureZone1;
                                        deviceData.Device.SetTemperatureZone2 = presetData.SetTemperatureZone2;
                                        deviceData.Device.ForcedHotWaterMode = presetData.ForcedHotWaterMode;
                                        deviceData.Device.SetHeatFlowTemperatureZone1 = presetData.SetHeatFlowTemperatureZone1;
                                        deviceData.Device.SetHeatFlowTemperatureZone2 = presetData.SetHeatFlowTemperatureZone2;
                                        deviceData.Device.SetCoolFlowTemperatureZone1 = presetData.SetCoolFlowTemperatureZone1;
                                        deviceData.Device.SetCoolFlowTemperatureZone2 = presetData.SetCoolFlowTemperatureZone2;
                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power;
                                        break;
                                    case false:
                                        deviceData.Device.Power = preset.previousSettings.Power;
                                        deviceData.Device.EcoHotWater = preset.previousSettings.EcoHotWater;
                                        deviceData.Device.OperationModeZone1 = preset.previousSettings.OperationModeZone1;
                                        deviceData.Device.OperationModeZone2 = preset.previousSettings.OperationModeZone2;
                                        deviceData.Device.SetTankWaterTemperature = preset.previousSettings.SetTankWaterTemperature;
                                        deviceData.Device.SetTemperatureZone1 = preset.previousSettings.SetTemperatureZone1;
                                        deviceData.Device.SetTemperatureZone2 = preset.previousSettings.SetTemperatureZone2;
                                        deviceData.Device.ForcedHotWaterMode = preset.previousSettings.ForcedHotWaterMode;
                                        deviceData.Device.SetHeatFlowTemperatureZone1 = preset.previousSettings.SetHeatFlowTemperatureZone1;
                                        deviceData.Device.SetHeatFlowTemperatureZone2 = preset.previousSettings.SetHeatFlowTemperatureZone2;
                                        deviceData.Device.SetCoolFlowTemperatureZone1 = preset.previousSettings.SetCoolFlowTemperatureZone1;
                                        deviceData.Device.SetCoolFlowTemperatureZone2 = preset.previousSettings.SetCoolFlowTemperatureZone2;
                                        deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power;
                                        break;
                                };

                                await this.melCloudAtw.send(deviceData);
                                const info = this.disableLogInfo ? false : this.emit('message', `${state ? 'Set:' : 'Unset:'} ${name}`);
                            } catch (error) {
                                this.emit('warn', `Set preset error: ${error}`);
                            };
                        });
                    this.presetsServices.push(presetService);
                    accessory.addService(presetService);
                });
            };

            //buttons services
            if (this.buttonsConfiguredCount > 0) {
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare buttons services`) : false;
                this.buttonsServices = [];
                this.buttonsConfigured.forEach((button, i) => {
                    //get button mode
                    const mode = button.mode;

                    //get button display type
                    const displayType = button.displayType;

                    //get button name
                    const name = button.name;

                    //get button name prefix
                    const namePrefix = button.namePrefix;

                    const serviceName = namePrefix ? `${accessoryName} ${name}` : name;
                    const serviceType = button.serviceType;
                    const characteristicType = button.characteristicType;
                    const buttonService = new serviceType(serviceName, `Button ${deviceId} ${i}`);
                    buttonService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    buttonService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                    buttonService.getCharacteristic(characteristicType)
                        .onGet(async () => {
                            const state = button.state;
                            return state;
                        })
                        .onSet(async (state) => {
                            if (displayType > 0 && displayType < 3) {
                                try {
                                    switch (mode) {
                                        case 0: //POWER ON,OFF
                                            deviceData.Device.Power = state;
                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power;
                                            break;
                                        case 1: //HEAT PUMP HEAT
                                            button.previousValue = state ? deviceData.Device.UnitStatus : button.previousValue ?? deviceData.Device.UnitStatus;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.UnitStatus = state ? 0 : button.previousValue;
                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationMode;
                                            break;
                                        case 2: //COOL
                                            button.previousValue = state ? deviceData.Device.UnitStatus : button.previousValue ?? deviceData.Device.UnitStatus;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.UnitStatus = state ? 1 : button.previousValue;
                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationMode;
                                            break;
                                        case 3: //HOLIDAY
                                            deviceData.Device.HolidayMode = state;
                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.HolidayMode;
                                            break;
                                        case 10: //ALL ZONES PHYSICAL LOCK CONTROL
                                            deviceData.Device.ProhibitZone1 = state;
                                            deviceData.Device.ProhibitHotWater = state;
                                            deviceData.Device.ProhibitZone2 = state;
                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.ProhibitHeatingZone1 + HeatPump.EffectiveFlags.ProhibitHotWater + HeatPump.EffectiveFlags.ProhibitHeatingZone2;
                                            break;
                                        case 20: //ZONE 1 HEAT THERMOSTAT
                                            button.previousValue = state ? deviceData.Device.OperationModeZone1 : button.previousValue ?? deviceData.Device.OperationModeZone1;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone1 = state ? 0 : button.previousValue;
                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone1;
                                            break;
                                        case 21: //HEAT FLOW
                                            button.previousValue = state ? deviceData.Device.OperationModeZone1 : button.previousValue ?? deviceData.Device.OperationModeZone1;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone1 = state ? 1 : button.previousValue;
                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone1;
                                            break;
                                        case 22: //HEAT CURVE
                                            button.previousValue = state ? deviceData.Device.OperationModeZone1 : button.previousValue ?? deviceData.Device.OperationModeZone1;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone1 = state ? 2 : button.previousValue;
                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone1;
                                            break;
                                        case 23: //COOL THERMOSTAT
                                            button.previousValue = state ? deviceData.Device.OperationModeZone1 : button.previousValue ?? deviceData.Device.OperationModeZone1;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone1 = state ? 3 : button.previousValue;
                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone1;
                                            break;
                                        case 24: //COOL FLOW
                                            button.previousValue = state ? deviceData.Device.OperationModeZone1 : button.previousValue ?? deviceData.Device.OperationModeZone1;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone1 = state ? 4 : button.previousValue;
                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone1;
                                            break;
                                        case 25: //FLOOR DRY UP
                                            button.previousValue = state ? deviceData.Device.OperationModeZone1 : button.previousValue ?? deviceData.Device.OperationModeZone1;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone1 = state ? 5 : button.previousValue;
                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone1;
                                            break;
                                        case 30: //PHYSICAL LOCK CONTROL
                                            deviceData.Device.ProhibitZone1 = state;
                                            HeatPump.EffectiveFlags.ProhibitHeatingZone1;
                                            break;
                                        case 40: //HOT WATER NORMAL/FORCE HOT WATER
                                            deviceData.Device.Power = true;
                                            deviceData.Device.ForcedHotWaterMode = state;
                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.ForcedHotWaterMode;
                                            break;
                                        case 41: //NORMAL/ECO
                                            deviceData.Device.Power = true;
                                            deviceData.Device.EcoHotWater = state;
                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.EcoHotWater;
                                            break;
                                        case 50: //PHYSICAL LOCK CONTROL
                                            deviceData.Device.ProhibitHotWater = state;
                                            HeatPump.EffectiveFlags.ProhibitHotWater;
                                            break;
                                        case 60: //ZONE 2 HEAT THERMOSTAT
                                            button.previousValue = state ? deviceData.Device.OperationModeZone2 : button.previousValue ?? deviceData.Device.OperationModeZone2;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone2 = state ? 0 : button.previousValue;
                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone2;
                                            break;
                                        case 61: // HEAT FLOW
                                            button.previousValue = state ? deviceData.Device.OperationModeZone2 : button.previousValue ?? deviceData.Device.OperationModeZone2;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone2 = state ? 1 : button.previousValue;
                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone2;
                                            break;
                                        case 62: //HEAT CURVE
                                            button.previousValue = state ? deviceData.Device.OperationModeZone2 : button.previousValue ?? deviceData.Device.OperationModeZone2;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone2 = state ? 2 : button.previousValue;
                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone2;
                                            break;
                                        case 63: //COOL THERMOSTAT
                                            button.previousValue = state ? deviceData.Device.OperationModeZone2 : button.previousValue ?? deviceData.Device.OperationModeZone2;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone2 = state ? 3 : button.previousValue;
                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone2;
                                            break;
                                        case 64: //COOL FLOW
                                            button.previousValue = state ? deviceData.Device.OperationModeZone2 : button.previousValue ?? deviceData.Device.OperationModeZone2;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone2 = state ? 4 : button.previousValue;
                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone2;
                                            break;
                                        case 65: //FLOOR DRY UP
                                            button.previousValue = state ? deviceData.Device.OperationModeZone2 : button.previousValue ?? deviceData.Device.OperationModeZone2;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationModeZone2 = state ? 5 : button.previousValue;
                                            deviceData.Device.EffectiveFlags = HeatPump.EffectiveFlags.Power + HeatPump.EffectiveFlags.OperationModeZone2;
                                            break;
                                        case 70: //PHYSICAL LOCK CONTROL
                                            deviceData.Device.ProhibitZone2 = state;
                                            HeatPump.EffectiveFlags.ProhibitHeatingZone2;
                                            break;
                                        default:
                                            this.emit('message', `Unknown button mode: ${mode}`);
                                            break;
                                    };

                                    await this.melCloudAtw.send(deviceData);
                                    const info = this.disableLogInfo ? false : this.emit('message', `${state ? `Set: ${name}` : `Unset: ${name}, Set: ${button.previousValue}`}`);
                                } catch (error) {
                                    this.emit('warn', `Set button error: ${error}`);
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
            this.melCloudAtw = new MelCloudAtw({
                contextKey: this.contextKey,
                devicesFile: this.devicesFile,
                deviceId: this.deviceId,
                enableDebugMode: this.enableDebugMode
            });

            this.melCloudAtw.on('deviceInfo', (manufacturer, modelIndoor, modelOutdoor, serialNumber, firmwareAppVersion, hasHotWaterTank, hasZone2) => {
                if (!this.displayDeviceInfo) {
                    return;
                }

                if (!this.disableLogDeviceInfo) {
                    this.emit('devInfo', `---- ${this.deviceTypeText}: ${this.deviceName} ----`);
                    this.emit('devInfo', `Account: ${this.accountName}`);
                    const indoor = modelIndoor ? this.emit('devInfo', `Indoor: ${modelIndoor}`) : false;
                    const outdoor = modelOutdoor ? this.emit('devInfo', `Outdoor: ${modelOutdoor}`) : false
                    this.emit('devInfo', `Serial: ${serialNumber}`)
                    this.emit('devInfo', `Firmware: ${firmwareAppVersion}`);
                    this.emit('devInfo', `Manufacturer: ${manufacturer}`);
                    this.emit('devInfo', '----------------------------------');
                    this.emit('devInfo', `Zone 1: Yes`);
                    this.emit('devInfo', `Hot Water Tank: ${hasHotWaterTank ? 'Yes' : 'No'}`);
                    this.emit('devInfo', `Zone 2: ${hasZone2 ? 'Yes' : 'No'}`);
                    this.emit('devInfo', '----------------------------------');
                };

                //accessory info
                this.manufacturer = manufacturer;
                this.model = modelIndoor ? modelIndoor : modelOutdoor ? modelOutdoor : `${this.deviceTypeText} ${this.deviceId}`;
                this.serialNumber = serialNumber;
                this.firmwareRevision = firmwareAppVersion;
                this.displayDeviceInfo = false;
            })
                .on('deviceState', async (deviceData) => {
                    this.deviceData = deviceData;

                    //presets
                    const presetsOnServer = deviceData.Presets ?? [];

                    //device info
                    const hasHeatPump = ![1, 2, 3, 4, 5, 6, 7, 15].includes(this.hideZone);
                    const hasZone1 = ![2, 3, 4, 8, 9, 10, 11, 15].includes(this.hideZone);
                    const hasHotWaterTank = ![3, 5, 6, 9, 10, 12, 13, 15].includes(this.hideZone) && deviceData.Device.HasHotWaterTank;
                    const hasZone2 = ![4, 6, 7, 10, 11, 13, 14, 15].includes(this.hideZone) && deviceData.Device.HasZone2;
                    const canHeat = deviceData.Device.CanHeat ?? false;
                    const canCool = deviceData.Device.CanCool ?? false;
                    const heatCoolModes = canHeat && canCool ? 0 : canHeat ? 1 : canCool ? 2 : 3;
                    const temperatureIncrement = deviceData.Device.TemperatureIncrement ?? 1;
                    const minSetTemperature = deviceData.Device.MinSetTemperature ?? 10;
                    const maxSetTemperature = deviceData.Device.MaxSetTemperature ?? 30;
                    const maxTankTemperature = deviceData.Device.MaxTankTemperature ?? 70;

                    //zones
                    let currentZoneCase = 0;
                    const caseHeatPump = hasHeatPump ? currentZoneCase++ : -1;
                    const caseZone1 = hasZone1 ? currentZoneCase++ : -1;
                    const caseHotWater = hasHotWaterTank ? currentZoneCase++ : -1;
                    const caseZone2 = hasZone2 ? currentZoneCase++ : -1;
                    const zonesCount = currentZoneCase;

                    //zones sensors
                    let currentZoneSensorCase = 0;
                    const caseHeatPumpSensor = this.temperatureSensor || this.temperatureSensorFlow || this.temperatureSensorReturn ? currentZoneSensorCase++ : -1;
                    const caseZone1Sensor = this.temperatureSensorFlowZone1 || this.temperatureSensorReturnZone1 ? currentZoneSensorCase++ : -1;
                    const caseHotWaterSensor = (this.temperatureSensorFlowWaterTank || this.temperatureSensorReturnWaterTank) && deviceData.Device.HasHotWaterTank ? currentZoneSensorCase++ : -1;
                    const caseZone2Sensor = (this.temperatureSensorFlowZone2 || this.temperatureSensorReturnZone2) && deviceData.Device.HasZone2 ? currentZoneSensorCase++ : -1;
                    const zonesSensorsCount = currentZoneSensorCase;

                    //heat pump
                    const heatPumpName = 'Heat Pump';
                    const power = deviceData.Device.Power ?? false;
                    const unitStatus = deviceData.Device.UnitStatus ?? 0;
                    const operationMode = deviceData.Device.OperationMode;
                    const outdoorTemperature = deviceData.Device.OutdoorTemperature;
                    const holidayMode = deviceData.Device.HolidayMode ?? false;
                    const flowTemperatureHeatPump = deviceData.Device.FlowTemperature;
                    const returnTemperatureHeatPump = deviceData.Device.ReturnTemperature;

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
                        power: power ? 1 : 0,
                        unitStatus: unitStatus,
                        idleZone1: idleZone1,
                        idleZone2: idleZone2,
                        temperatureIncrement: temperatureIncrement,
                        hasHeatPump: hasHeatPump,
                        hasZone1: hasZone1,
                        hasHotWaterTank: hasHotWaterTank,
                        hasZone2: hasZone2,
                        heatCoolModes: heatCoolModes,
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
                        temperatureUnit: this.useFahrenheit,
                        zones: [{}, {}, {}, {}],
                        zonesSensors: [{}, {}, {}, {}]
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

                    //zones
                    for (let i = 0; i < zonesCount; i++) {
                        switch (this.displayMode) {
                            case 1: //Heater Cooler
                                switch (i) {
                                    case caseHeatPump: //Heat Pump Operation Mode - IDLE, HOT WATER, HEATING ZONES, COOLING, HOT WATER STORAGE, FREEZE STAT, LEGIONELLA, HEATING ECO, MODE 1, MODE 2, MODE 3, HEATING UP /// Unit Status - HEAT, COOL
                                        name = heatPumpName;
                                        operationModeZone = operationMode;
                                        currentOperationMode = !power ? 0 : [1, 2, 2, 3, 2, 1, 1, 2, 1, 1, 1, 2][operationMode]; //INACTIVE, IDLE, HEATING, COOLING
                                        targetOperationMode = [1, 2][unitStatus]; //AUTO, HEAT, COOL
                                        roomTemperature = outdoorTemperature;
                                        setTemperature = outdoorTemperature;

                                        lockPhysicalControl = hasHotWaterTank && hasZone2 ? (prohibitZone1 && prohibitHotWater && prohibitZone2 ? 1 : 0) : hasHotWaterTank ? (prohibitZone1 && prohibitHotWater ? 1 : 0) : hasZone2 ? (prohibitZone1 && prohibitZone2 ? 1 : 0) : 0;
                                        operationModeSetPropsMinValue = [1, 1, 2, 0][heatCoolModes];
                                        operationModeSetPropsMaxValue = [2, 1, 2, 0][heatCoolModes];
                                        operationModeSetPropsValidValues = [[1, 2], [1], [2], [0]][heatCoolModes];
                                        temperatureSetPropsMinValue = -35;
                                        temperatureSetPropsMaxValue = 100;
                                        break;
                                    case caseZone1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                        name = zone1Name;
                                        operationModeZone = operationMode;
                                        currentOperationMode = !power ? 0 : idleZone1 ? 1 : [2, 2, 2, 3, 3, 2][operationModeZone1]; //INACTIVE, IDLE, HEATING, COOLING
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
                                        currentOperationMode = !power ? 0 : operationMode === 1 ? 2 : [1, 2][forcedHotWaterMode]; //INACTIVE, IDLE, HEATING, COOLING
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
                                        currentOperationMode = !power ? 0 : idleZone2 ? 1 : [2, 2, 2, 3, 3, 2][operationModeZone2]; //INACTIVE, IDLE, HEATING, COOLING
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
                                if (this.melCloudServices) {
                                    this.melCloudServices[i]
                                        .updateCharacteristic(Characteristic.Active, power)
                                        .updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentOperationMode)
                                        .updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetOperationMode)
                                        .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                                        .updateCharacteristic(Characteristic.LockPhysicalControls, lockPhysicalControl)
                                        .updateCharacteristic(Characteristic.TemperatureDisplayUnits, obj.useFahrenheit);
                                    const updateDefCool = heatCoolModes === 0 || heatCoolModes === 2 ? this.melCloudServices[i].updateCharacteristic(Characteristic.CoolingThresholdTemperature, setTemperature) : false;
                                    const updateDefHeat = heatCoolModes === 0 || heatCoolModes === 1 ? this.melCloudServices[i].updateCharacteristic(Characteristic.HeatingThresholdTemperature, setTemperature) : false;
                                }
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
                                        name = zone2Name;
                                        operationModeZone = operationMode;
                                        currentOperationMode = !power ? 0 : idleZone2 ? 0 : [1, 1, 1, 2, 2, 1][operationModeZone2]; //OFF, HEAT, COOL
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
                                if (this.melCloudServices) {
                                    this.melCloudServices[i]
                                        .updateCharacteristic(Characteristic.CurrentHeatingCoolingState, currentOperationMode)
                                        .updateCharacteristic(Characteristic.TargetHeatingCoolingState, targetOperationMode)
                                        .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                                        .updateCharacteristic(Characteristic.TargetTemperature, setTemperature)
                                        .updateCharacteristic(Characteristic.TemperatureDisplayUnits, obj.useFahrenheit);
                                }
                                break;
                        };

                        //add obj to zones arrays
                        const objZ = {
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
                            operationModesSetPropsValidValues: operationModeSetPropsValidValues,
                        };
                        obj.zones[i] = objZ;

                        //log current state
                        if (!this.disableLogInfo) {
                            let operationModeText = '';
                            switch (i) {
                                case caseHeatPump: //Heat Pump - HEAT, COOL, OFF
                                    this.emit('message', `${heatPumpName}, Power: ${power ? 'ON' : 'OFF'}`)
                                    this.emit('message', `${heatPumpName}, Operation mode: ${HeatPump.System[unitStatus]}`);
                                    this.emit('message', `${heatPumpName},'Outdoor temperature: ${roomTemperature}${obj.temperatureUnit}`);
                                    this.emit('message', `${heatPumpName}, Temperature display unit: ${obj.temperatureUnit}`);
                                    this.emit('message', `${heatPumpName}, Lock physical controls: ${lockPhysicalControl ? 'LOCKED' : 'UNLOCKED'}`);
                                    break;
                                case caseZone1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                    operationModeText = idleZone1 ? HeatPump.ZoneOperation[6] : HeatPump.ZoneOperation[operationModeZone1];
                                    this.emit('message', `${zone1Name}, Operation mode: ${operationModeText}`);
                                    this.emit('message', `${zone1Name}, Temperature: ${roomTemperature}${obj.temperatureUnit}`);
                                    this.emit('message', `${zone1Name}, Target temperature: ${setTemperature}${obj.temperatureUnit}`)
                                    this.emit('message', `${zone1Name}, Temperature display unit: ${obj.temperatureUnit}`);
                                    this.emit('message', `${zone1Name}, Lock physical controls: ${lockPhysicalControl ? 'LOCKED' : 'UNLOCKED'}`);
                                    break;
                                case caseHotWater: //Hot Water - AUTO, HEAT NOW
                                    operationModeText = operationMode === 1 ? HeatPump.ForceDhw[1] : HeatPump.ForceDhw[forcedHotWaterMode ? 1 : 0];
                                    this.emit('message', `${hotWaterName}, Operation mode: ${operationModeText}`);
                                    this.emit('message', `${hotWaterName}, Temperature: ${roomTemperature}${obj.temperatureUnit}`);
                                    this.emit('message', `${hotWaterName}, Target temperature: ${setTemperature}${obj.temperatureUnit}`)
                                    this.emit('message', `${hotWaterName}, Temperature display unit: ${obj.temperatureUnit}`);
                                    this.emit('message', `${hotWaterName}, Lock physical controls: ${lockPhysicalControl ? 'LOCKED' : 'UNLOCKED'}`);
                                    break;
                                case caseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                    operationModeText = idleZone2 ? HeatPump.ZoneOperation[6] : HeatPump.ZoneOperation[operationModeZone2];
                                    this.emit('message', `${zone2Name}, Operation mode: ${operationModeText}`);
                                    this.emit('message', `${zone2Name}, Temperature: ${roomTemperature}${obj.temperatureUnit}`);
                                    this.emit('message', `${zone2Name}, Target temperature: ${setTemperature}${obj.temperatureUnit}`)
                                    this.emit('message', `${zone2Name}, Temperature display unit: ${obj.temperatureUnit}`);
                                    this.emit('message', `${zone2Name}, Lock physical controls: ${lockPhysicalControl ? 'LOCKED' : 'UNLOCKED'}`);
                                    break;
                            };
                        };
                    };

                    //sensors
                    for (let i = 0; i < zonesSensorsCount; i++) {
                        switch (i) {
                            case caseHeatPumpSensor: //Heat Pump
                                name = heatPumpName;
                                roomTemperature = outdoorTemperature;
                                flowTemperature = flowTemperatureHeatPump;
                                returnTemperature = returnTemperatureHeatPump;

                                //updte characteristics
                                if (this.roomTemperatureSensorService) {
                                    this.roomTemperatureSensorService
                                        .updateCharacteristic(Characteristic.CurrentTemperature, outdoorTemperature)
                                };

                                if (this.flowTemperatureSensorService) {
                                    this.flowTemperatureSensorService
                                        .updateCharacteristic(Characteristic.CurrentTemperature, flowTemperatureHeatPump)
                                };

                                if (this.returnTemperatureSensorService) {
                                    this.returnTemperatureSensorService
                                        .updateCharacteristic(Characteristic.CurrentTemperature, returnTemperatureHeatPump)
                                };
                                break;
                            case caseZone1Sensor: //Zone 1
                                name = zone1Name;
                                roomTemperature = roomTemperatureZone1;
                                flowTemperature = flowTemperatureZone1;
                                returnTemperature = returnTemperatureZone1;

                                //updte characteristics
                                if (this.roomTemperatureZone1SensorService) {
                                    this.roomTemperatureZone1SensorService
                                        .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperatureZone1)
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
                            case caseHotWaterSensor: //Hot Water
                                name = hotWaterName;
                                roomTemperature = tankWaterTemperature;
                                flowTemperature = flowTemperatureWaterTank;
                                returnTemperature = returnTemperatureWaterTank;

                                //updte characteristics
                                if (this.roomTemperatureWaterTankSensorService) {
                                    this.roomTemperatureWaterTankSensorService
                                        .updateCharacteristic(Characteristic.CurrentTemperature, tankWaterTemperature)
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
                            case caseZone2Sensor: //Zone 2
                                name = zone2Name;
                                roomTemperature = roomTemperatureZone2;
                                flowTemperature = flowTemperatureZone2;
                                returnTemperature = returnTemperatureZone2;

                                //updte characteristics
                                if (this.roomTemperatureZone2SensorService) {
                                    this.roomTemperatureZone2SensorService
                                        .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperatureZone2)
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

                        //add obj to sensors arrays
                        const objS = {
                            name: name,
                            roomTemperature: roomTemperature,
                            flowTemperature: flowTemperature,
                            returnTemperature: returnTemperature
                        };
                        obj.zonesSensors[i] = objS;

                        //log current state
                        if (!this.disableLogInfo) {
                            switch (i) {
                                case caseHeatPumpSensor: //Heat Pump - HEAT, COOL, OFF
                                    const info = outdoorTemperature !== null ? this.emit('message', `${heatPumpName}, Outdoor temperature: ${outdoorTemperature}${obj.temperatureUnit}`) : false;
                                    const info0 = flowTemperatureHeatPump !== null ? this.emit('message', `${heatPumpName}, Flow temperature: ${flowTemperatureHeatPump}${obj.temperatureUnit}`) : false;
                                    const info1 = returnTemperatureHeatPump !== null ? this.emit('message', `${heatPumpName}, Return temperature: ${returnTemperatureHeatPump}${obj.temperatureUnit}`) : false;
                                    break;
                                case caseZone1Sensor: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                    const info2 = roomTemperatureZone1 !== null ? this.emit('message', `${zone1Name}, Room temperature: ${roomTemperatureZone1}${obj.temperatureUnit}`) : false;
                                    const info3 = flowTemperatureZone1 !== null ? this.emit('message', `${zone1Name}, Flow temperature: ${flowTemperatureZone1}${obj.temperatureUnit}`) : false;
                                    const info4 = returnTemperatureZone1 !== null ? this.emit('message', `${zone1Name}, Return temperature: ${returnTemperatureZone1}${obj.temperatureUnit}`) : false;
                                    break;
                                case caseHotWaterSensor: //Hot Water - AUTO, HEAT NOW
                                    const info5 = tankWaterTemperature !== null ? this.emit('message', `${hotWaterName}, Temperature: ${tankWaterTemperature}${obj.temperatureUnit}`) : false;
                                    const info6 = flowTemperatureWaterTank !== null ? this.emit('message', `${hotWaterName}, Flow temperature: ${flowTemperatureWaterTank}${obj.temperatureUnit}`) : false;
                                    const info7 = returnTemperatureWaterTank !== null ? this.emit('message', `${hotWaterName}, Return temperature: ${returnTemperatureWaterTank}${obj.temperatureUnit}`) : false;
                                    break;
                                case caseZone2Sensor: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRY UP
                                    const info8 = roomTemperatureZone2 !== null ? this.emit('message', `${zone2Name}, Room temperature: ${roomTemperatureZone2}${obj.temperatureUnit}`) : false;
                                    const info9 = flowTemperatureZone2 !== null ? this.emit('message', `${zone2Name}, Flow temperature: ${flowTemperatureZone2}${obj.temperatureUnit}`) : false;
                                    const info10 = returnTemperatureZone2 !== null ? this.emit('message', `${zone2Name}, Return temperature: ${returnTemperatureZone2}${obj.temperatureUnit}`) : false;
                                    break;
                            };
                        };
                    };

                    //add obj to mielHvac
                    this.mielHvac = obj;

                    //update presets state
                    if (this.presetsConfigured.length > 0) {
                        this.presetsConfigured.forEach((preset, i) => {
                            const presetData = presetsOnServer.find(p => p.ID === preset.Id);

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

                            if (this.presetsServices) {
                                const characteristicType = preset.characteristicType;
                                this.presetsServices[i]
                                    .updateCharacteristic(characteristicType, preset.state)
                            };
                        });
                    };

                    //update buttons state
                    if (this.buttonsConfiguredCount > 0) {
                        this.buttonsConfigured.forEach((button, i) => {
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
                                    this.emit('warn', `Unknown button mode: ${mode} detected`);
                                    break;
                            };

                            //update services
                            if (this.buttonsServices) {
                                const characteristicType = button.characteristicType;
                                this.buttonsServices[i]
                                    .updateCharacteristic(characteristicType, button.state)
                            };
                        });
                    };

                    //prepare accessory
                    if (this.startPrepareAccessory) {
                        const accessory = await this.prepareAccessory(this.accountInfo, deviceData, this.deviceId, this.deviceTypeText, this.deviceName, this.accountName);
                        this.emit('publishAccessory', accessory);
                        this.startPrepareAccessory = false;
                    }
                })
                .on('success', (success) => {
                    this.emit('success', success);
                })
                .on('info', (info) => {
                    this.emit('info', info);
                })
                .on('debug', (debug) => {
                    this.emit('debug', debug);
                })
                .on('warn', (warn) => {
                    this.emit('warn', warn);
                })
                .on('error', (error) => {
                    this.emit('error', error);
                })
                .on('restFul', (path, data) => {
                    const restFul = this.restFulConnected ? this.restFul1.update(path, data) : false;
                })
                .on('mqtt', (topic, message) => {
                    const mqtt = this.mqttConnected ? this.mqtt1.emit('publish', topic, message) : false;
                });

            //start external integrations
            const startExternalIntegrations = this.restFul.enable || this.mqtt.enable ? await this.externalIntegrations() : false;

            //check state
            await this.melCloudAtw.checkState();

            return true;
        } catch (error) {
            throw new Error(`Start error: ${error}`);
        };
    };
};
export default DeviceAtw;
