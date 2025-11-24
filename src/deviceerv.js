import EventEmitter from 'events';
import MelCloudErv from './melclouderv.js';
import RestFul from './restful.js';
import Mqtt from './mqtt.js';
import Functions from './functions.js';
import { TemperatureDisplayUnits, Ventilation } from './constants.js';
let Accessory, Characteristic, Service, Categories, AccessoryUUID;

class DeviceErv extends EventEmitter {
    constructor(api, account, device, defaultTempsFile, accountInfo, accountFile, melcloud, melcloudDevicesList) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        AccessoryUUID = api.hap.uuid;

        //account config
        this.melcloud = melcloud;
        this.melcloudDevicesList = melcloudDevicesList;
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
        this.temperatureSensor = device.temperatureSensor || false;
        this.temperatureOutdoorSensor = device.temperatureOutdoorSensor || false;
        this.temperatureSupplySensor = device.temperatureSupplySensor || false;
        this.inStandbySensor = device.inStandbySensor || false;
        this.connectSensor = device.connectSensor || false;
        this.errorSensor = device.errorSensor || false;
        this.holidayModeSupport = device.holidayModeSupport || false;
        this.presets = this.accountType === 'melcloud' ? (device.presets || []).filter(preset => (preset.displayType ?? 0) > 0 && preset.id !== '0') : [];
        this.schedules = this.accountType === 'melcloudhome' ? (device.schedules || []).filter(schedule => (schedule.displayType ?? 0) > 0 && schedule.id !== '0') : [];
        this.scenes = this.accountType === 'melcloudhome' ? (device.scenes || []).filter(scene => (scene.displayType ?? 0) > 0 && scene.id !== '0') : [];
        this.buttons = (device.buttonsSensors || []).filter(button => (button.displayType ?? 0) > 0);

        //files
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
                    flag = Ventilation.EffectiveFlags.Power;
                    break;
                case 'OperationMode':
                    deviceData.Device[key] = value;
                    flag = Ventilation.EffectiveFlags.OperationMode;
                    break;
                case 'VentilationMode':
                    deviceData.Device[key] = value;
                    flag = Ventilation.EffectiveFlags.VentilationMode;
                    break;
                case 'SetTemperature':
                    deviceData.Device[key] = value;
                    flag = Ventilation.EffectiveFlags.SetTemperature;
                    break;
                case 'DefaultCoolingSetTemperature':
                    deviceData.Device[key] = value;
                    flag = Ventilation.EffectiveFlags.SetTemperature;
                    break;
                case 'DefaultHeatingSetTemperature':
                    deviceData.Device[key] = value;
                    flag = Ventilation.EffectiveFlags.SetTemperature;
                    break;
                case 'NightPurgeMode':
                    if (this.accountType === 'melcloudhome') return;

                    deviceData.Device[key] = value;
                    flag = Ventilation.EffectiveFlags.NightPurgeMode;
                    break;
                case 'SetFanSpeed':
                    deviceData.Device[key] = value;
                    flag = Ventilation.EffectiveFlags.SetFanSpeed;
                    break;
                case 'HideRoomTemperature':
                    if (this.accountType === 'melcloudhome') return;

                    deviceData[key] = value;
                    flag = Ventilation.EffectiveFlags.Prohibit;
                    break;
                case 'HideSupplyTemperature':
                    if (this.accountType === 'melcloudhome') return;

                    deviceData[key] = value;
                    flag = Ventilation.EffectiveFlags.Prohibit;
                    break;
                case 'HideOutdoorTemperature':
                    if (this.accountType === 'melcloudhome') return;

                    deviceData[key] = value;
                    flag = Ventilation.EffectiveFlags.Prohibit;
                    break;
                case 'ScheduleEnabled':
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

            set = await this.melCloudErv.send(this.accountType, this.displayType, deviceData, flag);
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
            const supportsRoomTemperature = this.accessory.supportsRoomTemperature;
            const supportsSupplyTemperature = this.accessory.supportsSupplyTemperature;
            const supportsOutdoorTemperature = this.accessory.supportsOutdoorTemperature;
            const supportsCoolOperationMode = this.accessory.supportsCoolOperationMode;
            const supportsHeatOperationMode = this.accessory.supportsHeatOperationMode;
            const supportsAutoVentilationMode = this.accessory.supportsAutoVentilationMode;
            const supportsBypassVentilationMode = this.accessory.supportsBypassVentilationMode;
            const supportsAutomaticFanSpeed = this.accessory.supportsAutomaticFanSpeed;
            const supportsCO2Sensor = this.accessory.supportsCO2Sensor;
            const supportsPM25Sensor = this.accessory.supportsPM25Sensor;
            const supportsFanSpeed = this.accessory.supportsFanSpeed;
            const numberOfFanSpeeds = this.accessory.numberOfFanSpeeds;

            //accessory
            if (this.logDebug) this.emit('debug', `Prepare accessory`);
            const accessoryName = deviceName;
            const accessoryUUID = AccessoryUUID.generate(accountName + deviceId.toString());
            const accessoryCategory = Categories.AIR_PURIFIER;
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
            const serviceName = `${deviceTypeString} ${accessoryName}`;
            switch (this.displayType) {
                case 1: //Heater Cooler
                    if (this.logDebug) this.emit('debug', `Prepare heather/cooler service`);
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
                                await this.melCloudErv.send(this.accountType, this.displayType, deviceData, Ventilation.EffectiveFlags.Power);
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
                            const value = this.accessory.targetOperationMode ?? 0; //LOSSNAY, BYPASS, AUTO
                            return value;
                        })
                        .onSet(async (value) => {
                            try {
                                switch (value) {
                                    case 0: //AUTO - AUTO
                                        deviceData.Device.VentilationMode = supportsAutoVentilationMode ? 2 : 0;
                                        break;
                                    case 1: //HEAT - LOSSNAY
                                        deviceData.Device.VentilationMode = 0;
                                        break;
                                    case 2: //COOL - BYPASS
                                        deviceData.Device.VentilationMode = supportsBypassVentilationMode ? 1 : 0;
                                        break;
                                };

                                if (this.logInfo) this.emit('info', `Set operation mode: ${Ventilation.VentilationModeMapEnumToString[deviceData.Device.VentilationMode]}`);
                                await this.melCloudErv.send(this.accountType, this.displayType, deviceData, Ventilation.EffectiveFlags.VentilationMode);
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
                                const value = this.accessory.fanSpeed; //STOP, 1, 2, 3, 4, OFF
                                return value;
                            })
                            .onSet(async (value) => {
                                try {
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
                                            break;;
                                    };

                                    deviceData.Device.SetFanSpeed = value;
                                    if (this.logInfo) this.emit('info', `Set fan speed mode: ${Ventilation.FanSpeedMapEnumToString[value]}`);
                                    await this.melCloudErv.send(this.accountType, this.displayType, deviceData, Ventilation.EffectiveFlags.SetFanSpeed);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `Set fan speed mode error: ${error}`);
                                };
                            });
                    }
                    //device can cool
                    if (supportsAutoVentilationMode && supportsCoolOperationMode) {
                        melCloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
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
                                    if (this.logInfo) this.emit('info', `Set cooling threshold temperature: ${value}${this.accessory.temperatureUnit}`);
                                    await this.melCloudErv.send(this.accountType, this.displayType, deviceData, Ventilation.EffectiveFlags.SetTemperature);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `Set cooling threshold temperature error: ${error}`);
                                };
                            });
                    };
                    //device can heat
                    if (supportsAutoVentilationMode && supportsHeatOperationMode) {
                        melCloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
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
                                    if (this.logInfo) this.emit('info', `Set heating threshold temperature: ${value}${this.accessory.temperatureUnit}`);
                                    await this.melCloudErv.send(this.accountType, this.displayType, deviceData, Ventilation.EffectiveFlags.SetTemperature);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `Set heating threshold temperature error: ${error}`);
                                };
                            });
                    };
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
                                await this.melCloudErv.send(this.accountType, this.displayType, deviceData, 'account', this.accountInfo);
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
                            const value = this.accessory.targetOperationMode ?? 0; //LOSSNAY, BYPASS, AUTO
                            return value;
                        })
                        .onSet(async (value) => {
                            try {
                                let flag = null;
                                switch (value) {
                                    case 0: //OFF - POWER OFF
                                        deviceData.Device.Power = false;
                                        flag = Ventilation.EffectiveFlags.Power;
                                        break;
                                    case 1: //HEAT - LOSSNAY
                                        deviceData.Device.Power = true;
                                        flag = Ventilation.EffectiveFlags.Power + Ventilation.EffectiveFlags.VentilationMode;
                                        break;
                                    case 2: //COOL - BYPASS
                                        deviceData.Device.Power = true;
                                        value = supportsBypassVentilationMode ? 1 : 0;
                                        flag = Ventilation.EffectiveFlags.Power + Ventilation.EffectiveFlags.VentilationMode;
                                        break;
                                    case 3: //AUTO - AUTO
                                        deviceData.Device.Power = true;
                                        value = supportsAutoVentilationMode ? 2 : 0;
                                        flag = Ventilation.EffectiveFlags.Power + Ventilation.EffectiveFlags.VentilationMode;
                                        break;
                                };

                                deviceData.Device.VentilationMode = value;
                                if (this.logInfo) this.emit('info', `Set operation mode: ${Ventilation.VentilationModeMapEnumToString[deviceData.Device.VentilationMode]}`);
                                await this.melCloudErv.send(this.accountType, this.displayType, deviceData, flag);
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
                            minStep: this.accessory.temperatureIncrement
                        })
                        .onGet(async () => {
                            const value = this.accessory.setTemperature;
                            return value;
                        })
                        .onSet(async (value) => {
                            try {
                                deviceData.Device.SetTemperature = value;
                                if (this.logInfo) this.emit('info', `Set temperature: ${value}${this.accessory.temperatureUnit}`);
                                await this.melCloudErv.send(this.accountType, this.displayType, deviceData, Ventilation.EffectiveFlags.SetTemperature);
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
                                await this.melCloudErv.send(this.accountType, this.displayType, deviceData, 'account', this.accountInfo);
                            } catch (error) {
                                if (this.logWarn) this.emit('warn', `Set temperature display unit error: ${error}`);
                            };
                        });
                    this.melCloudService = melCloudServiceT;
                    accessory.addService(melCloudServiceT);
                    break;
            };

            //temperature sensor service room
            if (this.temperatureSensor && supportsRoomTemperature && this.accessory.roomTemperature !== null) {
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

            //temperature sensor service supply
            if (this.temperatureSupplySensor && supportsSupplyTemperature && this.accessory.supplyTemperature !== null) {
                if (this.logDebug) this.emit('debug', `Prepare supply temperature sensor service`);
                this.supplyTemperatureSensorService = new Service.TemperatureSensor(`${serviceName} Supply`, `supplyTemperatureSensorService${deviceId}`);
                this.supplyTemperatureSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.supplyTemperatureSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Supply`);
                this.supplyTemperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                    .onGet(async () => {
                        const state = this.accessory.supplyTemperature;
                        return state;
                    })
                accessory.addService(this.supplyTemperatureSensorService);
            }

            //temperature sensor service outdoor
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
            }

            //core maintenance
            if (this.accessory.coreMaintenanceRequired !== null) {
                this.coreMaintenanceService = new Service.FilterMaintenance(`${serviceName} Core Maintenance`, `coreMaintenanceService${deviceId}`);
                this.coreMaintenanceService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.coreMaintenanceService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Core Maintenance`);
                this.coreMaintenanceService.getCharacteristic(Characteristic.FilterChangeIndication)
                    .onGet(async () => {
                        const value = this.accessory.coreMaintenanceRequired;
                        return value;
                    });
                this.coreMaintenanceService.getCharacteristic(Characteristic.ResetFilterIndication)
                    .onSet(async (state) => {
                    });
                accessory.addService(this.coreMaintenanceService);
            }

            //filter maintenance
            if (this.accessory.filterMaintenanceRequired !== null) {
                this.filterMaintenanceService = new Service.FilterMaintenance(`${serviceName} Filter Maintenance`, `filterMaintenanceService${deviceId}`);
                this.filterMaintenanceService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.filterMaintenanceService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} Filter Maintenance`);
                this.filterMaintenanceService.getCharacteristic(Characteristic.FilterChangeIndication)
                    .onGet(async () => {
                        const value = this.accessory.filterMaintenanceRequired;
                        return value;
                    });
                this.filterMaintenanceService.getCharacteristic(Characteristic.ResetFilterIndication)
                    .onSet(async (state) => {
                    });
                accessory.addService(this.filterMaintenanceService);
            }

            //room CO2 sensor
            if (supportsCO2Sensor) {
                this.carbonDioxideSensorService = new Service.CarbonDioxideSensor(`${serviceName} CO2 Sensor`, `carbonDioxideSensorService${deviceId}`);
                this.carbonDioxideSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.carbonDioxideSensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} CO2 Sensor`);
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
            if (supportsPM25Sensor) {
                this.airQualitySensorService = new Service.AirQualitySensor(`${serviceName} PM2.5 Sensor`, `airQualitySensorService${deviceId}`);
                this.airQualitySensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                this.airQualitySensorService.setCharacteristic(Characteristic.ConfiguredName, `${accessoryName} PM2.5 Sensor`);
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
                            await this.melCloudErv.send(this.accountType, this.displayType, deviceData, 'holidaymode');
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

                                    if (this.logInfo) this.emit('info', `Preset ${name}: ${state ? 'Set' : 'Unset'}`);
                                    await this.melCloudErv.send(this.accountType, this.displayType, deviceData, AirConditioner.EffectiveFlags.Presets);
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
                                        await this.melCloudErv.send(this.accountType, this.displayType, deviceData, 'schedule', scheduleData);
                                    } catch (error) {
                                        if (this.logWarn) this.emit('warn', `Set schedule serror: ${error}`);
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
                    const sceneData = scenesOnServer.find(s => s.Id === scene.id);

                    //get name
                    const name = scene.name;

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
                                    sceneData.Enabled = state;
                                    if (this.logInfo) this.emit('info', `Scene ${name}: ${state ? 'Set' : 'Unset'}`);
                                    await this.melCloudErv.send(this.accountType, this.displayType, deviceData, 'scene', sceneData);
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
                    const name = button.name;

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
                                try {
                                    let flag = null;
                                    switch (mode) {
                                        case 0: //POWER ON,OFF
                                            deviceData.Device.Power = state;
                                            flag = Ventilation.EffectiveFlags.Power;
                                            break;
                                        case 1: //OPERATING MODE RECOVERY
                                            button.previousValue = state ? deviceData.Device.VentilationMode : button.previousValue ?? deviceData.Device.VentilationMode;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.VentilationMode = state ? 0 : button.previousValue;
                                            flag = Ventilation.EffectiveFlags.Power + Ventilation.EffectiveFlags.VentilationMode;
                                            break;
                                        case 2: //OPERATING MODE BYPASS
                                            button.previousValue = state ? deviceData.Device.VentilationMode : button.previousValue ?? deviceData.Device.VentilationMode;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.VentilationMode = state ? 1 : button.previousValue;
                                            flag = Ventilation.EffectiveFlags.Power + Ventilation.EffectiveFlags.VentilationMode;
                                            break
                                        case 3: //OPERATING MODE AUTO
                                            button.previousValue = state ? deviceData.Device.VentilationMode : button.previousValue ?? deviceData.Device.VentilationMode;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.VentilationMode = state ? 2 : button.previousValue;
                                            flag = Ventilation.EffectiveFlags.Power + Ventilation.EffectiveFlags.VentilationMode;
                                            break;
                                        case 4: //NIGHT PURGE MODE
                                            deviceData.Device.Power = true;
                                            deviceData.Device.NightPurgeMode = state;
                                            flag = Ventilation.EffectiveFlags.Power
                                            break;
                                        case 10: //FAN SPEED MODE AUTO
                                            button.previousValue = state ? deviceData.Device.SetFanSpeed : button.previousValue ?? deviceData.Device.SetFanSpeed;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.SetFanSpeed = state ? 0 : button.previousValue;
                                            flag = Ventilation.EffectiveFlags.Power + Ventilation.EffectiveFlags.SetFanSpeed;
                                            break;
                                        case 11: //FAN SPEED MODE 1
                                            button.previousValue = state ? deviceData.Device.SetFanSpeed : button.previousValue ?? deviceData.Device.SetFanSpeed;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.SetFanSpeed = state ? 1 : button.previousValue;
                                            flag = Ventilation.EffectiveFlags.Power + Ventilation.EffectiveFlags.SetFanSpeed;
                                            break;
                                        case 12: //FAN SPEED MODE 2
                                            button.previousValue = state ? deviceData.Device.SetFanSpeed : button.previousValue ?? deviceData.Device.SetFanSpeed;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.SetFanSpeed = state ? 2 : button.previousValue;
                                            flag = Ventilation.EffectiveFlags.Power + Ventilation.EffectiveFlags.SetFanSpeed;
                                            break;
                                        case 13: //FAN SPEED MODE 3
                                            button.previousValue = state ? deviceData.Device.SetFanSpeed : button.previousValue ?? deviceData.Device.SetFanSpeed;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.SetFanSpeed = state ? 3 : button.previousValue;
                                            flag = Ventilation.EffectiveFlags.Power + Ventilation.EffectiveFlags.SetFanSpeed;
                                            break;
                                        case 14: //FAN MODE 4
                                            button.previousValue = state ? deviceData.Device.SetFanSpeed : button.previousValue ?? deviceData.Device.SetFanSpeed;
                                            deviceData.Device.Power = true;
                                            deviceData.Device.SetFanSpeed = state ? 4 : button.previousValue;
                                            flag = Ventilation.EffectiveFlags.Power + Ventilation.EffectiveFlags.SetFanSpeed;
                                            break;
                                        case 15: //PHYSICAL LOCK CONTROLS
                                            deviceData.Device = deviceData.Device;
                                            flag = Ventilation.EffectiveFlags.Prohibit;
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
                                            if (this.logWarn) this.emit('warn', `Unknown button mode: ${mode}`);
                                            break;
                                    };

                                    if (this.logInfo) this.emit('info', `Button ${name}: ${state ? `Enabled` : `Disabled`}`);
                                    await this.melCloudErv.send(this.accountType, this.displayType, deviceData, flag);
                                } catch (error) {
                                    if (this.logWarn) this.emit('warn', `Set button error: ${error}`);
                                };
                            });
                        this.buttonControlServices.push(buttonControlService);
                        accessory.addService(buttonControlService);
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
    };

    //start
    async start() {
        try {
            //melcloud device
            this.melCloudErv = new MelCloudErv(this.account, this.device, this.defaultTempsFile, this.accountFile, this.melcloud)
                .on('deviceInfo', (modelIndoor, modelOutdoor, serialNumber, firmwareAppVersion) => {
                    if (this.logDeviceInfo && this.displayDeviceInfo) {
                        this.emit('devInfo', `---- ${this.deviceTypeString}: ${this.deviceName} ----`);
                        this.emit('devInfo', `Account: ${this.accountName}`);
                        if (modelIndoor) this.emit('devInfo', `Indoor: ${modelIndoor}`);
                        if (modelOutdoor) this.emit('devInfo', `Outdoor: ${modelOutdoor}`);
                        this.emit('devInfo', `Serial: ${serialNumber}`);
                        this.emit('devInfo', `Firmware: ${firmwareAppVersion}`);
                        this.emit('devInfo', `Manufacturer: Mitsubishi`);
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
                    const holidayModeEnabled = deviceData.HolidayMode?.Enabled;
                    const holidayModeActive = deviceData.HolidayMode?.Active ?? false;

                    //device control
                    const hideRoomTemperature = deviceData.HideRoomTemperature;
                    const hideSupplyTemperature = deviceData.HideSupplyTemperature;
                    const hideOutdoorTemperature = deviceData.HideOutdoorTemperature;

                    //device info
                    const supportsStanbyMode = deviceData.Device[supportStandbyKey];
                    const supportsCoolOperationMode = deviceData.Device.HasCoolOperationMode ?? false;
                    const supportsHeatOperationMode = deviceData.Device.HasHeatOperationMode ?? false;
                    const supportsAutoOperationMode = deviceData.Device.HasAutoOperationMode ?? false;
                    const supportsRoomTemperature = deviceData.Device.HasRoomTemperature ?? false;
                    const supportsSupplyTemperature = deviceData.Device.HasSupplyTemperature ?? false;
                    const supportsOutdoorTemperature = deviceData.Device.HasOutdoorTemperature ?? false;
                    const supportsCO2Sensor = deviceData.Device.HasCO2Sensor ?? false;
                    const roomCO2Level = deviceData.Device.RoomCO2Level ?? false;
                    const roomCO2Detected = supportsCO2Sensor && roomCO2Level > 1000 ? true : false;
                    const supportsPM25Sensor = deviceData.Device.HasPM25Sensor ?? false;
                    const pM25SensorStatus = supportsPM25Sensor ? deviceData.Device.PM25SensorStatus : 0;
                    const pM25Level = supportsPM25Sensor ? deviceData.Device.PM25Level : 0;
                    const pM25AirQuality = supportsPM25Sensor ? pM25Level <= 13 ? 1 : pM25Level <= 35 ? 2 : pM25Level <= 55 ? 3 : pM25Level <= 75 ? 4 : pM25Level <= 110 ? 5 : 0 : 0;
                    const supportsAutoVentilationMode = deviceData.Device.HasAutoVentilationMode ?? false;
                    const supportsBypassVentilationMode = deviceData.Device.HasBypassVentilationMode ?? false;
                    const supportsAutomaticFanSpeed = deviceData.Device.HasAutomaticFanSpeed ?? false;
                    const actualVentilationMode = deviceData.Device.ActualVentilationMode;
                    const numberOfFanSpeeds = deviceData.Device.NumberOfFanSpeeds;
                    const supportsFanSpeed = numberOfFanSpeeds > 0;
                    const coreMaintenanceRequired = deviceData.Device.CoreMaintenanceRequired;
                    const filterMaintenanceRequired = deviceData.Device.FilterMaintenanceRequired;
                    const temperatureIncrement = deviceData.Device[tempStepKey] ?? 1;
                    const minTempHeat = 10;
                    const maxTempHeat = 31;
                    const minTempCoolDry = 16;
                    const maxTempCoolDry = 31;

                    //device state
                    const power = deviceData.Device.Power;
                    const inStandbyMode = deviceData.Device.InStandbyMode;
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
                    const isConnected = accountTypeMelcloud ? !deviceData.Device[connectKey] : deviceData.Device[connectKey];
                    const isInError = deviceData.Device[errorKey];

                    //accessory
                    const obj = {
                        presets: presetsOnServer,
                        schedules: schedulesOnServer,
                        scenes: scenesOnServer,
                        supportsRoomTemperature: supportsRoomTemperature,
                        supportsSupplyTemperature: supportsSupplyTemperature,
                        supportsOutdoorTemperature: supportsOutdoorTemperature,
                        supportsCoolOperationMode: supportsCoolOperationMode,
                        supportsHeatOperationMode: supportsHeatOperationMode,
                        supportsCO2Sensor: supportsCO2Sensor,
                        roomCO2Level: roomCO2Level,
                        roomCO2Detected: roomCO2Detected,
                        supportsPM25Sensor: supportsPM25Sensor,
                        pM25SensorStatus: pM25SensorStatus,
                        pM25Level: pM25Level,
                        pM25AirQuality: pM25AirQuality,
                        supportsAutoVentilationMode: supportsAutoVentilationMode,
                        supportsBypassVentilationMode: supportsBypassVentilationMode,
                        supportsAutomaticFanSpeed: supportsAutomaticFanSpeed,
                        supportsStanbyMode: supportsStanbyMode,
                        coreMaintenanceRequired: coreMaintenanceRequired,
                        filterMaintenanceRequired: filterMaintenanceRequired,
                        actualVentilationMode: actualVentilationMode,
                        numberOfFanSpeeds: numberOfFanSpeeds,
                        supportsFanSpeed: supportsFanSpeed,
                        power: power,
                        inStandbyMode: inStandbyMode,
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
                        useFahrenheit: this.accountInfo.useFahrenheit ? 1 : 0,
                        temperatureUnit: TemperatureDisplayUnits[this.accountInfo.useFahrenheit ? 1 : 0],
                        isConnected: isConnected,
                        isInError: isInError,
                        scheduleEnabled: scheduleEnabled,
                        holidayModeEnabled: holidayModeEnabled,
                        holidayModeActive: holidayModeActive,
                        scheduleEnabled: scheduleEnabled
                    };

                    //characteristics array
                    const characteristics = [];

                    //ventilation mode - 0, HEAT, 2, COOL, 4, 5, 6, FAN, AUTO
                    switch (this.displayType) {
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
                                            if (this.logWarn) this.emit('warn', `Unknown actual ventilation mode: ${actualVentilationMode}`);
                                            break;
                                    };
                                    obj.targetOperationMode = 0;
                                    break;
                                default:
                                    if (this.logWarn) this.emit('warn', `Unknown ventilation mode: ${ventilationMode}`);
                                    break;
                            };

                            obj.currentOperationMode = !power ? 0 : obj.currentOperationMode;
                            obj.targetOperationMode = obj.targetOperationMode;
                            obj.operationModeSetPropsMinValue = supportsAutoVentilationMode ? 0 : 1;
                            obj.operationModeSetPropsMaxValue = supportsAutoVentilationMode ? 2 : 2;
                            obj.operationModeSetPropsValidValues = supportsAutoVentilationMode ? (supportsBypassVentilationMode ? [0, 1, 2] : [0, 2]) : (supportsBypassVentilationMode ? [1, 2] : [2]);

                            //fan speed mode
                            obj.fanSpeedSetPropsMaxValue = 2;

                            // fan speed mode
                            if (supportsFanSpeed) {
                                const max = numberOfFanSpeeds;
                                const autoIndex = supportsAutomaticFanSpeed ? max + 1 : 0;

                                // Tworzymy tablicę prędkości: [auto?, 1..N]
                                const speeds = [autoIndex];
                                for (let i = 1; i <= max; i++) {
                                    speeds.push(i);
                                }

                                obj.fanSpeed = speeds[setFanSpeed];
                                obj.fanSpeedSetPropsMaxValue = supportsAutomaticFanSpeed ? max + 1 : max;
                            }

                            //create characteristics
                            characteristics.push(
                                { type: Characteristic.Active, value: power },
                                { type: Characteristic.CurrentHeaterCoolerState, value: obj.currentOperationMode },
                                { type: Characteristic.TargetHeaterCoolerState, value: obj.targetOperationMode },
                                { type: Characteristic.CurrentTemperature, value: roomTemperature },
                                { type: Characteristic.RotationSpeed, value: obj.fanSpeed },
                                { type: Characteristic.LockPhysicalControls, value: obj.lockPhysicalControl },
                                { type: Characteristic.TemperatureDisplayUnits, value: obj.useFahrenheit },
                            );

                            if (supportsCoolOperationMode) characteristics.push({ type: Characteristic.CoolingThresholdTemperature, value: defaultCoolingSetTemperature });
                            if (supportsHeatOperationMode) characteristics.push({ type: Characteristic.HeatingThresholdTemperature, value: defaultHeatingSetTemperature });
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
                                            if (this.logWarn) this.emit('warn', `Unknown actual ventilation mode: ${actualVentilationMode}`);
                                            break;
                                    };
                                    obj.targetOperationMode = 3;
                                    break;
                                default:
                                    if (this.logWarn) this.emit('warn', `Unknown ventilation mode: ${ventilationMode}`);
                                    break;
                            };

                            obj.currentOperationMode = !power ? 0 : obj.currentOperationMode;
                            obj.targetOperationMode = !power ? 0 : obj.targetOperationMode;
                            obj.operationModeSetPropsMinValue = supportsAutoVentilationMode ? 0 : 0;
                            obj.operationModeSetPropsMaxValue = supportsAutoVentilationMode ? 3 : 2;
                            obj.operationModeSetPropsValidValues = supportsAutoVentilationMode ? (supportsBypassVentilationMode ? [0, 1, 2, 3] : [0, 2, 3]) : (supportsBypassVentilationMode ? [0, 1, 2] : [0, 2]);

                            //create characteristics
                            characteristics.push(
                                { type: Characteristic.CurrentHeatingCoolingState, value: obj.currentOperationMode },
                                { type: Characteristic.TargetHeatingCoolingState, value: obj.targetOperationMode },
                                { type: Characteristic.CurrentTemperature, value: roomTemperature },
                                { type: Characteristic.TargetTemperature, value: setTemperature },
                                { type: Characteristic.TemperatureDisplayUnits, value: obj.useFahrenheit },
                            );
                            break;
                    };

                    this.accessory = obj;

                    //update services
                    for (const { type, value } of characteristics) {
                        if (!this.functions.isValidValue(value)) continue;
                        this.melCloudService?.updateCharacteristic(type, value);
                    }

                    //update temperature sensors
                    this.roomTemperatureSensorService?.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature);
                    this.outdoorTemperatureSensorService?.updateCharacteristic(Characteristic.CurrentTemperature, outdoorTemperature);
                    this.supplyTemperatureSensorService?.updateCharacteristic(Characteristic.CurrentTemperature, supplyTemperature);

                    //update core maintenance
                    this.coreMaintenanceService?.updateCharacteristic(Characteristic.FilterChangeIndication, coreMaintenanceRequired);

                    //update filter maintenance
                    this.filterMaintenanceService?.updateCharacteristic(Characteristic.FilterChangeIndication, filterMaintenanceRequired);

                    //update CO2 sensor
                    this.carbonDioxideSensorService
                        ?.updateCharacteristic(Characteristic.CarbonDioxideDetected, roomCO2Detected)
                        .updateCharacteristic(Characteristic.CarbonDioxideLevel, roomCO2Level);

                    //update PM2.5 sensor
                    this.airQualitySensorService
                        ?.updateCharacteristic(Characteristic.AirQuality, pM25AirQuality)
                        .updateCharacteristic(Characteristic.PM2_5Density, pM25Level);

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
                            if (!presetData) return;

                            const characteristicType = preset.characteristicType;

                            preset.state = presetData ? (presetData.Power === power
                                && presetData.SetTemperature === setTemperature
                                && presetData.OperationMode === operationMode
                                && presetData.VentilationMode === ventilationMode
                                && presetData.SetFanSpeed === setFanSpeed) : false;

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
                            schedule.state = scheduleEnabled ? (scheduleData.Enabled ?? false) : false;

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
                            const characteristicType = button.characteristicType;
                            const mode = button.mode;
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
                                    if (this.logWarn) this.emit('warn', `Unknown button mode: ${mode} detected`);
                                    break;
                            };

                            //control
                            if (button.displayType > 3) this.buttonControlServices?.[i]?.updateCharacteristic(Characteristic.On, button.state);

                            //sensor
                            if (button.displayType < 7) this.buttonControlSensorServices?.[i]?.updateCharacteristic(characteristicType, button.state);
                        });
                    }

                    //log current state
                    if (this.logInfo) {
                        this.emit('info', `Power: ${power ? 'On' : 'Off'}`);
                        this.emit('info', `Target ventilation mode: ${Ventilation.OperationModeMapEnumToString[ventilationMode]}`);
                        this.emit('info', `Current ventilation mode: ${Ventilation.OperationModeMapEnumToString[actualVentilationMode]}`);
                        this.emit('info', `Target temperature: ${setTemperature}${obj.temperatureUnit}`);
                        this.emit('info', `Room temperature: ${roomTemperature}${obj.temperatureUnit}`);
                        if (supportsSupplyTemperature && deviceData.Device.SupplyTemperature !== null) this.emit('info', `Supply temperature: ${roomTemperature}${obj.temperatureUnit}`);
                        if (supportsOutdoorTemperature && deviceData.Device.OutdoorTemperature !== null) this.emit('info', `Outdoor temperature: ${roomTemperature}${obj.temperatureUnit}`);
                        this.emit('info', `Fan speed mode: ${Ventilation.FanSpeedMapEnumToString[setFanSpeed]}`);
                        this.emit('info', `Temperature display unit: ${obj.temperatureUnit}`);
                        this.emit('info', `Core maintenance: ${Ventilation.CoreMaintenanceMapEnumToString[coreMaintenanceRequired]}`);
                        this.emit('info', `Filter maintenance: ${Ventilation.FilterMaintenanceMapEnumToString[filterMaintenanceRequired]}`);
                        if (supportsCO2Sensor) this.emit('info', `CO2 detected: ${Ventilation.Co2DetectedMapEnumToString[roomCO2Detected]}`);
                        if (supportsCO2Sensor) this.emit('info', `CO2 level: ${roomCO2Level} ppm`);
                        if (supportsPM25Sensor) this.emit('info', `PM2.5 air quality: ${Ventilation.PM25AirQualityMapEnumToString[pM25AirQuality]}`);
                        if (supportsPM25Sensor) this.emit('info', `PM2.5 level: ${pM25Level} µg/m`);
                        if (this.accountType === 'melcloudhome') this.emit('info', `Signal strength: ${deviceData.Rssi}dBm`);
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
                .on('mqtt', (topic, message) => {
                    if (this.mqttConnected) this.mqtt1.emit('publish', topic, message);
                });

            //start external integrations
            if (this.restFul.enable || this.mqtt.enable) await this.externalIntegrations();

            //check state
            await this.melCloudErv.checkState(this.melcloudDevicesList);

            //prepare accessory
            await new Promise(r => setTimeout(r, 1000));
            const accessory = await this.prepareAccessory();
            return accessory;
        } catch (error) {
            throw new Error(`Start error: ${error}`);
        };
    };
};
export default DeviceErv;
