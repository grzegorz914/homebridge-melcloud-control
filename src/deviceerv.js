import EventEmitter from 'events';
import MelCloudErv from './melclouderv.js';
import RestFul from './restful.js';
import Mqtt from './mqtt.js';
import { TemperatureDisplayUnits, Ventilation } from './constants.js';
let Accessory, Characteristic, Service, Categories, AccessoryUUID;

class DeviceErv extends EventEmitter {
    constructor(api, account, device, contextKey, accountName, deviceId, deviceName, deviceTypeText, devicesFile, refreshInterval, useFahrenheit, restFul, mqtt) {
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
        this.temperatureSensorSupply = device.temperatureSensorSupply || false;
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
                        clientId: this.mqtt.clientId ? `${this.mqtt.clientId}_${this.deviceId}` : `${this.deviceTypeText}_${this.deviceName}_${this.deviceId}`,
                        prefix: this.mqtt.prefix ? `${this.mqtt.prefix}/${this.deviceTypeText}/${this.deviceName}` : `melcloud/${this.deviceTypeText}/${this.deviceName}`,
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
            switch (key) {
                case 'Power':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.Power;
                    set = await this.melCloudErv.send(deviceData, this.displayMode);
                    break;
                case 'OperationMode':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.OperationMode;
                    set = await this.melCloudErv.send(deviceData, this.displayMode);
                    break;
                case 'VentilationMode':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.VentilationMode;
                    set = await this.melCloudErv.send(deviceData, this.displayMode);
                    break;
                case 'SetTemperature':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.SetTemperature;
                    set = await this.melCloudErv.send(deviceData, this.displayMode);
                    break;
                case 'DefaultCoolingSetTemperature':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.SetTemperature;
                    set = await this.melCloudErv.send(deviceData, this.displayMode);
                    break;
                case 'DefaultHeatingSetTemperature':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.SetTemperature;
                    set = await this.melCloudErv.send(deviceData, this.displayMode);
                    break;
                case 'NightPurgeMode':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.NightPurgeMode;
                    set = await this.melCloudErv.send(deviceData, this.displayMode);
                    break;
                case 'SetFanSpeed':
                    deviceData.Device[key] = value;
                    deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.SetFanSpeed;
                    set = await this.melCloudErv.send(deviceData, this.displayMode);
                    break;
                case 'HideRoomTemperature':
                    deviceData[key] = value;
                    deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.Prohibit;
                    set = await this.melCloudErv.send(deviceData, this.displayMode);
                    break;
                case 'HideSupplyTemperature':
                    deviceData[key] = value;
                    deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.Prohibit;
                    set = await this.melCloudErv.send(deviceData, this.displayMode);
                    break;
                case 'HideOutdoorTemperature':
                    deviceData[key] = value;
                    deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.Prohibit;
                    set = await this.melCloudErv.send(deviceData, this.displayMode);
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
            await this.melCloudErv.impulseGenerator.start([{ name: 'checkState', sampling: this.refreshInterval }]);
            return true;
        } catch (error) {
            throw new Error(`Impulse generator start error: ${error}`);
        };
    }

    //prepare accessory
    async prepareAccessory(deviceData) {
        try {
            const deviceId = this.deviceId;
            const deviceTypeText = this.deviceTypeText;
            const deviceName = this.deviceName;
            const accountName = this.accountName;
            const presetsOnServer = this.accessory.presets;
            const hasRoomTemperature = this.accessory.hasRoomTemperature;
            const hasSupplyTemperature = this.accessory.hasSupplyTemperature;
            const hasOutdoorTemperature = this.accessory.hasOutdoorTemperature;
            const hasCoolOperationMode = this.accessory.hasCoolOperationMode;
            const hasHeatOperationMode = this.accessory.hasHeatOperationMode;
            const hasAutoVentilationMode = this.accessory.hasAutoVentilationMode;
            const hasBypassVentilationMode = this.accessory.hasBypassVentilationMode;
            const hasAutomaticFanSpeed = this.accessory.hasAutomaticFanSpeed;
            const hasCO2Sensor = this.accessory.hasCO2Sensor;
            const hasPM25Sensor = this.accessory.hasPM25Sensor;
            const numberOfFanSpeeds = this.accessory.numberOfFanSpeeds;

            //accessory
            const debug = this.enableDebugMode ? this.emit('debug', `Prepare accessory`) : false;
            const accessoryName = deviceName;
            const accessoryUUID = AccessoryUUID.generate(accountName + deviceId.toString());
            const accessoryCategory = [Categories.OTHER, Categories.AIR_PURIFIER, Categories.THERMOSTAT][this.displayType];
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
            const serviceName = `${deviceTypeText} ${accessoryName}`;
            switch (this.displayMode) {
                case 1: //Heater Cooler
                    const debug = this.enableDebugMode ? this.emit('debug', `Prepare heather/cooler service`) : false;
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
                                deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.Power;
                                await this.melCloudErv.send(deviceData, this.displayMode);
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
                            const value = this.accessory.targetOperationMode ?? 0; //LOSSNAY, BYPASS, AUTO
                            return value;
                        })
                        .onSet(async (value) => {
                            try {
                                switch (value) {
                                    case 0: //AUTO - AUTO
                                        deviceData.Device.VentilationMode = hasAutoVentilationMode ? 2 : 0;
                                        break;
                                    case 1: //HEAT - LOSSNAY
                                        deviceData.Device.VentilationMode = 0;
                                        break;
                                    case 2: //COOL - BYPASS
                                        deviceData.Device.VentilationMode = hasBypassVentilationMode ? 1 : 0;
                                        break;
                                };

                                deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.VentilationMode;
                                await this.melCloudErv.send(deviceData, this.displayMode);
                                const operationModeText = Ventilation.VentilationMode[deviceData.Device.VentilationMode];
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
                    this.melCloudService.getCharacteristic(Characteristic.RotationSpeed)
                        .setProps({
                            minValue: 0,
                            maxValue: this.accessory.fanSpeedSetPropsMaxValue,
                            minStep: 1
                        })
                        .onGet(async () => {
                            const value = this.accessory.fanSpeed; //STOP, 1, 2, 3, 4, OFF
                            return value;
                        })
                        .onSet(async (value) => {
                            try {
                                let fanSpeedModeText = '';
                                switch (numberOfFanSpeeds) {
                                    case 2: //Fan speed mode 2
                                        fanSpeedModeText = hasAutomaticFanSpeed ? [5, 1, 2, 0][value] : [5, 1, 2][value];
                                        deviceData.Device.SetFanSpeed = hasAutomaticFanSpeed ? [0, 1, 2, 0][value] : [1, 1, 2][value];
                                        break;
                                    case 3: //Fan speed mode 3
                                        fanSpeedModeText = hasAutomaticFanSpeed ? [5, 1, 2, 3, 0][value] : [5, 1, 2, 3][value];
                                        deviceData.Device.SetFanSpeed = hasAutomaticFanSpeed ? [0, 1, 2, 3, 0][value] : [1, 1, 2, 3][value];
                                        break;
                                    case 4: //Fan speed mode 4
                                        fanSpeedModeText = hasAutomaticFanSpeed ? [5, 1, 2, 3, 4, 0][value] : [5, 1, 2, 3, 4][value];
                                        deviceData.Device.SetFanSpeed = hasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 0][value] : [1, 1, 2, 3, 4][value];
                                        break;
                                    case 5: //Fan speed mode 5
                                        5; fanSpeedModeText = hasAutomaticFanSpeed ? [5, 1, 2, 3, 4, 5, 0][value] : [5, 1, 2, 3, 4, 5][value];
                                        deviceData.Device.SetFanSpeed = hasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 0][value] : [1, 1, 2, 3, 4, 5][value];
                                        break;;
                                };
                                deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.SetFanSpeed;
                                await this.melCloudErv.send(deviceData, this.displayMode);
                                const info = this.disableLogInfo ? false : this.emit('info', `Set fan speed mode: ${Ventilation.FanSpeed[fanSpeedModeText]}`);
                            } catch (error) {
                                this.emit('warn', `Set fan speed mode error: ${error}`);
                            };
                        });
                    //device can cool
                    if (hasAutoVentilationMode && hasCoolOperationMode) {
                        this.melCloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
                            .setProps({
                                minValue: this.accessory.minTempCoolDry,
                                maxValue: this.accessory.maxTempCoolDry,
                                minStep: this.accessory.temperatureIncrement
                            })
                            .onGet(async () => {
                                const value = this.accessory.ventilationMode === 2 ? this.accessory.defaultHeatingSetTemperature : this.accessory.setTemperature;
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    deviceData.Device.DefaultCoolingSetTemperature = value;
                                    deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.SetTemperature;
                                    await this.melCloudErv.send(deviceData, this.displayMode);
                                    const info = this.disableLogInfo ? false : this.emit('info', `Set cooling threshold temperature: ${value}${this.accessory.temperatureUnit}`);
                                } catch (error) {
                                    this.emit('warn', `Set cooling threshold temperature error: ${error}`);
                                };
                            });
                    };
                    //device can heat
                    if (hasAutoVentilationMode && hasHeatOperationMode) {
                        this.melCloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
                            .setProps({
                                minValue: this.accessory.minTempHeat,
                                maxValue: this.accessory.maxTempHeat,
                                minStep: this.accessory.temperatureIncrement
                            })
                            .onGet(async () => {
                                const value = this.accessory.ventilationMode === 2 ? this.accessory.defaultHeatingSetTemperature : this.accessory.setTemperature;
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
                                    deviceData.Device.DefaultHeatingSetTemperature = value;
                                    deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.SetTemperature;
                                    await this.melCloudErv.send(deviceData, this.displayMode);
                                    const info = this.disableLogInfo ? false : this.emit('info', `Set heating threshold temperature: ${value}${this.accessory.temperatureUnit}`);
                                } catch (error) {
                                    this.emit('warn', `Set heating threshold temperature error: ${error}`);
                                };
                            });
                    };
                    //this.melCloudService.getCharacteristic(Characteristic.LockPhysicalControls)
                    //    .onGet(async () => {
                    //        const value = this.accessory.lockPhysicalControl;
                    //        const info = this.disableLogInfo ? false : this.emit('info', `Lock physical controls: ${value ? 'LOCKED' : 'UNLOCKED'}`);
                    //        return value;
                    //    })
                    //    .onSet(async (value) => {
                    //       try {
                    //         value = value ? true : false;
                    //         deviceData.Device = deviceData.Device;
                    //         deviceData.Device.EffectiveFlags = CONSTANTS.Ventilation.EffectiveFlags.Prohibit;
                    //         await this.melCloudErv.send(deviceData, this.displayMode);
                    //         const info = this.disableLogInfo ? false : this.emit('info', `Set local physical controls: ${value ? 'LOCK' : 'UNLOCK'}`);
                    //     } catch (error) {
                    //          this.emit('warn', `Set lock physical controls error: ${error}`);
                    //      };
                    //   });
                    this.melCloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
                        .onGet(async () => {
                            const value = this.accessory.useFahrenheit;
                            return value;
                        })
                        .onSet(async (value) => {
                            try {
                                value = [false, true][value];
                                this.accessory.useFahrenheit = value;
                                this.emit('melCloud', 'UseFahrenheit', value);
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
                            const value = this.accessory.targetOperationMode ?? 0; //LOSSNAY, BYPASS, AUTO
                            return value;
                        })
                        .onSet(async (value) => {
                            try {
                                switch (value) {
                                    case 0: //OFF - POWER OFF
                                        deviceData.Device.Power = false;
                                        deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.Power;
                                        break;
                                    case 1: //HEAT - LOSSNAY
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VentilationMode = 0;
                                        deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.Power + Ventilation.EffectiveFlags.VentilationMode;
                                        break;
                                    case 2: //COOL - BYPASS
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VentilationMode = hasBypassVentilationMode ? 1 : 0;
                                        deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.Power + Ventilation.EffectiveFlags.VentilationMode;
                                        break;
                                    case 3: //AUTO - AUTO
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VentilationMode = hasAutoVentilationMode ? 2 : 0;
                                        deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.Power + Ventilation.EffectiveFlags.VentilationMode;
                                        break;
                                };

                                await this.melCloudErv.send(deviceData, this.displayMode);
                                const operationModeText = Ventilation.VentilationMode[deviceData.Device.VentilationMode];
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
                                deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.SetTemperature;
                                await this.melCloudErv.send(deviceData, this.displayMode);
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
                                value = [false, true][value];
                                this.accessory.useFahrenheit = value;
                                this.emit('melCloud', 'UseFahrenheit', value);
                                const info = this.disableLogInfo ? false : this.emit('info', `Set temperature display unit: ${TemperatureDisplayUnits[value]}`);
                            } catch (error) {
                                this.emit('warn', `Set temperature display unit error: ${error}`);
                            };
                        });
                    accessory.addService(this.melCloudService);
                    break;
            };

            //temperature sensor service room
            if (this.temperatureSensor && hasRoomTemperature && this.accessory.roomTemperature !== null) {
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare room temperature sensor service`) : false;
                this.roomTemperatureSensorService = new Service.TemperatureSensor(`${serviceName} Room`, `Room Temperature Sensor ${deviceId}`);
                this.roomTemperatureSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.roomTemperatureSensorService.setCharacteristic(Characteristic.ConfiguredName, `${serviceName} Room`);
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

            //temperature sensor service supply
            if (this.temperatureSensorSupply && hasSupplyTemperature && this.accessory.supplyTemperature !== null) {
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare supply temperature sensor service`) : false;
                this.supplyTemperatureSensorService = new Service.TemperatureSensor(`${serviceName} Supply`, `Supply Temperature Sensor ${deviceId}`);
                this.supplyTemperatureSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.supplyTemperatureSensorService.setCharacteristic(Characteristic.ConfiguredName, `${serviceName} Supply`);
                this.supplyTemperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                    .setProps({
                        minValue: -35,
                        maxValue: 150,
                        minStep: 0.5
                    })
                    .onGet(async () => {
                        const state = this.accessory.supplyTemperature;
                        return state;
                    })
                accessory.addService(this.supplyTemperatureSensorService);
            };

            //temperature sensor service outdoor
            if (this.temperatureSensorOutdoor && hasOutdoorTemperature && this.accessory.outdoorTemperature !== null) {
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare outdoor temperature sensor service`) : false;
                this.outdoorTemperatureSensorService = new Service.TemperatureSensor(`${serviceName} Outdoor`, `Outdoor Temperature Sensor ${deviceId}`);
                this.outdoorTemperatureSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.outdoorTemperatureSensorService.setCharacteristic(Characteristic.ConfiguredName, `${serviceName} Outdoor`);
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

            //core maintenance
            this.coreMaintenanceService = new Service.FilterMaintenance(`${serviceName} Core Maintenance`, `CoreMaintenance ${deviceId}`);
            this.coreMaintenanceService.addOptionalCharacteristic(Characteristic.ConfiguredName);
            this.coreMaintenanceService.setCharacteristic(Characteristic.ConfiguredName, `${serviceName} Core Maintenance`);
            this.coreMaintenanceService.getCharacteristic(Characteristic.FilterChangeIndication)
                .onGet(async () => {
                    const value = this.accessory.coreMaintenanceRequired;
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
                    const value = this.accessory.filterMaintenanceRequired;
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
                        const value = this.accessory.roomCO2Detected;
                        return value;
                    });
                this.carbonDioxideSensorService.getCharacteristic(Characteristic.CarbonDioxideLevel)
                    .onGet(async () => {
                        const value = this.accessory.roomCO2Level;
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
                        const value = this.accessory.pM25AirQuality;
                        return value;
                    });
                this.airQualitySensorService.getCharacteristic(Characteristic.PM2_5Density)
                    .onGet(async () => {
                        const value = this.accessory.pM25Level;
                        return value;
                    });
                accessory.addService(this.airQualitySensorService);
            }

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
                                        deviceData.Device.SetTemperature = presetData.SetTemperature;
                                        deviceData.Device.Power = presetData.Power;
                                        deviceData.Device.OperationMode = presetData.OperationMode;
                                        deviceData.Device.VentilationMode = presetData.VentilationMode;
                                        deviceData.Device.SetFanSpeed = presetData.FanSpeed;
                                        deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.Power;
                                        break;
                                    case false:
                                        deviceData.Device.SetTemperature = preset.previousSettings.SetTemperature;
                                        deviceData.Device.Power = preset.previousSettings.Power;
                                        deviceData.Device.OperationMode = preset.previousSettings.OperationMode;
                                        deviceData.Device.VentilationMode = preset.previousSettings.VentilationMode;
                                        deviceData.Device.SetFanSpeed = preset.previousSettings.FanSpeed;
                                        deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.Power;
                                        break;
                                };

                                await this.melCloudErv.send(deviceData, this.displayMode);
                                const info = this.disableLogInfo ? false : this.emit('info', `${state ? 'Set:' : 'Unset:'} ${name}`);
                            } catch (error) {
                                this.emit('warn', `Set preset error: ${error}`);
                            };
                        });
                });
                this.presetsServices.push(presetService);
                accessory.addService(presetService);
            };

            //buttons services
            if (this.buttonsConfiguredCount > 0) {
                const debug = this.enableDebugMode ? this.emit('debug', `Prepare buttons services`) : false;
                this.buttonsServices = [];
                this.buttonsConfigured.forEach((button, i) => {
                    //get button mode
                    const mode = button.mode;

                    //get button name
                    const buttonName = button.name;

                    //get button name prefix
                    const namePrefix = button.namePrefix;

                    const serviceName = namePrefix ? `${accessoryName} ${buttonName}` : buttonName;
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
                                        deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.Power;
                                        break;
                                    case 1: //OPERATING MODE RECOVERY
                                        button.previousValue = state ? deviceData.Device.VentilationMode : button.previousValue ?? deviceData.Device.VentilationMode;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VentilationMode = state ? 0 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.Power + Ventilation.EffectiveFlags.VentilationMode;
                                        break;
                                    case 2: //OPERATING MODE BYPASS
                                        button.previousValue = state ? deviceData.Device.VentilationMode : button.previousValue ?? deviceData.Device.VentilationMode;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VentilationMode = state ? 1 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.Power + Ventilation.EffectiveFlags.VentilationMode;
                                        break
                                    case 3: //OPERATING MODE AUTO
                                        button.previousValue = state ? deviceData.Device.VentilationMode : button.previousValue ?? deviceData.Device.VentilationMode;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.VentilationMode = state ? 2 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.Power + Ventilation.EffectiveFlags.VentilationMode;
                                        break;
                                    case 4: //NIGHT PURGE MODE
                                        deviceData.Device.Power = true;
                                        deviceData.Device.NightPurgeMode = state;
                                        deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.Power
                                        break;
                                    case 10: //FAN SPEED MODE AUTO
                                        button.previousValue = state ? deviceData.Device.SetFanSpeed : button.previousValue ?? deviceData.Device.SetFanSpeed;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.SetFanSpeed = state ? 0 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.Power + Ventilation.EffectiveFlags.SetFanSpeed;
                                        break;
                                    case 11: //FAN SPEED MODE 1
                                        button.previousValue = state ? deviceData.Device.SetFanSpeed : button.previousValue ?? deviceData.Device.SetFanSpeed;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.SetFanSpeed = state ? 1 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.Power + Ventilation.EffectiveFlags.SetFanSpeed;
                                        break;
                                    case 12: //FAN SPEED MODE 2
                                        button.previousValue = state ? deviceData.Device.SetFanSpeed : button.previousValue ?? deviceData.Device.SetFanSpeed;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.SetFanSpeed = state ? 2 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.Power + Ventilation.EffectiveFlags.SetFanSpeed;
                                        break;
                                    case 13: //FAN SPEED MODE 3
                                        button.previousValue = state ? deviceData.Device.SetFanSpeed : button.previousValue ?? deviceData.Device.SetFanSpeed;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.SetFanSpeed = state ? 3 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.Power + Ventilation.EffectiveFlags.SetFanSpeed;
                                        break;
                                    case 14: //FAN MODE 4
                                        button.previousValue = state ? deviceData.Device.SetFanSpeed : button.previousValue ?? deviceData.Device.SetFanSpeed;
                                        deviceData.Device.Power = true;
                                        deviceData.Device.SetFanSpeed = state ? 4 : button.previousValue;
                                        deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.Power + Ventilation.EffectiveFlags.SetFanSpeed;
                                        break;
                                    case 15: //PHYSICAL LOCK CONTROLS
                                        deviceData.Device = deviceData.Device;
                                        deviceData.Device.EffectiveFlags = Ventilation.EffectiveFlags.Prohibit;
                                        break;
                                    case 16: //ROOM TEMP HIDE
                                        deviceData.HideRoomTemperature = state;
                                        break;
                                    case 17: //SUPPLY TEMP HIDE
                                        deviceData.HideSupplyTemperature = state;
                                        break;
                                    case 18: //OUTDOOR EMP HIDE
                                        deviceData.hideOutdoorTemperature = state;
                                        break;
                                    default:
                                        this.emit('warn', `Unknown button mode: ${mode}`);
                                        break;
                                };

                                await this.melCloudErv.send(deviceData, this.displayMode);
                                const info = this.disableLogInfo ? false : this.emit('info', `${state ? `Set: ${buttonName}` : `Unset: ${buttonName}, Set: ${button.previousValue}`}`);
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
            this.melCloudErv = new MelCloudErv({
                contextKey: this.contextKey,
                devicesFile: this.devicesFile,
                deviceId: this.deviceId,
                enableDebugMode: this.enableDebugMode
            });

            this.melCloudErv.on('deviceInfo', (manufacturer, modelIndoor, modelOutdoor, serialNumber, firmwareAppVersion) => {
                if (!this.displayDeviceInfo) {
                    return;
                }

                if (!this.disableLogDeviceInfo) {
                    this.emit('devInfo', `---- ${this.deviceTypeText}: ${this.deviceName} ----`);
                    this.emit('devInfo', `Account: ${this.accountName}`);
                    const indoor = modelIndoor ? this.emit('devInfo', `Indoor: ${modelIndoor}`) : false;
                    const outdoor = modelOutdoor ? this.emit('devInfo', `Outdoor: ${modelOutdoor}`) : false;
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
                    const hideRoomTemperature = deviceData.HideRoomTemperature;
                    const hideSupplyTemperature = deviceData.HideSupplyTemperature;
                    const hideOutdoorTemperature = deviceData.HideOutdoorTemperature;

                    //device info
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
                    const minTempHeat = 10;
                    const maxTempHeat = 31;
                    const minTempCoolDry = 16;
                    const maxTempCoolDry = 31;

                    //device state
                    const power = deviceData.Device.Power ?? false;
                    const roomTemperature = deviceData.Device.RoomTemperature;
                    const supplyTemperature = deviceData.Device.SupplyTemperature;
                    const outdoorTemperature = deviceData.Device.OutdoorTemperature;
                    const nightPurgeMode = deviceData.Device.NightPurgeMode;
                    const setTemperature = deviceData.Device.SetTemperature ?? 20;
                    const defaultHeatingSetTemperature = deviceData.Device.DefaultHeatingSetTemperature ?? 20;
                    const defaultCoolingSetTemperature = deviceData.Device.DefaultCoolingSetTemperature ?? 23;
                    const setFanSpeed = deviceData.Device.SetFanSpeed;
                    const operationMode = deviceData.Device.OperationMode;
                    const ventilationMode = deviceData.Device.VentilationMode;

                    //accessory
                    const obj = {
                        presets: presetsOnServer,
                        hasRoomTemperature: hasRoomTemperature,
                        hasSupplyTemperature: hasSupplyTemperature,
                        hasOutdoorTemperature: hasOutdoorTemperature,
                        hasCoolOperationMode: hasCoolOperationMode,
                        hasHeatOperationMode: hasHeatOperationMode,
                        hasCO2Sensor: hasCO2Sensor,
                        roomCO2Level: roomCO2Level,
                        roomCO2Detected: roomCO2Detected,
                        hasPM25Sensor: hasPM25Sensor,
                        pM25SensorStatus: pM25SensorStatus,
                        pM25Level: pM25Level,
                        pM25AirQuality: pM25AirQuality,
                        hasAutoVentilationMode: hasAutoVentilationMode,
                        hasBypassVentilationMode: hasBypassVentilationMode,
                        hasAutomaticFanSpeed: hasAutomaticFanSpeed,
                        coreMaintenanceRequired: coreMaintenanceRequired,
                        filterMaintenanceRequired: filterMaintenanceRequired,
                        actualVentilationMode: actualVentilationMode,
                        numberOfFanSpeeds: numberOfFanSpeeds,
                        power: power ? 1 : 0,
                        operationMode: operationMode,
                        currentOperationMode: 0,
                        targetOperationMode: 0,
                        ventilationMode: ventilationMode,
                        roomTemperature: roomTemperature,
                        supplyTemperature: supplyTemperature,
                        outdoorTemperature: outdoorTemperature,
                        setTemperature: setTemperature,
                        defaultHeatingSetTemperature: defaultHeatingSetTemperature,
                        defaultCoolingSetTemperature: defaultCoolingSetTemperature,
                        lockPhysicalControl: 0,
                        temperatureIncrement: temperatureIncrement,
                        minTempHeat: minTempHeat,
                        temperatureIncrement: maxTempHeat,
                        minTempCoolDry: minTempCoolDry,
                        maxTempCoolDry: maxTempCoolDry,
                        useFahrenheit: this.useFahrenheit,
                        temperatureUnit: TemperatureDisplayUnits[this.useFahrenheit]
                    };

                    //ventilation mode - 0, HEAT, 2, COOL, 4, 5, 6, FAN, AUTO
                    switch (this.displayMode) {
                        case 1: //Heater Cooler
                            switch (ventilationMode) {
                                case 0: //LOSSNAY
                                    obj.currentOperationMode = 2; //INACTIVE, IDLE, HEATING, COOLIN
                                    obj.targetOperationMode = 1; //AUTO, HEAT, COOL
                                    break;
                                case 1: //BYPASS
                                    obj.currentOperationMode = 3;
                                    obj.targetOperationMode = 2;
                                    break;
                                case 2: //AUTO
                                    switch (actualVentilationMode) {
                                        case 0: //LOSSNAY
                                            obj.currentOperationMode = 2;
                                            break;
                                        case 1: //BYPASS
                                            obj.currentOperationMode = 3;
                                            break;
                                        default:
                                            this.emit('warn', `Unknown actual ventilation mode: ${actualVentilationMode}`);
                                            break;
                                    };
                                    obj.targetOperationMode = 0;
                                    break;
                                default:
                                    this.emit('warn', `Unknown ventilation mode: ${ventilationMode}`);
                                    break;
                            };

                            obj.currentOperationMode = !power ? 0 : obj.currentOperationMode;
                            obj.targetOperationMode = obj.targetOperationMode;
                            obj.operationModeSetPropsMinValue = hasAutoVentilationMode ? 0 : 1;
                            obj.operationModeSetPropsMaxValue = hasAutoVentilationMode ? 2 : 2;
                            obj.operationModeSetPropsValidValues = hasAutoVentilationMode ? (hasBypassVentilationMode ? [0, 1, 2] : [0, 2]) : (hasBypassVentilationMode ? [1, 2] : [2]);

                            //fan speed mode
                            obj.fanSpeedSetPropsMaxValue = 2;
                            switch (numberOfFanSpeeds) {
                                case 2: //Fan speed mode 2
                                    obj.fanSpeed = hasAutomaticFanSpeed ? [3, 1, 2][setFanSpeed] : [0, 1, 2][setFanSpeed];
                                    obj.fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 3 : 2;
                                    break;
                                case 3: //Fan speed mode 3
                                    this.obj.fanSpeed = hasAutomaticFanSpeed ? [4, 1, 2, 3][setFanSpeed] : [0, 1, 2, 3][setFanSpeed];
                                    obj.fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 4 : 3;
                                    break;
                                case 4: //Fan speed mode 4
                                    obj.fanSpeed = hasAutomaticFanSpeed ? [5, 1, 2, 3, 4][setFanSpeed] : [0, 1, 2, 3, 4][setFanSpeed];
                                    obj.fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 5 : 4;
                                    break;
                            };

                            //update characteristics
                            if (this.melCloudService) {
                                this.melCloudService
                                    .updateCharacteristic(Characteristic.Active, power)
                                    .updateCharacteristic(Characteristic.CurrentHeaterCoolerState, obj.currentOperationMode)
                                    .updateCharacteristic(Characteristic.TargetHeaterCoolerState, obj.targetOperationMode)
                                    .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                                    .updateCharacteristic(Characteristic.RotationSpeed, obj.fanSpeed)
                                    .updateCharacteristic(Characteristic.LockPhysicalControls, obj.lockPhysicalControl)
                                    .updateCharacteristic(Characteristic.TemperatureDisplayUnits, obj.useFahrenheit);
                                const updateDefCool = hasCoolOperationMode ? this.melCloudService.updateCharacteristic(Characteristic.CoolingThresholdTemperature, defaultCoolingSetTemperature) : false;
                                const updateDefHeat = hasHeatOperationMode ? this.melCloudService.updateCharacteristic(Characteristic.HeatingThresholdTemperature, defaultHeatingSetTemperature) : false;
                            };
                            break;
                        case 2: //Thermostat
                            //operation mode - 0, HEAT, 2, COOL, 4, 5, 6, FAN, AUTO
                            switch (ventilationMode) {
                                case 0: //LOSSNAY
                                    obj.currentOperationMode = 1; //OFF, HEAT, COOL
                                    obj.targetOperationMode = 1; //OFF, HEAT, COOL, AUTO
                                    break;
                                case 1: //BYPASS
                                    obj.currentOperationMode = 2;
                                    obj.targetOperationMode = 2;
                                    break;
                                case 2: //AUTO
                                    switch (actualVentilationMode) {
                                        case 0: //LOSSNAY
                                            obj.currentOperationMode = 1;
                                            break;
                                        case 1: //BYPASS
                                            obj.currentOperationMode = 2;
                                            break;
                                        default:
                                            this.emit('warn', `Unknown actual ventilation mode: ${actualVentilationMode}`);
                                            break;
                                    };
                                    obj.targetOperationMode = 3;
                                    break;
                                default:
                                    this.emit('warn', `Unknown ventilation mode: ${ventilationMode}`);
                                    break;
                            };

                            obj.currentOperationMode = !power ? 0 : obj.currentOperationMode;
                            obj.targetOperationMode = !power ? 0 : obj.targetOperationMode;
                            obj.operationModeSetPropsMinValue = hasAutoVentilationMode ? 0 : 0;
                            obj.operationModeSetPropsMaxValue = hasAutoVentilationMode ? 3 : 2;
                            obj.operationModeSetPropsValidValues = hasAutoVentilationMode ? (hasBypassVentilationMode ? [0, 1, 2, 3] : [0, 2, 3]) : (hasBypassVentilationMode ? [0, 1, 2] : [0, 2]);

                            //update characteristics
                            if (this.melCloudService) {
                                this.melCloudService
                                    .updateCharacteristic(Characteristic.CurrentHeatingCoolingState, obj.currentOperationMode)
                                    .updateCharacteristic(Characteristic.TargetHeatingCoolingState, obj.targetOperationMode)
                                    .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                                    .updateCharacteristic(Characteristic.TargetTemperature, setTemperature)
                                    .updateCharacteristic(Characteristic.TemperatureDisplayUnits, obj.useFahrenheit);
                            };
                            break;
                    };
                    this.accessory = obj;

                    //update temperature sensors
                    if (this.roomTemperatureSensorService) {
                        this.roomTemperatureSensorService
                            .updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
                    };

                    if (this.outdoorTemperatureSensorService) {
                        this.outdoorTemperatureSensorService
                            .updateCharacteristic(Characteristic.CurrentTemperature, outdoorTemperature)
                    };

                    if (this.supplyTemperatureSensorService) {
                        this.supplyTemperatureSensorService
                            .updateCharacteristic(Characteristic.CurrentTemperature, supplyTemperature)
                    };

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
                    if (this.carbonDioxideSensorService) {
                        this.carbonDioxideSensorService
                            .updateCharacteristic(Characteristic.CarbonDioxideDetected, roomCO2Detected)
                            .updateCharacteristic(Characteristic.CarbonDioxideLevel, roomCO2Level)
                    }

                    //update PM2.5 sensor
                    if (this.airQualitySensorService) {
                        this.airQualitySensorService
                            .updateCharacteristic(Characteristic.AirQuality, pM25AirQuality)
                            .updateCharacteristic(Characteristic.PM2_5Density, pM25Level)
                    }

                    //update presets state
                    if (this.presetsConfigured.length > 0) {
                        this.presetsConfigured.forEach((preset, i) => {
                            const presetData = presetsOnServer.find(p => p.ID === preset.Id);

                            preset.state = presetData ? (presetData.Power === power
                                && presetData.SetTemperature === setTemperature
                                && presetData.OperationMode === operationMode
                                && presetData.VentilationMode === ventilationMode
                                && presetData.FanSpeed === setFanSpeed) : false;

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
                            const mode = button.mode;;
                            switch (mode) {
                                case 0: //POWER ON,OFF
                                    button.state = (power === true);
                                    break;
                                case 1: //OPERATION MODE RECOVERY
                                    button.state = power ? (ventilationMode === 0) : false;
                                    break;
                                case 2: //OPERATION MODE BYPASS
                                    button.state = power ? (ventilationMode === 1) : false;
                                    break;
                                case 3: //OPERATION MODE AUTO
                                    button.state = power ? (ventilationMode === 2) : false;
                                    break;
                                case 4: //NIGHT PURGE MODE
                                    button.state = power ? (nightPurgeMode === true) : false;
                                    break;
                                case 10: //FAN SPEED MODE AUTO
                                    button.state = power ? (setFanSpeed === 0) : false;
                                    break;
                                case 11: //FAN SPEED MODE 1
                                    button.state = power ? (setFanSpeed === 1) : false;
                                    break;
                                case 12: //FAN SPEED MODE 2
                                    button.state = power ? (setFanSpeed === 2) : false;
                                    break;
                                case 13: //FAN SPEED MODE 3
                                    button.state = power ? (setFanSpeed === 3) : false;
                                    break;
                                case 14: //FAN SPEED MODE 4
                                    button.state = power ? (setFanSpeed === 4) : false;
                                    break;
                                case 15: //PHYSICAL LOCK CONTROLS
                                    button.state = (obj.lockPhysicalControl === 1);
                                    break;
                                case 16: //ROOM TEMP HIDE
                                    button.state = (hideRoomTemperature === true);
                                    break;
                                case 17: //SUPPLY TEMP HIDE
                                    button.state = (hideSupplyTemperature === true);
                                    break;
                                case 18: //OUTDOOR TEMP HIDE
                                    button.state = (hideOutdoorTemperature === true);
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
                        this.emit('info', `Target ventilation mode: ${Ventilation.OperationMode[ventilationMode]}`);
                        this.emit('info', `Current ventilation mode: ${Ventilation.OperationMode[actualVentilationMode]}`);
                        this.emit('info', `Target temperature: ${setTemperature}${obj.temperatureUnit}`);
                        this.emit('info', `Room temperature: ${roomTemperature}${obj.temperatureUnit}`);
                        const info1 = hasSupplyTemperature && deviceData.Device.SupplyTemperature !== null ? this.emit('info', `Supply temperature: ${roomTemperature}${obj.temperatureUnit}`) : false;
                        const info2 = hasOutdoorTemperature && deviceData.Device.OutdoorTemperature !== null ? this.emit('info', `Outdoor temperature: ${roomTemperature}${obj.temperatureUnit}`) : false;
                        this.emit('info', `Fan speed mode: ${Ventilation.FanSpeed[setFanSpeed]}`);
                        this.emit('info', `Temperature display unit: ${obj.temperatureUnit}`);
                        this.emit('info', `Core maintenance: ${Ventilation.CoreMaintenance[coreMaintenanceRequired]}`);
                        this.emit('info', `Filter maintenance: ${Ventilation.FilterMaintenance[filterMaintenanceRequired]}`);
                        const info5 = hasCO2Sensor ? this.emit('info', `CO2 detected: ${Ventilation.Co2Detected[roomCO2Detected]}`) : false;
                        const info6 = hasCO2Sensor ? this.emit('info', `CO2 level: ${roomCO2Level} ppm`) : false;
                        const info7 = hasPM25Sensor ? this.emit('info', `PM2.5 air quality: ${Ventilation.PM25AirQuality[pM25AirQuality]}`) : false;
                        const info8 = hasPM25Sensor ? this.emit('info', `PM2.5 level: ${pM25Level} µg/m`) : false;
                    };

                    //prepare accessory
                    if (this.startPrepareAccessory) {
                        const accessory = await this.prepareAccessory(deviceData);
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
            await this.melCloudErv.checkState();

            return true;
        } catch (error) {
            throw new Error(`Start error: ${error}`);
        };
    };
};
export default DeviceErv;
