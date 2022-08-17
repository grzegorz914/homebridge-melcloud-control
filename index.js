'use strict';

const fs = require('fs');
const path = require('path');
const mqtt = require('./src/mqtt.js');
const melCloud = require('./src/melcloud.js')
const melCloudDeviceAta = require('./src/melclouddeviceata.js');
const melCloudDeviceAtw = require('./src/melclouddeviceatw.js');
const melCloudDeviceErv = require('./src/melclouddeviceerv.js');

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
			log(`No configuration found for ${PLUGIN_NAME}`);
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
					this.log(`Name, user, password or language in config missing.`);
					return;
				} else {
					const enableDebugMode = account.enableDebugMode;
					const prefDir = path.join(api.user.storagePath(), 'melcloud');

					//check if the directory exists, if not then create it
					if (fs.existsSync(prefDir) == false) {
						fs.mkdirSync(prefDir);
					};

					//melcloud client
					this.melCloud = new melCloud({
						name: accountName,
						user: user,
						passwd: passwd,
						language: language,
						debugLog: enableDebugMode,
						prefDir: prefDir
					});

					this.melCloud.on('checkDevicesListComplete', (melCloudInfo, contextKey, buildingId, deviceInfo, deviceId, deviceType, deviceName, deviceTypeText, useFahrenheit, temperatureDisplayUnit) => {
							new melCloudDevice(this.log, this.api, account, prefDir, melCloudInfo, contextKey, buildingId, deviceInfo, deviceId, deviceType, deviceName, deviceTypeText, useFahrenheit, temperatureDisplayUnit);
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
	constructor(log, api, account, prefDir, melCloudInfo, contextKey, buildingId, deviceInfo, deviceId, deviceType, deviceName, deviceTypeText, useFahrenheit, temperatureDisplayUnit) {
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

		this.startPrepareAccessory = true;
		this.displayDeviceInfo = true;
		this.melCloudInfo = melCloudInfo;
		this.useFahrenheit = useFahrenheit;
		this.temperatureDisplayUnit = temperatureDisplayUnit;
		this.deviceId = deviceId;
		this.deviceName = deviceName;
		this.deviceType = deviceType;
		this.deviceTypeText = deviceTypeText;

		//mqtt client
		if (enableMqtt) {
			this.mqtt = new mqtt({
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

			this.mqtt.on('connected', (message) => {
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
		const displayMode = this.displayMode;
		const buttonsCount = this.buttons.length;
		switch (deviceType) {
			case 0: //air conditioner
				this.melCloudDeviceAta = new melCloudDeviceAta({
					name: this.accountName,
					deviceInfo: deviceInfo,
					contextKey: contextKey,
					buildingId: buildingId,
					deviceId: deviceId,
					deviceName: deviceName,
					deviceTypeText: deviceTypeText,
					debugLog: this.enableDebugMode,
					mqttEnabled: enableMqtt,
					prefDir: prefDir
				});

				this.melCloudDeviceAta.on('deviceInfo', (deviceInfo, manufacturer, modelName, modelName1, serialNumber, firmwareRevision) => {
						if (!this.disableLogDeviceInfo && this.displayDeviceInfo) {
							this.log(`---- ${this.deviceTypeText}: ${this.deviceName} ----`);
							this.log(`Account: ${this.accountName}`);
							this.log(`Model: ${modelName}`);
							this.log(`Serial: ${serialNumber}`);
							this.log(`Firmware: ${firmwareRevision}`);
							const outdoorDevice = (modelName1 != 'Undefined') ? this.log(`Outdoor: ${modelName1}`) : false;
							this.log(`Manufacturer: ${manufacturer}`);
							this.log('----------------------------------');
							this.displayDeviceInfo = false;
						};

						//device info
						this.canCool = (deviceInfo.Device.CanCool == true);
						this.canHeat = (deviceInfo.Device.CanHeat == true);
						this.canDry = (deviceInfo.Device.CanDry == true);
						this.hasAutomaticFanSpeed = (deviceInfo.Device.HasAutomaticFanSpeed == true);
						this.airDirectionFunction = (deviceInfo.Device.AirDirectionFunction == true);
						this.swingFunction = (deviceInfo.Device.SwingFunction == true);
						this.numberOfFanSpeeds = deviceInfo.Device.NumberOfFanSpeeds;
						this.modelIsAirCurtain = (deviceInfo.Device.ModelIsAirCurtain == true);
						this.modelSupportsFanSpeed = (deviceInfo.Device.ModelSupportsFanSpeed == true);
						this.modelSupportsAuto = (deviceInfo.Device.ModelSupportsAuto == true);
						this.modelSupportsHeat = (deviceInfo.Device.ModelSupportsHeat == true);
						this.modelSupportsDry = (deviceInfo.Device.ModelSupportsDry == true);
						this.modelSupportsVaneVertical = (deviceInfo.Device.ModelSupportsVaneVertical == true);
						this.modelSupportsVaneHorizontal = (deviceInfo.Device.ModelSupportsVaneHorizontal == true);
						this.modelSupportsWideVane = (deviceInfo.Device.ModelSupportsWideVane == true);
						this.modelSupportsStandbyMode = (deviceInfo.Device.ModelSupportsStandbyMode == true);

						this.manufacturer = manufacturer;
						this.modelName = modelName;
						this.serialNumber = serialNumber;
						this.firmwareRevision = firmwareRevision;
					})
					.on('deviceState', (deviceState, roomTemperature, setTemperature, setFanSpeed, operationMode, vaneHorizontal, vaneVertical, inStandbyMode, power) => {
						//device info
						const hasAutomaticFanSpeed = this.hasAutomaticFanSpeed;
						const swingFunction = this.swingFunction;
						const numberOfFanSpeeds = this.numberOfFanSpeeds;
						const modelSupportsFanSpeed = this.modelSupportsFanSpeed;
						const modelSupportsStandbyMode = this.modelSupportsStandbyMode;

						//device state
						this.deviceState = deviceState;
						this.power = power;
						const inStandby = modelSupportsStandbyMode ? inStandbyMode : false;
						this.inStandbyMode = inStandby;

						//operating mode
						let currentOperationMode = 0;
						let targetOperationMode = 0;
						switch (displayMode) {
							case 0: //Heater Cooler INACTIVE, IDLE, HEATING, COOLING - current, AUTO, HEAT, COOL - target
								currentOperationMode = power ? inStandby ? 1 : [1, 2, 2, 3, 3, 3, 3, 3, 3][operationMode] : 0;
								targetOperationMode = power ? [0, 1, 1, 2, 2, 2, 2, 2, 0][operationMode] : 0;
								break;
							case 1: //Thermostat //OFF, HEAT, COOL - current, //OFF, HEAT, COOL, AUTO - target
								currentOperationMode = power ? inStandby ? 0 : [0, 1, 2, 2, 2, 2, 2, 2, 2][operationMode] : 0;
								targetOperationMode = power ? [0, 1, 1, 2, 2, 2, 2, 2, 3][operationMode] : 0;
								break;
						};
						this.currentOperationMode = currentOperationMode;
						this.targetOperationMode = targetOperationMode;

						//temperature
						this.roomTemperature = roomTemperature;
						this.setTemperature = setTemperature;

						//fan speed mode
						let fanSpeed = 0;
						let fanSpeedSetProps = 0;
						if (modelSupportsFanSpeed) {
							switch (numberOfFanSpeeds) {
								case 2: //Fan speed mode 2
									fanSpeed = hasAutomaticFanSpeed ? [3, 1, 2][setFanSpeed] : [0, 1, 2][setFanSpeed];
									fanSpeedSetProps = hasAutomaticFanSpeed ? 3 : 2;
									break;
								case 3: //Fan speed mode 3
									fanSpeed = hasAutomaticFanSpeed ? [4, 1, 2, 3][setFanSpeed] : [0, 1, 2, 3][setFanSpeed];
									fanSpeedSetProps = hasAutomaticFanSpeed ? 4 : 3;
									break;
								case 4: //Fan speed mode 4
									fanSpeed = hasAutomaticFanSpeed ? [5, 1, 2, 3, 4][setFanSpeed] : [0, 1, 2, 3, 4][setFanSpeed];
									fanSpeedSetProps = hasAutomaticFanSpeed ? 5 : 4;
									break;
								case 5: //Fan speed mode 5
									fanSpeed = hasAutomaticFanSpeed ? [6, 1, 2, 3, 4, 5][setFanSpeed] : [0, 1, 2, 3, 4, 5][setFanSpeed];
									fanSpeedSetProps = hasAutomaticFanSpeed ? 6 : 5;
									break;
								case 6: //Fan speed mode 6
									fanSpeed = hasAutomaticFanSpeed ? [7, 1, 2, 3, 4, 5, 6][setFanSpeed] : [0, 1, 2, 3, 4, 5, 6][setFanSpeed];
									fanSpeedSetProps = hasAutomaticFanSpeed ? 7 : 6;
									break;
								case 7: //Fan speed mode 7
									fanSpeed = hasAutomaticFanSpeed ? [8, 1, 2, 3, 4, 5, 6, 7][setFanSpeed] : [0, 1, 2, 3, 4, 5, 6, 7][setFanSpeed];
									fanSpeedSetProps = hasAutomaticFanSpeed ? 8 : 7;
									break;
							};
						};
						this.fanSpeed = fanSpeed;
						this.fanSpeedSetProps = fanSpeedSetProps;
						this.fanSpeedModeInfoGet = setFanSpeed;

						//swing and vane mode
						const swingMode = swingFunction ? (vaneHorizontal == 12 && vaneVertical == 7) ? 1 : 0 : false;
						this.swingMode = swingMode;
						this.vaneHorizontal = vaneHorizontal;
						this.vaneVertical = vaneVertical;

						//lock physical controls
						const lockPhysicalControls = (deviceState.prohibitSetTemperature == true || deviceState.prohibitOperationMode == true || deviceState.prohibitPower == true) ? 1 : 0;
						this.lockPhysicalControls = lockPhysicalControls;

						if (this.melCloudService) {
							switch (displayMode) {
								case 0: //heater/cooler
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
								case 1: //thermostat
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
									case 31: //FAN SPEED  MODE 6
										buttonState = power ? (setFanSpeed == 6) : false;
										break;
									case 32: //FAN SPEED  MODE 7
										buttonState = power ? (setFanSpeed == 7) : false;
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
				break;
			case 1: //heat pump
				this.melCloudDeviceAtw = new melCloudDeviceAtw({
					name: this.accountName,
					deviceInfo: deviceInfo,
					contextKey: contextKey,
					buildingId: buildingId,
					deviceId: deviceId,
					deviceName: deviceName,
					deviceTypeText: deviceTypeText,
					debugLog: this.enableDebugMode,
					mqttEnabled: enableMqtt,
					prefDir: prefDir
				});

				this.melCloudDeviceAtw.on('deviceInfo', (deviceInfo, manufacturer, modelName, serialNumber, firmwareRevision) => {
						if (!this.disableLogDeviceInfo && this.displayDeviceInfo) {
							this.log(`---- ${this.deviceTypeText}: ${this.deviceName} ----`);
							this.log(`Account: ${this.accountName}`);
							this.log(`Model: ${modelName}`);
							this.log(`Serial: ${serialNumber}`);
							this.log(`Firmware: ${firmwareRevision}`);
							this.log(`Manufacturer: ${manufacturer}`);
							this.log('----------------------------------');
							this.displayDeviceInfo = false;
						};

						//device info
						this.deviceInfo = deviceInfo;
						this.manufacturer = manufacturer;
						this.modelName = modelName;
						this.serialNumber = serialNumber;
						this.firmwareRevision = firmwareRevision;
					})
					.on('deviceState', (deviceState, power, roomTemperatureZone1, setTemperatureZone1, roomTemperatureZone2, setTemperatureZone2, tankWaterTemperature, setTankWaterTemperatureconst, operationMode, operationModeZone1, operationModeZone2) => {
						//device state
						this.deviceState = deviceState;
						this.power = power;

						//operating mode
						let currentOperationMode = 0;
						let targetOperationMode = 0;
						switch (displayMode) {
							case 0: //Heater Cooler INACTIVE, IDLE, HEATING, COOLING - current, AUTO, HEAT, COOL - target
								currentOperationMode = power ? inStandby ? 1 : [1, 2, 2, 3, 3, 3, 3, 3, 3][operationMode] : 0;
								targetOperationMode = power ? [0, 1, 1, 2, 2, 2, 2, 2, 0][operationMode] : 0;
								break;
							case 1: //Thermostat //OFF, HEAT, COOL - current, //OFF, HEAT, COOL, AUTO - target
								currentOperationMode = power ? inStandby ? 0 : [0, 1, 2, 2, 2, 2, 2, 2, 2][operationMode] : 0;
								targetOperationMode = power ? [0, 1, 1, 2, 2, 2, 2, 2, 3][operationMode] : 0;
								break;
						};
						this.currentOperationMode = currentOperationMode;
						this.targetOperationMode = targetOperationMode;

						//temperature
						this.roomTemperatureZone1 = roomTemperatureZone1;
						this.roomTemperatureZone2 = roomTemperatureZone2;
						this.tankWaterTemperature = tankWaterTemperature;
						this.setTemperatureZone1 = setTemperatureZone1;
						this.setTemperatureZone2 = setTemperatureZone2;
						this.setTankWaterTemperatureconst = setTankWaterTemperatureconst;

						//lock physical controls
						const lockPhysicalControls = (deviceState.ProhibitHotWater == true || deviceState.ProhibitHeatingZone1 == true || deviceState.ProhibitHeatingZone2 == true) ? 1 : 0;
						this.lockPhysicalControls = lockPhysicalControls;

						if (this.melCloudService) {
							switch (displayMode) {
								case 0: //heater/cooler
									this.melCloudService
										.updateCharacteristic(Characteristic.Active, power)
										.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentOperationMode)
										.updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetOperationMode)
										.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
										.updateCharacteristic(Characteristic.HeatingThresholdTemperature, setTemperature)
										.updateCharacteristic(Characteristic.CoolingThresholdTemperature, setTemperature)
										.updateCharacteristic(Characteristic.LockPhysicalControls, lockPhysicalControls)
										.updateCharacteristic(Characteristic.TemperatureDisplayUnits, useFahrenheit);
									break;
								case 1: //thermostat
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
									case 31: //FAN SPEED  MODE 6
										buttonState = power ? (setFanSpeed == 6) : false;
										break;
									case 32: //FAN SPEED  MODE 7
										buttonState = power ? (setFanSpeed == 7) : false;
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
				break;
			case 2: //curtain

				break;
			case 3: //energy recovery ventilation
				this.melCloudDeviceAtw = new melCloudDeviceErv({
					name: this.accountName,
					deviceInfo: deviceInfo,
					contextKey: contextKey,
					buildingId: buildingId,
					deviceId: deviceId,
					deviceName: deviceName,
					deviceTypeText: deviceTypeText,
					debugLog: this.enableDebugMode,
					mqttEnabled: enableMqtt,
					prefDir: prefDir
				});

				this.melCloudDeviceErv.on('deviceInfo', (deviceInfo, manufacturer, modelName, modelName1, serialNumber, firmwareRevision) => {
						if (!this.disableLogDeviceInfo && this.displayDeviceInfo) {
							this.log(`---- ${this.deviceTypeText}: ${this.deviceName} ----`);
							this.log(`Account: ${this.accountName}`);
							this.log(`Model: ${modelName}`);
							this.log(`Serial: ${serialNumber}`);
							this.log(`Firmware: ${firmwareRevision}`);
							const outdoorDevice = (modelName1 != 'Undefined') ? this.log(`Outdoor: ${modelName1}`) : false;
							this.log(`Manufacturer: ${manufacturer}`);
							this.log('----------------------------------');
							this.displayDeviceInfo = false;
						};

						//device info
						this.deviceInfo = deviceInfo;
						this.modelSupportsFanSpeed = (deviceInfo.Device.ModelSupportsFanSpeed == true);
						this.hasAutomaticFanSpeed = (deviceInfo.Device.HasAutomaticFanSpeed == true);
						this.numberOfFanSpeeds = deviceInfo.Device.numberOfFanSpeeds;

						this.manufacturer = manufacturer;
						this.modelName = modelName;
						this.serialNumber = serialNumber;
						this.firmwareRevision = firmwareRevision;
					})
					.on('deviceState', (deviceState, power, roomTemperature, supplyTemperature, outdoorTemperature, roomCO2Level, setTemperature, setFanSpeed, operationMode, ventilationMode) => {
						//device info
						const modelSupportsFanSpeed = this.modelSupportsFanSpeed;
						const hasAutomaticFanSpeed = this.hasAutomaticFanSpeed;
						const numberOfFanSpeeds = this.numberOfFanSpeeds;

						//device state
						this.deviceState = deviceState;
						this.power = power;

						//operating mode
						let currentOperationMode = 0;
						let targetOperationMode = 0;
						switch (displayMode) {
							case 0: //Heater Cooler INACTIVE, IDLE, HEATING, COOLING - current, AUTO, HEAT, COOL - target
								currentOperationMode = power ? inStandby ? 1 : [1, 2, 2, 3, 3, 3, 3, 3, 3][operationMode] : 0;
								targetOperationMode = power ? [0, 1, 1, 2, 2, 2, 2, 2, 0][operationMode] : 0;
								break;
							case 1: //Thermostat //OFF, HEAT, COOL - current, //OFF, HEAT, COOL, AUTO - target
								currentOperationMode = power ? inStandby ? 0 : [0, 1, 2, 2, 2, 2, 2, 2, 2][operationMode] : 0;
								targetOperationMode = power ? [0, 1, 1, 2, 2, 2, 2, 2, 3][operationMode] : 0;
								break;
						};
						this.currentOperationMode = currentOperationMode;
						this.targetOperationMode = targetOperationMode;

						//ventilation mode
						this.ventilationMode = ventilationMode;

						//temperature
						this.roomTemperature = roomTemperature;
						this.supplyTemperature = supplyTemperature;
						this.outdoorTemperature = outdoorTemperature;
						this.roomCO2Level = roomCO2Level;
						this.setTemperature = setTemperature;

						//fan speed mode
						let fanSpeed = 0;
						let fanSpeedSetProps = 0;

						if (modelSupportsFanSpeed) {
							switch (numberOfFanSpeeds) {
								case 2: //Fan speed mode 2
									fanSpeed = hasAutomaticFanSpeed ? [3, 1, 2][setFanSpeed] : [0, 1, 2][setFanSpeed];
									fanSpeedSetProps = hasAutomaticFanSpeed ? 3 : 2;
									break;
								case 3: //Fan speed mode 3
									fanSpeed = hasAutomaticFanSpeed ? [4, 1, 2, 3][setFanSpeed] : [0, 1, 2, 3][setFanSpeed];
									fanSpeedSetProps = hasAutomaticFanSpeed ? 4 : 3;
									break;
								case 4: //Fan speed mode 4
									fanSpeed = hasAutomaticFanSpeed ? [5, 1, 2, 3, 4][setFanSpeed] : [0, 1, 2, 3, 4][setFanSpeed];
									fanSpeedSetProps = hasAutomaticFanSpeed ? 5 : 4;
									break;
								case 5: //Fan speed mode 5
									fanSpeed = hasAutomaticFanSpeed ? [6, 1, 2, 3, 4, 5][setFanSpeed] : [0, 1, 2, 3, 4, 5][setFanSpeed];
									fanSpeedSetProps = hasAutomaticFanSpeed ? 6 : 5;
									break;
								case 6: //Fan speed mode 6
									fanSpeed = hasAutomaticFanSpeed ? [7, 1, 2, 3, 4, 5, 6][setFanSpeed] : [0, 1, 2, 3, 4, 5, 6][setFanSpeed];
									fanSpeedSetProps = hasAutomaticFanSpeed ? 7 : 6;
									break;
								case 7: //Fan speed mode 7
									fanSpeed = hasAutomaticFanSpeed ? [8, 1, 2, 3, 4, 5, 6, 7][setFanSpeed] : [0, 1, 2, 3, 4, 5, 6, 7][setFanSpeed];
									fanSpeedSetProps = hasAutomaticFanSpeed ? 8 : 7;
									break;
							};
						};
						this.fanSpeed = fanSpeed;
						this.fanSpeedSetProps = fanSpeedSetProps;
						this.fanSpeedModeInfoGet = setFanSpeed;

						if (this.melCloudService) {
							switch (displayMode) {
								case 0: //heater/cooler
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
									break;
								case 1: //thermostat
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
									case 31: //FAN SPEED  MODE 6
										buttonState = power ? (setFanSpeed == 6) : false;
										break;
									case 32: //FAN SPEED  MODE 7
										buttonState = power ? (setFanSpeed == 7) : false;
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
				break;
		};
	};

	//prepare accessory
	async prepareAccessory() {
		this.log.debug('prepareAccessory');
		const melCloudInfo = this.melCloudInfo;
		const deviceId = this.deviceId;
		const deviceState = this.deviceState;
		const deviceName = this.deviceName;
		const deviceType = this.deviceType;
		const deviceTypeText = this.deviceTypeText;
		const temperatureUnit = this.temperatureDisplayUnit;
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
		const accessoryCategory = [Categories.AIR_CONDITIONER, Categories.AIR_HEATER, Categories.OTHER, Categories.FAN][deviceType];
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

		//information service
		this.log.debug('prepareInformationService');
		accessory.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, manufacturer)
			.setCharacteristic(Characteristic.Model, modelName)
			.setCharacteristic(Characteristic.SerialNumber, serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);

		//melcloud service
		const serviceName = `${accessoryName} ${deviceTypeText}`;
		switch (deviceType) {
			case 0: //air conditioner
				this.log.debug('prepareMelCloudService for air conditioner');
				this.melCloudService = displayMode ? accessory.addService(Service.Thermostat, serviceName) : accessory.addService(Service.HeaterCooler, serviceName);
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
								const newState = await this.melCloudDeviceAta.send(API_URL.SetAta, deviceState, 0);
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
							case 3: //AUTO, OFF
								deviceState.Power = displayMode ? true : false;
								deviceState.OperationMode = displayMode ? 8 : deviceState.OperationMode;
								deviceState.EffectiveFlags = displayMode ? DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode : DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power;
								break;
						};

						try {
							const newState = await this.melCloudDeviceAta.send(API_URL.SetAta, deviceState, 0);
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
									const newState = await this.melCloudDeviceAta.send(API_URL.SetAta, deviceState, 0);
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
									const newState = await this.melCloudDeviceAta.send(API_URL.SetAta, deviceState, 0);
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
								const newState = await this.melCloudDeviceAta.send(API_URL.SetAta, deviceState, 0);
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
							const newState = await this.melCloudDeviceAta.send(API_URL.SetAta, deviceState, 0);
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
							const newState = await this.melCloudDeviceAta.send(API_URL.SetAta, deviceState, 0);
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
								const newState = await this.melCloudDeviceAta.send(API_URL.SetAta, deviceState, 0);
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
						try {
							const newState = await this.melCloudDeviceAta.send(API_URL.UpdateApplicationOptions, melCloudInfo, 1);
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set temperature display unit: ${CONSTANS.TemperatureDisplayUnits[value]}`);
							this.melCloudInfo = melCloudInfo;
						} catch (error) {
							this.log.error(`${deviceTypeText}: ${accessoryName}, Set temperature display unit error: ${error}`);
						};
					});
				break;
			case 1: //heat pump

				break;
			case 2: //curtain

				break;
			case 3: //ventilation
				this.log.debug('prepareMelCloudService for energy recovery ventilation');
				this.melCloudService = displayMode ? accessory.addService(Service.Thermostat, serviceName) : accessory.addService(Service.HeaterCooler, serviceName);
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
								const newState = await this.melCloudDeviceAta.send(API_URL.SetErv, deviceState, 0);
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
							case 3: //AUTO, OFF
								deviceState.Power = displayMode ? true : false;
								deviceState.OperationMode = displayMode ? 8 : deviceState.OperationMode;
								deviceState.EffectiveFlags = displayMode ? DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode : DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power;
								break;
						};

						try {
							const newState = await this.melCloudDeviceAta.send(API_URL.SetErv, deviceState, 0);
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
								//fan speed mode
								let fanSpeedMode = 0;
								let fanSpeedModeInfo = 0;

								switch (numberOfFanSpeeds) {
									case 2: //Fan speed mode 2
										fanSpeedMode = hasAutomaticFanSpeed ? [0, 1, 2, 0][value] : [1, 1, 2][value]
										fanSpeedModeInfo = hasAutomaticFanSpeed ? [8, 1, 2, 0][value] : [8, 1, 2][value]
										break;
									case 3: //Fan speed mode 3
										fanSpeedMode = hasAutomaticFanSpeed ? [0, 1, 2, 3, 0][value] : [1, 1, 2, 3][value];
										fanSpeedModeInfo = hasAutomaticFanSpeed ? [8, 1, 2, 3, 0][value] : [8, 1, 2, 3][value];
										break;
									case 4: //Fan speed mode 4
										fanSpeedMode = hasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 0][value] : [1, 1, 2, 3, 4][value]
										fanSpeedModeInfo = hasAutomaticFanSpeed ? [8, 1, 2, 3, 4, 0][value] : [8, 1, 2, 3, 4][value]
										break;
									case 5: //Fan speed mode 5
										fanSpeedMode = hasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 0][value] : [1, 1, 2, 3, 4, 5][value]
										fanSpeedModeInfo = hasAutomaticFanSpeed ? [8, 1, 2, 3, 4, 5, 0][value] : [8, 1, 2, 3, 4, 5][value]
										break;
									case 6: //Fan speed mode 6
										fanSpeedMode = hasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 6, 0][value] : [1, 1, 2, 3, 4, 5, 6][value]
										fanSpeedModeInfo = hasAutomaticFanSpeed ? [8, 1, 2, 3, 4, 5, 6, 0][value] : [8, 1, 2, 3, 4, 5, 6][value]
										break;
									case 7: //Fan speed mode 7
										fanSpeedMode = hasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 6, 7, 0][value] : [1, 1, 2, 3, 4, 5, 6, 7][value]
										fanSpeedModeInfo = hasAutomaticFanSpeed ? [8, 1, 2, 3, 4, 5, 6, 7, 0][value] : [8, 1, 2, 3, 4, 5, 6, 7][value]
										break;
								};

								deviceState.Power = true;
								deviceState.SetFanSpeed = fanSpeedMode;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.SetFanSpeed;

								try {
									const newState = await this.melCloudDeviceAta.send(API_URL.SetErv, deviceState, 0);
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
									const newState = await this.melCloudDeviceAta.send(API_URL.SetErv, deviceState, 0);
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
								const newState = await this.melCloudDeviceAta.send(API_URL.SetErv, deviceState, 0);
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
							const newState = await this.melCloudDeviceAta.send(API_URL.SetErv, deviceState, 0);
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
							const newState = await this.melCloudDeviceAta.send(API_URL.SetErv, deviceState, 0);
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
								const newState = await this.melCloudDeviceAta.send(API_URL.SetErv, deviceState, 0);
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

						try {
							const newState = await this.melCloudDeviceAta.send(API_URL.UpdateApplicationOptions, melCloudInfo, 1);
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set temperature display unit: ${CONSTANS.TemperatureDisplayUnits[value]}`);
							this.melCloudInfo = melCloudInfo;
						} catch (error) {
							this.log.error(`${deviceTypeText}: ${accessoryName}, Set temperature display unit error: ${error}`);
						};
					});
				break;
		};

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
				const buttonService = new buttonServiceType(`${accessoryName} ${buttonName}`, `Button ${i}`);
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
							case 31: //FAN SPEED MODE 6
								deviceState.Power = true;
								deviceState.SetFanSpeed = 6;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.SetFanSpeed;
								break;
							case 32: //FAN SPEED MODE 7
								deviceState.Power = true;
								deviceState.SetFanSpeed = 7;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.SetFanSpeed;
								break;
						};

						try {
							const newState = await this.melCloudDeviceAta.send(API_URL.SetAta, deviceState, 0);
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set: ${buttonName}`);
						} catch (error) {
							this.log.error(`${deviceTypeText}: ${accessoryName}, Set button error: ${error}`);
						};
					});

				this.buttonsServices.push(buttonService);
				accessory.addService(this.buttonsServices[i])
			};
		};

		this.startPrepareAccessory = false;
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
		const debug = this.enableDebugMode ? this.log(`${deviceTypeText}: ${accessoryName}, published as external accessory.`) : false;
	};
};