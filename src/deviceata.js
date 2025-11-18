import EventEmitter from 'events';
import MelCloudAta from './melcloudata.js';
import RestFul from './restful.js';
import Mqtt from './mqtt.js';
import Functions from './functions.js';
import { TemperatureDisplayUnits, AirConditioner } from './constants.js';
let Accessory, Characteristic, Service, Categories, AccessoryUUID;

class DeviceAta extends EventEmitter {
    constructor(api, account, device, devicesFile, defaultTempsFile, accountInfo, accountFile) {
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
        this.deviceId = device.id;
        this.deviceName = device.name;
        this.deviceTypeString = device.typeString;
        this.displayType = device.displayType;
        this.heatDryFanMode = device.heatDryFanMode || 1; //NONE, HEAT, DRY, FAN
        this.coolDryFanMode = device.coolDryFanMode || 1; //NONE, COOL, DRY, FAN
        this.autoDryFanMode = device.autoDryFanMode || 1; //NONE, AUTO, DRY, FAN
        this.temperatureSensor = device.temperatureSensor || false;
        this.temperatureOutdoorSensor = device.temperatureOutdoorSensor || false;
        this.inStandbySensor = device.inStandbySensor || false;
        this.connectSensor = device.connectSensor || false;
        this.errorSensor = device.errorSensor || false;
        this.frostProtectionSupport = device.frostProtectionSupport || false;
        this.overheatProtectionSupport = device.overheatProtectionSupport || false;
        this.holidayModeSupport = device.holidayModeSupport || false;
        this.presets = this.accountType === 'melcloud' ? (device.presets || []).filter(preset => (preset.displayType ?? 0) > 0 && preset.id !== '0') : [];
        this.schedules = this.accountType === 'melcloudhome' ? (device.schedules || []).filter(schedule => (schedule.displayType ?? 0) > 0 && schedule.id !== '0') : [];
        this.scenes = this.accountType === 'melcloudhome' ? (device.scenes || []).filter(scene => (scene.displayType ?? 0) > 0 && scene.id !== '0') : [];
        this.buttons = (device.buttonsSensors || []).filter(button => (button.displayType ?? 0) > 0);

        //files
        this.devicesFile = devicesFile;
        this.defaultTempsFile = defaultTempsFile;
        this.accountInfo = accountInfo;
        this.accountFile = accountFile;

        //external integrations
        this.restFul = account.restFul ?? {};
        this.restFulConnected = false;
        this.mqtt = account.mqtt ?? {};
        this.mqttConnected = false;

        const serviceType = [null, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor, null];
        const characteristicType = [null, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState, null];

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
    };

    async startStopImpulseGenerator(state, timers = []) {
        try {
            //start impulse generator 
            await this.melCloudAta.impulseGenerator.state(state, timers)
            return true;
        } catch (error) {
            throw new Error(`Impulse generator start error: ${error}`);
        }
    }

    async externalIntegrations() {
        //RESTFul server
        const restFulEnabled = this.restFul.enable || false;
        if (restFulEnabled) {
            try {

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
            } catch (error) {
                this.emit('warn', `RESTFul integration start error: ${error}`);
            };
        }

        //MQTT client
        const mqttEnabled = this.mqtt.enable || false;
        if (mqttEnabled) {
            try {
                if (!this.mqttConnected) {
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
                }
            } catch (error) {
                this.emit('warn', `MQTT integration start error: ${error}`);
            };
        }
    }

    async setOverExternalIntegration(integration, deviceData, key, value) {
        try {
            let set = false
            let flag = null;
            switch (key) {
                case 'Power':
                    deviceData.Device[key] = value;
                    flag = AirConditioner.EffectiveFlags.Power;
                    break;
                case 'OperationMode':
                    deviceData.Device[key] = value;
                    flag = AirConditioner.EffectiveFlags.OperationMode
                    break;
                case 'SetTemperature':
                    deviceData.Device[key] = value;
                    flag = AirConditioner.EffectiveFlags.SetTemperature;
                    break;
                case 'DefaultCoolingSetTemperature':
                    deviceData.Device[key] = value;
                    flag = AirConditioner.EffectiveFlags.SetTemperature;
                    break;
                case 'DefaultHeatingSetTemperature':
                    deviceData.Device[key] = value;
                    flag = AirConditioner.EffectiveFlags.SetTemperature;
                    break;
                case 'FanSpeed':
                    key = this.accountType === 'melcloud' ? key : 'SetFanSpeed';
                    deviceData.Device[key] = value;
                    flag = AirConditioner.EffectiveFlags.SetFanSpeed;
                    break;
                case 'VaneHorizontalDirection':
                    deviceData.Device[key] = value;
                    flag = AirConditioner.EffectiveFlags.VaneHorizontalDirection;
                    break;
                case 'VaneVerticalDirection':
                    deviceData.Device[key] = value;
                    flag = AirConditioner.EffectiveFlags.VaneVerticalDirection;
                    break;
                case 'HideVaneControls':
                    if (this.accountType === 'melcloudhome') return;

                    deviceData[key] = value;
                    flag = AirConditioner.EffectiveFlags.Prohibit;
                    break;
                case 'HideDryModeControl':
                    if (this.accountType === 'melcloudhome') return;

                    deviceData[key] = value;
                    flag = AirConditioner.EffectiveFlags.Prohibit;
                    break;
                case 'ProhibitSetTemperature':
                    if (this.accountType === 'melcloudhome') return;

                    deviceData.Device[key] = value;
                    flag = AirConditioner.EffectiveFlags.Prohibit;
                    break;
                case 'ProhibitOperationMode':
                    if (this.accountType === 'melcloudhome') return;

                    deviceData.Device[key] = value;
                    flag = AirConditioner.EffectiveFlags.Prohibit;
                    break;
                case 'ProhibitPower':
                    if (this.accountType === 'melcloudhome') return;

                    deviceData.Device[key] = value;
                    flag = AirConditioner.EffectiveFlags.Prohibit;
                    break;
                case 'FrostProtection':
                    if (this.accountType === 'melcloud') return;

                    deviceData.Device[key].Enabled = value;
                    flag = 'frostprotection';
                    break;
                case 'OverheatProtection':
                    if (this.accountType === 'melcloud') return;

                    deviceData.Device[key].Enabled = value;
                    flag = 'overheatprotection';
                    break;
                case 'Schedules':
                    if (this.accountType === 'melcloud') return;

                    deviceData.Device[key].Enabled = value;
                    flag = 'schedule';
                    break;
                case 'HolidayMode':
                    if (this.accountType === 'melcloud') return;

                    deviceData.Device[key].Enabled = value;
                    flag = 'holidaymode';
                    break;
                default:
                    this.emit('warn', `${integration}, received key: ${key}, value: ${value}`);
                    break;
            };

            set = await this.melCloudAta.send(this.accountType, this.displayType, deviceData, flag);
            return set;
        } catch (error) {
            throw new Error(`${integration} set key: ${key}, value: ${value}, error: ${error.message ?? error}`);
        };
    }

    //prepare accessory
    async prepareAccessory() {
        try {
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
                                deviceData.Device.Power = state ? true : false;
                                if (this.logInfo) this.emit('info', `Set power: ${state ? 'On' : 'Off'}`);
                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, AirConditioner.EffectiveFlags.Power);
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

                                deviceData.Device.OperationMode = value;
                                if (this.logInfo) this.emit('info', `Set operation mode: ${AirConditioner.OperationModeMapEnumToString[value]}`);
                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, AirConditioner.EffectiveFlags.OperationMode);
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
                                    const fanKey = this.accountType === 'melcloud' ? 'FanSpeed' : 'SetFanSpeed';
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

                                    deviceData.Device[fanKey] = value;
                                    if (this.logInfo) this.emit('info', `Set fan speed mode: ${AirConditioner.FanSpeedMapEnumToString[value]}`);
                                    await this.melCloudAta.send(this.accountType, this.displayType, deviceData, AirConditioner.EffectiveFlags.SetFanSpeed);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `Set fan speed mode error: ${error}`);
                                };
                            });
                    };
                    if (supportsSwingFunction) {
                        melCloudService.getCharacteristic(Characteristic.SwingMode)
                            .onGet(async () => {
                                //Vane Horizontal: Auto, 1, 2, 3, 4, 5, 6, 7 = Sp;it, 12 = Swing //Vertical: Auto, 1, 2, 3, 4, 5, 7 = Swing
                                const value = this.accessory.currentSwingMode;
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    deviceData.Device.VaneHorizontalDirection = value ? 12 : 0;
                                    deviceData.Device.VaneVerticalDirection = value ? 7 : 0;
                                    if (this.logInfo) this.emit('info', `Set air direction mode: ${AirConditioner.AirDirectionMapEnumToString[value]}`);
                                    await this.melCloudAta.send(this.accountType, this.displayType, deviceData, AirConditioner.EffectiveFlags.VaneVerticalVaneHorizontal);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `Set air direction mode error: ${error}`);
                                };
                            });
                    };
                    melCloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
                        .setProps({
                            minValue: this.accessory.minTempCoolDryAuto,
                            maxValue: this.accessory.maxTempCoolDryAuto,
                            minStep: this.accessory.temperatureStep
                        })
                        .onGet(async () => {
                            const value = this.accessory.operationMode === 8 ? this.accessory.defaultCoolingSetTemperature : this.accessory.setTemperature;
                            return value;
                        })
                        .onSet(async (value) => {
                            try {
                                const tempKey = this.accessory.operationMode === 8 ? 'DefaultCoolingSetTemperature' : 'SetTemperature';
                                deviceData.Device[tempKey] = value;
                                if (this.logInfo) this.emit('info', `Set cooling threshold temperature: ${value}${this.accessory.temperatureUnit}`);
                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, AirConditioner.EffectiveFlags.SetTemperature);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Set cooling threshold temperature error: ${error}`);
                            };
                        });
                    if (supportsHeat) {
                        melCloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
                            .setProps({
                                minValue: this.accessory.minTempHeat,
                                maxValue: this.accessory.maxTempHeat,
                                minStep: this.accessory.temperatureStep
                            })
                            .onGet(async () => {
                                const value = this.accessory.operationMode === 8 ? this.accessory.defaultHeatingSetTemperature : this.accessory.setTemperature;
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    const tempKey = this.accessory.operationMode === 8 ? 'DefaultHeatingSetTemperature' : 'SetTemperature';
                                    deviceData.Device[tempKey] = value;
                                    if (this.logInfo) this.emit('info', `Set heating threshold temperature: ${value}${this.accessory.temperatureUnit}`);
                                    await this.melCloudAta.send(this.accountType, this.displayType, deviceData, AirConditioner.EffectiveFlags.SetTemperature);
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
                            if (this.account.type === 'melcloudhome') return;

                            try {
                                value = value ? true : false;
                                deviceData.Device.ProhibitSetTemperature = value;
                                deviceData.Device.ProhibitOperationMode = value;
                                deviceData.Device.ProhibitPower = value;
                                if (this.logInfo) this.emit('info', `Set local physical controls: ${value ? 'Lock' : 'Unlock'}`);
                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, AirConditioner.EffectiveFlags.Prohibit);
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
                            if (this.account.type === 'melcloudhome') return;

                            try {
                                this.accessory.useFahrenheit = value ? true : false;
                                if (this.logInfo) this.emit('info', `Set temperature display unit: ${TemperatureDisplayUnits[value]}`);
                                this.accountInfo.UseFahrenheit = value ? true : false;
                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, 'account', this.accountInfo);
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
                                        flag = AirConditioner.EffectiveFlags.Power;
                                        break;
                                    case 1: //HEAT - HEAT
                                        value = heatDryFanMode;
                                        flag = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                        break;
                                    case 2: //COOL - COOL
                                        value = coolDryFanMode;
                                        flag = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature
                                        break;
                                    case 3: //AUTO - AUTO
                                        value = autoDryFanMode;
                                        flag = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                        break;
                                };

                                deviceData.Device.Power = value > 0 ? true : false;
                                deviceData.Device.OperationMode = value;
                                if (this.logInfo) this.emit('info', `Set operation mode: ${AirConditioner.OperationModeMapEnumToString[value]}`);
                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, flag);
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
                            minValue: this.accessory.minTempHeat,
                            maxValue: this.accessory.maxTempHeat,
                            minStep: this.accessory.temperatureStep
                        })
                        .onGet(async () => {
                            const value = this.accessory.setTemperature;
                            return value;
                        })
                        .onSet(async (value) => {
                            try {
                                deviceData.Device.SetTemperature = value;
                                if (this.logInfo) this.emit('info', `Set temperature: ${value}${this.accessory.temperatureUnit}`);
                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, AirConditioner.EffectiveFlags.SetTemperature);
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
                            if (this.account.type === 'melcloudhome') return;

                            try {
                                this.accessory.useFahrenheit = value ? true : false;
                                if (this.logInfo) this.emit('info', `Set temperature display unit: ${TemperatureDisplayUnits[value]}`);
                                this.accountInfo.UseFahrenheit = value ? true : false;
                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, 'account', this.accountInfo);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Set temperature display unit error: ${error}`);
                            };
                        });
                    this.melCloudService = melCloudServiceT;
                    accessory.addService(melCloudServiceT);
                    break;
            };

            //temperature sensor services
            if (this.temperatureSensor && this.accessory.roomTemperature !== null) {
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
            };

            if (this.temperatureOutdoorSensor && supportsOutdoorTemperature && this.accessory.outdoorTemperature !== null) {
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
            };

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
                this.frostProtectionControlService = new Service.Switch(`${serviceName} Frost Protection`, `frostProtectionControlService${deviceId}`);
                this.frostProtectionControlService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.frostProtectionControlService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Frost Protection`);
                this.frostProtectionControlService.getCharacteristic(Characteristic.On)
                    .onGet(async () => {
                        const state = this.accessory.frostProtectionEnabled;
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            deviceData.FrostProtection.Enabled = state;
                            if (this.logInfo) this.emit('info', `Frost protection: ${state ? 'Enabled' : 'Disabled'}`);
                            await this.melCloudAta.send(this.accountType, this.displayType, deviceData, 'frostprotection');
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `Set frost protection error: ${error}`);
                        };
                    });
                accessory.addService(this.frostProtectionControlService);

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
                        const state = this.accessory.frostProtectionActive;
                        return state;
                    })
                accessory.addService(this.frostProtectionSensorService);
            }

            //overheat protection
            if (this.overheatProtectionSupport && this.accessory.overheatProtectionEnabled !== null) {
                //control
                if (this.logDebug) this.emit('debug', `Prepare overheat protection control service`);
                this.overheatProtectionControlService = new Service.Switch(`${serviceName} Overheat Protection`, `overheatProtectionControlService${deviceId}`);
                this.overheatProtectionControlService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.overheatProtectionControlService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Overheat Protection`);
                this.overheatProtectionControlService.getCharacteristic(Characteristic.On)
                    .onGet(async () => {
                        const state = this.accessory.overheatProtectionEnabled;
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            deviceData.OverheatProtection.Enabled = state;
                            if (this.logInfo) this.emit('info', `Overheat protection: ${state ? 'Enabled' : 'Disabled'}`);
                            await this.melCloudAta.send(this.accountType, this.displayType, deviceData, 'overheatprotection');
                        } catch (error) {
                            if (this.logWarn) this.emit('warn', `Set overheat protection error: ${error}`);
                        };
                    });
                accessory.addService(this.overheatProtectionControlService);

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
                        const state = this.accessory.overheatProtectionActive;
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
                            deviceData.HolidayMode.Enabled = state;
                            if (this.logInfo) this.emit('info', `Holiday mode: ${state ? 'Enabled' : 'Disabled'}`);
                            await this.melCloudAta.send(this.accountType, this.displayType, deviceData, 'holidaymode');
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
                this.holidayModeSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Holiday Mode`);
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

                    //get name
                    const name = preset.name;

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

                                    if (this.logInfo) this.emit('info', `Preset: ${name}: ${state ? 'Set' : 'Unset'}`);
                                    await this.melCloudAta.send(this.accountType, this.displayType, deviceData, AirConditioner.EffectiveFlags.Presets);
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
                                const state = this.accessory.scheduleEnabled;
                                return state;
                            })
                        this.presetControlSensorServices.push(presetControlSensorService);
                        accessory.addService(presetControlSensorService);
                    }
                });
            };

            //schedules services
            if (this.schedules.length > 0 && this.accessory.scheduleEnabled !== null) {
                if (this.logDebug) this.emit('debug', `Prepare schedules services`);
                this.scheduleSensorServices = [];
                this.schedules.forEach((schedule, i) => {
                    const scheduleData = schedulesOnServer.find(s => s.Id === schedule.id);

                    //get name
                    const name = schedule.name;

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
                                        deviceData.ScheduleEnabled = state;
                                        if (this.logInfo) this.emit('info', `Schedules: ${state ? 'Enabled' : 'Disabled'}`);
                                        await this.melCloudAta.send(this.accountType, this.displayType, deviceData, 'schedule', scheduleData);
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
                                    if (this.logInfo) this.emit('info', `Scene ${name}: ${state ? 'Set' : 'Unset'}`);
                                    await this.melCloudAta.send(this.accountType, this.displayType, deviceData, 'scene', sceneData);
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
            };

            //buttons services
            if (this.buttons.length > 0) {
                if (this.logDebug) this.emit('debug', `Prepare buttons / sensors services`);
                this.buttonControlServices = [];
                this.buttonControlSensorServices = [];
                this.buttons.forEach((button, i) => {
                    //get mode
                    const mode = button.mode;

                    //get name
                    const name = button.name;

                    //get name prefix
                    const namePrefix = button.namePrefix;

                    const serviceName = namePrefix ? `${accessoryName} ${name}` : name;
                    const serviceType = button.serviceType;
                    const characteristicType = button.characteristicType;

                    //control
                    if (button.displayType > 3) {
                        if (this.logDebug) this.emit('debug', `Prepare button control ${name} service`);
                        const buttonControlService = new serviceType(serviceName, `buttonControlService${deviceId} ${i}`);
                        buttonControlService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        buttonControlService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                        buttonControlService.getCharacteristic(Characteristic, On)
                            .onGet(async () => {
                                const state = button.state;
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    const fanKey = this.accountType === 'melcloud' ? 'FanSpeed' : 'SetFanSpeed';
                                    let flag = null;
                                    switch (mode) {
                                        case 0: //POWER ON,OFF
                                            deviceData.Device.Power = state;
                                            flag = AirConditioner.EffectiveFlags.Power;
                                            break;
                                        case 1: //OPERATING MODE HEAT
                                            button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationMode = state ? 1 : button.previousValue === 9 ? 1 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                            break;
                                        case 2: //OPERATING MODE DRY
                                            button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationMode = state ? 2 : button.previousValue === 10 ? 2 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                            break
                                        case 3: //OPERATING MODE COOL
                                            button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationMode = state ? 3 : button.previousValue === 11 ? 3 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                            break;
                                        case 4: //OPERATING MODE FAN
                                            button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationMode = state ? 7 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                            break;
                                        case 5: //OPERATING MODE AUTO
                                            button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationMode = state ? 8 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                            break;
                                        case 6: //OPERATING MODE PURIFY
                                            button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.OperationMode = state ? 12 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                            break;
                                        case 7: //OPERATING MODE DRY CONTROL HIDE
                                            deviceData.HideDryModeControl = state;
                                            break;
                                        case 10: //VANE H SWING MODE AUTO
                                            button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.VaneHorizontalDirection = state ? 0 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                            break;
                                        case 11: //VANE H SWING MODE 1
                                            button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.VaneHorizontalDirection = state ? 1 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                            break;
                                        case 12: //VANE H SWING MODE 2
                                            button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.VaneHorizontalDirection = state ? 2 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                            break;
                                        case 13: //VANE H SWING MODE 3
                                            button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.VaneHorizontalDirection = state ? 3 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                            break;
                                        case 14: //VANE H SWING MODE 4
                                            button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.VaneHorizontalDirection = state ? 4 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                            break;
                                        case 15: //VANE H SWING MODE 5
                                            button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.VaneHorizontalDirection = state ? 5 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                            break;
                                        case 16: //VANE H SWING MODE SPLIT
                                            button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.VaneHorizontalDirection = state ? 8 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                            break;
                                        case 17: //VANE H SWING MODE SWING
                                            button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.VaneHorizontalDirection = state ? 12 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                            break;
                                        case 20: //VANE V SWING MODE AUTO
                                            button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.VaneVerticalDirection = state ? 0 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerVaneVertical;
                                            break;
                                        case 21: //VANE V SWING MODE 1
                                            button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.VaneVerticalDirection = state ? 1 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerVaneVertical;
                                            break;
                                        case 22: //VANE V SWING MODE 2
                                            button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.VaneVerticalDirection = state ? 2 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerVaneVertical;
                                            break;
                                        case 23: //VANE V SWING MODE 3
                                            button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.VaneVerticalDirection = state ? 3 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerVaneVertical;
                                            break;
                                        case 24: //VANE V SWING MODE 4
                                            button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.VaneVerticalDirection = state ? 4 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerVaneVertical;
                                            break;
                                        case 25: //VANE V SWING MODE 5
                                            button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.VaneVerticalDirection = state ? 5 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerVaneVertical;
                                            break;
                                        case 26: //VANE V SWING MODE SWING
                                            button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.VaneVerticalDirection = state ? 7 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerVaneVertical;
                                            break;
                                        case 27: //VANE H/V CONTROLS HIDE
                                            deviceData.HideVaneControls = state;
                                            break;
                                        case 30: //FAN SPEED MODE AUTO
                                            button.previousValue = state ? deviceData.Device[fanKey] : button.previousValue ?? deviceData.Device[fanKey];
                                            deviceData.Device.Power = true;
                                            deviceData.Device[fanKey] = state ? 0 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerSetFanSpeed;
                                            break;
                                        case 31: //FAN SPEED MODE 1
                                            button.previousValue = state ? deviceData.Device[fanKey] : button.previousValue ?? deviceData.Device[fanKey];
                                            deviceData.Device.Power = true;
                                            deviceData.Device[fanKey] = state ? 1 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerSetFanSpeed;
                                            break;
                                        case 32: //FAN SPEED MODE 2
                                            button.previousValue = state ? deviceData.Device[fanKey] : button.previousValue ?? deviceData.Device[fanKey];
                                            deviceData.Device.Power = true;
                                            deviceData.Device[fanKey] = state ? 2 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerSetFanSpeed;
                                            break;
                                        case 33: //FAN SPEED MODE 3
                                            button.previousValue = state ? deviceData.Device[fanKey] : button.previousValue ?? deviceData.Device[fanKey];
                                            deviceData.Device.Power = true;
                                            deviceData.Device[fanKey] = state ? 3 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerSetFanSpeed;
                                            break;
                                        case 34: //FAN MODE 4
                                            button.previousValue = state ? deviceData.Device[fanKey] : button.previousValue ?? deviceData.Device[fanKey];
                                            deviceData.Device.Power = true;
                                            deviceData.Device[fanKey] = state ? 4 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerSetFanSpeed;
                                            break;
                                        case 35: //FAN SPEED MODE 5
                                            button.previousValue = state ? deviceData.Device[fanKey] : button.previousValue ?? deviceData.Device[fanKey];
                                            deviceData.Device.Power = true;
                                            deviceData.Device[fanKey] = state ? 5 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerSetFanSpeed;
                                            break;
                                        case 36: //FAN SPEED MODE 6
                                            button.previousValue = state ? deviceData.Device[fanKey] : button.previousValue ?? deviceData.Device[fanKey];
                                            deviceData.Device.Power = true;
                                            deviceData.Device[fanKey] = state ? 6 : button.previousValue;
                                            flag = AirConditioner.EffectiveFlags.PowerSetFanSpeed;
                                            break;
                                        case 37: //PHYSICAL LOCK CONTROLS
                                            deviceData.Device.ProhibitSetTemperature = state;
                                            deviceData.Device.ProhibitOperationMode = state;
                                            deviceData.Device.ProhibitPower = state;
                                            flag = AirConditioner.EffectiveFlags.Prohibit;
                                            break;
                                        case 38: //PHYSICAL LOCK CONTROLS POWER
                                            deviceData.Device.ProhibitPower = state;
                                            flag = AirConditioner.EffectiveFlags.Prohibit;
                                            break;
                                        case 39: //PHYSICAL LOCK CONTROLS MODE
                                            deviceData.Device.ProhibitOperationMode = state;
                                            flag = AirConditioner.EffectiveFlags.Prohibit;
                                            break;
                                        case 40: //PHYSICAL LOCK CONTROLS TEMP
                                            deviceData.Device.ProhibitSetTemperature = state;
                                            flag = AirConditioner.EffectiveFlags.Prohibit;
                                            break;
                                        default:
                                            if (this.logWarn) this.emit('warn', `Unknown button mode: ${mode}`);
                                            break;
                                    };

                                    if (this.logInfo) this.emit('info', `Button ${name}: ${state ? `Enabled` : `Disabled`}`);
                                    await this.melCloudAta.send(this.accountType, this.displayType, deviceData, flag);
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
            this.melCloudAta = new MelCloudAta(this.account, this.device, this.devicesFile, this.defaultTempsFile, this.accountFile)
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

                    //keys
                    const accountTypeMelcloud = this.accountType === 'melcloud';
                    const fanKey = accountTypeMelcloud ? 'FanSpeed' : 'SetFanSpeed';
                    const tempStepKey = accountTypeMelcloud ? 'TemperatureIncrement' : 'HasHalfDegreeIncrements';
                    const connectKey = accountTypeMelcloud ? 'Offline' : 'IsConnected';
                    const errorKey = accountTypeMelcloud ? 'HasError' : 'IsInError';
                    const supportAirDirectionKey = accountTypeMelcloud ? 'AirDirectionFunction' : 'HasAirDirectionFunction';
                    const supportSwingKey = accountTypeMelcloud ? 'SwingFunction' : 'HasSwing';
                    const supportVideWaneKey = accountTypeMelcloud ? 'ModelSupportsWideVane' : 'SupportsWideVane';
                    const supportAutoKey = accountTypeMelcloud ? 'ModelSupportsAuto' : 'HasAutoOperationMode';
                    const supportHeatKey = accountTypeMelcloud ? 'ModelSupportsHeat' : 'HasHeatOperationMode';
                    const supportDryKey = accountTypeMelcloud ? 'ModelSupportsDry' : 'HasDryOperationMode';
                    const supportCoolKey = accountTypeMelcloud ? 'ModelSupportsCool' : 'HasCoolOperationMode';
                    const supportStandbyKey = accountTypeMelcloud ? 'ModelSupportsStandbyMode' : 'HasStandby';

                    //presets schedules
                    const presetsOnServer = deviceData.Presets ?? [];
                    const scheduleEnabled = deviceData.ScheduleEnabled;
                    const schedulesOnServer = deviceData.Schedule ?? [];
                    const scenesOnServer = deviceData.Scenes ?? [];
                    const holidayModeEnabled = deviceData.HolidayMode?.Enabled;
                    const holidayModeActive = deviceData.HolidayMode?.Active ?? false;

                    //protection
                    const frostProtectionEnabled = deviceData.FrostProtection?.Enabled;
                    const frostProtectionActive = deviceData.FrostProtection?.Active ?? false;
                    const overheatProtectionEnabled = deviceData.OverheatProtection?.Enabled;
                    const overheatProtectionActive = deviceData.OverheatProtection?.Active ?? false;

                    //device control
                    const hideVaneControls = deviceData.HideVaneControls ?? false;
                    const hideDryModeControl = deviceData.HideDryModeControl ?? false;

                    //device info
                    const supportsStanbyMode = deviceData.Device[supportStandbyKey];
                    const supportsAutomaticFanSpeed = deviceData.Device.HasAutomaticFanSpeed ?? false;
                    const supportsAirDirectionFunction = deviceData.Device[supportAirDirectionKey];
                    const supportsSwingFunction = deviceData.Device[supportSwingKey];
                    const supportsWideVane = deviceData.Device[supportVideWaneKey];
                    const supportsOutdoorTemperature = deviceData.Device.HasOutdoorTemperature;
                    const supportsFanSpeed = accountTypeMelcloud ? deviceData.Device.ModelSupportsFanSpeed : deviceData.Device.NumberOfFanSpeeds > 0;
                    const supportsAuto1 = deviceData.Device[supportAutoKey];
                    const supportsAuto = this.autoDryFanMode >= 1 && supportsAuto1
                    const supportsHeat1 = deviceData.Device[supportHeatKey];
                    const supportsHeat = this.heatDryFanMode >= 1 && supportsHeat1;
                    const supportsDry = deviceData.Device[supportDryKey];
                    const supportsCool1 = deviceData.Device[supportCoolKey];
                    const supportsCool = this.coolDryFanMode >= 1 && supportsCool1;
                    const numberOfFanSpeeds = supportsFanSpeed ? deviceData.Device.NumberOfFanSpeeds : 0;
                    const minTempHeat = 10;
                    const maxTempHeat = 31;
                    const minTempCoolDryAuto = 16;
                    const maxTempCoolDryAuto = 31;

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
                    const prohibitSetTemperature = deviceData.Device.ProhibitSetTemperature ?? false;
                    const prohibitOperationMode = deviceData.Device.ProhibitOperationMode ?? false;
                    const prohibitPower = deviceData.Device.ProhibitPower ?? false;
                    const temperatureStep = deviceData.Device[tempStepKey] ? 0.5 : 1;
                    const outdoorTemperature = deviceData.Device.OutdoorTemperature;
                    const isConnected = accountTypeMelcloud ? !deviceData.Device[connectKey] : deviceData.Device[connectKey];
                    const isInError = deviceData.Device[errorKey];

                    //accessory
                    const obj = {
                        presets: presetsOnServer,
                        schedules: schedulesOnServer,
                        scenes: scenesOnServer,
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
                        minTempHeat: minTempHeat,
                        maxTempHeat: maxTempHeat,
                        minTempCoolDryAuto: minTempCoolDryAuto,
                        maxTempCoolDryAuto: maxTempCoolDryAuto,
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
                        currentSwingMode: supportsSwingFunction && vaneHorizontalDirection === 12 && vaneVerticalDirection === 7 ? 1 : 0,
                        lockPhysicalControl: prohibitSetTemperature && prohibitOperationMode && prohibitPower ? 1 : 0,
                        temperatureStep: temperatureStep,
                        useFahrenheit: this.accountInfo.useFahrenheit ? 1 : 0,
                        temperatureUnit: TemperatureDisplayUnits[this.accountInfo.useFahrenheit ? 1 : 0],
                        isConnected: isConnected,
                        isInError: isInError,
                        frostProtectionEnabled: frostProtectionEnabled,
                        frostProtectionActive: frostProtectionActive,
                        overheatProtectionEnabled: overheatProtectionEnabled,
                        overheatProtectionActive: overheatProtectionActive,
                        holidayModeEnabled: holidayModeEnabled,
                        holidayModeActive: holidayModeActive,
                        scheduleEnabled: scheduleEnabled
                    };

                    //characteristics array
                    const characteristics = [];

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
                                    if (this.logWarn) this.emit('warn', `Unknown operating mode: ${operationMode}`);
                            }

                            obj.currentOperationMode = !power ? 0 : (inStandbyMode ? 1 : obj.currentOperationMode);
                            obj.operationModeSetPropsMinValue = supportsAuto && supportsHeat ? 0 : !supportsAuto && supportsHeat ? 1 : supportsAuto && !supportsHeat ? 0 : 2;
                            obj.operationModeSetPropsMaxValue = 2
                            obj.operationModeSetPropsValidValues = supportsAuto && supportsHeat ? [0, 1, 2] : !supportsAuto && supportsHeat ? [1, 2] : supportsAuto && !supportsHeat ? [0, 2] : [2];

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
                                    if (this.logWarn) this.emit('warn', `Unknown operating mode: ${operationMode}`);
                                    break;
                            }

                            obj.currentOperationMode = !power ? 0 : obj.currentOperationMode;
                            obj.targetOperationMode = !power ? 0 : obj.targetOperationMode;
                            obj.operationModeSetPropsMinValue = 0
                            obj.operationModeSetPropsMaxValue = supportsAuto && supportsHeat ? 3 : !supportsAuto && supportsHeat ? 2 : supportsAuto && !supportsHeat ? 3 : 2;
                            obj.operationModeSetPropsValidValues = supportsAuto && supportsHeat ? [0, 1, 2, 3] : !supportsAuto && supportsHeat ? [0, 1, 2] : supportsAuto && !supportsHeat ? [0, 2, 3] : [0, 2];

                            //create characteristics
                            characteristics.push(
                                { type: Characteristic.CurrentHeatingCoolingState, value: obj.currentOperationMode },
                                { type: Characteristic.TargetHeatingCoolingState, value: obj.targetOperationMode },
                                { type: Characteristic.CurrentTemperature, value: roomTemperature },
                                { type: Characteristic.TargetTemperature, value: setTemperature },
                                { type: Characteristic.TemperatureDisplayUnits, value: obj.useFahrenheit }
                            );
                            break;
                    };
                    this.accessory = obj;

                    //update services
                    for (const { type, value } of characteristics) {
                        if (!this.functions.isValidValue(value)) continue;
                        this.melCloudService?.updateCharacteristic(type, value);
                    }

                    //other sensors
                    this.roomTemperatureSensorService?.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature);
                    this.outdoorTemperatureSensorService?.updateCharacteristic(Characteristic.CurrentTemperature, outdoorTemperature);
                    this.inStandbyService?.updateCharacteristic(Characteristic.ContactSensorState, inStandbyMode);
                    this.connectService?.updateCharacteristic(Characteristic.ContactSensorState, isConnected);
                    this.errorService?.updateCharacteristic(Characteristic.ContactSensorState, isInError);

                    //frost protection
                    if (this.frostProtectionSupport && frostProtectionEnabled !== null) {
                        this.frostProtectionControlService?.updateCharacteristic(Characteristic.On, frostProtectionEnabled);
                        this.frostProtectionControlSensorService?.updateCharacteristic(Characteristic.ContactSensorState, frostProtectionEnabled);
                        this.frostProtectionSensorService?.updateCharacteristic(Characteristic.ContactSensorState, frostProtectionActive);
                    }

                    //overheat protection
                    if (this.overheatProtectionSupport && overheatProtectionEnabled !== null) {
                        this.overheatProtectionControlService?.updateCharacteristic(Characteristic.On, overheatProtectionEnabled);
                        this.overheatProtectionControlSensorService?.updateCharacteristic(Characteristic.ContactSensorState, overheatProtectionEnabled);
                        this.overheatProtectionSensorService?.updateCharacteristic(Characteristic.ContactSensorState, overheatProtectionActive);
                    }

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
                    };

                    ///schedules
                    if (this.schedules.length > 0 && scheduleEnabled !== null) {
                        this.schedules.forEach((schedule, i) => {
                            const scheduleData = schedulesOnServer.find(s => s.Id === schedule.id);
                            const characteristicType = schedule.characteristicType;
                            schedule.state = scheduleEnabled ? (scheduleData.Enabled ?? false) : false;

                            //control
                            if (i === 0) {
                                if (schedule.displayType > 3) this.scheduleControlService?.updateCharacteristic(Characteristic.On, scheduleEnabled);
                                if (schedule.displayType < 7) this.scheduleControlSensorService?.updateCharacteristic(characteristicType, scheduleEnabled);
                            }

                            //sensor
                            if (schedule.displayType < 7) this.scheduleSensorServices?.[i]?.updateCharacteristic(characteristicType, schedule.state);
                        });
                    };

                    //scenes
                    if (this.scenes.length > 0) {
                        this.scenes.forEach((scene, i) => {
                            const sceneData = scenesOnServer.find(s => s.Id === scene.id);
                            const characteristicType = scene.characteristicType;
                            scene.state = sceneData.Enabled;

                            //control
                            if (scene.displayType > 3) this.sceneControlServices?.[i]?.updateCharacteristic(Characteristic.On, scene.state);

                            //sensor
                            if (scene.displayType < 7) this.sceneControlSensorServices?.[i]?.updateCharacteristic(characteristicType, scene.state);
                        });
                    };

                    //buttons
                    if (this.buttons.length > 0) {
                        this.buttons.forEach((button, i) => {
                            const characteristicType = button.characteristicType;
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
                                case 7: //OPERATING MODE DRY CONTROL HIDE
                                    button.state = power ? (hideDryModeControl === true) : false;
                                    break;
                                case 10: //VANE H SWING MODE AUTO
                                    button.state = power ? (vaneHorizontalDirection === 0) : false;
                                    break;
                                case 11: //VANE H SWING MODE 1
                                    button.state = power ? (vaneHorizontalDirection === 1) : false;
                                    break;
                                case 12: //VANE H SWING MODE 2
                                    button.state = power ? (vaneHorizontalDirection === 2) : false;
                                    break;
                                case 13: //VANE H SWING MODE 3
                                    button.state = power ? (vaneHorizontalDirection === 3) : false;
                                    break;
                                case 14: //VANE H SWING MODE 4
                                    button.state = power ? (vaneHorizontalDirection === 4) : false;
                                    break;
                                case 15: //VANE H SWING MODE 5
                                    button.state = power ? (vaneHorizontalDirection === 5) : false;
                                    break;
                                case 16: //VANE H SWING MODE SPLIT
                                    button.state = power ? (vaneHorizontalDirection === 8) : false;
                                    break;
                                case 17: //VANE H SWING MODE SWING
                                    button.state = power ? (vaneHorizontalDirection === 12) : false;
                                    break;
                                case 20: //VANE V SWING MODE AUTO
                                    button.state = power ? (vaneVerticalDirection === 0) : false;
                                    break;
                                case 21: //VANE V SWING MODE 1
                                    button.state = power ? (vaneVerticalDirection === 1) : false;
                                    break;
                                case 22: //VANE V SWING MODE 2
                                    button.state = power ? (vaneVerticalDirection === 2) : false;
                                    break;
                                case 23: //VANE V SWING MODE 3
                                    button.state = power ? (vaneVerticalDirection === 3) : false;
                                    break;
                                case 24: //VANE V SWING MODE 4
                                    button.state = power ? (vaneVerticalDirection === 4) : false;
                                    break;
                                case 25: //VANE V SWING MODE 5
                                    button.state = power ? (vaneVerticalDirection === 5) : false;
                                    break;
                                case 26: //VANE V SWING MODE SWING
                                    button.state = power ? (vaneVerticalDirection === 7) : false;
                                    break;
                                case 27: //VANE H/V CONTROLS HIDE
                                    button.state = power ? (hideVaneControls === true) : false;
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
                                    button.state = (prohibitPower === true);
                                    break;
                                case 39: //PHYSICAL LOCK CONTROLS MODE
                                    button.state = (prohibitOperationMode === true);
                                    break;
                                case 40: //PHYSICAL LOCK CONTROLS TEMP
                                    button.state = (prohibitSetTemperature === true);
                                    break;
                                default: //Unknown button
                                    if (this.logWarn) this.emit('warn', `Unknown button mode: ${mode} detected`);
                                    break;
                            };

                            //control
                            if (button.displayType > 3) this.buttonControlServices?.[i]?.updateCharacteristic(Characteristic.On, button.state);

                            //sensor
                            if (button.displayType < 7) this.buttonControlSensorServices?.[i]?.updateCharacteristic(characteristicType, button.state);
                        });
                    };

                    //log current state
                    if (this.logInfo) {
                        this.emit('info', `Power: ${power ? 'On' : 'Off'}`);
                        this.emit('info', `Target operation mode: ${AirConditioner.OperationModeMapEnumToString[operationMode]}`);
                        this.emit('info', `Current operation mode: ${this.displayType === 1 ? AirConditioner.CurrentOperationModeHeatherCoolerMapEnumToString[obj.currentOperationMode] : AirConditioner.CurrentOperationModeThermostatMapEnumToString[obj.currentOperationMode]}`);
                        this.emit('info', `Target temperature: ${setTemperature}${obj.temperatureUnit}`);
                        this.emit('info', `Current temperature: ${roomTemperature}${obj.temperatureUnit}`);
                        if (supportsOutdoorTemperature && outdoorTemperature !== null) this.emit('info', `Outdoor temperature: ${outdoorTemperature}${obj.temperatureUnit}`);
                        if (supportsFanSpeed) this.emit('info', `Target fan speed: ${AirConditioner.FanSpeedMapEnumToString[setFanSpeed]}`);
                        if (supportsFanSpeed) this.emit('info', `Current fan speed: ${AirConditioner.FanSpeedCurrentMapEnumToString[actualFanSpeed]}`);
                        if (vaneHorizontalDirection !== null) this.emit('info', `Vane horizontal: ${AirConditioner.VaneHorizontalDirectionMapEnumToString[vaneHorizontalDirection]}`);
                        if (vaneVerticalDirection !== null) this.emit('info', `Vane vertical: ${AirConditioner.VaneVerticalDirectionMapEnumToString[vaneVerticalDirection]}`);
                        if (supportsSwingFunction) this.emit('info', `Air direction: ${AirConditioner.AirDirectionMapEnumToString[obj.currentSwingMode]}`);
                        this.emit('info', `Temperature display unit: ${obj.temperatureUnit}`);
                        this.emit('info', `Lock physical controls: ${obj.lockPhysicalControl ? 'Locked' : 'Unlocked'}`);
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
            await this.melCloudAta.checkState();

            //prepare accessory
            const accessory = await this.prepareAccessory();
            return accessory;
        } catch (error) {
            throw new Error(`Start error: ${error}`);
        };
    };
};
export default DeviceAta;
