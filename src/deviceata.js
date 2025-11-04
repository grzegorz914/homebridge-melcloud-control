import EventEmitter from 'events';
import MelCloudAta from './melcloudata.js';
import RestFul from './restful.js';
import Mqtt from './mqtt.js';
import { TemperatureDisplayUnits, AirConditioner } from './constants.js';
let Accessory, Characteristic, Service, Categories, AccessoryUUID;

class DeviceAta extends EventEmitter {
    constructor(api, account, device, devicesFile, defaultTempsFile, useFahrenheit, restFul, mqtt) {
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
        this.temperatureSensor = device.temperatureSensor || false;
        this.temperatureSensorOutdoor = device.temperatureSensorOutdoor || false;
        this.errorSensor = device.errorSensor || false;
        this.heatDryFanMode = device.heatDryFanMode || 1; //NONE, HEAT, DRY, FAN
        this.coolDryFanMode = device.coolDryFanMode || 1; //NONE, COOL, DRY, FAN
        this.autoDryFanMode = device.autoDryFanMode || 1; //NONE, AUTO, DRY, FAN
        this.presets = (device.presets || []).filter(preset => (preset.displayType ?? 0) > 0);
        this.buttons = (device.buttonsSensors || []).filter(sensor => (sensor.displayType ?? 0) > 0);
        this.deviceId = device.id;
        this.deviceName = device.name;
        this.deviceTypeText = device.typeString;
        this.devicesFile = devicesFile;
        this.defaultTempsFile = defaultTempsFile;
        this.displayDeviceInfo = true;

        //external integrations
        this.restFul = restFul;
        this.restFulConnected = false;
        this.mqtt = mqtt;
        this.mqttConnected = false;

        //presets configured
        for (const preset of this.presets) {
            preset.name = preset.name || 'Preset'
            preset.serviceType = [null, Service.Outlet, Service.Switch, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][preset.displayType];
            preset.characteristicType = [null, Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][preset.displayType];
            preset.state = false;
            preset.previousSettings = {};
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
                        port: this.deviceId.toString().slice(-4).replace(/^0/, '9'),
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
            let effectiveFlags = null;
            switch (key) {
                case 'Power':
                    deviceData.Device[key] = value;
                    effectiveFlags = AirConditioner.EffectiveFlags.Power;
                    break;
                case 'OperationMode':
                    deviceData.Device[key] = value;
                    effectiveFlags = AirConditioner.EffectiveFlags.OperationMode
                    break;
                case 'SetTemperature':
                    deviceData.Device[key] = value;
                    effectiveFlags = AirConditioner.EffectiveFlags.SetTemperature;
                    break;
                case 'DefaultCoolingSetTemperature':
                    deviceData.Device[key] = value;
                    effectiveFlags = AirConditioner.EffectiveFlags.SetTemperature;
                    break;
                case 'DefaultHeatingSetTemperature':
                    deviceData.Device[key] = value;
                    effectiveFlags = AirConditioner.EffectiveFlags.SetTemperature;
                    break;
                case 'FanSpeed':
                    deviceData.Device[key] = value;
                    effectiveFlags = AirConditioner.EffectiveFlags.SetFanSpeed;
                    break;
                case 'VaneHorizontalDirection':
                    deviceData.Device[key] = value;
                    effectiveFlags = AirConditioner.EffectiveFlags.VaneHorizontalDirection;
                    break;
                case 'VaneVerticalDirection':
                    deviceData.Device[key] = value;
                    effectiveFlags = AirConditioner.EffectiveFlags.VaneVerticalDirection;
                    break;
                case 'HideVaneControls':
                    deviceData[key] = value;
                    effectiveFlags = AirConditioner.EffectiveFlags.Prohibit;
                    break;
                case 'HideDryModeControl':
                    deviceData[key] = value;
                    effectiveFlags = AirConditioner.EffectiveFlags.Prohibit;
                    break;
                case 'ProhibitSetTemperature':
                    deviceData.Device[key] = value;
                    effectiveFlags = AirConditioner.EffectiveFlags.Prohibit;
                    break;
                case 'ProhibitOperationMode':
                    deviceData.Device[key] = value;
                    effectiveFlags = AirConditioner.EffectiveFlags.Prohibit;
                    break;
                case 'ProhibitPower':
                    deviceData.Device[key] = value;
                    effectiveFlags = AirConditioner.EffectiveFlags.Prohibit;
                    break;
                default:
                    this.emit('warn', `${integration}, received key: ${key}, value: ${value}`);
                    break;
            };

            set = await this.melCloudAta.send(this.accountType, this.displayType, deviceData, effectiveFlags);
            return set;
        } catch (error) {
            throw new Error(`${integration} set key: ${key}, value: ${value}, error: ${error.message ?? error}`);
        };
    }

    async startStopImpulseGenerator(state, timers = []) {
        try {
            //start impulse generator 
            await this.melCloudAta.impulseGenerator.state(state, timers)
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
            const accessoryCategory = [Categories.OTHER, Categories.AIR_HEATER, Categories.THERMOSTAT][this.displayType];
            const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

            //information service
            if (this.logDebug) this.emit('debug', `Prepare information service`);
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
                .setCharacteristic(Characteristic.Model, this.model)
                .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
                .setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision)
                .setCharacteristic(Characteristic.ConfiguredName, accessoryName);

            //melcloud services
            const serviceName = `${deviceTypeText} ${accessoryName}`;
            switch (this.displayType) {
                case 1: //Heater Cooler
                    if (this.logDebug) this.emit('debug', `Prepare heater/cooler service`);
                    this.melCloudService = new Service.HeaterCooler(serviceName, `HeaterCooler ${deviceId}`);
                    this.melCloudService.setPrimaryService(true);
                    this.melCloudService.getCharacteristic(Characteristic.Active)
                        .onGet(async () => {
                            const state = this.accessory.power;
                            return state;
                        })
                        .onSet(async (state) => {
                            if (!!state === this.accessory.power) return;

                            try {
                                deviceData.Device.Power = state ? true : false;
                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, AirConditioner.EffectiveFlags.Power);
                                if (this.logInfo) this.emit('info', `Set power: ${state ? 'ON' : 'OFF'}`);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Set power error: ${error}`);
                            };
                        });
                    this.melCloudService.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
                        .onGet(async () => {
                            const value = this.accessory.currentOperationMode;
                            return value;
                        });
                    this.melCloudService.getCharacteristic(Characteristic.TargetHeaterCoolerState)
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
                                        deviceData.Device.OperationMode = value;
                                        break;
                                    case 1: //HEAT - HEAT
                                        value = heatDryFanMode;
                                        deviceData.Device.OperationMode = value;
                                        break;
                                    case 2: //COOL - COOL
                                        value = coolDryFanMode;
                                        deviceData.Device.OperationMode = value;
                                        break;
                                };

                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, AirConditioner.EffectiveFlags.OperationMode);
                                if (this.logInfo) this.emit('info', `Set operation mode: ${AirConditioner.OperationModeMapEnumToString[value]}`);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Set operation mode error: ${error}`);
                            };
                        });
                    this.melCloudService.getCharacteristic(Characteristic.CurrentTemperature)
                        .onGet(async () => {
                            const value = this.accessory.roomTemperature;
                            return value;
                        });
                    if (supportsFanSpeed) {
                        this.melCloudService.getCharacteristic(Characteristic.RotationSpeed)
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

                                    deviceData.Device[fanKey] = value
                                    await this.melCloudAta.send(this.accountType, this.displayType, deviceData, AirConditioner.EffectiveFlags.SetFanSpeed);
                                    if (this.logInfo) this.emit('info', `Set fan speed mode: ${AirConditioner.FanSpeedMapEnumToString[value]}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `Set fan speed mode error: ${error}`);
                                };
                            });
                    };
                    if (supportsSwingFunction) {
                        this.melCloudService.getCharacteristic(Characteristic.SwingMode)
                            .onGet(async () => {
                                //Vane Horizontal: Auto, 1, 2, 3, 4, 5, 6, 7 = Sp;it, 12 = Swing //Vertical: Auto, 1, 2, 3, 4, 5, 7 = Swing
                                const value = this.accessory.currentSwingMode;
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    deviceData.Device.VaneHorizontalDirection = value ? 12 : 0;
                                    deviceData.Device.VaneVerticalDirection = value ? 7 : 0;
                                    await this.melCloudAta.send(this.accountType, this.displayType, deviceData, AirConditioner.EffectiveFlags.VaneVerticalVaneHorizontal);
                                    if (this.logInfo) this.emit('info', `Set air direction mode: ${AirConditioner.AirDirectionMapEnumToString[value]}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `Set vane swing mode error: ${error}`);
                                };
                            });
                    };
                    this.melCloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
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
                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, AirConditioner.EffectiveFlags.SetTemperature);
                                if (this.logInfo) this.emit('info', `Set cooling threshold temperature: ${value}${this.accessory.temperatureUnit}`);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Set cooling threshold temperature error: ${error}`);
                            };
                        });
                    if (supportsHeat) {
                        this.melCloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
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
                                    await this.melCloudAta.send(this.accountType, this.displayType, deviceData, AirConditioner.EffectiveFlags.SetTemperature);
                                    if (this.logInfo) this.emit('info', `Set heating threshold temperature: ${value}${this.accessory.temperatureUnit}`);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `Set heating threshold temperature error: ${error}`);
                                };
                            });
                    };
                    this.melCloudService.getCharacteristic(Characteristic.LockPhysicalControls)
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
                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, AirConditioner.EffectiveFlags.Prohibit);
                                if (this.logInfo) this.emit('info', `Set local physical controls: ${value ? 'LOCK' : 'UNLOCK'}`);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Set lock physical controls error: ${error}`);
                            };
                        });
                    this.melCloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
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
                    accessory.addService(this.melCloudService);
                    break;
                case 2: //Thermostat
                    if (this.logDebug) this.emit('debug', `Prepare thermostat service`);
                    this.melCloudService = new Service.Thermostat(serviceName, `Thermostat ${deviceId}`);
                    this.melCloudService.setPrimaryService(true);
                    this.melCloudService.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
                        .onGet(async () => {
                            const value = this.accessory.currentOperationMode;
                            return value;
                        });
                    this.melCloudService.getCharacteristic(Characteristic.TargetHeatingCoolingState)
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
                                let effectiveFlags = null;
                                switch (value) {
                                    case 0: //OFF - POWER OFF
                                        value = deviceData.Device.OperationMode;
                                        deviceData.Device.Power = false;
                                        effectiveFlags = AirConditioner.EffectiveFlags.Power;
                                        break;
                                    case 1: //HEAT - HEAT
                                        deviceData.Device.Power = true;
                                        value = heatDryFanMode;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                        break;
                                    case 2: //COOL - COOL
                                        value = coolDryFanMode;
                                        deviceData.Device.Power = true;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature
                                        break;
                                    case 3: //AUTO - AUTO
                                        value = autoDryFanMode;
                                        deviceData.Device.Power = true;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                        break;
                                };

                                deviceData.Device.OperationMode = value;
                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, effectiveFlags);
                                const operationModeText = AirConditioner.OperationModeMapEnumToString[value];
                                if (this.logInfo) this.emit('info', `Set operation mode: ${operationModeText}`);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Set operation mode error: ${error}`);
                            };
                        });
                    this.melCloudService.getCharacteristic(Characteristic.CurrentTemperature)
                        .onGet(async () => {
                            const value = this.accessory.roomTemperature;
                            return value;
                        });
                    this.melCloudService.getCharacteristic(Characteristic.TargetTemperature)
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
                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, AirConditioner.EffectiveFlags.SetTemperature);
                                if (this.logInfo) this.emit('info', `Set temperature: ${value}${this.accessory.temperatureUnit}`);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Set temperature error: ${error}`);
                            };
                        });
                    this.melCloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
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
                    accessory.addService(this.melCloudService);
                    break;
            };

            //temperature sensor services
            if (this.temperatureSensor && this.accessory.roomTemperature !== null) {
                if (this.logDebug) this.emit('debug', `Prepare room temperature sensor service`);
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
                        const state = this.accessory.roomTemperature;
                        return state;
                    })
                accessory.addService(this.roomTemperatureSensorService);
            };

            if (this.temperatureSensorOutdoor && supportsOutdoorTemperature && this.accessory.outdoorTemperature !== null) {
                if (this.logDebug) this.emit('debug', `Prepare outdoor temperature sensor service`);
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
                        const state = this.accessory.outdoorTemperature;
                        return state;
                    })
                accessory.addService(this.outdoorTemperatureSensorService);
            };

            //error sensor
            if (this.errorSensor) {
                if (this.logDebug) this.emit('debug', `Prepare error service`);
                this.errorService = new Service.ContactSensor(`${serviceName} Error`, `Error Sensor ${deviceId}`);
                this.errorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.errorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Error`);
                this.errorService.getCharacteristic(Characteristic.ContactSensorState)
                    .onGet(async () => {
                        const state = this.accessory.isInError;
                        return state;
                    })
                accessory.addService(this.errorService);
            }

            //presets services
            if (this.presets.length > 0) {
                if (this.logDebug) this.emit('debug', `Prepare presets services`);
                this.presetsServices = [];
                this.presets.forEach((preset, i) => {
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
                                const fanKey = this.accountType === 'melcloud' ? 'FanSpeed' : 'SetFanSpeed';
                                switch (state) {
                                    case true:
                                        preset.previousSettings = deviceData.Device;
                                        deviceData.Device.Power = presetData.Power;
                                        deviceData.Device.OperationMode = presetData.OperationMode;
                                        deviceData.Device.SetTemperature = presetData.SetTemperature;
                                        deviceData.Device.VaneHorizontalDirection = presetData.VaneHorizontalDirection;
                                        deviceData.Device.VaneVerticalDirection = presetData.VaneVerticalDirection;
                                        deviceData.Device[fanKey] = presetData[fanKey];
                                        break;
                                    case false:
                                        deviceData.Device.Power = preset.previousSettings.Power;
                                        deviceData.Device.OperationMode = preset.previousSettings.OperationMode;
                                        deviceData.Device.SetTemperature = preset.previousSettings.SetTemperature;
                                        deviceData.Device.VaneHorizontalDirection = preset.previousSettings.VaneHorizontalDirection;
                                        deviceData.Device.VaneVerticalDirection = preset.previousSettings.VaneVerticalDirection;
                                        deviceData.Device[fanKey] = preset.previousSettings[fanKey];
                                        break;
                                };

                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, AirConditioner.EffectiveFlags.Presets);
                                if (this.logInfo) this.emit('info', `${state ? 'Set:' : 'Unset:'} ${name}`);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Set preset error: ${error}`);
                            };
                        });
                    this.presetsServices.push(presetService);
                    accessory.addService(presetService);
                });
            };

            //buttons services
            if (this.buttons.length > 0) {
                if (this.logDebug) this.emit('debug', `Prepare buttons/sensors services`);
                this.buttonsServices = [];
                this.buttons.forEach((button, i) => {
                    //get button mode
                    const mode = button.mode;

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
                            try {
                                const key = this.accountType === 'melcloud' ? 'FanSpeed' : 'SetFanSpeed';
                                let effectiveFlags = null;
                                switch (mode) {
                                    case 0: //POWER ON,OFF
                                        deviceData.Device.Power = state;
                                        effectiveFlags = AirConditioner.EffectiveFlags.Power;
                                        break;
                                    case 1: //OPERATING MODE HEAT
                                        button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.OperationMode = state ? 1 : button.previousValue === 9 ? 1 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                        break;
                                    case 2: //OPERATING MODE DRY
                                        button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.OperationMode = state ? 2 : button.previousValue === 10 ? 2 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                        break
                                    case 3: //OPERATING MODE COOL
                                        button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.OperationMode = state ? 3 : button.previousValue === 11 ? 3 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                        break;
                                    case 4: //OPERATING MODE FAN
                                        button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.OperationMode = state ? 7 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                        break;
                                    case 5: //OPERATING MODE AUTO
                                        button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.OperationMode = state ? 8 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                        break;
                                    case 6: //OPERATING MODE PURIFY
                                        button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.OperationMode = state ? 12 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                        break;
                                    case 7: //OPERATING MODE DRY CONTROL HIDE
                                        deviceData.HideDryModeControl = state;
                                        break;
                                    case 10: //VANE H SWING MODE AUTO
                                        button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneHorizontalDirection = state ? 0 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                        break;
                                    case 11: //VANE H SWING MODE 1
                                        button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneHorizontalDirection = state ? 1 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                        break;
                                    case 12: //VANE H SWING MODE 2
                                        button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneHorizontalDirection = state ? 2 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                        break;
                                    case 13: //VANE H SWING MODE 3
                                        button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneHorizontalDirection = state ? 3 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                        break;
                                    case 14: //VANE H SWING MODE 4
                                        button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneHorizontalDirection = state ? 4 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                        break;
                                    case 15: //VANE H SWING MODE 5
                                        button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneHorizontalDirection = state ? 5 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                        break;
                                    case 16: //VANE H SWING MODE SPLIT
                                        button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneHorizontalDirection = state ? 8 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                        break;
                                    case 17: //VANE H SWING MODE SWING
                                        button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneHorizontalDirection = state ? 12 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                        break;
                                    case 20: //VANE V SWING MODE AUTO
                                        button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneVerticalDirection = state ? 0 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerVaneVertical;
                                        break;
                                    case 21: //VANE V SWING MODE 1
                                        button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneVerticalDirection = state ? 1 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerVaneVertical;
                                        break;
                                    case 22: //VANE V SWING MODE 2
                                        button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneVerticalDirection = state ? 2 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerVaneVertical;
                                        break;
                                    case 23: //VANE V SWING MODE 3
                                        button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneVerticalDirection = state ? 3 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerVaneVertical;
                                        break;
                                    case 24: //VANE V SWING MODE 4
                                        button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneVerticalDirection = state ? 4 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerVaneVertical;
                                        break;
                                    case 25: //VANE V SWING MODE 5
                                        button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneVerticalDirection = state ? 5 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerVaneVertical;
                                        break;
                                    case 26: //VANE V SWING MODE SWING
                                        button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneVerticalDirection = state ? 7 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerVaneVertical;
                                        break;
                                    case 27: //VANE H/V CONTROLS HIDE
                                        deviceData.HideVaneControls = state;
                                        break;
                                    case 30: //FAN SPEED MODE AUTO
                                        button.previousValue = state ? deviceData.Device[fanKey] : button.previousValue ?? deviceData.Device[fanKey];
                                        deviceData.Device.Power = true;
                                        deviceData.Device[fanKey] = state ? 0 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerSetFanSpeed;
                                        break;
                                    case 31: //FAN SPEED MODE 1
                                        button.previousValue = state ? deviceData.Device[fanKey] : button.previousValue ?? deviceData.Device[fanKey];
                                        deviceData.Device.Power = true;
                                        deviceData.Device[fanKey] = state ? 1 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerSetFanSpeed;
                                        break;
                                    case 32: //FAN SPEED MODE 2
                                        button.previousValue = state ? deviceData.Device[fanKey] : button.previousValue ?? deviceData.Device[fanKey];
                                        deviceData.Device.Power = true;
                                        deviceData.Device[fanKey] = state ? 2 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerSetFanSpeed;
                                        break;
                                    case 33: //FAN SPEED MODE 3
                                        button.previousValue = state ? deviceData.Device[fanKey] : button.previousValue ?? deviceData.Device[fanKey];
                                        deviceData.Device.Power = true;
                                        deviceData.Device[fanKey] = state ? 3 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerSetFanSpeed;
                                        break;
                                    case 34: //FAN MODE 4
                                        button.previousValue = state ? deviceData.Device[fanKey] : button.previousValue ?? deviceData.Device[fanKey];
                                        deviceData.Device.Power = true;
                                        deviceData.Device[fanKey] = state ? 4 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerSetFanSpeed;
                                        break;
                                    case 35: //FAN SPEED MODE 5
                                        button.previousValue = state ? deviceData.Device[fanKey] : button.previousValue ?? deviceData.Device[fanKey];
                                        deviceData.Device.Power = true;
                                        deviceData.Device[fanKey] = state ? 5 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerSetFanSpeed;
                                        break;
                                    case 36: //FAN SPEED MODE 6
                                        button.previousValue = state ? deviceData.Device[fanKey] : button.previousValue ?? deviceData.Device[fanKey];
                                        deviceData.Device.Power = true;
                                        deviceData.Device[fanKey] = state ? 6 : button.previousValue;
                                        effectiveFlags = AirConditioner.EffectiveFlags.PowerSetFanSpeed;
                                        break;
                                    case 37: //PHYSICAL LOCK CONTROLS
                                        deviceData.Device.ProhibitSetTemperature = state;
                                        deviceData.Device.ProhibitOperationMode = state;
                                        deviceData.Device.ProhibitPower = state;
                                        effectiveFlags = AirConditioner.EffectiveFlags.Prohibit;
                                        break;
                                    case 38: //PHYSICAL LOCK CONTROLS POWER
                                        deviceData.Device.ProhibitPower = state;
                                        effectiveFlags = AirConditioner.EffectiveFlags.Prohibit;
                                        break;
                                    case 39: //PHYSICAL LOCK CONTROLS MODE
                                        deviceData.Device.ProhibitOperationMode = state;
                                        effectiveFlags = AirConditioner.EffectiveFlags.Prohibit;
                                        break;
                                    case 40: //PHYSICAL LOCK CONTROLS TEMP
                                        deviceData.Device.ProhibitSetTemperature = state;
                                        effectiveFlags = AirConditioner.EffectiveFlags.Prohibit;
                                        break;
                                    default:
                                        if (this.logWarn) this.emit('warn', `Unknown button mode: ${mode}`);
                                        break;
                                };

                                await this.melCloudAta.send(this.accountType, this.displayType, deviceData, effectiveFlags);
                                if (this.logInfo) this.emit('info', `${state ? `Set: ${name}` : `Unset: ${name}, Set: ${button.previousValue}`}`);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Set button error: ${error}`);
                            };
                        });
                    this.buttonsServices.push(buttonService);
                    accessory.addService(buttonService);
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
            this.melCloudAta = new MelCloudAta(this.account, this.device, this.devicesFile, this.defaultTempsFile)
                .on('deviceInfo', (manufacturer, modelIndoor, modelOutdoor, serialNumber, firmwareAppVersion) => {
                    if (this.logDeviceInfo && this.displayDeviceInfo) {
                        this.emit('devInfo', `---- ${this.deviceTypeText}: ${this.deviceName} ----`);
                        this.emit('devInfo', `Account: ${this.accountName}`);
                        if (modelIndoor) this.emit('devInfo', `Indoor: ${modelIndoor}`);
                        if (modelOutdoor) this.emit('devInfo', `Outdoor: ${modelOutdoor}`);
                        if (serialNumber) this.emit('devInfo', `Serial: ${serialNumber}`);
                        if (firmwareAppVersion) this.emit('devInfo', `Firmware: ${firmwareAppVersion}`);
                        this.emit('devInfo', `Manufacturer: ${manufacturer}`);
                        this.emit('devInfo', '----------------------------------');
                        this.displayDeviceInfo = false;
                    }

                    //accessory info
                    this.manufacturer = manufacturer;
                    this.model = modelIndoor ? modelIndoor : modelOutdoor ? modelOutdoor : `${this.deviceTypeText}`;
                    this.serialNumber = serialNumber.toString();
                    this.firmwareRevision = firmwareAppVersion.toString();

                    this.informationService?.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareAppVersion);
                })
                .on('deviceState', async (deviceData) => {
                    this.deviceData = deviceData;

                    //presets
                    const presetsOnServer = deviceData.Presets ?? [];

                    //device control
                    const hideVaneControls = deviceData.HideVaneControls ?? false;
                    const hideDryModeControl = deviceData.HideDryModeControl ?? false;

                    //device info
                    const accountTypeMelcloud = this.accountType === 'melcloud';
                    const supportsAutomaticFanSpeed = deviceData.Device.HasAutomaticFanSpeed ?? false;
                    const supportsAirDirectionFunction = accountTypeMelcloud ? deviceData.Device.AirDirectionFunction : deviceData.Device.HasAirDirectionFunction;;
                    const supportsSwingFunction = accountTypeMelcloud ? deviceData.Device.SwingFunction : deviceData.Device.HasSwing;
                    const supportsWideVane = accountTypeMelcloud ? deviceData.Device.ModelSupportsWideVane : deviceData.Device.SupportsWideVane;
                    const supportsOutdoorTemperature = deviceData.Device.HasOutdoorTemperature ?? false;
                    const supportsFanSpeed = accountTypeMelcloud ? deviceData.Device.ModelSupportsFanSpeed : deviceData.Device.NumberOfFanSpeeds > 0;
                    const supportsAuto1 = accountTypeMelcloud ? deviceData.Device.ModelSupportsAuto : deviceData.Device.HasAutoOperationMode;
                    const supportsAuto = this.autoDryFanMode >= 1 && supportsAuto1
                    const supportsHeat1 = accountTypeMelcloud ? deviceData.Device.ModelSupportsHeat : deviceData.Device.HasHeatOperationMode
                    const supportsHeat = this.heatDryFanMode >= 1 && supportsHeat1;
                    const supportsDry = accountTypeMelcloud ? deviceData.Device.ModelSupportsDry : deviceData.Device.HasDryOperationMode;
                    const supportsCool1 = accountTypeMelcloud ? deviceData.Device.ModelSupportsCool : deviceData.Device.HasCoolOperationMode;
                    const supportsCool = this.coolDryFanMode >= 1 && supportsCool1;
                    const numberOfFanSpeeds = supportsFanSpeed ? deviceData.Device.NumberOfFanSpeeds : 0;
                    const minTempHeat = 10;
                    const maxTempHeat = 31;
                    const minTempCoolDryAuto = 16;
                    const maxTempCoolDryAuto = 31;

                    //device state
                    const fanKey = this.accountType === 'melcloud' ? 'FanSpeed' : 'SetFanSpeed';
                    const tempStepKey = this.accountType === 'melcloud' ? 'TemperatureIncrement' : 'HasHalfDegreeIncrements';
                    const power = deviceData.Device.Power ?? false;
                    const inStandbyMode = deviceData.Device.InStandbyMode ?? false;
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
                    const isInError = deviceData.Device.IsInError ?? false;

                    //accessory
                    const obj = {
                        presets: presetsOnServer,
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
                        minTempHeat: minTempHeat,
                        maxTempHeat: maxTempHeat,
                        minTempCoolDryAuto: minTempCoolDryAuto,
                        maxTempCoolDryAuto: maxTempCoolDryAuto,
                        power: power ? 1 : 0,
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
                        useFahrenheit: this.useFahrenheit,
                        temperatureUnit: TemperatureDisplayUnits[this.useFahrenheit],
                        isInError: isInError
                    };

                    //operating mode 0, HEAT, DRY, COOL, 4, 5, 6, FAN, AUTO, ISEE HEAT, ISEE DRY, ISEE COOL
                    switch (this.displayType) {
                        case 1: //Heater Cooler
                            switch (operationMode) {
                                case 1: //HEAT
                                    obj.currentOperationMode = roomTemperature > setTemperature ? 1 : 2; //INACTIVE, IDLE, HEATING, COOLING
                                    obj.targetOperationMode = 1; //AUTO, HEAT, COOL
                                    break;
                                case 2: //DRY
                                    obj.currentOperationMode = 1;
                                    obj.targetOperationMode = this.autoDryFanMode === 2 ? 0 : this.heatDryFanMode === 2 ? 1 : this.coolDryFanMode === 2 ? 2 : obj.targetOperationMode ?? 0;
                                    break;
                                case 3: //COOL
                                    obj.currentOperationMode = roomTemperature < setTemperature ? 1 : 3;
                                    obj.targetOperationMode = 2;
                                    break;
                                case 7: //FAN
                                    obj.currentOperationMode = 1;
                                    obj.targetOperationMode = this.autoDryFanMode === 3 ? 0 : this.heatDryFanMode === 3 ? 1 : this.coolDryFanMode === 3 ? 2 : obj.targetOperationMode ?? 0;
                                    break;
                                case 8: //AUTO
                                    obj.currentOperationMode = roomTemperature > setTemperature ? 3 : roomTemperature < setTemperature ? 2 : 1;
                                    obj.targetOperationMode = 0;
                                    break;
                                case 9: //ISEE HEAT
                                    obj.currentOperationMode = roomTemperature > setTemperature ? 1 : 2
                                    obj.targetOperationMode = 1;
                                    break;
                                case 10: //ISEE DRY
                                    obj.currentOperationMode = 1;
                                    obj.targetOperationMode = this.autoDryFanMode === 2 ? 0 : this.heatDryFanMode === 2 ? 1 : this.coolDryFanMode === 2 ? 2 : obj.targetOperationMode ?? 0;
                                    break;
                                case 11: //ISEE COOL;
                                    obj.currentOperationMode = roomTemperature < setTemperature ? 1 : 3;
                                    obj.targetOperationMode = 2;
                                    break;
                                default:
                                    if (this.logWarn) this.emit('warn', `Unknown operating mode: ${operationMode}`);
                                    return
                            };

                            obj.currentOperationMode = !power ? 0 : inStandbyMode ? 1 : obj.currentOperationMode;
                            obj.operationModeSetPropsMinValue = supportsAuto && supportsHeat ? 0 : !supportsAuto && supportsHeat ? 1 : supportsAuto && !supportsHeat ? 0 : 2;
                            obj.operationModeSetPropsMaxValue = 2
                            obj.operationModeSetPropsValidValues = supportsAuto && supportsHeat ? [0, 1, 2] : !supportsAuto && supportsHeat ? [1, 2] : supportsAuto && !supportsHeat ? [0, 2] : [2];

                            //fan speed mode
                            if (supportsFanSpeed) {
                                switch (numberOfFanSpeeds) {
                                    case 2: //Fan speed mode 2
                                        obj.currentFanSpeed = supportsAutomaticFanSpeed ? [3, 1, 2][setFanSpeed] : [0, 1, 2][setFanSpeed];
                                        obj.fanSpeedSetPropsMaxValue = supportsAutomaticFanSpeed ? 3 : 2;
                                        break;
                                    case 3: //Fan speed mode 3
                                        obj.currentFanSpeed = supportsAutomaticFanSpeed ? [4, 1, 2, 3][setFanSpeed] : [0, 1, 2, 3][setFanSpeed];
                                        obj.fanSpeedSetPropsMaxValue = supportsAutomaticFanSpeed ? 4 : 3;
                                        break;
                                    case 4: //Fan speed mode 4
                                        obj.currentFanSpeed = supportsAutomaticFanSpeed ? [5, 1, 2, 3, 4][setFanSpeed] : [0, 1, 2, 3, 4][setFanSpeed];
                                        obj.fanSpeedSetPropsMaxValue = supportsAutomaticFanSpeed ? 5 : 4;
                                        break;
                                    case 5: //Fan speed mode 5
                                        obj.currentFanSpeed = supportsAutomaticFanSpeed ? [6, 1, 2, 3, 4, 5][setFanSpeed] : [0, 1, 2, 3, 4, 5][setFanSpeed];
                                        obj.fanSpeedSetPropsMaxValue = supportsAutomaticFanSpeed ? 6 : 5;
                                        break;
                                };
                            };

                            //update characteristics
                            this.melCloudService
                                ?.updateCharacteristic(Characteristic.Active, power ? 1 : 0)
                                .updateCharacteristic(Characteristic.CurrentHeaterCoolerState, obj.currentOperationMode)
                                .updateCharacteristic(Characteristic.TargetHeaterCoolerState, obj.targetOperationMode)
                                .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                                .updateCharacteristic(Characteristic.LockPhysicalControls, obj.lockPhysicalControl)
                                .updateCharacteristic(Characteristic.TemperatureDisplayUnits, obj.useFahrenheit)
                                .updateCharacteristic(Characteristic.CoolingThresholdTemperature, operationMode === 8 ? defaultCoolingSetTemperature : setTemperature);
                            if (supportsHeat) this.melCloudService?.updateCharacteristic(Characteristic.HeatingThresholdTemperature, operationMode === 8 ? defaultHeatingSetTemperature : setTemperature);
                            if (supportsFanSpeed) this.melCloudService?.updateCharacteristic(Characteristic.RotationSpeed, obj.currentFanSpeed);
                            if (supportsSwingFunction) this.melCloudService?.updateCharacteristic(Characteristic.SwingMode, obj.currentSwingMode);
                            break;
                        case 2: //Thermostat
                            switch (operationMode) {
                                case 1: //HEAT
                                    obj.currentOperationMode = roomTemperature > setTemperature ? 0 : 1; //OFF, HEATING, COOLING
                                    obj.targetOperationMode = 1; //OFF, HEAT, COOL, AUTO
                                    break;
                                case 2: //DRY
                                    obj.currentOperationMode = 0;
                                    obj.targetOperationMode = this.autoDryFanMode === 2 ? 3 : this.heatDryFanMode === 2 ? 1 : this.coolDryFanMode === 2 ? 2 : obj.targetOperationMode ?? 0;
                                    break;
                                case 3: //COOL
                                    obj.currentOperationMode = roomTemperature < setTemperature ? 0 : 2;
                                    obj.targetOperationMode = 2;
                                    break;
                                case 7: //FAN
                                    obj.currentOperationMode = 0;
                                    obj.targetOperationMode = this.autoDryFanMode === 3 ? 3 : this.heatDryFanMode === 3 ? 1 : this.coolDryFanMode === 3 ? 2 : obj.targetOperationMode ?? 0;
                                    break;
                                case 8: //AUTO
                                    obj.currentOperationMode = roomTemperature < setTemperature ? 1 : roomTemperature > setTemperature ? 2 : 0;
                                    obj.targetOperationMode = 3;
                                    break;
                                case 9: //ISEE HEAT
                                    obj.currentOperationMode = roomTemperature > setTemperature ? 0 : 1;
                                    obj.targetOperationMode = 1;
                                    break;
                                case 10: //ISEE DRY
                                    obj.currentOperationMode = 0;
                                    obj.targetOperationMode = this.autoDryFanMode === 2 ? 3 : this.heatDryFanMode === 2 ? 1 : this.coolDryFanMode === 2 ? 2 : obj.targetOperationMode ?? 0;
                                    break;
                                case 11: //ISEE COOL;
                                    obj.currentOperationMode = roomTemperature < setTemperature ? 0 : 2;
                                    obj.targetOperationMode = 2;
                                    break;
                                default:
                                    if (this.logWarn) this.emit('warn', `Unknown operating mode: ${operationMode}`);
                                    break;
                            };

                            obj.currentOperationMode = !power ? 0 : obj.currentOperationMode;
                            obj.targetOperationMode = !power ? 0 : obj.targetOperationMode;
                            obj.operationModeSetPropsMinValue = 0
                            obj.operationModeSetPropsMaxValue = supportsAuto && supportsHeat ? 3 : !supportsAuto && supportsHeat ? 2 : supportsAuto && !supportsHeat ? 3 : 2;
                            obj.operationModeSetPropsValidValues = supportsAuto && supportsHeat ? [0, 1, 2, 3] : !supportsAuto && supportsHeat ? [0, 1, 2] : supportsAuto && !supportsHeat ? [0, 2, 3] : [0, 2];

                            //update characteristics
                            this.melCloudService
                                ?.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, obj.currentOperationMode)
                                .updateCharacteristic(Characteristic.TargetHeatingCoolingState, obj.targetOperationMode)
                                .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                                .updateCharacteristic(Characteristic.TargetTemperature, setTemperature)
                                .updateCharacteristic(Characteristic.TemperatureDisplayUnits, obj.useFahrenheit);
                            break;
                    };
                    this.accessory = obj;

                    this.roomTemperatureSensorService?.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature);
                    this.outdoorTemperatureSensorService?.updateCharacteristic(Characteristic.CurrentTemperature, outdoorTemperature);
                    this.errorService?.updateCharacteristic(Characteristic.ContactSensorState, isInError);

                    //update presets state
                    if (this.presets.length > 0) {
                        this.presets.forEach((preset, i) => {
                            const presetData = presetsOnServer.find(p => p.ID === preset.Id);

                            preset.state = presetData ? (presetData.Power === power
                                && presetData.SetTemperature === setTemperature
                                && presetData.OperationMode === operationMode
                                && presetData.VaneHorizontalDirection === vaneHorizontalDirection
                                && presetData.VaneVerticalDirection === vaneVerticalDirection
                                && presetData[fanKey] === setFanSpeed) : false;

                            const characteristicType = preset.characteristicType;
                            this.presetsServices?.[i]?.updateCharacteristic(characteristicType, preset.state);
                        });
                    };

                    //update buttons state
                    if (this.buttons.length > 0) {
                        this.buttons.forEach((button, i) => {
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

                            //update services
                            const characteristicType = button.characteristicType;
                            this.buttonsServices?.[i]?.updateCharacteristic(characteristicType, button.state);
                        });
                    };

                    //log current state
                    if (this.logInfo) {
                        this.emit('info', `Power: ${power ? 'ON' : 'OFF'}`);
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
