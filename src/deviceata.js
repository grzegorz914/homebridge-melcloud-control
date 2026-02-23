import EventEmitter from 'events';
import MelCloudAta from './melcloudata.js';
import RestFul from './restful.js';
import Mqtt from './mqtt.js';
import Functions from './functions.js';
import { TemperatureDisplayUnits, AirConditioner, DeviceType } from './constants.js';
let Accessory, Characteristic, Service, Categories, AccessoryUUID;

class DeviceAta extends EventEmitter {
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
        this.heatDryFanMode = device.heatDryFanMode || 1; //NONE, HEAT, DRY, FAN
        this.coolDryFanMode = device.coolDryFanMode || 1; //NONE, COOL, DRY, FAN
        this.autoDryFanMode = device.autoDryFanMode || 1; //NONE, AUTO, DRY, FAN
        this.temperatureRoomSensor = device.temperatureRoomSensor || false;
        this.temperatureOutdoorSensor = device.temperatureOutdoorSensor || false;
        this.inStandbySensor = device.inStandbySensor || false;
        this.connectSensor = device.connectSensor || false;
        this.errorSensor = device.errorSensor || false;
        this.frostProtectionSupport = device.frostProtectionSupport || false;
        this.overheatProtectionSupport = device.overheatProtectionSupport || false;
        this.holidayModeSupport = device.holidayModeSupport || false;
        this.remoteRoomTemperatureSupport = device.remoteRoomTemperatureSupport || false;
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
        this.remoteRoomTemperature = 20;
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

        return true;
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
                case 'OperationMode':
                    payload.operationMode = value;
                    flag = AirConditioner.EffectiveFlags.OperationMode
                    break;
                case 'SetTemperature':
                    payload.setTemperature = value;
                    flag = AirConditioner.EffectiveFlags.SetTemperature;
                    break;
                case 'DefaultCoolingSetTemperature':
                    payload.defaultCoolingSetTemperature = value;
                    flag = AirConditioner.EffectiveFlags.SetTemperature;
                    break;
                case 'DefaultHeatingSetTemperature':
                    payload.defaultHeatingSetTemperature = value;
                    flag = AirConditioner.EffectiveFlags.SetTemperature;
                    break;
                case 'FanSpeed':
                    key = accountTypeMelCloud ? 'fanSpeed' : 'setFanSpeed';
                    payload[key] = value;
                    flag = AirConditioner.EffectiveFlags.SetFanSpeed;
                    break;
                case 'VaneHorizontalDirection':
                    payload.vaneHorizontalDirection = value;
                    flag = AirConditioner.EffectiveFlags.VaneHorizontalDirection;
                    break;
                case 'VaneVerticalDirection':
                    payload.vaneVerticalDirection = value;
                    flag = AirConditioner.EffectiveFlags.VaneVerticalDirection;
                    break;
                case 'ProhibitSetTemperature':
                    if (!accountTypeMelCloud) return;
                    payload.prohibitSetTemperature = value;
                    flag = AirConditioner.EffectiveFlags.Prohibit;
                    break;
                case 'ProhibitOperationMode':
                    if (!accountTypeMelCloud) return;
                    payload.prohibitOperationMode = value;
                    flag = AirConditioner.EffectiveFlags.Prohibit;
                    break;
                case 'ProhibitPower':
                    if (!accountTypeMelCloud) return;
                    payload.prohibitOperationMode = value;
                    flag = AirConditioner.EffectiveFlags.Prohibit;
                    break;
                case 'FrostProtection':
                    if (accountTypeMelCloud) return;
                    payload.enabled = value;
                    flag = 'frostprotection';
                    break;
                case 'OverheatProtection':
                    if (accountTypeMelCloud) return;
                    payload.enabled = value;
                    flag = 'overheatprotection';
                    break;
                case 'Schedules':
                    if (accountTypeMelCloud) return;
                    payload.enabled = value;
                    flag = 'schedule';
                    break;
                case 'HolidayMode':
                    if (accountTypeMelCloud) return;
                    payload.enabled = value;
                    flag = 'holidaymode';
                    break;
                case 'RemoteRoomTemperature':
                    this.remoteRoomTemperature = value;
                    return;
                default:
                    this.emit('warn', `${integration}, received key: ${key}, value: ${value}`);
                    return;
            };

            set = await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload, flag);
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
            const supportsHeat = this.accessory.supportsHeat;
            const supportsDry = this.accessory.supportsDry;
            const supportsCool = this.accessory.supportsCool;
            const supportsAuto = this.accessory.supportsAuto;
            const supportsFanSpeed = this.accessory.supportsFanSpeed;
            const supportsAutomaticFanSpeed = this.accessory.supportsAutomaticFanSpeed;
            const supportsOutdoorTemperature = this.accessory.supportsOutdoorTemperature;
            const numberOfFanSpeeds = this.accessory.numberOfFanSpeeds;
            const supportsSwingFunction = this.accessory.supportsSwingFunction;
            const supportsVideWane = this.accessory.supportsVideWane;
            const autoDryFanMode = [this.accessory.operationMode, 8, supportsDry ? 2 : 8, 7][this.autoDryFanMode]; //NONE, AUTO - 8, DRY - 2, FAN - 7
            const heatDryFanMode = [this.accessory.operationMode, 1, supportsDry ? 2 : 1, 7][this.heatDryFanMode]; //NONE, HEAT - 1, DRY - 2, FAN - 7
            const coolDryFanMode = [this.accessory.operationMode, 3, supportsDry ? 2 : 3, 7][this.coolDryFanMode]; //NONE, COOL - 3, DRY - 2, FAN - 7

            //accessory
            if (this.logDebug) this.emit('debug', `Prepare accessory`);
            const accessoryName = deviceName;
            const accessoryUUID = AccessoryUUID.generate(accountName + deviceId.toString());
            const accessoryCategory = Categories.AIR_CONDITIONER;
            const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

            //information service
            if (this.logDebug) this.emit('debug', `Prepare information service`);
            this.informationService = accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
                .setCharacteristic(Characteristic.Model, this.model)
                .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
                .setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision)
                .setCharacteristic(Characteristic.ConfiguredName, accessoryName);

            //melcloud services
            const serviceName = `${deviceTypeString} ${accessoryName}`;
            switch (this.displayType) {
                case 1: //Heater Cooler
                    if (this.logDebug) this.emit('debug', `Prepare heater/cooler service`);
                    const melCloudService = new Service.HeaterCooler(serviceName, `HeaterCooler ${deviceId}`);
                    melCloudService.setPrimaryService(true);
                    melCloudService.getCharacteristic(Characteristic.Active)
                        .onGet(async () => {
                            const state = this.accessory.power;
                            return state;
                        })
                        .onSet(async (state) => {
                            try {
                                const payload = { power: state ? true : false };
                                if (this.logInfo) this.emit('info', `Set power: ${state ? 'On' : 'Off'}`);
                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Set power error: ${error}`);
                            };
                        });
                    melCloudService.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
                        .onGet(async () => {
                            const value = this.accessory.currentOperationMode;
                            return value;
                        });
                    melCloudService.getCharacteristic(Characteristic.TargetHeaterCoolerState)
                        .setProps({
                            minValue: this.accessory.operationModeSetPropsMinValue,
                            maxValue: this.accessory.operationModeSetPropsMaxValue,
                            validValues: this.accessory.operationModeSetPropsValidValues
                        })
                        .onGet(async () => {
                            const value = this.accessory.targetOperationMode; //1 = HEAT, 2 = DRY 3 = COOL, 7 = FAN, 8 = AUTO
                            return value;
                        })
                        .onSet(async (value) => {
                            try {
                                switch (value) {
                                    case 0: //AUTO - AUTO
                                        value = autoDryFanMode;
                                        break;
                                    case 1: //HEAT - HEAT
                                        value = heatDryFanMode;
                                        break;
                                    case 2: //COOL - COOL
                                        value = coolDryFanMode;
                                        break;
                                };

                                const payload = { operationMode: value };
                                if (this.logInfo) this.emit('info', `Set operation mode: ${AirConditioner.OperationModeMapEnumToString[value]}`);
                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload, AirConditioner.EffectiveFlags.OperationMode);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Set operation mode error: ${error}`);
                            };
                        });
                    melCloudService.getCharacteristic(Characteristic.CurrentTemperature)
                        .onGet(async () => {
                            const value = this.accessory.roomTemperature;
                            return value;
                        });
                    if (supportsFanSpeed) {
                        melCloudService.getCharacteristic(Characteristic.RotationSpeed)
                            .setProps({
                                minValue: 0,
                                maxValue: this.accessory.fanSpeedSetPropsMaxValue,
                                minStep: 1
                            })
                            .onGet(async () => {
                                const value = this.accessory.currentFanSpeed; //AUTO, 1, 2, 3, 4, 5, 6, OFF
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    const payload = {};
                                    const fanKeySet = accountTypeMelCloud ? 'fanSpeed' : 'setFanSpeed';
                                    switch (numberOfFanSpeeds) {
                                        case 2: //Fan speed mode 2
                                            value = supportsAutomaticFanSpeed ? [0, 1, 2, 0][value] : [1, 1, 2][value];
                                            break;
                                        case 3: //Fan speed mode 3
                                            value = supportsAutomaticFanSpeed ? [0, 1, 2, 3, 0][value] : [1, 1, 2, 3][value];
                                            break;
                                        case 4: //Fan speed mode 4
                                            value = supportsAutomaticFanSpeed ? [0, 1, 2, 3, 4, 0][value] : [1, 1, 2, 3, 4][value];
                                            break;
                                        case 5: //Fan speed mode 5
                                            value = supportsAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 0][value] : [1, 1, 2, 3, 4, 5][value];
                                            break;
                                    };

                                    payload[fanKeySet] = value;
                                    if (this.logInfo) this.emit('info', `Set fan speed mode: ${AirConditioner.FanSpeedMapEnumToString[value]}`);
                                    await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload, AirConditioner.EffectiveFlags.SetFanSpeed);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `Set fan speed mode error: ${error}`);
                                };
                            });
                    };
                    if (supportsSwingFunction) {
                        melCloudService.getCharacteristic(Characteristic.SwingMode)
                            .onGet(async () => {
                                //Vane Horizontal: Auto, 1, 2, 3, 4, 5, 6, 7 = Split, 12 = Swing //Vertical: Auto, 1, 2, 3, 4, 5, 7 = Swing
                                //Home Vane Horizontal: Auto, 1, 2, 3, 4, 5, 6, 7 = Swing, 8 = Split //Vertical: Auto, 1, 2, 3, 4, 5, 6 = Swing
                                const value = this.accessory.currentSwingMode;
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    const payload = {};
                                    if (supportsVideWane) payload.vaneHorizontalDirection = value ? 12 : 0;
                                    payload.vaneVerticalDirection = value ? 7 : 0;
                                    if (this.logInfo) this.emit('info', `Set air direction mode: ${AirConditioner.AirDirectionMapEnumToString[value]}`);
                                    await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload, AirConditioner.EffectiveFlags.VaneVerticalVaneHorizontal);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `Set air direction mode error: ${error}`);
                                };
                            });
                    };
                    melCloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature) // 16 - 31
                        .setProps({
                            minValue: this.accessory.minSetCoolDryAutoRoomTemperature,
                            maxValue: this.accessory.maxSetHeatCoolDryAutoRoomTemperature,
                            minStep: this.accessory.temperatureStep
                        })
                        .onGet(async () => {
                            const value = this.accessory.operationMode === 8 ? this.accessory.defaultCoolingSetTemperature : this.accessory.setTemperature;
                            return value;
                        })
                        .onSet(async (value) => {
                            try {
                                if (this.accessory.operationMode === 8) deviceData.Device.DefaultCoolingSetTemperature = value < 16 ? 16 : value;
                                const payload = { setTemperature: value < 16 ? 16 : value };
                                if (this.logInfo) this.emit('info', `Set cooling threshold temperature: ${value}${this.accessory.temperatureUnit}`);
                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload, AirConditioner.EffectiveFlags.SetTemperature);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Set cooling threshold temperature error: ${error}`);
                            };
                        });
                    if (supportsHeat) {
                        melCloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature) // 10 - 31
                            .setProps({
                                minValue: this.accessory.minSetHeatRoomTemperature,
                                maxValue: this.accessory.maxSetHeatCoolDryAutoRoomTemperature,
                                minStep: this.accessory.temperatureStep
                            })
                            .onGet(async () => {
                                const value = this.accessory.operationMode === 8 ? this.accessory.defaultHeatingSetTemperature : this.accessory.setTemperature;
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    if (this.accessory.operationMode === 8) deviceData.Device.DefaultHeatingSetTemperature = value;
                                    const payload = { setTemperature: value };
                                    if (this.logInfo) this.emit('info', `Set heating threshold temperature: ${value}${this.accessory.temperatureUnit}`);
                                    await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload, AirConditioner.EffectiveFlags.SetTemperature);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `Set heating threshold temperature error: ${error}`);
                                };
                            });
                    };
                    melCloudService.getCharacteristic(Characteristic.LockPhysicalControls)
                        .onGet(async () => {
                            const value = this.accessory.lockPhysicalControl;
                            return value;
                        })
                        .onSet(async (value) => {
                            if (!accountTypeMelCloud) return;

                            try {
                                value = value ? true : false;

                                const payload = {};
                                payload.prohibitSetTemperature = value;
                                payload.prohibitOperationMode = value;
                                payload.prohibitPower = value;
                                if (this.logInfo) this.emit('info', `Set local physical controls: ${value ? 'Lock' : 'Unlock'}`);
                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload, AirConditioner.EffectiveFlags.Prohibit);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Set lock physical controls error: ${error}`);
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
                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload, 'account');
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Set temperature display unit error: ${error}`);
                            };
                        });
                    this.melCloudService = melCloudService;
                    accessory.addService(melCloudService);
                    break;
                case 2: //Thermostat
                    if (this.logDebug) this.emit('debug', `Prepare thermostat service`);
                    const melCloudServiceT = new Service.Thermostat(serviceName, `Thermostat ${deviceId}`);
                    melCloudServiceT.setPrimaryService(true);
                    melCloudServiceT.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
                        .onGet(async () => {
                            const value = this.accessory.currentOperationMode;
                            return value;
                        });
                    melCloudServiceT.getCharacteristic(Characteristic.TargetHeatingCoolingState)
                        .setProps({
                            minValue: this.accessory.operationModeSetPropsMinValue,
                            maxValue: this.accessory.operationModeSetPropsMaxValue,
                            validValues: this.accessory.operationModeSetPropsValidValues
                        })
                        .onGet(async () => {
                            const value = this.accessory.targetOperationMode; //1 = HEAT, 2 = DRY 3 = COOL, 7 = FAN, 8 = AUTO
                            return value;
                        })
                        .onSet(async (value) => {
                            try {
                                let flag = null;
                                switch (value) {
                                    case 0: //OFF - POWER OFF
                                        value = deviceData.Device.OperationMode;
                                        break;
                                    case 1: //HEAT - HEAT
                                        value = heatDryFanMode;
                                        flag = AirConditioner.EffectiveFlags.OperationModeSetTemperature;
                                        break;
                                    case 2: //COOL - COOL
                                        value = coolDryFanMode;
                                        flag = AirConditioner.EffectiveFlags.OperationModeSetTemperature
                                        break;
                                    case 3: //AUTO - AUTO
                                        value = autoDryFanMode;
                                        flag = AirConditioner.EffectiveFlags.OperationModeSetTemperature;
                                        break;
                                };

                                const payload = { operationMode: value };
                                if (this.logInfo) this.emit('info', `Set operation mode: ${AirConditioner.OperationModeMapEnumToString[value]}`);
                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload, flag);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Set operation mode error: ${error}`);
                            };
                        });
                    melCloudServiceT.getCharacteristic(Characteristic.CurrentTemperature)
                        .onGet(async () => {
                            const value = this.accessory.roomTemperature;
                            return value;
                        });
                    melCloudServiceT.getCharacteristic(Characteristic.TargetTemperature)
                        .setProps({
                            minValue: this.accessory.minSetCoolDryAutoRoomTemperature,
                            maxValue: this.accessory.maxSetHeatCoolDryAutoRoomTemperature,
                            minStep: this.accessory.temperatureStep
                        })
                        .onGet(async () => {
                            const value = this.accessory.setTemperature;
                            return value;
                        })
                        .onSet(async (value) => {
                            try {
                                if (deviceData.Device.OperationMode === 1 && value < this.accessory.minSetHeatRoomTemperature) {
                                    value = this.accessory.minSetHeatRoomTemperature;
                                } else if (value < 16) {
                                    value = 16;
                                }

                                const payload = { setTemperature: value };
                                if (this.logInfo) this.emit('info', `Set temperature: ${value}${this.accessory.temperatureUnit}`);
                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload, AirConditioner.EffectiveFlags.SetTemperature);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Set temperature error: ${error}`);
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
                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload, 'account');
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Set temperature display unit error: ${error}`);
                            };
                        });
                    this.melCloudService = melCloudServiceT;
                    accessory.addService(melCloudServiceT);
                    break;
                default:
                    if (this.logWarn) this.emit('warn', `Received unknown display type: ${this.displayType}`);
                    return;
            };

            //temperature sensor services
            if (this.temperatureRoomSensor && this.accessory.roomTemperature !== null) {
                if (this.logDebug) this.emit('debug', `Prepare room temperature sensor service`);
                this.roomTemperatureSensorService = new Service.TemperatureSensor(`${serviceName} Room`, `roomTemperatureSensorService${deviceId}`);
                this.roomTemperatureSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.roomTemperatureSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Room`);
                this.roomTemperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                    .onGet(async () => {
                        const state = this.accessory.roomTemperature;
                        return state;
                    })
                accessory.addService(this.roomTemperatureSensorService);
            }

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

            //overheat protection
            if (this.overheatProtectionSupport && this.accessory.overheatProtectionEnabled !== null) {
                //control
                if (this.logDebug) this.emit('debug', `Prepare overheat protection control service`);
                const overheatProtectionControlService = new Service.HeaterCooler(`${serviceName} Overheat Protection`, `overheatProtectionControlService${deviceId}`);
                overheatProtectionControlService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                overheatProtectionControlService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Overheat Protection`);
                overheatProtectionControlService.getCharacteristic(Characteristic.Active)
                    .onGet(async () => {
                        const state = this.accessory.overheatProtectionEnabled;
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            const payload = { enabled: state ? true : false, min: deviceData.OverheatProtection.Min, max: deviceData.OverheatProtection.Max };
                            if (this.logInfo) this.emit('info', `Overheat protection: ${state ? 'Enabled' : 'Disabled'}`);
                            await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload, 'overheatprotection');
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `Set overheat protection error: ${error}`);
                        };
                    });
                overheatProtectionControlService.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
                    .onGet(async () => {
                        const value = this.accessory.overheatProtection.Active ? 2 : 1;
                        return value;
                    })
                overheatProtectionControlService.getCharacteristic(Characteristic.TargetHeaterCoolerState)
                    .setProps({
                        minValue: 0,
                        maxValue: 0,
                        validValues: [0]
                    })
                    .onGet(async () => {
                        const value = 0
                        return value;
                    })
                    .onSet(async (value) => {
                        try {
                            const payload = { enabled: true, min: deviceData.OverheatProtection.Min, max: deviceData.OverheatProtection.Max };
                            if (this.logInfo) this.emit('info', `Set overheat protection: Enabled`);
                            await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload, 'overheatprotection');
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `Set overheat protection error: ${error}`);
                        };
                    });
                overheatProtectionControlService.getCharacteristic(Characteristic.CurrentTemperature)
                    .onGet(async () => {
                        const value = this.accessory.roomTemperature;
                        return value;
                    });
                overheatProtectionControlService.getCharacteristic(Characteristic.CoolingThresholdTemperature) //max
                    .setProps({
                        minValue: 33,
                        maxValue: 40,
                        minStep: 1
                    })
                    .onGet(async () => {
                        const value = this.accessory.overheatProtection.Max;
                        return value;
                    })
                    .onSet(async (value) => {
                        try {
                            let { min, max } = await this.functions.adjustTempProtection(deviceData.OverheatProtection.Min, deviceData.OverheatProtection.Max, value, 'max', 31, 38, 33, 40);
                            const payload = { enabled: deviceData.OverheatProtection.Enabled, min: min, max: max };
                            if (this.logInfo) this.emit('info', `Set overheat protection max. temperature: ${max}${this.accessory.temperatureUnit}`);
                            await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload, 'overheatprotection');
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `Set overheat protection max. temperature error: ${error}`);
                        };
                    });
                overheatProtectionControlService.getCharacteristic(Characteristic.HeatingThresholdTemperature) //min
                    .setProps({
                        minValue: 31,
                        maxValue: 38,
                        minStep: 1
                    })
                    .onGet(async () => {
                        const value = this.accessory.overheatProtection.Min;
                        return value;
                    })
                    .onSet(async (value) => {
                        try {
                            let { min, max } = await this.functions.adjustTempProtection(deviceData.OverheatProtection.Min, deviceData.OverheatProtection.Max, value, 'min', 31, 38, 33, 40);
                            const payload = { enabled: deviceData.OverheatProtection.Enabled, min: min, max: max };
                            if (this.logInfo) this.emit('info', `Set overheat protection min. temperature: ${min}${this.accessory.temperatureUnit}`);
                            await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload, 'overheatprotection');
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `Set overheat protection min. temperature error: ${error}`);
                        };
                    });
                this.overheatProtectionControlService = overheatProtectionControlService;
                accessory.addService(overheatProtectionControlService);

                if (this.logDebug) this.emit('debug', `Prepare overheat protection control sensor service`);
                this.overheatProtectionControlSensorService = new Service.ContactSensor(`${serviceName} Overheat Protection Control`, `overheatProtectionControlSensorService${deviceId}`);
                this.overheatProtectionControlSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.overheatProtectionControlSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Overheat Protection Control`);
                this.overheatProtectionControlSensorService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.accessory.overheatProtectionEnabled;
                        return state;
                    })
                accessory.addService(this.overheatProtectionControlSensorService);

                if (this.logDebug) this.emit('debug', `Prepare overheat protection sensor service`);
                this.overheatProtectionSensorService = new Service.ContactSensor(`${serviceName} Overheat Protection`, `overheatProtectionSensorService${deviceId}`);
                this.overheatProtectionSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.overheatProtectionSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Overheat Protection`);
                this.overheatProtectionSensorService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.accessory.overheatProtection.Active;
                        return state;
                    })
                accessory.addService(this.overheatProtectionSensorService);
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

            //presets
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
                                                operationMode: presetData.OperationMode,
                                                setTemperature: presetData.SetTemperature,
                                                vaneHorizontalDirection: presetData.VaneHorizontalDirection,
                                                vaneVerticalDirection: presetData.VaneVerticalDirection,
                                                setFanSpeed: presetData.SetFanSpeed
                                            }
                                            break;
                                        case false:
                                            payload = {
                                                power: preset.previousSettings.Power,
                                                operationMode: preset.previousSettings.OperationMode,
                                                setTemperature: preset.previousSettings.SetTemperature,
                                                vaneHorizontalDirection: preset.previousSettings.VaneHorizontalDirection,
                                                vaneVerticalDirection: preset.previousSettings.VaneVerticalDirection,
                                                setFanSpeed: preset.previousSettings.SetFanSpeed
                                            }
                                            break;
                                    };

                                    if (this.logInfo) this.emit('info', `Preset: ${name}: ${state ? 'Set' : 'Unset'}`);
                                    await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload, AirConditioner.EffectiveFlags.Presets);
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

            //schedules
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

                    //get preset name
                    const name = scene.name || `Scene ${i}`;

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
                                    const sceneData = scenesOnServer.find(s => s.Id === scene.id);
                                    const payload = { id: sceneData.Id, enabled: state };
                                    if (this.logInfo) this.emit('info', `Scene ${name}: ${state ? 'Set' : 'Unset'}`);
                                    await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload, 'scene');
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
                this.buttons.forEach((button, i) => {
                    //get mode
                    const mode = button.mode;

                    //get name
                    const name = button.name || `Button ${i}`;

                    //get name prefix
                    const namePrefix = button.namePrefix;

                    const serviceName = namePrefix ? `${accessoryName} ${name}` : name;
                    const serviceType = button.serviceType;
                    const characteristicType = button.characteristicType;

                    //control
                    if (button.displayType > 3) {
                        if (this.logDebug) this.emit('debug', `Prepare button control ${name} service`);
                        const buttonControlService = new Service.Switch(serviceName, `buttonControlService${deviceId} ${i}`);
                        buttonControlService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        buttonControlService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                        buttonControlService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = button.state;
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    const fanKey = accountTypeMelCloud ? 'FanSpeed' : 'SetFanSpeed';
                                    const fanKeySet = accountTypeMelCloud ? 'fanSpeed' : 'setFanSpeed';
                                    let payload = {};
                                    let flag = null;
                                    switch (mode) {
                                        case 0: //POWER ON,OFF
                                            payload.power = state;
                                            break;
                                        case 1: //OPERATING MODE HEAT
                                            button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                            payload.operationMode = state ? 1 : button.previousValue === 9 ? 1 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.OperationModeSetTemperature;
                                            break;
                                        case 2: //OPERATING MODE DRY
                                            button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                            payload.operationMode = state ? 2 : button.previousValue === 10 ? 2 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.OperationModeSetTemperature;
                                            break
                                        case 3: //OPERATING MODE COOL
                                            button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                            payload.operationMode = state ? 3 : button.previousValue === 11 ? 3 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.OperationModeSetTemperature;
                                            break;
                                        case 4: //OPERATING MODE FAN
                                            button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                            payload.operationMode = state ? 7 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.OperationModeSetTemperature;
                                            break;
                                        case 5: //OPERATING MODE AUTO
                                            button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                            payload.operationMode = state ? 8 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.OperationModeSetTemperature;
                                            break;
                                        case 6: //OPERATING MODE PURIFY
                                            button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                            payload.operationMode = state ? 12 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.OperationModeSetTemperature;
                                            break;
                                        case 10: //VANE H MODE AUTO
                                            button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                            payload.vaneHorizontalDirection = state ? 0 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.VaneHorizontal;
                                            break;
                                        case 11: //VANE H MODE 1
                                            button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                            payload.vaneHorizontalDirection = state ? 1 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.VaneHorizontal;
                                            break;
                                        case 12: //VANE H MODE 2
                                            button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                            payload.vaneHorizontalDirection = state ? 2 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.VaneHorizontal;
                                            break;
                                        case 13: //VANE H MODE 3
                                            button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                            payload.vaneHorizontalDirection = state ? 3 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.VaneHorizontal;
                                            break;
                                        case 14: //VANE H MODE 4
                                            button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                            payload.vaneHorizontalDirection = state ? 4 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.VaneHorizontal;
                                            break;
                                        case 15: //VANE H MODE 5
                                            button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                            payload.vaneHorizontalDirection = state ? 5 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.VaneHorizontal;
                                            break;
                                        case 16: //VANE H MODE SPLIT
                                            button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                            payload.vaneHorizontalDirection = state ? 8 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.VaneHorizontal;
                                            break;
                                        case 17: //VANE H MODE SWING
                                            button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                            payload.vaneHorizontalDirection = state ? 12 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.VaneHorizontal;
                                            break;
                                        case 20: //VANE V MODE AUTO
                                            button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                            payload.vaneVerticalDirection = state ? 0 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.VaneVertical;
                                            break;
                                        case 21: //VANE V MODE 1
                                            button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                            payload.vaneVerticalDirection = state ? 1 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.VaneVertical;
                                            break;
                                        case 22: //VANE V MODE 2
                                            button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                            payload.vaneVerticalDirection = state ? 2 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.VaneVertical;
                                            break;
                                        case 23: //VANE V MODE 3
                                            button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                            payload.vaneVerticalDirection = state ? 3 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.VaneVertical;
                                            break;
                                        case 24: //VANE V MODE 4
                                            button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                            payload.vaneVerticalDirection = state ? 4 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.VaneVertical;
                                            break;
                                        case 25: //VANE V MODE 5
                                            button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                            payload.vaneVerticalDirection = state ? 5 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.VaneVertical;
                                            break;
                                        case 26: //VANE V MODE SWING
                                            button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                            payload.vaneVerticalDirection = state ? 7 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.VaneVertical;
                                            break;
                                        case 30: //FAN SPEED MODE AUTO
                                            button.previousValue = state ? deviceData.Device[fanKey] : button.previousValue ?? deviceData.Device[fanKey];
                                            payload[fanKeySet] = state ? 0 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.SetFanSpeed;
                                            break;
                                        case 31: //FAN SPEED MODE 1
                                            button.previousValue = state ? deviceData.Device[fanKey] : button.previousValue ?? deviceData.Device[fanKey];
                                            payload[fanKeySet] = state ? 1 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.SetFanSpeed;
                                            break;
                                        case 32: //FAN SPEED MODE 2
                                            button.previousValue = state ? deviceData.Device[fanKey] : button.previousValue ?? deviceData.Device[fanKey];
                                            payload[fanKeySet] = state ? 2 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.SetFanSpeed;
                                            break;
                                        case 33: //FAN SPEED MODE 3
                                            button.previousValue = state ? deviceData.Device[fanKey] : button.previousValue ?? deviceData.Device[fanKey];
                                            payload[fanKeySet] = state ? 3 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.SetFanSpeed;
                                            break;
                                        case 34: //FAN MODE 4
                                            button.previousValue = state ? deviceData.Device[fanKey] : button.previousValue ?? deviceData.Device[fanKey];
                                            payload[fanKeySet] = state ? 4 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.SetFanSpeed;
                                            break;
                                        case 35: //FAN SPEED MODE 5
                                            button.previousValue = state ? deviceData.Device[fanKey] : button.previousValue ?? deviceData.Device[fanKey];
                                            payload[fanKeySet] = state ? 5 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.SetFanSpeed;
                                            break;
                                        case 36: //FAN SPEED MODE 6
                                            button.previousValue = state ? deviceData.Device[fanKey] : button.previousValue ?? deviceData.Device[fanKey];
                                            payload[fanKeySet] = state ? 6 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.SetFanSpeed;
                                            break;
                                        case 37: //PHYSICAL LOCK CONTROLS
                                            if (accountTypeMelCloud) payload.prohibitSetTemperature = state;
                                            payload.prohibitOperationMode = state;
                                            if (accountTypeMelCloud) payload.prohibitPower = state;
                                            flag = AirConditioner.EffectiveFlags.Prohibit;
                                            break;
                                        case 38: //PHYSICAL LOCK CONTROLS POWER
                                            if (!accountTypeMelCloud) return;
                                            payload.prohibitPower = state;
                                            flag = AirConditioner.EffectiveFlags.Prohibit;
                                            break;
                                        case 39: //PHYSICAL LOCK CONTROLS MODE
                                            if (!accountTypeMelCloud) return;
                                            payload.prohibitOperationMode = state;
                                            flag = AirConditioner.EffectiveFlags.Prohibit;
                                            break;
                                        case 40: //PHYSICAL LOCK CONTROLS TEMP
                                            if (!accountTypeMelCloud) return;
                                            payload.prohibitSetTemperature = state;
                                            flag = AirConditioner.EffectiveFlags.Prohibit;
                                            break;
                                        default:
                                            if (this.logWarn) this.emit('warn', `Received unknown button mode: ${mode}`);
                                            return;
                                    };

                                    if (this.logInfo) this.emit('info', `Button ${name}: ${state ? `Enabled` : `Disabled`}`);
                                    await this.melCloudAta.send(this.accountType, this.displayType, deviceData, payload, flag);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `Set button error: ${error}`);
                                };
                            });
                        this.buttonControlServices.push(buttonControlService);
                        accessory.addService(buttonControlService);
                    }

                    //sensor
                    if (button.displayType < 7) {
                        if (this.logDebug) this.emit('debug', `Prepare scene control sensor ${name} service`);
                        const buttonControlSensorService = new serviceType(serviceName, `buttonControlSensorService${deviceId} ${i}`);
                        buttonControlSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        buttonControlSensorService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
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
        }
    }

    //start
    async start() {
        try {
            //melcloud device
            this.melCloudAta = new MelCloudAta(this.account, this.device, this.defaultTempsFile, this.melCloudClass)
                .on('deviceInfo', (modelIndoor, modelOutdoor, serialNumber, firmwareAppVersion) => {
                    if (this.logDeviceInfo && this.displayDeviceInfo) {
                        this.emit('devInfo', `---- ${this.deviceTypeString}: ${this.deviceName} ----`);
                        this.emit('devInfo', `Account: ${this.accountName}`);
                        if (modelIndoor) this.emit('devInfo', `Indoor: ${modelIndoor}`);
                        if (modelOutdoor) this.emit('devInfo', `Outdoor: ${modelOutdoor}`);
                        if (serialNumber) this.emit('devInfo', `Serial: ${serialNumber}`);
                        if (firmwareAppVersion) this.emit('devInfo', `Firmware: ${firmwareAppVersion}`);
                        this.emit('devInfo', `Manufacturer: Mitsubishi`);
                        this.emit('devInfo', '----------------------------------');
                        this.displayDeviceInfo = false;
                    }

                    //accessory info
                    this.manufacturer = 'Mitsubishi';
                    this.model = modelIndoor ? modelIndoor : modelOutdoor ? modelOutdoor : `${this.deviceTypeString}`;
                    this.serialNumber = serialNumber.toString();
                    this.firmwareRevision = firmwareAppVersion.toString();

                    this.informationService?.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);
                })
                .on('deviceState', async (deviceData) => {
                    this.deviceData = deviceData;
                    if (this.remoteRoomTemperatureSupport) this.deviceData.Device.RoomTemperature = this.remoteRoomTemperature;

                    //keys
                    const accountTypeMelCloud = this.accountTypeMelCloud;
                    const fanKey = accountTypeMelCloud ? 'FanSpeed' : 'SetFanSpeed';
                    const tempStepKey = accountTypeMelCloud ? 'TemperatureIncrement' : 'HasHalfDegreeIncrements';
                    const connectKey = accountTypeMelCloud ? 'Offline' : 'IsConnected';
                    const errorKey = accountTypeMelCloud ? 'HasError' : 'IsInError';
                    const supportAirDirectionKey = accountTypeMelCloud ? 'AirDirectionFunction' : 'HasAirDirectionFunction';
                    const supportSwingKey = accountTypeMelCloud ? 'SwingFunction' : 'HasSwing';
                    const supportVideWaneKey = accountTypeMelCloud ? 'ModelSupportsWideVane' : 'SupportsWideVane';
                    const supportAutoKey = accountTypeMelCloud ? 'ModelSupportsAuto' : 'HasAutoOperationMode';
                    const supportHeatKey = accountTypeMelCloud ? 'ModelSupportsHeat' : 'HasHeatOperationMode';
                    const supportDryKey = accountTypeMelCloud ? 'ModelSupportsDry' : 'HasDryOperationMode';
                    const supportCoolKey = accountTypeMelCloud ? 'ModelSupportsCool' : 'HasCoolOperationMode';
                    const supportStandbyKey = accountTypeMelCloud ? 'ModelSupportsStandbyMode' : 'HasStandby';

                    //presets schedules
                    const presetsOnServer = deviceData.Presets ?? [];
                    const schedulesOnServer = deviceData.Schedule ?? [];
                    const scheduleEnabled = deviceData.ScheduleEnabled ?? null;
                    const scenesOnServer = deviceData.Scenes ?? [];

                    //protection
                    const frostProtection = deviceData.FrostProtection ?? {};
                    const frostProtectionEnabled = frostProtection.Enabled ?? null;
                    const overheatProtection = deviceData.OverheatProtection ?? {};
                    const overheatProtectionEnabled = overheatProtection.Enabled ?? null;
                    const holidayMode = deviceData.HolidayMode ?? {};
                    const holidayModeEnabled = holidayMode.Enabled ?? null;

                    //device control
                    const hideVaneControls = !!deviceData.HideVaneControls;
                    const hideDryModeControl = !!deviceData.HideDryModeControl;

                    //device info
                    const supportsStanbyMode = !!deviceData.Device[supportStandbyKey];
                    const supportsAutomaticFanSpeed = !!deviceData.Device.HasAutomaticFanSpeed;
                    const supportsAirDirectionFunction = !!deviceData.Device[supportAirDirectionKey];
                    const supportsSwingFunction = !!deviceData.Device[supportSwingKey];
                    const supportsWideVane = !!deviceData.Device[supportVideWaneKey];
                    const supportsOutdoorTemperature = !!deviceData.Device.HasOutdoorTemperature && this.functions.isValidValue(deviceData.Device.OutdoorTemperature);
                    const supportsFanSpeed = accountTypeMelCloud ? !!deviceData.Device.ModelSupportsFanSpeed : deviceData.Device.NumberOfFanSpeeds > 0;
                    const supportsAuto1 = !!deviceData.Device[supportAutoKey];
                    const supportsAuto = this.autoDryFanMode >= 1 && supportsAuto1
                    const supportsHeat1 = !!deviceData.Device[supportHeatKey];
                    const supportsHeat = this.heatDryFanMode >= 1 && supportsHeat1;
                    const supportsDry = !!deviceData.Device[supportDryKey];
                    const supportsCool1 = !!deviceData.Device[supportCoolKey];
                    const supportsCool = this.coolDryFanMode >= 1;
                    const numberOfFanSpeeds = deviceData.Device.NumberOfFanSpeeds;
                    const minSetHeatRoomTemperature = 10;
                    const maxSetHeatCoolDryAutoRoomTemperature = 31;
                    const minSetCoolDryAutoRoomTemperature = accountTypeMelCloud ? 4 : deviceData.Device.MinTempAutomatic ?? 16;

                    //device state
                    const power = deviceData.Device.Power ?? false;
                    const inStandbyMode = deviceData.Device.InStandbyMode;
                    const roomTemperature = deviceData.Device.RoomTemperature;
                    const setTemperature = deviceData.Device.SetTemperature;
                    const defaultHeatingSetTemperature = deviceData.Device.DefaultHeatingSetTemperature;
                    const defaultCoolingSetTemperature = deviceData.Device.DefaultCoolingSetTemperature;
                    const actualFanSpeed = deviceData.Device.ActualFanSpeed;
                    const automaticFanSpeed = deviceData.Device.AutomaticFanSpeed;
                    const setFanSpeed = deviceData.Device[fanKey];
                    const operationMode = deviceData.Device.OperationMode;
                    const vaneVerticalDirection = deviceData.Device.VaneVerticalDirection;
                    const vaneVerticalSwing = deviceData.Device.VaneVerticalSwing;
                    const vaneHorizontalDirection = deviceData.Device.VaneHorizontalDirection;
                    const vaneHorizontalSwing = deviceData.Device.VaneHorizontalSwing;
                    const prohibitSetTemperature = deviceData.Device.ProhibitSetTemperature;
                    const prohibitOperationMode = deviceData.Device.ProhibitOperationMode;
                    const prohibitPower = deviceData.Device.ProhibitPower;
                    const temperatureStep = deviceData.Device[tempStepKey] ? 0.5 : 1;
                    const outdoorTemperature = deviceData.Device.OutdoorTemperature;
                    const isConnected = accountTypeMelCloud ? !deviceData.Device[connectKey] : deviceData.Device[connectKey];
                    const isInError = deviceData.Device[errorKey];
                    const currentSwingMode = supportsSwingFunction ? (supportsWideVane ? vaneHorizontalDirection === 12 && vaneVerticalDirection === 7 ? 1 : 0 : vaneVerticalDirection === 7 ? 1 : 0) : 0;

                    //accessory
                    const obj = {
                        presets: presetsOnServer,
                        schedules: schedulesOnServer,
                        scheduleEnabled: scheduleEnabled,
                        scenes: scenesOnServer,
                        frostProtection: frostProtection,
                        frostProtectionEnabled: frostProtectionEnabled,
                        overheatProtection: overheatProtection,
                        overheatProtectionEnabled: overheatProtectionEnabled,
                        holidayMode: holidayMode,
                        holidayModeEnabled: holidayModeEnabled,
                        supportsAutomaticFanSpeed: supportsAutomaticFanSpeed,
                        supportsAirDirectionFunction: supportsAirDirectionFunction,
                        supportsSwingFunction: supportsSwingFunction,
                        supportsWideVane: supportsWideVane,
                        supportsOutdoorTemperature: supportsOutdoorTemperature,
                        numberOfFanSpeeds: numberOfFanSpeeds,
                        supportsFanSpeed: supportsFanSpeed,
                        supportsAuto: supportsAuto,
                        supportsHeat: supportsHeat,
                        supportsDry: supportsDry,
                        supportsCool: supportsCool,
                        supportsStanbyMode: supportsStanbyMode,
                        minSetHeatRoomTemperature: minSetHeatRoomTemperature,
                        maxSetHeatCoolDryAutoRoomTemperature: maxSetHeatCoolDryAutoRoomTemperature,
                        minSetCoolDryAutoRoomTemperature: minSetCoolDryAutoRoomTemperature,
                        power: power,
                        inStandbyMode: inStandbyMode,
                        operationMode: operationMode,
                        currentOperationMode: 0,
                        targetOperationMode: 0,
                        roomTemperature: roomTemperature,
                        outdoorTemperature: outdoorTemperature,
                        setTemperature: setTemperature,
                        defaultHeatingSetTemperature: defaultHeatingSetTemperature,
                        defaultCoolingSetTemperature: defaultCoolingSetTemperature,
                        actualFanSpeed: actualFanSpeed,
                        automaticFanSpeed: automaticFanSpeed,
                        vaneVerticalSwing: vaneVerticalSwing,
                        vaneHorizontalSwing: vaneHorizontalSwing,
                        currentSwingMode: currentSwingMode,
                        lockPhysicalControl: prohibitSetTemperature && prohibitOperationMode && prohibitPower ? 1 : 0,
                        temperatureStep: temperatureStep,
                        useFahrenheit: this.melCloudAccountData.useFahrenheit ? 1 : 0,
                        temperatureUnit: TemperatureDisplayUnits[this.melCloudAccountData.useFahrenheit ? 1 : 0],
                        isConnected: isConnected,
                        isInError: isInError
                    };

                    //characteristics array
                    const characteristics = [];
                    const operationModevalidValues = [];

                    //operating mode 0, HEAT, DRY, COOL, 4, 5, 6, FAN, AUTO, ISEE HEAT, ISEE DRY, ISEE COOL
                    switch (this.displayType) {
                        case 1: //Heater Cooler
                            // Helper to map fan mode (2 or 3) into operation target
                            const resolveTargetOperation = (modeValue, obj) => {
                                return this.autoDryFanMode === modeValue ? 0 : this.heatDryFanMode === modeValue ? 1 : this.coolDryFanMode === modeValue ? 2 : (obj.targetOperationMode ?? 0);
                            };

                            switch (operationMode) {
                                case 1: // HEAT
                                    obj.currentOperationMode = roomTemperature > setTemperature ? 1 : 2;
                                    obj.targetOperationMode = 1;
                                    break;
                                case 2: // DRY
                                    obj.currentOperationMode = 1;
                                    obj.targetOperationMode = resolveTargetOperation(2, obj);
                                    break;
                                case 3: // COOL
                                    obj.currentOperationMode = roomTemperature < setTemperature ? 1 : 3;
                                    obj.targetOperationMode = 2;
                                    break;
                                case 7: // FAN
                                    obj.currentOperationMode = 1;
                                    obj.targetOperationMode = resolveTargetOperation(3, obj);
                                    break;
                                case 8: // AUTO
                                    obj.currentOperationMode = roomTemperature > setTemperature ? 3 : roomTemperature < setTemperature ? 2 : 1;
                                    obj.targetOperationMode = 0;
                                    break;
                                case 9: // ISEE HEAT
                                    obj.currentOperationMode = roomTemperature > setTemperature ? 1 : 2;
                                    obj.targetOperationMode = 1;
                                    break;
                                case 10: // ISEE DRY
                                    obj.currentOperationMode = 1;
                                    obj.targetOperationMode = resolveTargetOperation(2, obj);
                                    break;
                                case 11: // ISEE COOL
                                    obj.currentOperationMode = roomTemperature < setTemperature ? 1 : 3;
                                    obj.targetOperationMode = 2;
                                    break;
                                default:
                                    if (this.logDebug) this.emit('debug', `Unknown operating mode: ${operationMode}`);
                                    return;
                            }
                            obj.currentOperationMode = !power ? 0 : (inStandbyMode ? 1 : obj.currentOperationMode);

                            if (supportsAuto) operationModevalidValues.push(0);
                            if (supportsHeat) operationModevalidValues.push(1);
                            operationModevalidValues.push(2);

                            obj.operationModeSetPropsMinValue = operationModevalidValues[0];
                            obj.operationModeSetPropsMaxValue = operationModevalidValues.at(-1);
                            obj.operationModeSetPropsValidValues = operationModevalidValues;

                            //fan speed mode
                            if (supportsFanSpeed) {
                                const max = numberOfFanSpeeds;
                                const autoIndex = supportsAutomaticFanSpeed ? max + 1 : 0;
                                const speeds = [autoIndex];

                                for (let i = 1; i <= max; i++) {
                                    speeds.push(i);
                                }

                                obj.currentFanSpeed = speeds[setFanSpeed];
                                obj.fanSpeedSetPropsMaxValue = supportsAutomaticFanSpeed ? max + 1 : max;
                            }

                            //create characteristics
                            characteristics.push(
                                { type: Characteristic.Active, value: power },
                                { type: Characteristic.CurrentHeaterCoolerState, value: obj.currentOperationMode },
                                { type: Characteristic.TargetHeaterCoolerState, value: obj.targetOperationMode },
                                { type: Characteristic.CurrentTemperature, value: roomTemperature },
                                { type: Characteristic.LockPhysicalControls, value: obj.lockPhysicalControl },
                                { type: Characteristic.TemperatureDisplayUnits, value: obj.useFahrenheit },
                                { type: Characteristic.CoolingThresholdTemperature, value: operationMode === 8 ? defaultCoolingSetTemperature : setTemperature }
                            );

                            if (supportsHeat) characteristics.push({ type: Characteristic.HeatingThresholdTemperature, value: operationMode === 8 ? defaultHeatingSetTemperature : setTemperature });
                            if (supportsFanSpeed) characteristics.push({ type: Characteristic.RotationSpeed, value: obj.currentFanSpeed });
                            if (supportsSwingFunction) characteristics.push({ type: Characteristic.SwingMode, value: obj.currentSwingMode });
                            break;
                        case 2: //Thermostat
                            // Helper for mapping target operation in DRY / FAN modes
                            const resolveTargetOperation1 = (modeValue, obj) => {
                                return this.autoDryFanMode === modeValue ? 3 : this.heatDryFanMode === modeValue ? 1 : this.coolDryFanMode === modeValue ? 2 : (obj.targetOperationMode ?? 0);
                            };

                            switch (operationMode) {
                                case 1: // HEAT
                                    obj.currentOperationMode = roomTemperature > setTemperature ? 0 : 1;
                                    obj.targetOperationMode = 1;
                                    break;
                                case 2: // DRY
                                    obj.currentOperationMode = 0;
                                    obj.targetOperationMode = resolveTargetOperation1(2, obj);
                                    break;
                                case 3: // COOL
                                    obj.currentOperationMode = roomTemperature < setTemperature ? 0 : 2;
                                    obj.targetOperationMode = 2;
                                    break;
                                case 7: // FAN
                                    obj.currentOperationMode = 0;
                                    obj.targetOperationMode = resolveTargetOperation1(3, obj);
                                    break;
                                case 8: // AUTO
                                    obj.currentOperationMode = roomTemperature < setTemperature ? 1 : roomTemperature > setTemperature ? 2 : 0;
                                    obj.targetOperationMode = 3;
                                    break;
                                case 9: // ISEE HEAT
                                    obj.currentOperationMode = roomTemperature > setTemperature ? 0 : 1;
                                    obj.targetOperationMode = 1;
                                    break;
                                case 10: // ISEE DRY
                                    obj.currentOperationMode = 0;
                                    obj.targetOperationMode = resolveTargetOperation1(2, obj);
                                    break;
                                case 11: // ISEE COOL
                                    obj.currentOperationMode = roomTemperature < setTemperature ? 0 : 2;
                                    obj.targetOperationMode = 2;
                                    break;
                                default:
                                    if (this.logDebug) this.emit('debug', `Unknown operating mode: ${operationMode}`);
                                    return;
                            }

                            obj.currentOperationMode = !power ? 0 : obj.currentOperationMode;
                            obj.targetOperationMode = !power ? 0 : obj.targetOperationMode;

                            operationModevalidValues.push(0);
                            if (supportsHeat) operationModevalidValues.push(1);
                            operationModevalidValues.push(2);
                            if (supportsAuto) operationModevalidValues.push(3);

                            obj.operationModeSetPropsMinValue = operationModevalidValues[0];
                            obj.operationModeSetPropsMaxValue = operationModevalidValues.at(-1);
                            obj.operationModeSetPropsValidValues = operationModevalidValues;

                            //create characteristics
                            characteristics.push(
                                { type: Characteristic.CurrentHeatingCoolingState, value: obj.currentOperationMode },
                                { type: Characteristic.TargetHeatingCoolingState, value: obj.targetOperationMode },
                                { type: Characteristic.CurrentTemperature, value: roomTemperature },
                                { type: Characteristic.TargetTemperature, value: setTemperature },
                                { type: Characteristic.TemperatureDisplayUnits, value: obj.useFahrenheit }
                            );
                            break;
                        default:
                            if (this.logDebug) this.emit('debug', `Received unknown display type: ${this.displayType}`);
                            return;
                    };
                    this.accessory = obj;

                    //update services
                    for (const { type, value } of characteristics) {
                        if (!this.functions.isValidValue(value)) continue;
                        this.melCloudService?.updateCharacteristic(type, value);
                    }

                    //other sensors
                    if (this.temperatureRoomSensor) this.roomTemperatureSensorService?.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature);
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
                            .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                            .updateCharacteristic(Characteristic.CoolingThresholdTemperature, frostProtection.Max)
                            .updateCharacteristic(Characteristic.HeatingThresholdTemperature, frostProtection.Min);
                        this.frostProtectionControlSensorService?.updateCharacteristic(Characteristic.ContactSensorState, frostProtectionEnabled);
                        this.frostProtectionSensorService?.updateCharacteristic(Characteristic.ContactSensorState, frostProtection.Active);
                    }

                    //overheat protection
                    if (this.overheatProtectionSupport && overheatProtectionEnabled !== null) {
                        this.overheatProtectionControlService
                            ?.updateCharacteristic(Characteristic.Active, overheatProtectionEnabled)
                            .updateCharacteristic(Characteristic.CurrentHeaterCoolerState, overheatProtection.Active ? 2 : 1)
                            .updateCharacteristic(Characteristic.TargetHeaterCoolerState, 0)
                            .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                            .updateCharacteristic(Characteristic.CoolingThresholdTemperature, overheatProtection.Max)
                            .updateCharacteristic(Characteristic.HeatingThresholdTemperature, overheatProtection.Min);
                        this.overheatProtectionControlSensorService?.updateCharacteristic(Characteristic.ContactSensorState, overheatProtectionEnabled);
                        this.overheatProtectionSensorService?.updateCharacteristic(Characteristic.ContactSensorState, overheatProtection.Active);
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
                                && presetData.SetTemperature === setTemperature
                                && presetData.OperationMode === operationMode
                                && presetData.VaneHorizontalDirection === vaneHorizontalDirection
                                && presetData.VaneVerticalDirection === vaneVerticalDirection
                                && presetData.FanSpeed === setFanSpeed) : false;

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
                                case 1: //OPERATING MODE HEAT
                                    button.state = power ? (operationMode === 1 || operationMode === 9) : false;
                                    break;
                                case 2: //OPERATING MODE DRY
                                    button.state = power ? (operationMode === 2 || operationMode === 10) : false;
                                    break
                                case 3: //OPERATING MODE COOL
                                    button.state = power ? (operationMode === 3 || operationMode === 11) : false;
                                    break;
                                case 4: //OPERATING MODE FAN
                                    button.state = power ? (operationMode === 7) : false;
                                    break;
                                case 5: //OPERATING MODE AUTO
                                    button.state = power ? (operationMode === 8) : false;
                                    break;
                                case 6: //OPERATING MODE PURIFY
                                    button.state = power ? (operationMode === 12) : false;
                                    break;
                                case 10: //VANE H MODE AUTO
                                    button.state = power ? (vaneHorizontalDirection === 0) : false;
                                    break;
                                case 11: //VANE H MODE 1
                                    button.state = power ? (vaneHorizontalDirection === 1) : false;
                                    break;
                                case 12: //VANE H MODE 2
                                    button.state = power ? (vaneHorizontalDirection === 2) : false;
                                    break;
                                case 13: //VANE H MODE 3
                                    button.state = power ? (vaneHorizontalDirection === 3) : false;
                                    break;
                                case 14: //VANE H MODE 4
                                    button.state = power ? (vaneHorizontalDirection === 4) : false;
                                    break;
                                case 15: //VANE H MODE 5
                                    button.state = power ? (vaneHorizontalDirection === 5) : false;
                                    break;
                                case 16: //VANE H MODE SPLIT
                                    button.state = power ? (vaneHorizontalDirection === 8) : false;
                                    break;
                                case 17: //VANE H MODE SWING
                                    button.state = power ? (vaneHorizontalDirection === 12) : false;
                                    break;
                                case 20: //VANE V MODE AUTO
                                    button.state = power ? (vaneVerticalDirection === 0) : false;
                                    break;
                                case 21: //VANE V MODE 1
                                    button.state = power ? (vaneVerticalDirection === 1) : false;
                                    break;
                                case 22: //VANE V MODE 2
                                    button.state = power ? (vaneVerticalDirection === 2) : false;
                                    break;
                                case 23: //VANE V MODE 3
                                    button.state = power ? (vaneVerticalDirection === 3) : false;
                                    break;
                                case 24: //VANE V MODE 4
                                    button.state = power ? (vaneVerticalDirection === 4) : false;
                                    break;
                                case 25: //VANE V MODE 5
                                    button.state = power ? (vaneVerticalDirection === 5) : false;
                                    break;
                                case 26: //VANE V MODE SWING
                                    button.state = power ? (vaneVerticalDirection === 7) : false;
                                    break;
                                case 30: //FAN SPEED MODE AUTO
                                    button.state = power ? (setFanSpeed === 0) : false;
                                    break;
                                case 31: //FAN SPEED MODE 1
                                    button.state = power ? (setFanSpeed === 1) : false;
                                    break;
                                case 32: //FAN SPEED MODE 2
                                    button.state = power ? (setFanSpeed === 2) : false;
                                    break;
                                case 33: //FAN SPEED MODE 3
                                    button.state = power ? (setFanSpeed === 3) : false;
                                    break;
                                case 34: //FAN SPEED MODE 4
                                    button.state = power ? (setFanSpeed === 4) : false;
                                    break;
                                case 35: //FAN SPEED  MODE 5
                                    button.state = power ? (setFanSpeed === 5) : false;
                                    break;
                                case 36: //FAN SPEED  MODE 6
                                    button.state = power ? (setFanSpeed === 6) : false;
                                    break;
                                case 37: //PHYSICAL LOCK CONTROLS ALL
                                    button.state = (obj.lockPhysicalControl === 1);
                                    break;
                                case 38: //PHYSICAL LOCK CONTROLS POWER
                                    button.state = prohibitPower;
                                    break;
                                case 39: //PHYSICAL LOCK CONTROLS MODE
                                    button.state = prohibitOperationMode;
                                    break;
                                case 40: //PHYSICAL LOCK CONTROLS TEMP
                                    button.state = prohibitSetTemperature;
                                    break;
                                default: //Unknown button
                                    if (this.logWarn) this.emit('warn', `Received unknown button mode: ${mode} detected`);
                                    break;
                            };

                            //control
                            if (button.displayType > 3) updateSensorCharacteristics(this.buttonControlServices, Characteristic.On, button.state);

                            //sensor
                            const characteristicType = button.characteristicType;
                            if (button.displayType < 7) updateSensorCharacteristics(this.buttonControlSensorServices, characteristicType, button.state);
                        });
                    }

                    //log current state
                    if (this.logInfo) {
                        this.emit('info', `Power: ${power ? 'On' : 'Off'}`);
                        this.emit('info', `Target operation mode: ${AirConditioner.OperationModeMapEnumToString[operationMode]}`);
                        this.emit('info', `Current operation mode: ${this.displayType === 1 ? AirConditioner.CurrentOperationModeMapEnumToStringHeatherCooler[obj.currentOperationMode] : AirConditioner.CurrentOperationModeMapEnumToStringThermostat[obj.currentOperationMode]}`);
                        this.emit('info', `Target temperature: ${setTemperature}${obj.temperatureUnit}`);
                        this.emit('info', `Current temperature: ${roomTemperature}${obj.temperatureUnit}`);
                        if (supportsOutdoorTemperature) this.emit('info', `Outdoor temperature: ${outdoorTemperature}${obj.temperatureUnit}`);
                        if (supportsFanSpeed) this.emit('info', `Target fan speed: ${AirConditioner.FanSpeedMapEnumToString[setFanSpeed]}`);
                        if (supportsFanSpeed) this.emit('info', `Current fan speed: ${AirConditioner.AktualFanSpeedMapEnumToString[actualFanSpeed]}`);
                        if (vaneHorizontalDirection !== null) this.emit('info', `Vane horizontal: ${AirConditioner.VaneHorizontalDirectionMapEnumToString[vaneHorizontalDirection]}`);
                        if (vaneVerticalDirection !== null) this.emit('info', `Vane vertical: ${AirConditioner.VaneVerticalDirectionMapEnumToString[vaneVerticalDirection]}`);
                        if (supportsSwingFunction) this.emit('info', `Air direction: ${AirConditioner.AirDirectionMapEnumToString[currentSwingMode]}`);
                        this.emit('info', `Temperature display unit: ${obj.temperatureUnit}`);
                        this.emit('info', `Lock physical controls: ${obj.lockPhysicalControl ? 'Locked' : 'Unlocked'}`);
                        if (!accountTypeMelCloud) this.emit('info', `WiFi signal strength: ${deviceData.Rssi}dBm`);
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
            await this.melCloudAta.updateState('request', this.melCloudDeviceData);

            //prepare accessory
            const accessory = await this.prepareAccessory();
            return accessory;
        } catch (error) {
            throw new Error(`Start error: ${error}`);
        };
    }
}

export default DeviceAta;
