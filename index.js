'use strict';

const fs = require('fs');
const path = require('path');
const mqttClient = require('./src/mqtt.js');
const melCloudClient = require('./src/melcloudclient.js')
const melCloudClientDevice = require('./src/melcloudclientdevice.js')

const API_URL = require('./src/apiurl.json');
const DEVICES_EFFECTIVE_FLAGS = require('./src/effectiveflags.json');
const CONSTANS = require('./src/constans.json');

const PLUGIN_NAME = 'homebridge-melcloud-control';
const PLATFORM_NAME = 'melcloudcontrol';

let Accessory, Characteristic, Service, Categories, AccessoryUUID;

module.exports = (api) => {
	Accessory = api.platformAccessory;
	Characteristic = api.hap.Characteristic;
	Service = api.hap.Service;
	Categories = api.hap.Categories;
	AccessoryUUID = api.hap.uuid;
	api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, melCloudPlatform, true);
};

class melCloudPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.accounts)) {
			log('No configuration found for %s', PLUGIN_NAME);
			return;
		}
		this.log = log;
		this.api = api;
		const accounts = config.accounts;
		const accountsCount = accounts.length;
		this.accessories = [];

		this.api.on('didFinishLaunching', () => {
			this.log.debug('didFinishLaunching');
			for (let i = 0; i < accountsCount; i++) {
				const account = accounts[i];
				const accountName = account.name;
				const user = account.user;
				const passwd = account.passwd;
				const language = account.language;
				if (!accountName || !user || !passwd || !language) {
					this.log('Name, user, password or language for %s accout missing.', i);
					return;
				} else {
					const enableDebugMode = account.enableDebugMode;
					const prefDir = path.join(api.user.storagePath(), 'melcloud');
					const melCloudInfoFile = `${prefDir}/${accountName}_Account`;
					const melCloudBuildingsFile = `${prefDir}/${accountName}_Buildings`;

					//check if the directory exists, if not then create it
					if (fs.existsSync(prefDir) == false) {
						fs.mkdirSync(prefDir);
					};
					if (fs.existsSync(melCloudInfoFile) == false) {
						fs.writeFileSync(melCloudInfoFile, '');
					};
					if (fs.existsSync(melCloudBuildingsFile) == false) {
						fs.writeFileSync(melCloudBuildingsFile, '');
					};

					//melcloud client
					this.melCloudClient = new melCloudClient({
						name: accountName,
						user: user,
						passwd: passwd,
						language: language,
						debugLog: enableDebugMode,
						melCloudInfoFile: melCloudInfoFile,
						melCloudBuildingsFile: melCloudBuildingsFile
					});

					this.melCloudClient.on('connected', (melCloudInfo, contextKey, devices, devicesCount) => {
							if (devicesCount > 0) {
								for (let i = 0; i < devicesCount; i++) {
									const device = devices[i];
									const buildingId = device.BuildingID;
									const deviceId = device.DeviceID;
									const deviceName = device.DeviceName;
									const deviceType = device.Type;
									const deviceTypeText = CONSTANS.DeviceType[deviceType];
									const deviceInfo = device;

									new melCloudDevice(this.log, this.api, account, melCloudInfo, contextKey, deviceInfo, buildingId, deviceId, deviceName, deviceType, deviceTypeText);
								};
							} else {
								this.log(`Account: ${accountName}, No devices found!!!`)
							};
						})
						.on('message', (message) => {
							this.log(message);
						})
						.on('error', (error) => {
							this.log(error);
						})
						.on('debug', (message) => {
							this.log(message);
						});
				};
			};
		});
	};

	configureAccessory(accessory) {
		this.log.debug('configureAccessory');
		this.accessories.push(accessory);
	};

	removeAccessory(accessory) {
		this.log.debug('removeAccessory');
		this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
	};
};


class melCloudDevice {
	constructor(log, api, account, melCloudInfo, contextKey, deviceInfo, buildingId, deviceId, deviceName, deviceType, deviceTypeText) {
		this.log = log;
		this.api = api;

		//account config
		this.accountName = account.name;
		this.displayMode = account.displayMode;
		this.buttons = account.buttons || [];
		this.disableLogInfo = account.disableLogInfo || false;
		this.disableLogDeviceInfo = account.disableLogDeviceInfo || false;
		this.enableDebugMode = account.enableDebugMode || false;

		const enableMqtt = account.enableMqtt || false;
		const mqttHost = account.mqttHost;
		const mqttPort = account.mqttPort || 1883;
		const mqttPrefix = account.mqttPrefix;
		const mqttAuth = account.mqttAuth || false;
		const mqttUser = account.mqttUser;
		const mqttPasswd = account.mqttPass;
		const mqttDebug = account.mqttDebug || false;

		//default properties
		this.startPrepareAccessory = true;
		this.displayDeviceInfo = true;

		//mqtt client
		if (enableMqtt) {
			this.mqttClient = new mqttClient({
				enabled: enableMqtt,
				host: mqttHost,
				port: mqttPort,
				prefix: mqttPrefix,
				topic: this.accountName,
				auth: mqttAuth,
				user: mqttUser,
				passwd: mqttPasswd,
				debug: mqttDebug
			});

			this.mqttClient.on('connected', (message) => {
					this.log(message);
				})
				.on('error', (error) => {
					this.log(error);
				})
				.on('debug', (message) => {
					this.log(message);
				})
				.on('message', (message) => {
					this.log(message);
				})
				.on('disconnected', (message) => {
					this.log(message);
				});
		};

		//melcloud device
		this.melCloudClientDevice = new melCloudClientDevice({
			melCloudInfo: melCloudInfo,
			deviceInfo: deviceInfo,
			contextKey: contextKey,
			buildingId: buildingId,
			deviceId: deviceId,
			debugLog: this.enableDebugMode,
			mqttEnabled: enableMqtt
		});

		this.melCloudClientDevice.on('deviceInfo', (melCloudInfo, deviceId, deviceType, deviceName, deviceTypeText, manufacturer, modelName, modelName1, serialNumber, serialNumber1, firmwareRevision) => {
				const model = (deviceType == 0) ? modelName : modelName1;
				const serial = (deviceType == 0) ? serialNumber : serialNumber1;
				if (!this.disableLogDeviceInfo && this.displayDeviceInfo) {
					this.log('------- %s --------', deviceTypeText);
					this.log('Account: %s', this.accountName);
					this.log('Name: %s', deviceName);
					this.log('Model: %s', model);
					this.log('Serial: %s', serial);
					this.log('Firmware: %s', firmwareRevision);
					const device1 = (modelName1 != 'Undefined' && deviceType == 0) ? this.log('Outdoor: %s', modelName1) : false;
					this.log('Manufacturer: %s', manufacturer);
					this.log('----------------------------------');
					this.displayDeviceInfo = false;
				};
				this.melCloudInfo = melCloudInfo;
				this.deviceId = deviceId;
				this.deviceName = deviceName;
				this.deviceType = deviceType;
				this.deviceTypeText = deviceTypeText;
				this.useFahrenheit = (melCloudInfo.UseFahrenheit == true) ? 1 : 0;
				this.temperatureDisplayUnit = CONSTANS.TemperatureDisplayUnits[this.useFahrenheit];

				this.manufacturer = manufacturer;
				this.modelName = model;
				this.serialNumber = serial;
				this.firmwareRevision = firmwareRevision;
			})
			.on('deviceState', (deviceInfo, deviceState, roomTemperature, setTemperature, setFanSpeed, operationMode, vaneHorizontal, vaneVertical, defaultHeatingSetTemperature, defaultCoolingSetTemperature, inStandbyMode, power) => {
				const displayMode = this.displayMode;
				const buttonsCount = this.buttons.length;
				this.deviceInfo = deviceInfo;
				this.deviceState = deviceState;

				//device info
				const canCool = (deviceInfo.Device.CanCool == true);
				const canHeat = (deviceInfo.Device.CanHeat == true);
				const canDry = (deviceInfo.Device.CanDry == true);
				const hasAutomaticFanSpeed = (deviceInfo.Device.HasAutomaticFanSpeed == true);
				const airDirectionFunction = (deviceInfo.Device.AirDirectionFunction == true);
				const swingFunction = (deviceInfo.Device.SwingFunction == true);
				const numberOfFanSpeeds = deviceInfo.Device.NumberOfFanSpeeds;
				const modelIsAirCurtain = (deviceInfo.Device.ModelIsAirCurtain == true);
				const modelSupportsFanSpeed = (deviceInfo.Device.ModelSupportsFanSpeed == true);
				const modelSupportsAuto = (deviceInfo.Device.ModelSupportsAuto == true);
				const modelSupportsHeat = (deviceInfo.Device.ModelSupportsHeat == true);
				const modelSupportsDry = (deviceInfo.Device.ModelSupportsDry == true);
				const modelSupportsVaneVertical = (deviceInfo.Device.ModelSupportsVaneVertical == true);
				const modelSupportsVaneHorizontal = (deviceInfo.Device.ModelSupportsVaneHorizontal == true);
				const modelSupportsWideVane = (deviceInfo.Device.ModelSupportsWideVane == true);
				const modelSupportsStandbyMode = (deviceInfo.Device.ModelSupportsStandbyMode == true);

				this.hasAutomaticFanSpeed = hasAutomaticFanSpeed;
				this.swingFunction = swingFunction;
				this.numberOfFanSpeeds = numberOfFanSpeeds;
				this.modelSupportsFanSpeed = modelSupportsFanSpeed;

				//device state
				const inStandby = modelSupportsStandbyMode ? inStandbyMode : false;

				this.power = power;
				this.inStandbyMode = inStandby;

				//INACTIVE, IDLE, HEATING, COOLING
				const currentHeaterCoolerOperationMode = power ? inStandby ? 1 : [1, 2, 2, 3, 3, 3, 3, 3, 3][operationMode] : 0;
				//OFF, HEAT, COOL
				const currentThermostatOperationMode = power ? inStandby ? 0 : [0, 1, 2, 2, 2, 2, 2, 2, 2][operationMode] : 0;
				const currentOperationMode = displayMode ? currentThermostatOperationMode : currentHeaterCoolerOperationMode;
				this.currentOperationMode = currentOperationMode;

				//AUTO/ HEAT, COOL
				const targetHeaterCoolerOperationMode = power ? inStandby ? 0 : [0, 1, 1, 2, 2, 2, 2, 2, 0][operationMode] : 0;
				//OFF, HEAT, COOL, AUTO
				const targetThermostatOperationMode = power ? inStandby ? 0 : [0, 1, 2, 2, 2, 2, 2, 2, 3][operationMode] : 0;
				const targetOperationMode = displayMode ? targetThermostatOperationMode : targetHeaterCoolerOperationMode;
				this.targetOperationMode = targetOperationMode;

				this.roomTemperature = roomTemperature;
				this.setTemperature = setTemperature;
				this.defaultHeatingSetTemperature = defaultHeatingSetTemperature;
				this.defaultCoolingSetTemperature = defaultCoolingSetTemperature;

				//fan speed mode
				const fanSpeed = modelSupportsFanSpeed ? (numberOfFanSpeeds == 3) ? hasAutomaticFanSpeed ? [4, 1, 2, 3][setFanSpeed] : [0, 1, 2, 3][setFanSpeed] : (numberOfFanSpeeds == 5) ? hasAutomaticFanSpeed ? [6, 1, 2, 3, 4, 5][setFanSpeed] : [0, 1, 2, 3, 4, 5][setFanSpeed] : false : false;
				const fanSpeedSetProps = modelSupportsFanSpeed ? (numberOfFanSpeeds == 3) ? hasAutomaticFanSpeed ? 4 : 3 : (numberOfFanSpeeds == 5) ? hasAutomaticFanSpeed ? 6 : 5 : false : false;
				this.fanSpeed = fanSpeed;
				this.fanSpeedSetProps = fanSpeedSetProps;
				this.fanSpeedModeInfoGet = setFanSpeed;

				//swing mode
				const swingMode = swingFunction ? (vaneHorizontal == 12 && vaneVertical == 7) ? 1 : 0 : false;
				this.swingMode = swingMode;

				this.vaneHorizontal = vaneHorizontal;
				this.vaneVertical = vaneVertical;

				const lockPhysicalControls = (deviceState.prohibitSetTemperature == true || deviceState.prohibitOperationMode == true || deviceState.prohibitPower == true) ? 1 : 0;
				this.lockPhysicalControls = lockPhysicalControls;
				const useFahrenheit = this.useFahrenheit

				if (this.melCloudService) {
					switch (displayMode) {
						case 0: //HEATER COOLET
							this.melCloudService
								.updateCharacteristic(Characteristic.Active, power)
								.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentOperationMode)
								.updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetOperationMode)
								.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
								.updateCharacteristic(Characteristic.HeatingThresholdTemperature, setTemperature)
								.updateCharacteristic(Characteristic.CoolingThresholdTemperature, setTemperature)
								.updateCharacteristic(Characteristic.LockPhysicalControls, lockPhysicalControls)
								.updateCharacteristic(Characteristic.TemperatureDisplayUnits, useFahrenheit);
							const updateRotationSpeed = modelSupportsFanSpeed ? this.melCloudService.updateCharacteristic(Characteristic.RotationSpeed, fanSpeed) : false;
							const updateSwingMode = swingFunction ? this.melCloudService.updateCharacteristic(Characteristic.SwingMode, swingMode) : false;
							break;
						case 1: //THERMOSTAT
							this.melCloudService
								.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, currentOperationMode)
								.updateCharacteristic(Characteristic.TargetHeatingCoolingState, targetOperationMode)
								.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
								.updateCharacteristic(Characteristic.TargetTemperature, setTemperature)
								.updateCharacteristic(Characteristic.HeatingThresholdTemperature, setTemperature)
								.updateCharacteristic(Characteristic.CoolingThresholdTemperature, setTemperature)
								.updateCharacteristic(Characteristic.TemperatureDisplayUnits, useFahrenheit);
							break;
					};

				};

				if (buttonsCount > 0) {
					this.buttonsStates = new Array();
					for (let i = 0; i < buttonsCount; i++) {
						const button = this.buttons[i];
						const buttonMode = button.mode;

						let buttonState = false;
						switch (buttonMode) {
							case 0: //POWER ON,OFF
								buttonState = (power == true);
								break;
							case 1: //OPERATING MODE HEAT
								buttonState = power ? (operationMode == 1) : false;
								break;
							case 2: //OPERATING MODE DRY
								buttonState = power ? (operationMode == 2) : false;
								break
							case 3: //OPERATING MODE COOL
								buttonState = power ? (operationMode == 3) : false;
								break;
							case 7: //OPERATING MODE FAN
								buttonState = power ? (operationMode == 7) : false;
								break;
							case 8: //OPERATING MODE AUTO
								buttonState = power ? (operationMode == 8) : false;
								break;
							case 9: //OPERATING MODE PURIFY
								buttonState = power ? (operationMode == 9) : false;
								break;
							case 10: //PHYSICAL LOCK CONTROLS
								buttonState = (lockPhysicalControls == 1);
								break;
							case 11: //WANE H SWING MODE AUTO
								buttonState = power ? (vaneHorizontal == 0) : false;
								break;
							case 12: //WANE H SWING MODE 1
								buttonState = power ? (vaneHorizontal == 1) : false;
								break;
							case 13: //WANE H SWING MODE 2
								buttonState = power ? (vaneHorizontal == 2) : false;
								break;
							case 14: //WANE H SWING MODE 3
								buttonState = power ? (vaneHorizontal == 3) : false;
								break;
							case 15: //WANE H SWING MODE 4
								buttonState = power ? (vaneHorizontal == 4) : false;
								break;
							case 16: //WANE H SWING MODE 5
								buttonState = power ? (vaneHorizontal == 5) : false;
								break;
							case 17: //WANE H SWING MODE SWING
								buttonState = power ? (vaneHorizontal == 12) : false;
								break;
							case 18: //VANE V SWING MODE AUTO
								buttonState = power ? (vaneVertical == 0) : false;
								break;
							case 19: //VANE V SWING MODE 1
								buttonState = power ? (vaneVertical == 1) : false;
								break;
							case 20: //VANE V SWING MODE 2
								buttonState = power ? (vaneVertical == 2) : false;
								break;
							case 21: //VANE V SWING MODE 3
								buttonState = power ? (vaneVertical == 3) : false;
								break;
							case 22: //VANE V SWING MODE 4
								buttonState = power ? (vaneVertical == 4) : false;
								break;
							case 23: //VANE V SWING MODE 5
								buttonState = power ? (vaneVertical == 5) : false;
								break;
							case 24: //VANE V SWING MODE SWING
								buttonState = power ? (vaneVertical == 7) : false;
								break;
							case 25: //FAN SPEED MODE AUTO
								buttonState = power ? (setFanSpeed == 0) : false;
								break;
							case 26: //FAN SPEED MODE 1
								buttonState = power ? (setFanSpeed == 1) : false;
								break;
							case 27: //FAN SPEED MODE 2
								buttonState = power ? (setFanSpeed == 2) : false;
								break;
							case 28: //FAN SPEED MODE 3
								buttonState = power ? (setFanSpeed == 3) : false;
								break;
							case 29: //FAN SPEED MODE 4
								buttonState = power ? (setFanSpeed == 4) : false;
								break;
							case 30: //FAN SPEED  MODE 5
								buttonState = power ? (setFanSpeed == 5) : false;
								break;
						};
						this.buttonsStates.push(buttonState);

						if (this.buttonsServices) {
							this.buttonsServices[i]
								.updateCharacteristic(Characteristic.On, buttonState)
						};
					};

				};

				//start prepare accessory
				if (this.startPrepareAccessory) {
					this.prepareAccessory();
				};
			})
			.on('error', (error) => {
				this.log(error);
			})
			.on('debug', (message) => {
				this.log(message);
			})
			.on('message', (message) => {
				this.log(message);
			})
			.on('mqtt', (topic, message) => {
				this.mqttClient.send(topic, message);
			});
	};

	//prepare accessory
	async prepareAccessory() {
		this.log.debug('prepareAccessory');
		const melCloudInfo = this.melCloudInfo;
		const deviceId = this.deviceId.toString();
		const deviceState = this.deviceState;
		const deviceName = this.deviceName;
		const deviceType = this.deviceType;
		const deviceTypeText = this.deviceTypeText;
		const temperatureUnit = this.temperatureDisplayUnit;
		const deviceTypeUrl = [API_URL.SetAta, API_URL.SetAtw, '', API_URL.SetErv][deviceType];
		const modelSupportsFanSpeed = this.modelSupportsFanSpeed;
		const hasAutomaticFanSpeed = this.hasAutomaticFanSpeed;
		const numberOfFanSpeeds = this.numberOfFanSpeeds
		const swingFunction = this.swingFunction;

		const manufacturer = this.manufacturer;
		const modelName = this.modelName;
		const serialNumber = this.serialNumber;
		const firmwareRevision = this.firmwareRevision;

		const displayMode = this.displayMode;
		const currentModeText = CONSTANS.AirConditioner.CurrentHeaterCoolerThermostat[displayMode];
		const targetModeText = CONSTANS.AirConditioner.TargetHeaterCoolerThermostat[displayMode];

		//accessory
		const accessoryName = deviceName;
		const accessoryUUID = AccessoryUUID.generate(deviceId);
		const accessoryCategory = displayMode ? Categories.THERMOSTAT : Categories.AIR_CONDITIONER;
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

		//information service
		this.log.debug('prepareInformationService');
		accessory.removeService(accessory.getService(Service.AccessoryInformation));
		const informationService = new Service.AccessoryInformation(accessoryName);
		informationService
			.setCharacteristic(Characteristic.Manufacturer, manufacturer)
			.setCharacteristic(Characteristic.Model, modelName)
			.setCharacteristic(Characteristic.SerialNumber, serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);
		accessory.addService(informationService);


		//melcloud service
		this.log.debug('prepareMelCloudService');
		this.melCloudService = displayMode ? new Service.Thermostat(accessoryName, 'Thermostat') : new Service.HeaterCooler(accessoryName, 'HeaterCooler');
		if (displayMode == 0) {
			//Only for Heater Cooler
			this.melCloudService.getCharacteristic(Characteristic.Active)
				.onGet(async () => {
					const state = this.power;
					const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Power: ${state?'ON':'OFF'}`);
					return state;
				})
				.onSet(async (state) => {
					deviceState.Power = state;
					deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power;

					try {
						const newState = await this.melCloudClientDevice.send(deviceTypeUrl, deviceState, 0);
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set power: ${state?'ON':'OFF'}`);
					} catch (error) {
						this.log.error(`${deviceTypeText}: ${accessoryName}, Set power error: ${error}`);
					};
				});
		};
		this.melCloudService.getCharacteristic(displayMode ? Characteristic.CurrentHeatingCoolingState : Characteristic.CurrentHeaterCoolerState)
			.onGet(async () => {
				//1 = HEAT, 2 = DRY 3 = COOL, 7 = FAN, 8 = AUTO
				const value = this.currentOperationMode;
				const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Heating cooling mode: ${currentModeText[value]}`);
				return value;
			});
		this.melCloudService.getCharacteristic(displayMode ? Characteristic.TargetHeatingCoolingState : Characteristic.TargetHeaterCoolerState)
			.onGet(async () => {
				//1 = HEAT, 2 = DRY 3 = COOL, 7 = FAN, 8 = AUTO
				const value = this.targetOperationMode;
				const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Target heating cooling mode: ${targetModeText[value]}`);
				return value;
			})
			.onSet(async (value) => {
				switch (value) {
					case 0: //OFF, AUTO
						deviceState.Power = displayMode ? false : true;
						deviceState.OperationMode = displayMode ? deviceState.OperationMode : 8;
						deviceState.EffectiveFlags = displayMode ? DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power : DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
						break;
					case 1: //HEAT
						deviceState.Power = true;
						deviceState.OperationMode = 1;
						deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
						break;
					case 2: //COOL
						deviceState.Power = true;
						deviceState.OperationMode = 3;
						deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
						break;
					case 3: //AUTO only Thermostat
						deviceState.Power = true;
						deviceState.OperationMode = 8;
						deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
						break;
				};

				try {
					const newState = await this.melCloudClientDevice.send(deviceTypeUrl, deviceState, 0);
					const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set target heating cooling mode: ${targetModeText[value]}`);
				} catch (error) {
					this.log.error(`${deviceTypeText}: ${accessoryName}, Set target heating cooling mode error: ${error}`);
				};
			});
		if (displayMode == 0) {
			//Only for Heater Cooler
			if (modelSupportsFanSpeed) {
				this.melCloudService.getCharacteristic(Characteristic.RotationSpeed)
					.setProps({
						minValue: 0,
						maxValue: this.fanSpeedSetProps,
						minStep: 1
					})
					.onGet(async () => {
						//AUTO, 1, 2, 3, 4, 5
						const value = this.fanSpeed;
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Fan speed mode: ${CONSTANS.AirConditioner.SetFanSpeed[this.fanSpeedModeInfoGet]}`);
						return value;
					})
					.onSet(async (value) => {
						const fanSpeedMode = (numberOfFanSpeeds == 3) ? hasAutomaticFanSpeed ? [0, 1, 2, 3, 0][value] : [1, 1, 2, 3][value] : (numberOfFanSpeeds == 5) ? hasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 0][value] : [1, 1, 2, 3, 4, 5][value] : false;
						const fanSpeedModeInfo = (numberOfFanSpeeds == 3) ? hasAutomaticFanSpeed ? [6, 1, 2, 3, 0][value] : [6, 1, 2, 3][value] : (numberOfFanSpeeds == 5) ? hasAutomaticFanSpeed ? [6, 1, 2, 3, 4, 5, 0][value] : [6, 1, 2, 3, 4, 5][value] : false;

						deviceState.Power = true;
						deviceState.SetFanSpeed = fanSpeedMode;
						deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.SetFanSpeed;

						try {
							const newState = await this.melCloudClientDevice.send(deviceTypeUrl, deviceState, 0);
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set fan speed mode: ${CONSTANS.AirConditioner.SetFanSpeed[fanSpeedModeInfo]}`);
						} catch (error) {
							this.log.error(`${deviceTypeText}: ${accessoryName}, Set fan speed mode error: ${error}`);
						};
					});
			};
			if (swingFunction) {
				this.melCloudService.getCharacteristic(Characteristic.SwingMode)
					.onGet(async () => {
						//Vane Horizontal: Auto, 1, 2, 3, 4, 5, 12 = Swing
						//Vane Vertical: Auto, 1, 2, 3, 4, 5, 7 = Swing
						const value = this.swingMode;
						const swingMode = value ? 6 : 0;
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Vane swing mode: ${CONSTANS.AirConditioner.SwingMode[swingMode]}`);
						return value;
					})
					.onSet(async (value) => {
						const swingMode = value ? 6 : 0;
						deviceState.Power = true;
						deviceState.VaneHorizontal = value ? 12 : 0;
						deviceState.VaneVertical = value ? 7 : 0;
						deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneHorizontal + DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneVertical;

						try {
							const newState = await this.melCloudClientDevice.send(deviceTypeUrl, deviceState, 0);
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set vane swing mode: ${CONSTANS.AirConditioner.SwingMode[swingMode]}`);
						} catch (error) {
							this.log.error(`${deviceTypeText}: ${accessoryName}, Set vane swing mode error: ${error}`);
						};
					});
			};
		};
		this.melCloudService.getCharacteristic(Characteristic.CurrentTemperature)
			.onGet(async () => {
				const value = this.roomTemperature;
				const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Room temperature: ${value}${temperatureUnit}`);
				return value;
			});
		if (displayMode == 1) {
			//Only for Thermostat
			this.melCloudService.getCharacteristic(Characteristic.TargetTemperature)

				.onGet(async () => {
					const value = this.setTemperature;
					const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Target room temperature: ${value}${temperatureUnit}`);
					return value;
				})
				.onSet(async (value) => {
					deviceState.Power = true;
					deviceState.SetTemperature = value;
					deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.SetTemperature;

					try {
						const newState = await this.melCloudClientDevice.send(deviceTypeUrl, deviceState, 0);
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set target room temperature: ${value}${temperatureUnit}`);
					} catch (error) {
						this.log.error(`${deviceTypeText}: ${accessoryName}, Set target room temperature error: ${error}`);
					};
				});
		};
		this.melCloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
			.setProps({
				minValue: this.useFahrenheit ? 50 : 10,
				maxValue: this.useFahrenheit ? 95 : 35,
				minStep: this.useFahrenheit ? 1 : 0.5
			})
			.onGet(async () => {
				const value = this.setTemperature;
				const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Heating threshold temperature: ${value}${temperatureUnit}`);
				return value;
			})
			.onSet(async (value) => {
				deviceState.Power = true;
				deviceState.SetTemperature = value;
				deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.SetTemperature;

				try {
					const newState = await this.melCloudClientDevice.send(deviceTypeUrl, deviceState, 0);
					const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set heating threshold temperature: ${value}${temperatureUnit}`);
				} catch (error) {
					this.log.error(`${deviceTypeText}: ${accessoryName}, Set heating threshold temperature error: ${error}`);
				};
			});
		this.melCloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
			.setProps({
				minValue: this.useFahrenheit ? 50 : 10,
				maxValue: this.useFahrenheit ? 95 : 35,
				minStep: this.useFahrenheit ? 1 : 0.5
			})
			.onGet(async () => {
				const value = this.setTemperature;
				const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Cooling threshold temperature: ${value}${temperatureUnit}`);
				return value;
			})
			.onSet(async (value) => {
				deviceState.Power = true;
				deviceState.SetTemperature = value;
				deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.SetTemperature;

				try {
					const newState = await this.melCloudClientDevice.send(deviceTypeUrl, deviceState, 0);
					const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set cooling threshold temperature: ${value}${temperatureUnit}`);
				} catch (error) {
					this.log.error(`${deviceTypeText}: ${accessoryName}, Set cooling threshold temperature error: ${error}`);
				};
			});
		if (displayMode == 0) {
			//Only for Heater Cooler
			this.melCloudService.getCharacteristic(Characteristic.LockPhysicalControls)
				.onGet(async () => {
					const value = this.lockPhysicalControls;
					const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Lock physical controls: ${value ? 'LOCKED':'UNLOCKED'}`);
					return value;
				})
				.onSet(async (value) => {
					value = value ? true : false;
					deviceState.ProhibitSetTemperature = value;
					deviceState.ProhibitOperationMode = value;
					deviceState.ProhibitPower = value;

					try {
						const newState = await this.melCloudClientDevice.send(deviceTypeUrl, deviceState, 0);
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set locl physical controls: ${value ? 'LOCK':'UNLOCK'}`);
					} catch (error) {
						this.log.error(`${deviceTypeText}: ${accessoryName}, Set lock physical controls error: ${error}`);
					};
				});
		};
		this.melCloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
			.onGet(async () => {
				const value = this.useFahrenheit;
				const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Temperature display unit: ${temperatureUnit}`);
				return value;
			})
			.onSet(async (value) => {
				melCloudInfo.UseFahrenheit = value ? true : false;
				melCloudInfo.EmailOnCommsError = false;
				melCloudInfo.EmailOnUnitError = false;
				melCloudInfo.EmailCommsErrors = 1;
				melCloudInfo.EmailUnitErrors = 1;
				melCloudInfo.RestorePages = false;
				melCloudInfo.MarketingCommunication = false;
				melCloudInfo.AlternateEmailAddress = '';
				melCloudInfo.Fred = 4;

				try {
					const newState = await this.melCloudClientDevice.send(API_URL.UpdateApplicationOptions, melCloudInfo, 1);
					const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set temperature display unit: ${CONSTANS.TemperatureDisplayUnits[value]}`);
				} catch (error) {
					this.log.error(`${deviceTypeText}: ${accessoryName}, Set temperature display unit error: ${error}`);
				};
			});
		accessory.addService(this.melCloudService);

		//buttons services
		const buttonsCount = this.buttons.length;
		if (buttonsCount > 0) {
			this.log.debug('prepareButtonsService');
			this.buttonsServices = new Array();
			const buttons = this.buttons;
			for (let i = 0; i < buttonsCount; i++) {
				//get button
				const button = buttons[i];

				//get button mode
				const buttonMode = button.mode;

				//get button name
				const buttonName = (button.name != undefined) ? button.name : buttonMode;

				//get button display type
				const buttonDisplayType = (button.displayType != undefined) ? button.displayType : 0;

				const buttonServiceType = [Service.Outlet, Service.Switch][buttonDisplayType];
				const buttonServiceName = accessoryName + ' ' + buttonName;
				const buttonService = new buttonServiceType(buttonServiceName, `ButtonService${i}`);
				buttonService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = this.buttonsStates[i];
						return state;
					})
					.onSet(async (state) => {
						switch (buttonMode) {
							case 0: //POWER ON,OFF
								deviceState.Power = state;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power;
								break;
							case 1: //OPERATING MODE HEAT
								deviceState.Power = true;
								deviceState.OperationMode = 1;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
								break;
							case 2: //OPERATING MODE DRY
								deviceState.Power = true;
								deviceState.OperationMode = 2;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
								break
							case 3: //OPERATING MODE COOL
								deviceState.Power = true;
								deviceState.OperationMode = 3;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
								break;
							case 7: //OPERATING MODE FAN
								deviceState.Power = true;
								deviceState.OperationMode = 7;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
								break;
							case 8: //OPERATING MODE AUTO
								deviceState.Power = true;
								deviceState.OperationMode = 8;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
								break;
							case 9: //OPERATING MODE PURIFY
								deviceState.Power = true;
								deviceState.OperationMode = 9;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
								break;
							case 10: //PHYSICAL LOCK CONTROLS
								deviceState.ProhibitSetTemperature = state;
								deviceState.ProhibitOperationMode = state;
								deviceState.ProhibitPower = state;
								break;
							case 11: //WANE H SWING MODE AUTO
								deviceState.Power = true;
								deviceState.VaneHorizontal = 0;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneHorizontal;
								break;
							case 12: //WANE H SWING MODE 1
								deviceState.Power = true;
								deviceState.VaneHorizontal = 1;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneHorizontal;
								break;
							case 13: //WANE H SWING MODE 2
								deviceState.Power = true;
								deviceState.VaneHorizontal = 2;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneHorizontal;
								break;
							case 14: //WANE H SWING MODE 3
								deviceState.Power = true;
								deviceState.VaneHorizontal = 3;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneHorizontal;
								break;
							case 15: //WANE H SWING MODE 4
								deviceState.Power = true;
								deviceState.VaneHorizontal = 4;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneHorizontal;
								break;
							case 16: //WANE H SWING MODE 5
								deviceState.Power = true;
								deviceState.VaneHorizontal = 5;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneHorizontal;
								break;
							case 17: //WANE H SWING MODE SWING
								deviceState.Power = true;
								deviceState.VaneHorizontal = 12;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneHorizontal;
								break;
							case 18: //VANE V SWING MODE AUTO
								deviceState.Power = true;
								deviceState.VaneVertical = 0;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneVertical;
								break;
							case 19: //VANE V SWING MODE 1
								deviceState.Power = true;
								deviceState.VaneVertical = 1;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneVertical;
								break;
							case 20: //VANE V SWING MODE 2
								deviceState.Power = true;
								deviceState.VaneVertical = 2;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneVertical;
								break;
							case 21: //VANE V SWING MODE 3
								deviceState.Power = true;
								deviceState.VaneVertical = 3;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneVertical;
								break;
							case 22: //VANE V SWING MODE 4
								deviceState.Power = true;
								deviceState.VaneVertical = 4;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneVertical;
								break;
							case 23: //VANE V SWING MODE 5
								deviceState.Power = true;
								deviceState.VaneVertical = 5;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneVertical;
								break;
							case 24: //VANE V SWING MODE SWING
								deviceState.Power = true;
								deviceState.VaneVertical = 7;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneVertical;
								break;
							case 25: //FAN SPEED MODE AUTO
								deviceState.Power = true;
								deviceState.SetFanSpeed = 0;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.SetFanSpeed;
								break;
							case 26: //FAN SPEED MODE 1
								deviceState.Power = true;
								deviceState.SetFanSpeed = 1;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.SetFanSpeed;
								break;
							case 27: //FAN SPEED MODE 2
								deviceState.Power = true;
								deviceState.SetFanSpeed = 2;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.SetFanSpeed;
								break;
							case 28: //FAN SPEED MODE 3
								deviceState.Power = true;
								deviceState.SetFanSpeed = 3;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.SetFanSpeed;
								break;
							case 29: //FAN MODE 4
								deviceState.Power = true;
								deviceState.SetFanSpeed = 4;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.SetFanSpeed;
								break;
							case 30: //FAN SPEED MODE 5
								deviceState.Power = true;
								deviceState.SetFanSpeed = 5;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.SetFanSpeed;
								break;
						};

						try {
							const newState = await this.melCloudClientDevice.send(deviceTypeUrl, deviceState, 0);
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set: ${buttonName}`);
						} catch (error) {
							this.log.error(`${deviceTypeText}: ${accessoryName}, Set button error: ${error}`);
						};
					});

				this.buttonsServices.push(buttonService);
				accessory.addService(this.buttonsServices[i]);
			};
		};

		this.startPrepareAccessory = false;
		this.melCloudClientDevice.refreshDeviceState();
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
		const debug = this.enableDebugMode ? this.log(`${deviceTypeText}: ${accessoryName}, published as external accessory.`) : false;
	};
};