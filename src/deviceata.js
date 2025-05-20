import EventEmitter from 'events';
import MelCloudAta from './melcloudata.js';
import RestFul from './restful.js';
import Mqtt from './mqtt.js';
import { TemperatureDisplayUnits, AirConditioner } from './constants.js';
let Accessory, Characteristic, Service, Categories, AccessoryUUID;

class DeviceAta extends EventEmitter {
    constructor(api, account, device, melCloud, accountInfo, contextKey, accountName, deviceId, deviceName, deviceTypeText, devicesFile, refreshInterval, useFahrenheit, restFul, mqtt) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        AccessoryUUID = api.hap.uuid;

        //account config
        this.displayMode = device.displayMode;
        this.temperatureSensor = device.temperatureSensor || false;
        this.temperatureSensorOutdoor = device.temperatureSensorOutdoor || false;
        this.heatDryFanMode = device.heatDryFanMode || 1; //NONE, HEAT, DRY, FAN
        this.coolDryFanMode = device.coolDryFanMode || 1; //NONE, COOL, DRY, FAN
        this.autoDryFanMode = device.autoDryFanMode || 1; //NONE, AUTO, DRY, FAN
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
        this.accessory = {};
        this.accessory.useFahrenheit = useFahrenheit ? 1 : 0;
        this.accessory.temperatureUnit = TemperatureDisplayUnits[this.accessory.useFahrenheit];
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
                    deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.Power;
                    set = await this.melCloudAta.send(deviceData, this.displayMode);
                    break;
                case 'OperationMode':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.OperationModeSetTemperature;
                    set = await this.melCloudAta.send(deviceData, this.displayMode);
                    break;
                case 'SetTemperature':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.SetTemperature;
                    set = await this.melCloudAta.send(deviceData, this.displayMode);
                    break;
                case 'DefaultCoolingSetTemperature':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.SetTemperature;
                    set = await this.melCloudAta.send(deviceData, this.displayMode);
                    break;
                case 'DefaultHeatingSetTemperature':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.SetTemperature;
                    set = await this.melCloudAta.send(deviceData, this.displayMode);
                    break;
                case 'FanSpeed':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.SetFanSpeed;
                    set = await this.melCloudAta.send(deviceData, this.displayMode);
                    break;
                case 'VaneHorizontalDirection':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.VaneHorizontal;
                    set = await this.melCloudAta.send(deviceData, this.displayMode);
                    break;
                case 'VaneVerticalDirection':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.VaneVertical;
                    set = await this.melCloudAta.send(deviceData, this.displayMode);
                    break;
                case 'HideVaneControls':
                    deviceData[key] = value;
                    deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.Prohibit;
                    set = await this.melCloudAta.send(deviceData, this.displayMode);
                    break;
                case 'HideDryModeControl':
                    deviceData[key] = value;
                    deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.Prohibit;
                    await this.melCloudAta.send(deviceData, this.displayMode);
                    break;
                case 'ProhibitSetTemperature':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.Prohibit;
                    set = await this.melCloudAta.send(deviceData, this.displayMode);
                    break;
                case 'ProhibitOperationMode':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.Prohibit;
                    await this.melCloudAta.send(deviceData, this.displayMode);
                    break;
                case 'ProhibitPower':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.Prohibit;
                    set = await this.melCloudAta.send(deviceData, this.displayMode);
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
            await this.melCloudAta.impulseGenerator.start([{ name: 'checkState', sampling: this.refreshInterval }]);
            return true;
        } catch (error) {
            throw new Error(`Impulse generator start error: ${error}`);
        };
    }

    //prepare accessory
    async prepareAccessory(accountInfo, deviceData, deviceId, deviceTypeText, deviceName, accountName) {
        try {
            const presetsOnServer = this.accessory.presets;
            const modelSupportsHeat = this.accessory.modelSupportsHeat;
            const modelSupportsDry = this.accessory.modelSupportsDry;
            const modelSupportsCool = this.accessory.modelSupportsCool;
            const modelSupportsAuto = this.accessory.modelSupportsAuto;
            const modelSupportsFanSpeed = this.accessory.modelSupportsFanSpeed;
            const hasAutomaticFanSpeed = this.accessory.hasAutomaticFanSpeed;
            const hasOutdoorTemperature = this.accessory.hasOutdoorTemperature;
            const numberOfFanSpeeds = this.accessory.numberOfFanSpeeds;
            const swingFunction = this.accessory.swingFunction;
            const autoDryFanMode = [this.accessory.operationMode, 8, modelSupportsDry ? 2 : 8, 7][this.autoDryFanMode]; //NONE, AUTO - 8, DRY - 2, FAN - 7
            const heatDryFanMode = [this.accessory.operationMode, 1, modelSupportsDry ? 2 : 1, 7][this.heatDryFanMode]; //NONE, HEAT - 1, DRY - 2, FAN - 7
            const coolDryFanMode = [this.accessory.operationMode, 3, modelSupportsDry ? 2 : 3, 7][this.coolDryFanMode]; //NONE, COOL - 3, DRY - 2, FAN - 7

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

            //melcloud services
            const serviceName = `${deviceTypeText} ${accessoryName}`;
            switch (this.displayMode) {
                case 1: //Heater Cooler
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare heater/cooler service`) : false;
                    this.melCloudService = new Service.HeaterCooler(serviceName, `HeaterCooler ${deviceId}`);
                    this.melCloudService.setPrimaryService(true);
                    this.melCloudService.getCharacteristic(Characteristic.Active)
                        .onGet(async () => {
                            const state = this.accessory.power;
                            return state;
                        })
                        .onSet(async (state) => {
                            try {
                                deviceData.Device.Power = [false, true][state];
                                deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.Power;
                                await this.melCloudAta.send(deviceData, this.displayMode);
                                const info = this.disableLogInfo ? false : this.emit('info', `Set power: ${state ? 'ON' : 'OFF'}`);
                            } catch (error) {
                                this.emit('warn', `Set power error: ${error}`);
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
                                        deviceData.Device.OperationMode = autoDryFanMode;
                                        break;
                                    case 1: //HEAT - HEAT
                                        deviceData.Device.OperationMode = heatDryFanMode;
                                        break;
                                    case 2: //COOL - COOL
                                        deviceData.Device.OperationMode = coolDryFanMode;
                                        break;
                                };

                                deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.OperationModeSetTemperature;
                                await this.melCloudAta.send(deviceData, this.displayMode);
                                const operationModeText = AirConditioner.DriveMode[deviceData.Device.OperationMode];
                                const info = this.disableLogInfo ? false : this.emit('info', `Set operation mode: ${operationModeText}`);
                            } catch (error) {
                                this.emit('warn', `Set operation mode error: ${error}`);
                            };
                        });
                    this.melCloudService.getCharacteristic(Characteristic.CurrentTemperature)
                        .onGet(async () => {
                            const value = this.accessory.roomTemperature;
                            return value;
                        });
                    if (modelSupportsFanSpeed) {
                        this.melCloudService.getCharacteristic(Characteristic.RotationSpeed)
                            .setProps({
                                minValue: 0,
                                maxValue: this.accessory.fanSpeedSetPropsMaxValue,
                                minStep: 1
                            })
                            .onGet(async () => {
                                const value = this.accessory.fanSpeed; //AUTO, 1, 2, 3, 4, 5, 6, OFF
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    let fanSpeedModeText = '';
                                    switch (numberOfFanSpeeds) {
                                        case 2: //Fan speed mode 2
                                            fanSpeedModeText = hasAutomaticFanSpeed ? [7, 1, 2, 0][value] : [7, 1, 2][value];
                                            deviceData.Device.FanSpeed = hasAutomaticFanSpeed ? [0, 1, 2, 0][value] : [1, 1, 2][value];
                                            break;
                                        case 3: //Fan speed mode 3
                                            fanSpeedModeText = hasAutomaticFanSpeed ? [7, 1, 2, 3, 0][value] : [7, 1, 2, 3][value];
                                            deviceData.Device.FanSpeed = hasAutomaticFanSpeed ? [0, 1, 2, 3, 0][value] : [1, 1, 2, 3][value];
                                            break;
                                        case 4: //Fan speed mode 4
                                            fanSpeedModeText = hasAutomaticFanSpeed ? [7, 1, 2, 3, 4, 0][value] : [7, 1, 2, 3, 4][value];
                                            deviceData.Device.FanSpeed = hasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 0][value] : [1, 1, 2, 3, 4][value];
                                            break;
                                        case 5: //Fan speed mode 5
                                            5; fanSpeedModeText = hasAutomaticFanSpeed ? [7, 1, 2, 3, 4, 5, 0][value] : [7, 1, 2, 3, 4, 5][value];
                                            deviceData.Device.FanSpeed = hasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 0][value] : [1, 1, 2, 3, 4, 5][value];
                                            break;
                                        case 6: //Fan speed mode 6
                                            fanSpeedModeText = hasAutomaticFanSpeed ? [7, 1, 2, 3, 4, 5, 6, 0][value] : [7, 1, 2, 3, 4, 5, 6][value];
                                            deviceData.Device.FanSpeed = hasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 6, 0][value] : [1, 1, 2, 3, 4, 5, 6][value];
                                            break;
                                    };
                                    deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.SetFanSpeed;
                                    await this.melCloudAta.send(deviceData, this.displayMode);
                                    const info = this.disableLogInfo ? false : this.emit('info', `Set fan speed mode: ${AirConditioner.FanSpeed[fanSpeedModeText]}`);
                                } catch (error) {
                                    this.emit('warn', `Set fan speed mode error: ${error}`);
                                };
                            });
                    };
                    if (swingFunction) {
                        this.melCloudService.getCharacteristic(Characteristic.SwingMode)
                            .onGet(async () => {
                                //Vane Horizontal: Auto, 1, 2, 3, 4, 5, 6, 12 = Swing //Vertical: Auto, 1, 2, 3, 4, 5, 7 = Swing
                                const value = this.accessory.swingMode;
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    deviceData.Device.VaneHorizontal = value ? 12 : 0;
                                    deviceData.Device.VaneVertical = value ? 7 : 0;
                                    deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.VaneVerticalVaneHorizontal;
                                    await this.melCloudAta.send(deviceData, this.displayMode);
                                    const info = this.disableLogInfo ? false : this.emit('info', `Set air direction mode: ${AirConditioner.AirDirection[value]}`);
                                } catch (error) {
                                    this.emit('warn', `Set vane swing mode error: ${error}`);
                                };
                            });
                    };
                    this.melCloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
                        .setProps({
                            minValue: this.accessory.minTempCoolDry,
                            maxValue: this.accessory.maxTempCoolDry,
                            minStep: this.accessory.temperatureIncrement
                        })
                        .onGet(async () => {
                            const value = this.accessory.operationMode === 8 ? this.accessory.defaultCoolingSetTemperature : this.accessory.setTemperature;
                            return value;
                        })
                        .onSet(async (value) => {
                            try {
                                deviceData.Device.DefaultCoolingSetTemperature = value;
                                deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.SetTemperature;
                                await this.melCloudAta.send(deviceData, this.displayMode);
                                const info = this.disableLogInfo ? false : this.emit('info', `Set cooling threshold temperature: ${value}${this.accessory.temperatureUnit}`);
                            } catch (error) {
                                this.emit('warn', `Set cooling threshold temperature error: ${error}`);
                            };
                        });
                    if (modelSupportsHeat) {
                        this.melCloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
                            .setProps({
                                minValue: this.accessory.minTempHeat,
                                maxValue: this.accessory.maxTempHeat,
                                minStep: this.accessory.temperatureIncrement
                            })
                            .onGet(async () => {
                                const value = this.accessory.operationMode === 8 ? this.accessory.defaultHeatingSetTemperature : this.accessory.setTemperature;
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    deviceData.Device.DefaultHeatingSetTemperature = value;
                                    deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.SetTemperature;
                                    await this.melCloudAta.send(deviceData, this.displayMode);
                                    const info = this.disableLogInfo ? false : this.emit('info', `Set heating threshold temperature: ${value}${this.accessory.temperatureUnit}`);
                                } catch (error) {
                                    this.emit('warn', `Set heating threshold temperature error: ${error}`);
                                };
                            });
                    };
                    this.melCloudService.getCharacteristic(Characteristic.LockPhysicalControls)
                        .onGet(async () => {
                            const value = this.accessory.lockPhysicalControl;
                            return value;
                        })
                        .onSet(async (value) => {
                            try {
                                value = value ? true : false;
                                deviceData.Device.ProhibitSetTemperature = value;
                                deviceData.Device.ProhibitOperationMode = value;
                                deviceData.Device.ProhibitPower = value;
                                deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.Prohibit;
                                await this.melCloudAta.send(deviceData, this.displayMode);
                                const info = this.disableLogInfo ? false : this.emit('info', `Set local physical controls: ${value ? 'LOCK' : 'UNLOCK'}`);
                            } catch (error) {
                                this.emit('warn', `Set lock physical controls error: ${error}`);
                            };
                        });
                    this.melCloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
                        .onGet(async () => {
                            const value = this.accessory.useFahrenheit;
                            return value;
                        })
                        .onSet(async (value) => {
                            try {
                                accountInfo.UseFahrenheit = [false, true][value];
                                await this.melCloud.send(accountInfo);
                                this.accessory.useFahrenheit = value;
                                const info = this.disableLogInfo ? false : this.emit('info', `Set temperature display unit: ${TemperatureDisplayUnits[value]}`);
                            } catch (error) {
                                this.emit('warn', `Set temperature display unit error: ${error}`);
                            };
                        });
                    accessory.addService(this.melCloudService);
                    break;
                case 2: //Thermostat
                    const debug1 = this.enableDebugMode ? this.emit('debug', `Prepare thermostat service`) : false;
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
                                switch (value) {
                                    case 0: //OFF - POWER OFF
                                        deviceData.Device.Power = false;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.Power;
                                        break;
                                    case 1: //HEAT - HEAT
                                        deviceData.Device.Power = true;
                                        deviceData.Device.OperationMode = heatDryFanMode;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                        break;
                                    case 2: //COOL - COOL
                                        deviceData.Device.Power = true;
                                        deviceData.Device.OperationMode = coolDryFanMode;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature
                                        break;
                                    case 3: //AUTO - AUTO
                                        deviceData.Device.Power = true;
                                        deviceData.Device.OperationMode = autoDryFanMode;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                        break;
                                };

                                await this.melCloudAta.send(deviceData, this.displayMode);
                                const operationModeText = AirConditioner.DriveMode[deviceData.Device.OperationMode];
                                const info = this.disableLogInfo ? false : this.emit('info', `Set operation mode: ${operationModeText}`);
                            } catch (error) {
                                this.emit('warn', `Set operation mode error: ${error}`);
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
                            minStep: this.accessory.temperatureIncrement
                        })
                        .onGet(async () => {
                            const value = this.accessory.setTemperature;
                            return value;
                        })
                        .onSet(async (value) => {
                            try {
                                deviceData.Device.SetTemperature = value;
                                deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.SetTemperature;
                                await this.melCloudAta.send(deviceData, this.displayMode);
                                const info = this.disableLogInfo ? false : this.emit('info', `Set temperature: ${value}${this.accessory.temperatureUnit}`);
                            } catch (error) {
                                this.emit('warn', `Set temperature error: ${error}`);
                            };
                        });
                    this.melCloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
                        .onGet(async () => {
                            const value = this.accessory.useFahrenheit;
                            return value;
                        })
                        .onSet(async (value) => {
                            try {
                                accountInfo.UseFahrenheit = [false, true][value];
                                await this.melCloud.send(accountInfo);
                                this.accessory.useFahrenheit = value;
                                const info = this.disableLogInfo ? false : this.emit('info', `Set temperature display unit: ${TemperatureDisplayUnits[value]}`);
                            } catch (error) {
                                this.emit('warn', `Set temperature display unit error: ${error}`);
                            };
                        });
                    accessory.addService(this.melCloudService);
                    break;
            };

            //temperature sensor services
            if (this.temperatureSensor && this.accessory.roomTemperature !== null) {
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
                        const state = this.accessory.roomTemperature;
                        return state;
                    })
                accessory.addService(this.roomTemperatureSensorService);
            };

            if (this.temperatureSensorOutdoor && hasOutdoorTemperature && this.accessory.outdoorTemperature !== null) {
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
                        const state = this.accessory.outdoorTemperature;
                        return state;
                    })
                accessory.addService(this.outdoorTemperatureSensorService);
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
                                        deviceData.Device.OperationMode = presetData.OperationMode;
                                        deviceData.Device.SetTemperature = presetData.SetTemperature;
                                        deviceData.Device.VaneHorizontalDirection = presetData.VaneHorizontal;
                                        deviceData.Device.VaneVerticalDirection = presetData.VaneVertical;
                                        deviceData.Device.FanSpeed = presetData.FanSpeed;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.Presets;
                                        break;
                                    case false:
                                        deviceData.Device.Power = preset.previousSettings.Power;
                                        deviceData.Device.OperationMode = preset.previousSettings.OperationMode;
                                        deviceData.Device.SetTemperature = preset.previousSettings.SetTemperature;
                                        deviceData.Device.VaneHorizontalDirection = preset.previousSettings.VaneHorizontalDirection;
                                        deviceData.Device.VaneVerticalDirection = preset.previousSettings.VaneVerticalDirection;
                                        deviceData.Device.FanSpeed = preset.previousSettings.FanSpeed;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.Presets;
                                        break;
                                };

                                await this.melCloudAta.send(deviceData, this.displayMode);
                                const info = this.disableLogInfo ? false : this.emit('info', `${state ? 'Set:' : 'Unset:'} ${name}`);
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
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare buttons/sensors services`) : false;
                this.buttonsServices = [];
                this.buttonsConfigured.forEach((button, i) => {
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
                                switch (mode) {
                                    case 0: //POWER ON,OFF
                                        deviceData.Device.Power = state;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.Power;
                                        break;
                                    case 1: //OPERATING MODE HEAT
                                        button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.OperationMode = state ? 1 : button.previousValue === 9 ? 1 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                        break;
                                    case 2: //OPERATING MODE DRY
                                        button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.OperationMode = state ? 2 : button.previousValue === 10 ? 2 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                        break
                                    case 3: //OPERATING MODE COOL
                                        button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.OperationMode = state ? 3 : button.previousValue === 11 ? 3 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                        break;
                                    case 4: //OPERATING MODE FAN
                                        button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.OperationMode = state ? 7 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                        break;
                                    case 5: //OPERATING MODE AUTO
                                        button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.OperationMode = state ? 8 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                        break;
                                    case 6: //OPERATING MODE PURIFY
                                        button.previousValue = state ? deviceData.Device.OperationMode : button.previousValue ?? deviceData.Device.OperationMode;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.OperationMode = state ? 12 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerOperationModeSetTemperature;
                                        break;
                                    case 7: //OPERATING MODE DRY CONTROL HIDE
                                        deviceData.HideDryModeControl = state;
                                        break;
                                    case 10: //VANE H SWING MODE AUTO
                                        button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneHorizontalDirection = state ? 0 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                        break;
                                    case 11: //VANE H SWING MODE 1
                                        button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneHorizontalDirection = state ? 1 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                        break;
                                    case 12: //VANE H SWING MODE 2
                                        button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneHorizontalDirection = state ? 2 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                        break;
                                    case 13: //VANE H SWING MODE 3
                                        button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneHorizontalDirection = state ? 3 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                        break;
                                    case 14: //VANE H SWING MODE 4
                                        button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneHorizontalDirection = state ? 4 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                        break;
                                    case 15: //VANE H SWING MODE 5
                                        button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneHorizontalDirection = state ? 5 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                        break;
                                    case 16: //VANE H SWING MODE SPLIT
                                        button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneHorizontalDirection = state ? 8 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                        break;
                                    case 17: //VANE H SWING MODE SWING
                                        button.previousValue = state ? deviceData.Device.VaneHorizontalDirection : button.previousValue ?? deviceData.Device.VaneHorizontalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneHorizontalDirection = state ? 12 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerVaneHorizontal;
                                        break;
                                    case 20: //VANE V SWING MODE AUTO
                                        button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneVerticalDirection = state ? 0 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerVaneVertical;
                                        break;
                                    case 21: //VANE V SWING MODE 1
                                        button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneVerticalDirection = state ? 1 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerVaneVertical;
                                        break;
                                    case 22: //VANE V SWING MODE 2
                                        button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneVerticalDirection = state ? 2 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerVaneVertical;
                                        break;
                                    case 23: //VANE V SWING MODE 3
                                        button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneVerticalDirection = state ? 3 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerVaneVertical;
                                        break;
                                    case 24: //VANE V SWING MODE 4
                                        button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneVerticalDirection = state ? 4 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerVaneVertical;
                                        break;
                                    case 25: //VANE V SWING MODE 5
                                        button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneVerticalDirection = state ? 5 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerVaneVertical;
                                        break;
                                    case 26: //VANE V SWING MODE SWING
                                        button.previousValue = state ? deviceData.Device.VaneVerticalDirection : button.previousValue ?? deviceData.Device.VaneVerticalDirection;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VaneVerticalDirection = state ? 7 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerVaneVertical;
                                        break;
                                    case 27: //VANE H/V CONTROLS HIDE
                                        deviceData.HideVaneControls = state;
                                        break;
                                    case 30: //FAN SPEED MODE AUTO
                                        button.previousValue = state ? deviceData.Device.FanSpeed : button.previousValue ?? deviceData.Device.FanSpeed;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.FanSpeed = state ? 0 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerSetFanSpeed;
                                        break;
                                    case 31: //FAN SPEED MODE 1
                                        button.previousValue = state ? deviceData.Device.FanSpeed : button.previousValue ?? deviceData.Device.FanSpeed;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.FanSpeed = state ? 1 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerSetFanSpeed;
                                        break;
                                    case 32: //FAN SPEED MODE 2
                                        button.previousValue = state ? deviceData.Device.FanSpeed : button.previousValue ?? deviceData.Device.FanSpeed;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.FanSpeed = state ? 2 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerSetFanSpeed;
                                        break;
                                    case 33: //FAN SPEED MODE 3
                                        button.previousValue = state ? deviceData.Device.FanSpeed : button.previousValue ?? deviceData.Device.FanSpeed;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.FanSpeed = state ? 3 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerSetFanSpeed;
                                        break;
                                    case 34: //FAN MODE 4
                                        button.previousValue = state ? deviceData.Device.FanSpeed : button.previousValue ?? deviceData.Device.FanSpeed;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.FanSpeed = state ? 4 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerSetFanSpeed;
                                        break;
                                    case 35: //FAN SPEED MODE 5
                                        button.previousValue = state ? deviceData.Device.FanSpeed : button.previousValue ?? deviceData.Device.FanSpeed;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.FanSpeed = state ? 5 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerSetFanSpeed;
                                        break;
                                    case 36: //FAN SPEED MODE 6
                                        button.previousValue = state ? deviceData.Device.FanSpeed : button.previousValue ?? deviceData.Device.FanSpeed;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.FanSpeed = state ? 6 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.PowerSetFanSpeed;
                                        break;
                                    case 37: //PHYSICAL LOCK CONTROLS
                                        deviceData.Device.ProhibitSetTemperature = state;
                                        deviceData.Device.ProhibitOperationMode = state;
                                        deviceData.Device.ProhibitPower = state;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.Prohibit;
                                        break;
                                    case 38: //PHYSICAL LOCK CONTROLS POWER
                                        deviceData.Device.ProhibitPower = state;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.Prohibit;
                                        break;
                                    case 39: //PHYSICAL LOCK CONTROLS MODE
                                        deviceData.Device.ProhibitOperationMode = state;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.Prohibit;
                                        break;
                                    case 40: //PHYSICAL LOCK CONTROLS TEMP
                                        deviceData.Device.ProhibitSetTemperature = state;
                                        deviceData.Device.EffectiveFlags = AirConditioner.EffectiveFlags.Prohibit;
                                        break;
                                    default:
                                        this.emit('warn', `Unknown button mode: ${mode}`);
                                        break;
                                };

                                await this.melCloudAta.send(deviceData, this.displayMode);
                                const info = this.disableLogInfo ? false : this.emit('info', `${state ? `Set: ${name}` : `Unset: ${name}, Set: ${button.previousValue}`}`);
                            } catch (error) {
                                this.emit('warn', `Set button error: ${error}`);
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
            this.melCloudAta = new MelCloudAta({
                contextKey: this.contextKey,
                devicesFile: this.devicesFile,
                deviceId: this.deviceId,
                enableDebugMode: this.enableDebugMode
            });

            this.melCloudAta.on('deviceInfo', (manufacturer, modelIndoor, modelOutdoor, serialNumber, firmwareAppVersion) => {
                if (!this.displayDeviceInfo) {
                    return;
                }

                if (!this.disableLogDeviceInfo) {
                    this.emit('devInfo', `---- ${this.deviceTypeText}: ${this.deviceName} ----`);
                    this.emit('devInfo', `Account: ${this.accountName}`);
                    const indoor = modelIndoor ? this.emit('devInfo', `Indoor: ${modelIndoor}`) : false;
                    const outdoor = modelOutdoor ? this.emit('devInfo', `Outdoor: ${modelOutdoor}`) : false
                    this.emit('devInfo', `Serial: ${serialNumber}`);
                    this.emit('devInfo', `Firmware: ${firmwareAppVersion}`);
                    this.emit('devInfo', `Manufacturer: ${manufacturer}`);
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

                    //device control
                    const hideVaneControls = deviceData.HideVaneControls ?? false;
                    const hideDryModeControl = deviceData.HideDryModeControl ?? false;

                    //device info
                    const hasAutomaticFanSpeed = deviceData.Device.HasAutomaticFanSpeed ?? false;
                    const airDirectionFunction = deviceData.Device.AirDirectionFunction ?? false;
                    const swingFunction = deviceData.Device.SwingFunction ?? false;
                    const hasOutdoorTemperature = deviceData.Device.HasOutdoorTemperature ?? false;
                    const numberOfFanSpeeds = deviceData.Device.NumberOfFanSpeeds ?? 0;
                    const modelSupportsFanSpeed = deviceData.Device.ModelSupportsFanSpeed ?? false;
                    const modelSupportsAuto1 = deviceData.Device.ModelSupportsAuto ?? false;
                    const modelSupportsAuto = this.autoDryFanMode >= 1 && modelSupportsAuto1
                    const modelSupportsHeat1 = deviceData.Device.ModelSupportsHeat ?? false;
                    const modelSupportsHeat = this.heatDryFanMode >= 1 && modelSupportsHeat1;
                    const modelSupportsDry = deviceData.Device.ModelSupportsDry ?? false;
                    const modelSupportsCool = this.coolDryFanMode >= 1;
                    const minTempHeat = 10;
                    const maxTempHeat = 31;
                    const minTempCoolDry = 16;
                    const maxTempCoolDry = 31;

                    //device state
                    const power = deviceData.Device.Power ?? false;
                    const inStandbyMode = deviceData.Device.InStandbyMode ?? false;
                    const roomTemperature = deviceData.Device.RoomTemperature;
                    const setTemperature = deviceData.Device.SetTemperature ?? 20;
                    const defaultHeatingSetTemperature = deviceData.Device.DefaultHeatingSetTemperature ?? 20;
                    const defaultCoolingSetTemperature = deviceData.Device.DefaultCoolingSetTemperature ?? 23;
                    const actualFanSpeed = deviceData.Device.ActualFanSpeed;
                    const automaticFanSpeed = deviceData.Device.AutomaticFanSpeed;
                    const fanSpeed = deviceData.Device.FanSpeed ?? 0;
                    const operationMode = deviceData.Device.OperationMode;
                    const vaneVerticalDirection = deviceData.Device.VaneVerticalDirection;
                    const vaneVerticalSwing = deviceData.Device.VaneVerticalSwing;
                    const vaneHorizontalDirection = deviceData.Device.VaneHorizontalDirection;
                    const vaneHorizontalSwing = deviceData.Device.VaneHorizontalSwing;
                    const prohibitSetTemperature = deviceData.Device.ProhibitSetTemperature ?? false;
                    const prohibitOperationMode = deviceData.Device.ProhibitOperationMode ?? false;
                    const prohibitPower = deviceData.Device.ProhibitPower ?? false;
                    const temperatureIncrement = deviceData.Device.TemperatureIncrement ?? 1;
                    const outdoorTemperature = deviceData.Device.OutdoorTemperature;

                    //accessory
                    this.accessory.presets = presetsOnServer;
                    this.accessory.hasAutomaticFanSpeed = hasAutomaticFanSpeed;
                    this.accessory.airDirectionFunction = airDirectionFunction;
                    this.accessory.swingFunction = swingFunction;
                    this.accessory.hasOutdoorTemperature = hasOutdoorTemperature;
                    this.accessory.numberOfFanSpeeds = numberOfFanSpeeds;
                    this.accessory.modelSupportsFanSpeed = modelSupportsFanSpeed;
                    this.accessory.modelSupportsAuto = modelSupportsAuto;
                    this.accessory.modelSupportsHeat = modelSupportsHeat;
                    this.accessory.modelSupportsDry = modelSupportsDry;
                    this.accessory.modelSupportsCool = modelSupportsCool;
                    this.accessory.minTempHeat = minTempHeat;
                    this.accessory.maxTempHeat = maxTempHeat;
                    this.accessory.minTempCoolDry = minTempCoolDry;
                    this.accessory.maxTempCoolDry = maxTempCoolDry;

                    this.accessory.power = power ? 1 : 0;
                    this.accessory.inStandbyMode = inStandbyMode;
                    this.accessory.operationMode = operationMode;
                    this.accessory.roomTemperature = roomTemperature;
                    this.accessory.outdoorTemperature = outdoorTemperature;
                    this.accessory.setTemperature = setTemperature;
                    this.accessory.defaultHeatingSetTemperature = defaultHeatingSetTemperature;
                    this.accessory.defaultCoolingSetTemperature = defaultCoolingSetTemperature;
                    this.accessory.actualFanSpeed = actualFanSpeed;
                    this.accessory.automaticFanSpeed = automaticFanSpeed;
                    this.accessory.vaneVerticalSwing = vaneVerticalSwing;
                    this.accessory.vaneHorizontalSwing = vaneHorizontalSwing;
                    this.accessory.swingMode = swingFunction && vaneHorizontalDirection === 12 && vaneVerticalDirection === 7 ? 1 : 0;
                    this.accessory.lockPhysicalControl = prohibitSetTemperature && prohibitOperationMode && prohibitPower ? 1 : 0;
                    this.accessory.temperatureIncrement = temperatureIncrement;

                    //operating mode 0, HEAT, DRY, COOL, 4, 5, 6, FAN, AUTO, ISEE HEAT, ISEE DRY, ISEE COOL
                    switch (this.displayMode) {
                        case 1: //Heater Cooler
                            switch (operationMode) {
                                case 1: //HEAT
                                    this.accessory.currentOperationMode = roomTemperature > setTemperature ? 1 : 2; //INACTIVE, IDLE, HEATING, COOLING
                                    this.accessory.targetOperationMode = 1; //AUTO, HEAT, COOL
                                    break;
                                case 2: //DRY
                                    this.accessory.currentOperationMode = 1;
                                    this.accessory.targetOperationMode = this.autoDryFanMode === 2 ? 0 : this.heatDryFanMode === 2 ? 1 : this.coolDryFanMode === 2 ? 2 : this.accessory.targetOperationMode ?? 0;
                                    break;
                                case 3: //COOL
                                    this.accessory.currentOperationMode = roomTemperature < setTemperature ? 1 : 3;
                                    this.accessory.targetOperationMode = 2;
                                    break;
                                case 7: //FAN
                                    this.accessory.currentOperationMode = 1;
                                    this.accessory.targetOperationMode = this.autoDryFanMode === 3 ? 0 : this.heatDryFanMode === 3 ? 1 : this.coolDryFanMode === 3 ? 2 : this.accessory.targetOperationMode ?? 0;
                                    break;
                                case 8: //AUTO
                                    this.accessory.currentOperationMode = roomTemperature > setTemperature ? 3 : roomTemperature < setTemperature ? 2 : 1;
                                    this.accessory.targetOperationMode = 0;
                                    break;
                                case 9: //ISEE HEAT
                                    this.accessory.currentOperationMode = roomTemperature > setTemperature ? 1 : 2
                                    this.accessory.targetOperationMode = 1;
                                    break;
                                case 10: //ISEE DRY
                                    this.accessory.currentOperationMode = 1;
                                    this.accessory.targetOperationMode = this.autoDryFanMode === 2 ? 0 : this.heatDryFanMode === 2 ? 1 : this.coolDryFanMode === 2 ? 2 : this.accessory.targetOperationMode ?? 0;
                                    break;
                                case 11: //ISEE COOL;
                                    this.accessory.currentOperationMode = roomTemperature < setTemperature ? 1 : 3;
                                    this.accessory.targetOperationMode = 2;
                                    break;
                                default:
                                    this.emit('warn', `Unknown operating mode: ${operationMode}`);
                                    return
                            };

                            this.accessory.currentOperationMode = !power ? 0 : inStandbyMode ? 1 : this.accessory.currentOperationMode;
                            this.accessory.operationModeSetPropsMinValue = modelSupportsAuto && modelSupportsHeat ? 0 : !modelSupportsAuto && modelSupportsHeat ? 1 : modelSupportsAuto && !modelSupportsHeat ? 0 : 2;
                            this.accessory.operationModeSetPropsMaxValue = 2
                            this.accessory.operationModeSetPropsValidValues = modelSupportsAuto && modelSupportsHeat ? [0, 1, 2] : !modelSupportsAuto && modelSupportsHeat ? [1, 2] : modelSupportsAuto && !modelSupportsHeat ? [0, 2] : [2];

                            //fan speed mode
                            if (modelSupportsFanSpeed) {
                                switch (numberOfFanSpeeds) {
                                    case 2: //Fan speed mode 2
                                        this.accessory.fanSpeed = hasAutomaticFanSpeed ? [3, 1, 2][fanSpeed] : [0, 1, 2][fanSpeed];
                                        this.accessory.fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 3 : 2;
                                        break;
                                    case 3: //Fan speed mode 3
                                        this.accessory.fanSpeed = hasAutomaticFanSpeed ? [4, 1, 2, 3][fanSpeed] : [0, 1, 2, 3][fanSpeed];
                                        this.accessory.fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 4 : 3;
                                        break;
                                    case 4: //Fan speed mode 4
                                        this.accessory.fanSpeed = hasAutomaticFanSpeed ? [5, 1, 2, 3, 4][fanSpeed] : [0, 1, 2, 3, 4][fanSpeed];
                                        this.accessory.fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 5 : 4;
                                        break;
                                    case 5: //Fan speed mode 5
                                        this.accessory.fanSpeed = hasAutomaticFanSpeed ? [6, 1, 2, 3, 4, 5][fanSpeed] : [0, 1, 2, 3, 4, 5][fanSpeed];
                                        this.accessory.fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 6 : 5;
                                        break;
                                    case 6: //Fan speed mode 6
                                        this.accessory.fanSpeed = hasAutomaticFanSpeed ? [7, 1, 2, 3, 4, 5, 6][fanSpeed] : [0, 1, 2, 3, 4, 5, 6][fanSpeed];
                                        this.accessory.fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 7 : 6;
                                        break;
                                };
                            };

                            //update characteristics
                            if (this.melCloudService) {
                                this.melCloudService
                                    .updateCharacteristic(Characteristic.Active, power ? 1 : 0)
                                    .updateCharacteristic(Characteristic.CurrentHeaterCoolerState, this.accessory.currentOperationMode)
                                    .updateCharacteristic(Characteristic.TargetHeaterCoolerState, this.accessory.targetOperationMode)
                                    .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                                    .updateCharacteristic(Characteristic.LockPhysicalControls, this.accessory.lockPhysicalControl)
                                    .updateCharacteristic(Characteristic.TemperatureDisplayUnits, this.accessory.useFahrenheit)
                                    .updateCharacteristic(Characteristic.CoolingThresholdTemperature, defaultCoolingSetTemperature);
                                const updateDefHeat = modelSupportsHeat ? this.melCloudService.updateCharacteristic(Characteristic.HeatingThresholdTemperature, defaultHeatingSetTemperature) : false;
                                const updateRS = modelSupportsFanSpeed ? this.melCloudService.updateCharacteristic(Characteristic.RotationSpeed, this.accessory.fanSpeed) : false;
                                const updateSM = swingFunction ? this.melCloudService.updateCharacteristic(Characteristic.SwingMode, this.accessory.swingMode) : false;
                            };
                            break;
                        case 2: //Thermostat
                            switch (operationMode) {
                                case 1: //HEAT
                                    this.accessory.currentOperationMode = roomTemperature > setTemperature ? 0 : 1; //OFF, HEATING, COOLING
                                    this.accessory.targetOperationMode = 1; //OFF, HEAT, COOL, AUTO
                                    break;
                                case 2: //DRY
                                    this.accessory.currentOperationMode = 0;
                                    this.accessory.targetOperationMode = this.autoDryFanMode === 2 ? 3 : this.heatDryFanMode === 2 ? 1 : this.coolDryFanMode === 2 ? 2 : this.accessory.targetOperationMode ?? 0;
                                    break;
                                case 3: //COOL
                                    this.accessory.currentOperationMode = roomTemperature < setTemperature ? 0 : 2;
                                    this.accessory.targetOperationMode = 2;
                                    break;
                                case 7: //FAN
                                    this.accessory.currentOperationMode = 0;
                                    this.accessory.targetOperationMode = this.autoDryFanMode === 3 ? 3 : this.heatDryFanMode === 3 ? 1 : this.coolDryFanMode === 3 ? 2 : this.accessory.targetOperationMode ?? 0;
                                    break;
                                case 8: //AUTO
                                    this.accessory.currentOperationMode = roomTemperature < setTemperature ? 1 : roomTemperature > setTemperature ? 2 : 0;
                                    this.accessory.targetOperationMode = 3;
                                    break;
                                case 9: //ISEE HEAT
                                    this.accessory.currentOperationMode = roomTemperature > setTemperature ? 0 : 1;
                                    this.accessory.targetOperationMode = 1;
                                    break;
                                case 10: //ISEE DRY
                                    this.accessory.currentOperationMode = 0;
                                    this.accessory.targetOperationMode = this.autoDryFanMode === 2 ? 3 : this.heatDryFanMode === 2 ? 1 : this.coolDryFanMode === 2 ? 2 : this.accessory.targetOperationMode ?? 0;
                                    break;
                                case 11: //ISEE COOL;
                                    this.accessory.currentOperationMode = roomTemperature < setTemperature ? 0 : 2;
                                    this.accessory.targetOperationMode = 2;
                                    break;
                                default:
                                    this.emit('warn', `Unknown operating mode: ${operationMode}`);
                                    break;
                            };

                            this.accessory.currentOperationMode = !power ? 0 : this.accessory.currentOperationMode;
                            this.accessory.targetOperationMode = !power ? 0 : this.accessory.targetOperationMode;
                            this.accessory.operationModeSetPropsMinValue = 0
                            this.accessory.operationModeSetPropsMaxValue = modelSupportsAuto && modelSupportsHeat ? 3 : !modelSupportsAuto && modelSupportsHeat ? 2 : modelSupportsAuto && !modelSupportsHeat ? 3 : 2;
                            this.accessory.operationModeSetPropsValidValues = modelSupportsAuto && modelSupportsHeat ? [0, 1, 2, 3] : !modelSupportsAuto && modelSupportsHeat ? [0, 1, 2] : modelSupportsAuto && !modelSupportsHeat ? [0, 2, 3] : [0, 2];

                            //update characteristics
                            if (this.melCloudService) {
                                this.melCloudService
                                    .updateCharacteristic(Characteristic.CurrentHeatingCoolingState, this.accessory.currentOperationMode)
                                    .updateCharacteristic(Characteristic.TargetHeatingCoolingState, this.accessory.targetOperationMode)
                                    .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                                    .updateCharacteristic(Characteristic.TargetTemperature, setTemperature)
                                    .updateCharacteristic(Characteristic.TemperatureDisplayUnits, this.accessory.useFahrenheit);
                            };
                            break;
                    };

                    if (this.roomTemperatureSensorService) {
                        this.roomTemperatureSensorService
                            .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                    };

                    if (this.outdoorTemperatureSensorService) {
                        this.outdoorTemperatureSensorService
                            .updateCharacteristic(Characteristic.CurrentTemperature, outdoorTemperature)
                    };

                    //update presets state
                    if (this.presetsConfigured.length > 0) {
                        this.presetsConfigured.forEach((preset, i) => {
                            const presetData = presetsOnServer.find(p => p.ID === preset.Id);

                            preset.state = presetData ? (presetData.Power === power
                                && presetData.SetTemperature === setTemperature
                                && presetData.OperationMode === operationMode
                                && presetData.VaneHorizontal === vaneHorizontalDirection
                                && presetData.VaneVertical === vaneVerticalDirection
                                && presetData.FanSpeed === fanSpeed) : false;

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
                                    button.state = power ? (fanSpeed === 0) : false;
                                    break;
                                case 31: //FAN SPEED MODE 1
                                    button.state = power ? (fanSpeed === 1) : false;
                                    break;
                                case 32: //FAN SPEED MODE 2
                                    button.state = power ? (fanSpeed === 2) : false;
                                    break;
                                case 33: //FAN SPEED MODE 3
                                    button.state = power ? (fanSpeed === 3) : false;
                                    break;
                                case 34: //FAN SPEED MODE 4
                                    button.state = power ? (fanSpeed === 4) : false;
                                    break;
                                case 35: //FAN SPEED  MODE 5
                                    button.state = power ? (fanSpeed === 5) : false;
                                    break;
                                case 36: //FAN SPEED  MODE 6
                                    button.state = power ? (fanSpeed === 6) : false;
                                    break;
                                case 37: //PHYSICAL LOCK CONTROLS ALL
                                    button.state = (this.accessory.lockPhysicalControl === 1);
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

                    //log current state
                    if (!this.disableLogInfo) {
                        this.emit('info', `Power: ${power ? 'ON' : 'OFF'}`);
                        this.emit('info', `Target operation mode: ${AirConditioner.DriveMode[operationMode]}`);
                        this.emit('info', `Current operation mode: ${this.displayMode === 1 ? AirConditioner.CurrentOperationModeHeatherCooler[this.accessory.currentOperationMode] : AirConditioner.CurrentOperationModeThermostat[this.accessory.currentOperationMode]}`);
                        this.emit('info', `Target temperature: ${setTemperature}${this.accessory.temperatureUnit}`);
                        this.emit('info', `Current temperature: ${roomTemperature}${this.accessory.temperatureUnit}`);
                        const info = hasOutdoorTemperature && outdoorTemperature !== null ? this.emit('info', `Outdoor temperature: ${outdoorTemperature}${this.accessory.temperatureUnit}`) : false;
                        const info3 = modelSupportsFanSpeed ? this.emit('info', `Target fan speed: ${AirConditioner.FanSpeed[fanSpeed]}`) : false;
                        const info4 = modelSupportsFanSpeed ? this.emit('info', `Current fan speed: ${AirConditioner.FanSpeed[actualFanSpeed]}`) : false;
                        const info5 = vaneHorizontalDirection !== null ? this.emit('info', `Vane horizontal: ${AirConditioner.HorizontalVane[vaneHorizontalDirection] ?? vaneHorizontalDirection}`) : false;
                        const info6 = vaneVerticalDirection !== null ? this.emit('info', `Vane vertical: ${AirConditioner.VerticalVane[vaneVerticalDirection] ?? vaneVerticalDirection}`) : false;
                        const info7 = swingFunction ? this.emit('info', `Air direction: ${AirConditioner.AirDirection[this.accessory.swingMode]}`) : false;
                        this.emit('info', `Temperature display unit: ${this.accessory.temperatureUnit}`);
                        this.emit('info', `Lock physical controls: ${this.accessory.lockPhysicalControl ? 'LOCKED' : 'UNLOCKED'}`);
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
            await this.melCloudAta.checkState();

            return true;
        } catch (error) {
            throw new Error(`Start error: ${error}`);
        };
    };
};
export default DeviceAta;
