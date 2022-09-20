'use strict';
const path = require('path');
const fs = require('fs');
const Mqtt = require('./src/mqtt.js');
const MelCloud = require('./src/melcloud.js')
const MelCloudAta = require('./src/melcloudata.js');
const MelCloudAtw = require('./src/melcloudatw.js');
const MelCloudErv = require('./src/melclouderv.js');

const PLUGIN_NAME = 'homebridge-melcloud-control';
const PLATFORM_NAME = 'melcloudcontrol';
const CONSTANS = require('./src/constans.json');

let Accessory, Characteristic, Service, Categories, UUID;

module.exports = (api) => {
	Accessory = api.platformAccessory;
	Characteristic = api.hap.Characteristic;
	Service = api.hap.Service;
	Categories = api.hap.Categories;
	UUID = api.hap.uuid;
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
					this.melCloud = new MelCloud({
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
							this.log.error(error);
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
		this.displayMode = account.displayMode || 0;
		this.buttons = account.buttons || [];
		this.enableDevicePresets = account.enableDevicePresets || false;
		this.disableLogInfo = account.disableLogInfo || false;
		this.disableLogDeviceInfo = account.disableLogDeviceInfo || false;
		this.enableDebugMode = account.enableDebugMode || false;
		this.buttonsCount = this.buttons.length;

		const mqttEnabled = account.enableMqtt || false;
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
		this.mqtt = new Mqtt({
			enabled: mqttEnabled,
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
				this.log.error(error);
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

		//melcloud device
		const displayMode = this.displayMode;
		const buttonsCount = this.buttonsCount;
		switch (deviceType) {
			case 0: //air conditioner
				this.melCloudAta = new MelCloudAta({
					name: this.accountName,
					deviceInfo: deviceInfo,
					contextKey: contextKey,
					buildingId: buildingId,
					deviceId: deviceId,
					deviceName: deviceName,
					deviceTypeText: deviceTypeText,
					debugLog: this.enableDebugMode,
					mqttEnabled: mqttEnabled,
					prefDir: prefDir
				});

				this.melCloudAta.on('deviceInfo', (manufacturer, modelIndoor, modelOutdoor, serialNumber, firmwareRevision, presets, presetsCount, hasAutomaticFanSpeed, swingFunction, numberOfFanSpeeds, modelSupportsFanSpeed, modelSupportsStandbyMode) => {
					if (!this.disableLogDeviceInfo && this.displayDeviceInfo) {
						this.log(`---- ${this.deviceTypeText}: ${this.deviceName} ----`);
						this.log(`Account: ${this.accountName}`);
						this.log(`Model: ${modelIndoor}`);
						this.log(`Serial: ${serialNumber}`);
						this.log(`Firmware: ${firmwareRevision}`);
						const outdoorDevice = (modelOutdoor != 'Undefined') ? this.log(`Outdoor: ${modelOutdoor}`) : false;
						this.log(`Manufacturer: ${manufacturer}`);
						this.log('----------------------------------');
						this.displayDeviceInfo = false;
					};

					//accessory info 					
					this.manufacturer = manufacturer;
					this.modelName = modelIndoor;
					this.serialNumber = serialNumber;
					this.firmwareRevision = firmwareRevision;

					//device info
					this.ataHasAutomaticFanSpeed = hasAutomaticFanSpeed;
					this.ataSwingFunction = swingFunction;
					this.ataNumberOfFanSpeeds = numberOfFanSpeeds;
					this.ataModelSupportsFanSpeed = modelSupportsFanSpeed;
					this.ataModelSupportsStandbyMode = modelSupportsStandbyMode;
					this.ataPresets = presets;
					this.ataPresetsCount = this.enableDevicePresets ? presetsCount : 0;
				}).on('deviceState', (deviceState, roomTemperature, setTemperature, setFanSpeed, operationMode, vaneHorizontal, vaneVertical, inStandbyMode, power) => {
					//account info
					const useFahrenheit = this.useFahrenheit;

					//device info
					const hasAutomaticFanSpeed = this.ataHasAutomaticFanSpeed;
					const swingFunction = this.ataSwingFunction;
					const numberOfFanSpeeds = this.ataNumberOfFanSpeeds;
					const modelSupportsFanSpeed = this.ataModelSupportsFanSpeed;
					const modelSupportsStandbyMode = this.ataModelSupportsStandbyMode;
					const presets = this.ataPresets;
					const presetsCount = this.ataPresetsCount;

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
					let fanSpeedSetPropsMaxValue = 0;
					if (modelSupportsFanSpeed) {
						switch (numberOfFanSpeeds) {
							case 2: //Fan speed mode 2
								fanSpeed = hasAutomaticFanSpeed ? [3, 1, 2][setFanSpeed] : [0, 1, 2][setFanSpeed];
								fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 3 : 2;
								break;
							case 3: //Fan speed mode 3
								fanSpeed = hasAutomaticFanSpeed ? [4, 1, 2, 3][setFanSpeed] : [0, 1, 2, 3][setFanSpeed];
								fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 4 : 3;
								break;
							case 4: //Fan speed mode 4
								fanSpeed = hasAutomaticFanSpeed ? [5, 1, 2, 3, 4][setFanSpeed] : [0, 1, 2, 3, 4][setFanSpeed];
								fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 5 : 4;
								break;
							case 5: //Fan speed mode 5
								fanSpeed = hasAutomaticFanSpeed ? [6, 1, 2, 3, 4, 5][setFanSpeed] : [0, 1, 2, 3, 4, 5][setFanSpeed];
								fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 6 : 5;
								break;
							case 6: //Fan speed mode 6
								fanSpeed = hasAutomaticFanSpeed ? [7, 1, 2, 3, 4, 5, 6][setFanSpeed] : [0, 1, 2, 3, 4, 5, 6][setFanSpeed];
								fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 7 : 6;
								break;
							case 7: //Fan speed mode 7
								fanSpeed = hasAutomaticFanSpeed ? [8, 1, 2, 3, 4, 5, 6, 7][setFanSpeed] : [0, 1, 2, 3, 4, 5, 6, 7][setFanSpeed];
								fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 8 : 7;
								break;
							case 8: //Fan speed mode 8
								fanSpeed = hasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 0][setFanSpeed] : [1, 1, 2, 3, 4, 5, 6, 7, 8][setFanSpeed]
								fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 9 : 8;
								break;
						};
					};
					this.fanSpeed = fanSpeed;
					this.fanSpeedSetPropsMaxValue = fanSpeedSetPropsMaxValue;
					this.setFanSpeed = setFanSpeed;

					//swing and vane mode
					const swingMode = swingFunction ? (vaneHorizontal == 12 && vaneVertical == 7) ? 1 : 0 : false;
					this.swingMode = swingMode;
					this.vaneHorizontal = vaneHorizontal;
					this.vaneVertical = vaneVertical;

					//lock physical controls
					const lockPhysicalControls = (deviceState.prohibitSetTemperature == true || deviceState.prohibitOperationMode == true || deviceState.prohibitPower == true) ? 1 : 0;
					this.lockPhysicalControls = lockPhysicalControls;

					if (this.ataMelCloudService) {
						switch (displayMode) {
							case 0: //heater/cooler
								this.ataMelCloudService
									.updateCharacteristic(Characteristic.Active, power)
									.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentOperationMode)
									.updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetOperationMode)
									.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
									.updateCharacteristic(Characteristic.HeatingThresholdTemperature, setTemperature)
									.updateCharacteristic(Characteristic.CoolingThresholdTemperature, setTemperature)
									.updateCharacteristic(Characteristic.LockPhysicalControls, lockPhysicalControls)
									.updateCharacteristic(Characteristic.TemperatureDisplayUnits, useFahrenheit);
								const updateRotationSpeed = modelSupportsFanSpeed ? this.ataMelCloudService.updateCharacteristic(Characteristic.RotationSpeed, fanSpeed) : false;
								const updateSwingMode = swingFunction ? this.ataMelCloudService.updateCharacteristic(Characteristic.SwingMode, swingMode) : false;
								break;
							case 1: //thermostat
								this.ataMelCloudService
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
						this.ataButtonsStates = new Array();
						this.ataButtonsModes = new Array();
						this.ataButtonsNames = new Array();
						this.ataButtonsDisplayType = new Array();

						for (let i = 0; i < buttonsCount; i++) {
							const button = this.buttons[i];
							const buttonMode = button.mode;
							const buttonName = button.name;
							const buttonDisplayType = button.displayType;

							let buttonState = false;
							switch (buttonMode) {
								case 0: //POWER ON,OFF
									buttonState = (power == true);
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 1: //OPERATING MODE HEAT
									buttonState = power ? (operationMode == 1) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 2: //OPERATING MODE DRY
									buttonState = power ? (operationMode == 2) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break
								case 3: //OPERATING MODE COOL
									buttonState = power ? (operationMode == 3) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 4: //OPERATING MODE FAN
									buttonState = power ? (operationMode == 7) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 5: //OPERATING MODE AUTO
									buttonState = power ? (operationMode == 8) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 6: //OPERATING MODE PURIFY
									buttonState = power ? (operationMode == 9) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 10: //WANE H SWING MODE AUTO
									buttonState = power ? (vaneHorizontal == 0) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 11: //WANE H SWING MODE 1
									buttonState = power ? (vaneHorizontal == 1) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 12: //WANE H SWING MODE 2
									buttonState = power ? (vaneHorizontal == 2) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 13: //WANE H SWING MODE 3
									buttonState = power ? (vaneHorizontal == 3) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 14: //WANE H SWING MODE 4
									buttonState = power ? (vaneHorizontal == 4) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 15: //WANE H SWING MODE 5
									buttonState = power ? (vaneHorizontal == 5) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 16: //WANE H SWING MODE SWING
									buttonState = power ? (vaneHorizontal == 12) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 20: //VANE V SWING MODE AUTO
									buttonState = power ? (vaneVertical == 0) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 21: //VANE V SWING MODE 1
									buttonState = power ? (vaneVertical == 1) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 22: //VANE V SWING MODE 2
									buttonState = power ? (vaneVertical == 2) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 23: //VANE V SWING MODE 3
									buttonState = power ? (vaneVertical == 3) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 24: //VANE V SWING MODE 4
									buttonState = power ? (vaneVertical == 4) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 25: //VANE V SWING MODE 5
									buttonState = power ? (vaneVertical == 5) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 26: //VANE V SWING MODE SWING
									buttonState = power ? (vaneVertical == 7) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 30: //FAN SPEED MODE AUTO
									buttonState = power ? (setFanSpeed == 0) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 31: //FAN SPEED MODE 1
									buttonState = power ? (setFanSpeed == 1) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 32: //FAN SPEED MODE 2
									buttonState = power ? (setFanSpeed == 2) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 33: //FAN SPEED MODE 3
									buttonState = power ? (setFanSpeed == 3) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 34: //FAN SPEED MODE 4
									buttonState = power ? (setFanSpeed == 4) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 35: //FAN SPEED  MODE 5
									buttonState = power ? (setFanSpeed == 5) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 36: //FAN SPEED  MODE 6
									buttonState = power ? (setFanSpeed == 6) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 37: //FAN SPEED  MODE 7
									buttonState = power ? (setFanSpeed == 7) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 38: //FAN SPEED  MODE 8
									buttonState = power ? (setFanSpeed == 8) : false;
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
								case 40: //PHYSICAL LOCK CONTROLS
									buttonState = (lockPhysicalControls == 1);
									this.ataButtonsStates.push(buttonState);
									this.ataButtonsModes.push(buttonMode);
									this.ataButtonsNames.push(buttonName);
									this.ataButtonsDisplayType.push(buttonDisplayType);
									break;
							};
						};
						const buttonsCount = this.ataButtonsStates.length;
						this.ataButtonsCount = buttonsCount

						for (let i = 0; i < buttonsCount; i++) {
							const buttonState = this.ataButtonsStates[i];
							if (this.ataButtonsServices) {
								this.ataButtonsServices[i]
									.updateCharacteristic(Characteristic.On, buttonState)
							};
						};

					};

					if (presetsCount > 0) {
						this.ataPresetsStates = new Array();

						for (let i = 0; i < presetsCount; i++) {
							//get preset
							const preset = presets[i];
							const presetState = (preset.Power = power && preset.SetTemperature == setTemperature && preset.OperationMode == operationMode && preset.VaneHorizontal == vaneHorizontal && preset.VaneVertical == vaneVertical && preset.FanSpeed == setFanSpeed) ? true : false;
							this.ataPresetsStates.push(presetState);

							if (this.ataPresetsServices) {
								this.ataPresetsServices[i]
									.updateCharacteristic(Characteristic.On, presetState)
							};
						};
					};

					//start prepare accessory
					if (this.startPrepareAccessory) {
						this.prepareAccessory();
					};
				}).on('error', (error) => {
					this.log.error(error);
				}).on('debug', (message) => {
					this.log(message);
				}).on('message', (message) => {
					this.log(message);
				}).on('mqtt', (topic, message) => {
					this.mqtt.send(topic, message);
				});
				break;
			case 1: //heat pump
				this.melCloudAtw = new MelCloudAtw({
					name: this.accountName,
					deviceInfo: deviceInfo,
					contextKey: contextKey,
					buildingId: buildingId,
					deviceId: deviceId,
					deviceName: deviceName,
					deviceTypeText: deviceTypeText,
					debugLog: this.enableDebugMode,
					mqttEnabled: mqttEnabled,
					prefDir: prefDir
				});

				this.melCloudAtw.on('deviceInfo', (manufacturer, modelIndoor, modelOutdoor, serialNumber, firmwareRevision, presets, presetsCount, zonesCount, hasHotWaterTank, hasZone2, zone1Name, zone2Name) => {
					if (!this.disableLogDeviceInfo && this.displayDeviceInfo) {
						this.log(`---- ${this.deviceTypeText}: ${this.deviceName} ----`);
						this.log(`Account: ${this.accountName}`);
						this.log(`Model: ${modelOutdoor}`);
						this.log(`Serial: ${serialNumber}`);
						this.log(`Firmware: ${firmwareRevision}`);
						const indoorDevice = (modelIndoor != 'Undefined') ? this.log(`Indoor: ${modelIndoor}`) : false;
						this.log(`Hot Water Tank: ${hasHotWaterTank ? 'Yes' : 'No'}`);
						this.log(`Zone 2: ${hasZone2 ? 'Yes' : 'No'}`);
						this.log(`Manufacturer: ${manufacturer}`);
						this.log('----------------------------------');
						this.displayDeviceInfo = false;
					};

					//accessory info 					
					this.manufacturer = manufacturer;
					this.modelName = modelOutdoor;
					this.serialNumber = serialNumber;
					this.firmwareRevision = firmwareRevision;

					//device info
					this.atwZonesCount = zonesCount;
					this.atwHeatPumpName = 'Heat Pump';
					this.atwZone1Name = zone1Name;
					this.atwHasHotWaterTank = hasHotWaterTank;
					this.atwHotWaterName = hasHotWaterTank ? 'Hot Water' : 'No Hot Water';
					this.atwHasZone2 = hasZone2;
					this.atwZone2Name = hasZone2 ? zone2Name : 'No Zone 2';
					this.atwPresets = presets;
					this.atwPresetsCount = this.enableDevicePresets ? presetsCount : 0;
				}).on('deviceState', (deviceState, unitStatus, outdoorTemperature, power, operationMode, holidayMode, operationModeZone1, roomTemperatureZone1, setTemperatureZone1, setHeatFlowTemperatureZone1, setCoolFlowTemperatureZone1, prohibitZone1, idleZone1, forcedHotWaterMode, ecoHotWater, tankWaterTemperature, setTankWaterTemperature, prohibitHotWater, operationModeZone2, roomTemperatureZone2, setTemperatureZone2, setHeatFlowTemperatureZone2, setCoolFlowTemperatureZone2, prohibitZone2, idleZone2) => {
					//account info
					const useFahrenheit = this.useFahrenheit;

					//device info
					const zonesCount = this.atwZonesCount;
					const presets = this.atwPresets;
					const presetsCount = this.atwPresetsCount;

					//device state
					this.deviceState = deviceState;
					this.power = power;

					if (zonesCount > 0) {
						this.currentOperationModes = new Array();
						this.targetOperationModes = new Array();
						this.currentTemperatures = new Array();
						this.targetOperationModesSetPropsMinValue = new Array();
						this.targetOperationModesSetPropsMaxValue = new Array();
						this.targetOperationModesSetPropsValidValue = new Array();
						this.setTemperatures = new Array();
						this.lockPhysicalsControls = new Array();

						for (let i = 0; i < zonesCount; i++) {
							let currentOperationMode = 0;
							let targetOperationMode = 0;
							let targetOperationModeSetPropsMinValue = 0;
							let targetOperationModeSetPropsMaxValue = 3;
							let targetOperationModeSetPropsValidValue = [0, 1, 2, 3];
							let roomTemperature = 0;
							let setTemperature = 0;
							let lockPhysicalControl = 0;
							switch (i) {
								case 0: //Heat Pump - IDLE, HEAT WATER, HEAT ZONES, COOL, DEFROST, STANDBY, LEGIONELLA /// HEAT, COOL
									switch (displayMode) {
										case 0: //Heater Cooler - INACTIVE, IDLE, HEATING, COOLING /// AUTO, HEAT, COOL, OFF
											currentOperationMode = power ? [1, 2, 2, 3, 1, 0, 1][unitStatus] : 0;
											targetOperationMode = power ? [1, 2][operationMode] : 0;
											targetOperationModeSetPropsMinValue = 1;
											targetOperationModeSetPropsMaxValue = 3;
											targetOperationModeSetPropsValidValue = [1, 2, 3];
											lockPhysicalControl = (prohibitZone1 == true && prohibitHotWater == true && prohibitZone2 == true) ? 1 : 0;
											break;
										case 1: //Thermostat - OFF, HEAT, COOL /// OFF, HEAT, COOL, AUTO
											currentOperationMode = power ? [1, 1, 1, 2, 2, 0, 1][unitStatus] : 0;
											targetOperationMode = power ? [1, 2][operationMode] : 0;
											targetOperationModeSetPropsMinValue = 0;
											targetOperationModeSetPropsMaxValue = 2;
											targetOperationModeSetPropsValidValue = [0, 1, 2];
											break;
									};
									roomTemperature = outdoorTemperature;
									setTemperature = 35;
									break;
								case 1: //Zone 1 - HEAT THERMOSTAT, COOL THERMOSTAT, CURVE, HEAT FLOW, COOL FLOW /// ROOM, FLOW, CURVE
									switch (displayMode) {
										case 0: //Heater Cooler - INACTIVE, IDLE, HEATING, COOLING /// AUTO, HEAT, COOL, OFF
											currentOperationMode = power ? idleZone1 ? 1 : [2, 3, 1, 2, 3][operationModeZone1] : 0;
											targetOperationMode = [1, 2, 0, 1, 2][operationModeZone1];
											targetOperationModeSetPropsMinValue = 0;
											targetOperationModeSetPropsMaxValue = 2;
											targetOperationModeSetPropsValidValue = [0, 1, 2];
											lockPhysicalControl = (prohibitZone1 == true) ? 1 : 0;
											break;
										case 1: //Thermostat - OFF, HEAT, COOL /// OFF, HEAT, COOL, AUTO
											currentOperationMode = power ? idleZone1 ? 0 : [1, 2, 2, 1, 2][operationModeZone1] : 0;
											targetOperationMode = power ? [1, 2, 3, 1, 2][operationModeZone1] : 3;
											targetOperationModeSetPropsMinValue = 1;
											targetOperationModeSetPropsMaxValue = 3;
											targetOperationModeSetPropsValidValue = [1, 2, 3];
											break;
									};
									roomTemperature = roomTemperatureZone1;
									setTemperature = setTemperatureZone1;
									break;
								case 2: //Hot Water - AUTO, HEAT NOW
									switch (displayMode) {
										case 0: //Heater Cooler - INACTIVE, IDLE, HEATING, COOLING /// AUTO, HEAT, COOL, OFF
											currentOperationMode = forcedHotWaterMode ? 2 : 1;
											targetOperationMode = forcedHotWaterMode ? 1 : 0;
											targetOperationModeSetPropsMinValue = 0;
											targetOperationModeSetPropsMaxValue = 1;
											targetOperationModeSetPropsValidValue = [0, 1];
											lockPhysicalControl = (prohibitHotWater == true) ? 1 : 0;
											break;
										case 1: //Thermostat - OFF, HEAT, COOL /// OFF, HEAT, COOL, AUTO
											currentOperationMode = forcedHotWaterMode ? 1 : 1;
											targetOperationMode = forcedHotWaterMode ? 1 : 3;
											targetOperationModeSetPropsMinValue = 1;
											targetOperationModeSetPropsMaxValue = 3;
											targetOperationModeSetPropsValidValue = [1, 3];
											break;
									};
									roomTemperature = tankWaterTemperature;
									setTemperature = setTankWaterTemperature;
									break;
								case 3: //Zone 2 - HEAT THERMOSTAT, COOL THERMOSTAT, CURVE, HEAT FLOW, COOL FLOW  /// ROOM, FLOW, CURVE
									switch (displayMode) {
										case 0: //Heater Cooler - INACTIVE, IDLE, HEATING, COOLING /// AUTO, HEAT, COOL
											currentOperationMode = power ? idleZone2 ? 1 : [2, 3, 1, 2, 3][operationModeZone2] : 0;
											targetOperationMode = [1, 2, 0, 1, 2][operationModeZone2];
											targetOperationModeSetPropsMinValue = 1;
											targetOperationModeSetPropsMaxValue = 3;
											targetOperationModeSetPropsValidValue = [1, 2, 3];
											lockPhysicalControl = (prohibitZone2 == true) ? 1 : 0;
											break;
										case 1: //Thermostat - OFF, HEAT, COOL /// OFF, HEAT, COOL, AUTO
											currentOperationMode = power ? idleZone2 ? 0 : [1, 2, 2, 1, 2][operationModeZone2] : 0;
											targetOperationMode = power ? [1, 2, 3, 1, 2][operationModeZone2] : 3;
											targetOperationModeSetPropsMinValue = 1;
											targetOperationModeSetPropsMaxValue = 3;
											targetOperationModeSetPropsValidValue = [1, 2, 3];
											break;
									};
									roomTemperature = roomTemperatureZone2;
									setTemperature = setTemperatureZone2;
									break;
							};
							this.currentOperationModes.push(currentOperationMode);
							this.targetOperationModes.push(targetOperationMode);
							this.targetOperationModesSetPropsMinValue.push(targetOperationModeSetPropsMinValue);
							this.targetOperationModesSetPropsMaxValue.push(targetOperationModeSetPropsMaxValue);
							this.targetOperationModesSetPropsValidValue.push(targetOperationModeSetPropsValidValue);
							this.currentTemperatures.push(roomTemperature);
							this.setTemperatures.push(setTemperature);
							this.lockPhysicalsControls.push(lockPhysicalControl);

							if (this.atwMelCloudServices) {
								switch (displayMode) {
									case 0: //heater/cooler
										this.atwMelCloudServices[i]
											.updateCharacteristic(Characteristic.Active, power)
											.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentOperationMode)
											.updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetOperationMode)
											.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
											.updateCharacteristic(Characteristic.HeatingThresholdTemperature, setTemperature)
											.updateCharacteristic(Characteristic.CoolingThresholdTemperature, setTemperature)
											.updateCharacteristic(Characteristic.LockPhysicalControls, lockPhysicalControl)
											.updateCharacteristic(Characteristic.TemperatureDisplayUnits, useFahrenheit);
										break;
									case 1: //thermostat
										this.atwMelCloudServices[i]
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
						};

						if (buttonsCount > 0) {
							this.atwButtonsStates = new Array();
							this.atwButtonsModes = new Array();
							this.atwButtonsNames = new Array();
							this.atwButtonsDisplayType = new Array();

							for (let i = 0; i < buttonsCount; i++) {
								const button = this.buttons[i];
								const buttonMode = button.mode;
								const buttonName = button.name;
								const buttonDisplayType = button.displayType;

								let buttonState = false;
								switch (buttonMode) {
									case 50: //POWER ON,OFF
										buttonState = (power == true);
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 51: //HEAT PUMP HEAT
										buttonState = power ? (operationMode == 0) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 52: //COOL
										buttonState = power ? (operationMode == 1) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 53: //HOLIDAY
										buttonState = power ? (holidayMode == true) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 60: //ALL ZONES PHYSICAL LOCK CONTROL
										buttonState = power ? (prohibitZone1 == true && prohibitHotWater == true && prohibitZone2 == true) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 70: //HOT WATER AUTO
										buttonState = power ? (forcedHotWaterMode == false) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 71: //ECO
										buttonState = power ? (ecoHotWater == true) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 72: //FORCE HEAT
										buttonState = power ? (forcedHotWaterMode == true) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 80: //PHYSICAL LOCK CONTROL
										buttonState = (prohibitHotWater == true);
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 90: //ZONE 1 ROOM
										buttonState = power ? (operationModeZone1 == 0) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 91: //FLOW
										buttonState = power ? (operationModeZone1 == 1) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 92: //CURVE
										buttonState = power ? (operationModeZone1 == 2) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 100: //PHYSICAL LOCK CONTROL
										buttonState = (prohibitZone1 == true);
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 110: //ZONE 2 ROOM
										buttonState = power ? (operationModeZone2 == 0) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 111: //FLOW
										buttonState = power ? (operationModeZone2 == 1) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 112: //CURVE
										buttonState = power ? (operationModeZone2 == 2) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 120: //PHYSICAL LOCK CONTROL
										buttonState = (prohibitZone2 == true);
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
								};
							};
							const buttonsCount = this.atwButtonsStates.length;
							this.atwButtonsCount = buttonsCount

							for (let i = 0; i < buttonsCount; i++) {
								const buttonState = this.atwButtonsStates[i];
								if (this.atwButtonsServices) {
									this.atwButtonsServices[i]
										.updateCharacteristic(Characteristic.On, buttonState)
								};
							};
						};

						if (presetsCount > 0) {
							this.atwPresetsStates = new Array();

							for (let i = 0; i < presetsCount; i++) {
								//get preset
								const preset = presets[i];
								const presetState = (preset.Power = power && preset.EcoHotWater == ecoHotWater && preset.OperationModeZone1 == operationModeZone1 && preset.OperationModeZone2 == operationModeZone2 && preset.SetTankWaterTemperature == setTankWaterTemperature && preset.SetTemperatureZone1 == setTemperatureZone1 && preset.SetTemperatureZone2 == setTemperatureZone2 && preset.ForcedHotWaterMode == forcedHotWaterMode && preset.SetHeatFlowTemperatureZone1 == setHeatFlowTemperatureZone1 && preset.SetHeatFlowTemperatureZone2 == setHeatFlowTemperatureZone2 && preset.SetCoolFlowTemperatureZone1 == setCoolFlowTemperatureZone1 && preset.SetCoolFlowTemperatureZone2 == setCoolFlowTemperatureZone2) ? true : false;
								this.atwPresetsStates.push(presetState);

								if (this.atwPresetsServices) {
									this.atwPresetsServices[i]
										.updateCharacteristic(Characteristic.On, presetState)
								};
							};
						};

						//start prepare accessory
						if (this.startPrepareAccessory) {
							this.prepareAccessory();
						};
					};
				}).on('error', (error) => {
					this.log.error(error);
				}).on('debug', (message) => {
					this.log(message);
				}).on('message', (message) => {
					this.log(message);
				}).on('mqtt', (topic, message) => {
					this.mqtt.send(topic, message);
				});
				break;
			case 2: //curtain

				break;
			case 3: //energy recovery ventilation
				this.melCloudErv = new MelCloudErv({
					name: this.accountName,
					deviceInfo: deviceInfo,
					contextKey: contextKey,
					buildingId: buildingId,
					deviceId: deviceId,
					deviceName: deviceName,
					deviceTypeText: deviceTypeText,
					debugLog: this.enableDebugMode,
					mqttEnabled: mqttEnabled,
					prefDir: prefDir
				});

				this.melCloudErv.on('deviceInfo', (manufacturer, modelIndoor, modelOutdoor, serialNumber, firmwareRevision, presets, presetsCount, hasAutoVentilationMode, hasBypassVentilationMode, hasAutomaticFanSpeed, numberOfFanSpeeds) => {
					if (!this.disableLogDeviceInfo && this.displayDeviceInfo) {
						this.log(`---- ${this.deviceTypeText}: ${this.deviceName} ----`);
						this.log(`Account: ${this.accountName}`);
						this.log(`Model: ${modelOutdoor}`);
						this.log(`Serial: ${serialNumber}`);
						this.log(`Firmware: ${firmwareRevision}`);
						const indoorDevice = (modelIndoor != 'Undefined') ? this.log(`Indoor: ${modelIndoor}`) : false;
						this.log(`Manufacturer: ${manufacturer}`);
						this.log('----------------------------------');
						this.displayDeviceInfo = false;
					};

					//accessory info 					
					this.manufacturer = manufacturer;
					this.modelName = modelOutdoor;
					this.serialNumber = serialNumber;
					this.firmwareRevision = firmwareRevision;

					//device info
					this.ervHasAutoVentilationMode = hasAutoVentilationMode;
					this.ervHasBypassVentilationMode = hasBypassVentilationMode;
					this.ervHasAutomaticFanSpeed = hasAutomaticFanSpeed;
					this.ervNumberOfFanSpeeds = numberOfFanSpeeds;
					this.ervPresets = presets;
					this.ervPresetsCount = this.enableDevicePresets ? presetsCount : 0;
				}).on('deviceState', (deviceState, power, roomTemperature, supplyTemperature, outdoorTemperature, nightPurgeMode, roomCO2Level, setTemperature, setFanSpeed, operationMode, ventilationMode) => {
					//account info
					const useFahrenheit = this.useFahrenheit;

					//device info
					const hasAutoVentilationMode = this.ervHasAutoVentilationMode;
					const hasBypassVentilationMode = this.ervHasBypassVentilationMode;
					const hasAutomaticFanSpeed = this.ervHasAutomaticFanSpeed;
					const numberOfFanSpeeds = this.ervNumberOfFanSpeeds;
					const presets = this.ervPresets;
					const presetsCount = this.ervPresetsCount;

					//device state
					this.deviceState = deviceState;
					this.power = power;

					//operating mode
					let currentOperationMode = 0;
					let targetOperationMode = 0;
					switch (displayMode) { //0 = RECOVERY, 1 = BYPAS 2 = AUTO
						case 0: //Heater Cooler INACTIVE, IDLE, HEATING, COOLING - current, AUTO, HEAT, COOL, OFF- target
							currentOperationMode = power ? [2, 3, 1][ventilationMode] : 0;
							targetOperationMode = power ? [1, 2, 0][ventilationMode] : 0;
							break;
						case 1: //Thermostat //OFF, HEAT, COOL - current, //OFF, HEAT, COOL, AUTO - target
							currentOperationMode = power ? [1, 2, 2][ventilationMode] : 0;
							targetOperationMode = power ? [3, 1, 2][ventilationMode] : 0;
							break;
					};
					this.currentOperationMode = currentOperationMode;
					this.targetOperationMode = targetOperationMode;

					//roomTemperature
					this.roomTemperature = roomTemperature;
					this.supplyTemperature = supplyTemperature;
					this.outdoorTemperature = outdoorTemperature;
					this.roomCO2Level = roomCO2Level;
					this.setTemperature = setTemperature;

					//fan speed mode
					let fanSpeed = 0; //STOPPED
					let fanSpeedSetPropsMaxValue = 0;

					switch (numberOfFanSpeeds) {
						case 2: //Fan speed mode 2
							fanSpeed = hasAutomaticFanSpeed ? [3, 1, 2][setFanSpeed] : [0, 1, 2][setFanSpeed];
							fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 3 : 2;
							break;
						case 3: //Fan speed mode 3
							fanSpeed = hasAutomaticFanSpeed ? [4, 1, 2, 3][setFanSpeed] : [0, 1, 2, 3][setFanSpeed];
							fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 4 : 3;
							break;
						case 4: //Fan speed mode 4
							fanSpeed = hasAutomaticFanSpeed ? [5, 1, 2, 3, 4][setFanSpeed] : [0, 1, 2, 3, 4][setFanSpeed];
							fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 5 : 4;
							break;
						case 5: //Fan speed mode 5
							fanSpeed = hasAutomaticFanSpeed ? [6, 1, 2, 3, 4, 5][setFanSpeed] : [0, 1, 2, 3, 4, 5][setFanSpeed];
							fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 6 : 5;
							break;
						case 6: //Fan speed mode 6
							fanSpeed = hasAutomaticFanSpeed ? [7, 1, 2, 3, 4, 5, 6][setFanSpeed] : [0, 1, 2, 3, 4, 5, 6][setFanSpeed];
							fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 7 : 6;
							break;
						case 7: //Fan speed mode 7
							fanSpeed = hasAutomaticFanSpeed ? [8, 1, 2, 3, 4, 5, 6, 7][setFanSpeed] : [0, 1, 2, 3, 4, 5, 6, 7][setFanSpeed];
							fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 8 : 7;
							break;
						case 8: //Fan speed mode 8
							fanSpeed = hasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 0][setFanSpeed] : [1, 1, 2, 3, 4, 5, 6, 7, 8][setFanSpeed]
							fanSpeedSetPropsMaxValue = hasAutomaticFanSpeed ? 9 : 8;
							break;
					};
					this.fanSpeed = fanSpeed;
					this.fanSpeedSetPropsMaxValue = fanSpeedSetPropsMaxValue;
					this.setFanSpeed = setFanSpeed;

					//lock physical controls
					const lockPhysicalControls = 0;
					this.lockPhysicalControls = lockPhysicalControls;

					if (this.ervMelCloudService) {
						switch (displayMode) {
							case 0: //heater/cooler
								this.ervMelCloudService
									.updateCharacteristic(Characteristic.Active, power)
									.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentOperationMode)
									.updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetOperationMode)
									.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
									.updateCharacteristic(Characteristic.HeatingThresholdTemperature, setTemperature)
									.updateCharacteristic(Characteristic.CoolingThresholdTemperature, setTemperature)
									.updateCharacteristic(Characteristic.LockPhysicalControls, lockPhysicalControls)
									.updateCharacteristic(Characteristic.TemperatureDisplayUnits, useFahrenheit)
									.updateCharacteristic(Characteristic.RotationSpeed, fanSpeed);
								break;
							case 1: //thermostat
								this.ervMelCloudService
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
						this.ervButtonsStates = new Array();
						this.ervButtonsModes = new Array();
						this.ervButtonsNames = new Array();
						this.ervButtonsDisplayType = new Array();

						for (let i = 0; i < buttonsCount; i++) {
							const button = this.buttons[i];
							const buttonMode = button.mode;
							const buttonName = button.name;
							const buttonDisplayType = button.displayType;

							let buttonState = false;
							switch (buttonMode) {
								case 130: //POWER ON,OFF
									buttonState = (power == true);
									this.ervButtonsStates.push(buttonState);
									this.ervButtonsModes.push(buttonMode);
									this.ervButtonsNames.push(buttonName);
									this.ervButtonsDisplayType.push(buttonDisplayType);
									break;
								case 131: //OPERATION MODE RECOVERY
									buttonState = power ? (ventilationMode == 0) : false;
									this.ervButtonsStates.push(buttonState);
									this.ervButtonsModes.push(buttonMode);
									this.ervButtonsNames.push(buttonName);
									this.ervButtonsDisplayType.push(buttonDisplayType);
									break;
								case 132: //OPERATION MODE BYPAS
									buttonState = power ? (ventilationMode == 1) : false;
									this.ervButtonsStates.push(buttonState);
									this.ervButtonsModes.push(buttonMode);
									this.ervButtonsNames.push(buttonName);
									this.ervButtonsDisplayType.push(buttonDisplayType);
									break;
								case 133: //OPERATION MODE AUTO
									buttonState = power ? (ventilationMode == 2) : false;
									this.ervButtonsStates.push(buttonState);
									this.ervButtonsModes.push(buttonMode);
									this.ervButtonsNames.push(buttonName);
									this.ervButtonsDisplayType.push(buttonDisplayType);
									break;
								case 134: //NIGHT PURGE MODE
									buttonState = power ? (nightPurgeMode == true) : false;
									this.ervButtonsStates.push(buttonState);
									this.ervButtonsModes.push(buttonMode);
									this.ervButtonsNames.push(buttonName);
									this.ervButtonsDisplayType.push(buttonDisplayType);
									break;
								case 140: //FAN SPEED MODE AUTO
									buttonState = power ? (setFanSpeed == 0) : false;
									this.ervButtonsStates.push(buttonState);
									this.ervButtonsModes.push(buttonMode);
									this.ervButtonsNames.push(buttonName);
									this.ervButtonsDisplayType.push(buttonDisplayType);
									break;
								case 141: //FAN SPEED MODE 1
									buttonState = power ? (setFanSpeed == 1) : false;
									this.ervButtonsStates.push(buttonState);
									this.ervButtonsModes.push(buttonMode);
									this.ervButtonsNames.push(buttonName);
									this.ervButtonsDisplayType.push(buttonDisplayType);
									break;
								case 142: //FAN SPEED MODE 2
									buttonState = power ? (setFanSpeed == 2) : false;
									this.ervButtonsStates.push(buttonState);
									this.ervButtonsModes.push(buttonMode);
									this.ervButtonsNames.push(buttonName);
									this.ervButtonsDisplayType.push(buttonDisplayType);
									break;
								case 143: //FAN SPEED MODE 3
									buttonState = power ? (setFanSpeed == 3) : false;
									this.ervButtonsStates.push(buttonState);
									this.ervButtonsModes.push(buttonMode);
									this.ervButtonsNames.push(buttonName);
									this.ervButtonsDisplayType.push(buttonDisplayType);
									break;
								case 144: //FAN SPEED MODE 4
									buttonState = power ? (setFanSpeed == 4) : false;
									this.ervButtonsStates.push(buttonState);
									this.ervButtonsModes.push(buttonMode);
									this.ervButtonsNames.push(buttonName);
									this.ervButtonsDisplayType.push(buttonDisplayType);
									break;
								case 145: //FAN SPEED  MODE 5
									buttonState = power ? (setFanSpeed == 5) : false;
									this.ervButtonsStates.push(buttonState);
									this.ervButtonsModes.push(buttonMode);
									this.ervButtonsNames.push(buttonName);
									this.ervButtonsDisplayType.push(buttonDisplayType);
									break;
								case 146: //FAN SPEED  MODE 6
									buttonState = power ? (setFanSpeed == 6) : false;
									this.ervButtonsStates.push(buttonState);
									this.ervButtonsModes.push(buttonMode);
									this.ervButtonsNames.push(buttonName);
									this.ervButtonsDisplayType.push(buttonDisplayType);
									break;
								case 147: //FAN SPEED  MODE 7
									buttonState = power ? (setFanSpeed == 7) : false;
									this.ervButtonsStates.push(buttonState);
									this.ervButtonsModes.push(buttonMode);
									this.ervButtonsNames.push(buttonName);
									this.ervButtonsDisplayType.push(buttonDisplayType);
									break;
								case 148: //FAN SPEED  MODE 8
									buttonState = power ? (setFanSpeed == 8) : false;
									this.ervButtonsStates.push(buttonState);
									this.ervButtonsModes.push(buttonMode);
									this.ervButtonsNames.push(buttonName);
									this.ervButtonsDisplayType.push(buttonDisplayType);
									break;
								case 150: //PHYSICAL LOCK CONTROLS
									buttonState = (lockPhysicalControls == 1);
									this.ervButtonsStates.push(buttonState);
									this.ervButtonsModes.push(buttonMode);
									this.ervButtonsNames.push(buttonName);
									this.ervButtonsDisplayType.push(buttonDisplayType);
									break;
							};
						};
						const buttonsCount = this.ervButtonsStates.length;
						this.ervButtonsCount = buttonsCount

						for (let i = 0; i < buttonsCount; i++) {
							const buttonState = this.ervButtonsStates[i];
							if (this.ervButtonsServices) {
								this.ervButtonsServices[i]
									.updateCharacteristic(Characteristic.On, buttonState)
							};
						};
					};

					if (presetsCount > 0) {
						this.ervPresetsStates = new Array();

						for (let i = 0; i < presetsCount; i++) {
							//get preset
							const preset = presets[i];
							const presetState = (preset.Power = power && preset.VentilationMode == ventilationMode && preset.FanSpeed == setFanSpeed) ? true : false;
							this.ervPresetsStates.push(presetState);

							if (this.ervPresetsServices) {
								this.ervPresetsServices[i]
									.updateCharacteristic(Characteristic.On, presetState)
							};
						};
					};
					//start prepare accessory
					if (this.startPrepareAccessory) {
						this.prepareAccessory();
					};
				}).on('error', (error) => {
					this.log.error(error);
				}).on('debug', (message) => {
					this.log(message);
				}).on('message', (message) => {
					this.log(message);
				}).on('mqtt', (topic, message) => {
					this.mqtt.send(topic, message);
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
		const displayMode = this.displayMode;

		const manufacturer = this.manufacturer;
		const modelName = this.modelName;
		const serialNumber = this.serialNumber;
		const firmwareRevision = this.firmwareRevision;

		//accessory
		const accessoryName = deviceName;
		const accessoryUUID = UUID.generate(deviceId);
		const accessoryCategory = [Categories.AIR_CONDITIONER, Categories.AIR_HEATER, Categories.OTHER, Categories.FAN][deviceType];
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

		//information service
		this.log.debug('prepareInformationService');
		accessory.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, manufacturer)
			.setCharacteristic(Characteristic.Model, modelName)
			.setCharacteristic(Characteristic.SerialNumber, serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);

		//melcloud services
		switch (deviceType) {
			case 0: //air conditioner
				this.log.debug('prepareMelCloudServiceAta');
				const ataHasAutomaticFanSpeed = this.ataHasAutomaticFanSpeed;
				const ataModelSupportsFanSpeed = this.ataModelSupportsFanSpeed;
				const ataNumberOfFanSpeeds = this.ataNumberOfFanSpeeds
				const ataSwingFunction = this.ataSwingFunction;
				const ataButtonsCount = this.ataButtonsCount;
				const ataPresetsCount = this.ataPresetsCount;
				const ataCurrentModeText = CONSTANS.AirConditioner.CurrentHeaterCoolerThermostat[displayMode];
				const ataTargetModeText = CONSTANS.AirConditioner.TargetHeaterCoolerThermostat[displayMode];

				const ataTargetTempSetPropsMin = this.useFahrenheit ? 50 : 10;
				const ataTargetTempSetPropsMax = this.useFahrenheit ? 95 : 35;
				const ataTargetTempSetPropsStep = this.useFahrenheit ? 1 : 0.5

				const ataServiceName = `${accessoryName} ${deviceTypeText}`;
				this.ataMelCloudService = displayMode ? accessory.addService(Service.Thermostat, ataServiceName) : accessory.addService(Service.HeaterCooler, ataServiceName);
				if (displayMode == 0) {
					//Only for Heater Cooler
					this.ataMelCloudService.getCharacteristic(Characteristic.Active)
						.onGet(async () => {
							const state = this.power;
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Power: ${state ? 'ON' : 'OFF'}`);
							return state;
						})
						.onSet(async (state) => {
							deviceState.Power = state;
							deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power;

							try {
								const newState = await this.melCloudAta.send(CONSTANS.ApiUrls.SetAta, deviceState, 0);
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set power: ${state ? 'ON' : 'OFF'}`);
							} catch (error) {
								this.log.error(`${deviceTypeText}: ${accessoryName}, Set power error: ${error}`);
							};
						});
				};
				this.ataMelCloudService.getCharacteristic(displayMode ? Characteristic.CurrentHeatingCoolingState : Characteristic.CurrentHeaterCoolerState)
					.onGet(async () => {
						//1 = HEAT, 2 = DRY 3 = COOL, 7 = FAN, 8 = AUTO
						const value = this.currentOperationMode;
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Heating cooling mode: ${ataCurrentModeText[value]}`);
						return value;
					});
				this.ataMelCloudService.getCharacteristic(displayMode ? Characteristic.TargetHeatingCoolingState : Characteristic.TargetHeaterCoolerState)
					.onGet(async () => {
						//1 = HEAT, 2 = DRY 3 = COOL, 7 = FAN, 8 = AUTO
						const value = this.targetOperationMode;
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Target heating cooling mode: ${ataTargetModeText[value]}`);
						return value;
					})
					.onSet(async (value) => {
						switch (value) {
							case 0: //OFF, AUTO
								deviceState.Power = displayMode ? false : true;
								deviceState.OperationMode = displayMode ? deviceState.OperationMode : 8;
								deviceState.EffectiveFlags = displayMode ? CONSTANS.AirConditioner.EffectiveFlags.Power : CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
								break;
							case 1: //HEAT
								deviceState.Power = true;
								deviceState.OperationMode = 1;
								deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
								break;
							case 2: //COOL
								deviceState.Power = true;
								deviceState.OperationMode = 3;
								deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
								break;
							case 3: //AUTO, OFF
								deviceState.Power = displayMode ? true : false;
								deviceState.OperationMode = displayMode ? 8 : deviceState.OperationMode;
								deviceState.EffectiveFlags = displayMode ? CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode : CONSTANS.AirConditioner.EffectiveFlags.Power;
								break;
						};

						try {
							const newState = await this.melCloudAta.send(CONSTANS.ApiUrls.SetAta, deviceState, 0);
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set target heating cooling mode: ${ataTargetModeText[value]}`);
						} catch (error) {
							this.log.error(`${deviceTypeText}: ${accessoryName}, Set target heating cooling mode error: ${error}`);
						};
					});
				if (displayMode == 0) {
					//Only for Heater Cooler
					if (ataModelSupportsFanSpeed) {
						this.ataMelCloudService.getCharacteristic(Characteristic.RotationSpeed)
							.setProps({
								minValue: 0,
								maxValue: this.fanSpeedSetPropsMaxValue,
								minStep: 1
							})
							.onGet(async () => {
								//AUTO, 1, 2, 3, 4, 5
								const value = this.fanSpeed;
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Fan speed mode: ${CONSTANS.AirConditioner.SetFanSpeed[this.setFanSpeed]}`);
								return value;
							})
							.onSet(async (value) => {
								//fan speed mode
								let fanSpeedMode = 0;
								let fanSpeedModeInfo = 0;

								switch (ataNumberOfFanSpeeds) {
									case 2: //Fan speed mode 2
										fanSpeedMode = ataHasAutomaticFanSpeed ? [0, 1, 2, 0][value] : [1, 1, 2][value];
										fanSpeedModeInfo = ataHasAutomaticFanSpeed ? [8, 1, 2, 0][value] : [8, 1, 2][value];
										break;
									case 3: //Fan speed mode 3
										fanSpeedMode = ataHasAutomaticFanSpeed ? [0, 1, 2, 3, 0][value] : [1, 1, 2, 3][value];
										fanSpeedModeInfo = ataHasAutomaticFanSpeed ? [8, 1, 2, 3, 0][value] : [8, 1, 2, 3][value];
										break;
									case 4: //Fan speed mode 4
										fanSpeedMode = ataHasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 0][value] : [1, 1, 2, 3, 4][value];
										fanSpeedModeInfo = ataHasAutomaticFanSpeed ? [8, 1, 2, 3, 4, 0][value] : [8, 1, 2, 3, 4][value];
										break;
									case 5: //Fan speed mode 5
										fanSpeedMode = ataHasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 0][value] : [1, 1, 2, 3, 4, 5][value];
										fanSpeedModeInfo = ataHasAutomaticFanSpeed ? [8, 1, 2, 3, 4, 5, 0][value] : [8, 1, 2, 3, 4, 5][value];
										break;
									case 6: //Fan speed mode 6
										fanSpeedMode = ataHasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 6, 0][value] : [1, 1, 2, 3, 4, 5, 6][value];
										fanSpeedModeInfo = ataHasAutomaticFanSpeed ? [8, 1, 2, 3, 4, 5, 6, 0][value] : [8, 1, 2, 3, 4, 5, 6][value];
										break;
									case 7: //Fan speed mode 7
										fanSpeedMode = ataHasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 6, 7, 0][value] : [1, 1, 2, 3, 4, 5, 6, 7][value];
										fanSpeedModeInfo = ataHasAutomaticFanSpeed ? [8, 1, 2, 3, 4, 5, 6, 7, 0][value] : [8, 1, 2, 3, 4, 5, 6, 7][value];
										break;
									case 8: //Fan speed mode 8
										fanSpeedMode = ataHasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 0][value] : [1, 1, 2, 3, 4, 5, 6, 7, 8][value];
										fanSpeedModeInfo = ataHasAutomaticFanSpeed ? [8, 1, 2, 3, 4, 5, 6, 7, 8, 0][value] : [8, 1, 2, 3, 4, 5, 6, 7, 8][value];
										break;
								};

								deviceState.Power = true;
								deviceState.SetFanSpeed = fanSpeedMode;
								deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;

								try {
									const newState = await this.melCloudAta.send(CONSTANS.ApiUrls.SetAta, deviceState, 0);
									const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set fan speed mode: ${CONSTANS.AirConditioner.SetFanSpeed[fanSpeedModeInfo]}`);
								} catch (error) {
									this.log.error(`${deviceTypeText}: ${accessoryName}, Set fan speed mode error: ${error}`);
								};
							});
					};
					if (ataSwingFunction) {
						this.ataMelCloudService.getCharacteristic(Characteristic.SwingMode)
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
								deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;

								try {
									const newState = await this.melCloudAta.send(CONSTANS.ApiUrls.SetAta, deviceState, 0);
									const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set vane swing mode: ${CONSTANS.AirConditioner.SwingMode[swingMode]}`);
								} catch (error) {
									this.log.error(`${deviceTypeText}: ${accessoryName}, Set vane swing mode error: ${error}`);
								};
							});
					};
				};
				this.ataMelCloudService.getCharacteristic(Characteristic.CurrentTemperature)
					.onGet(async () => {
						const value = this.roomTemperature;
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Room temperature: ${value}${temperatureUnit}`);
						return value;
					});
				if (displayMode == 1) {
					//Only for Thermostat
					this.ataMelCloudService.getCharacteristic(Characteristic.TargetTemperature)
						.setProps({
							minValue: ataTargetTempSetPropsMin,
							maxValue: ataTargetTempSetPropsMax,
							minStep: ataTargetTempSetPropsStep
						})
						.onGet(async () => {
							const value = this.setTemperature;
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Target temperature: ${value}${temperatureUnit}`);
							return value;
						})
						.onSet(async (value) => {
							deviceState.Power = true;
							deviceState.SetTemperature = value;
							deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.SetTemperature;

							try {
								const newState = await this.melCloudAta.send(CONSTANS.ApiUrls.SetAta, deviceState, 0);
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set target temperature: ${value}${temperatureUnit}`);
							} catch (error) {
								this.log.error(`${deviceTypeText}: ${accessoryName}, Set target temperature error: ${error}`);
							};
						});
				};
				this.ataMelCloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
					.setProps({
						minValue: ataTargetTempSetPropsMin,
						maxValue: ataTargetTempSetPropsMax,
						minStep: ataTargetTempSetPropsStep
					})
					.onGet(async () => {
						const value = this.setTemperature;
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Heating threshold temperature: ${value}${temperatureUnit}`);
						return value;
					})
					.onSet(async (value) => {
						deviceState.Power = true;
						deviceState.SetTemperature = value;
						deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.SetTemperature;

						try {
							const newState = await this.melCloudAta.send(CONSTANS.ApiUrls.SetAta, deviceState, 0);
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set heating threshold temperature: ${value}${temperatureUnit}`);
						} catch (error) {
							this.log.error(`${deviceTypeText}: ${accessoryName}, Set heating threshold temperature error: ${error}`);
						};
					});
				this.ataMelCloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
					.setProps({
						minValue: ataTargetTempSetPropsMin,
						maxValue: ataTargetTempSetPropsMax,
						minStep: ataTargetTempSetPropsStep
					})
					.onGet(async () => {
						const value = this.setTemperature;
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Cooling threshold temperature: ${value}${temperatureUnit}`);
						return value;
					})
					.onSet(async (value) => {
						deviceState.Power = true;
						deviceState.SetTemperature = value;
						deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.SetTemperature;

						try {
							const newState = await this.melCloudAta.send(CONSTANS.ApiUrls.SetAta, deviceState, 0);
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set cooling threshold temperature: ${value}${temperatureUnit}`);
						} catch (error) {
							this.log.error(`${deviceTypeText}: ${accessoryName}, Set cooling threshold temperature error: ${error}`);
						};
					});
				if (displayMode == 0) {
					//Only for Heater Cooler
					this.ataMelCloudService.getCharacteristic(Characteristic.LockPhysicalControls)
						.onGet(async () => {
							const value = this.lockPhysicalControls;
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Lock physical controls: ${value ? 'LOCKED' : 'UNLOCKED'}`);
							return value;
						})
						.onSet(async (value) => {
							value = value ? true : false;
							deviceState.ProhibitSetTemperature = value;
							deviceState.ProhibitOperationMode = value;
							deviceState.ProhibitPower = value;

							try {
								const newState = await this.melCloudAta.send(CONSTANS.ApiUrls.SetAta, deviceState, 0);
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set locl physical controls: ${value ? 'LOCK' : 'UNLOCK'}`);
							} catch (error) {
								this.log.error(`${deviceTypeText}: ${accessoryName}, Set lock physical controls error: ${error}`);
							};
						});
				};
				this.ataMelCloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
					.onGet(async () => {
						const value = this.useFahrenheit;
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Temperature display unit: ${temperatureUnit}`);
						return value;
					})
					.onSet(async (value) => {
						melCloudInfo.UseFahrenheit = value ? true : false;

						try {
							const newState = await this.melCloudAta.send(CONSTANS.ApiUrls.UpdateApplicationOptions, melCloudInfo, 1);
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set temperature display unit: ${CONSTANS.TemperatureDisplayUnits[value]}`);
							this.melCloudInfo = melCloudInfo;
						} catch (error) {
							this.log.error(`${deviceTypeText}: ${accessoryName}, Set temperature display unit error: ${error}`);
						};
					});

				//buttons services
				if (ataButtonsCount > 0) {
					this.log.debug('prepareButtonsService');
					this.ataButtonsServices = new Array();

					for (let i = 0; i < ataButtonsCount; i++) {
						//get button mode
						const buttonMode = this.ataButtonsModes[i];

						//get button name
						const buttonName = (this.ataButtonsNames[i] != undefined) ? this.ataButtonsNames[i] : buttonMode;

						//get button display type
						const buttonDisplayType = (this.ataButtonsDisplayType[i] != undefined) ? this.ataButtonsDisplayType[i] : 0;

						const buttonServiceType = [Service.Outlet, Service.Switch][buttonDisplayType];
						const buttonService = new buttonServiceType(`${accessoryName} ${buttonName}`, `Button ${i}`);
						buttonService.getCharacteristic(Characteristic.On)
							.onGet(async () => {
								const state = this.ataButtonsStates[i];
								return state;
							})
							.onSet(async (state) => {
								switch (buttonMode) {
									case 0: //POWER ON,OFF
										deviceState.Power = state;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power;
										break;
									case 1: //OPERATING MODE HEAT
										deviceState.Power = true;
										deviceState.OperationMode = 1;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
										break;
									case 2: //OPERATING MODE DRY
										deviceState.Power = true;
										deviceState.OperationMode = 2;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
										break
									case 3: //OPERATING MODE COOL
										deviceState.Power = true;
										deviceState.OperationMode = 3;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
										break;
									case 4: //OPERATING MODE FAN
										deviceState.Power = true;
										deviceState.OperationMode = 7;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
										break;
									case 5: //OPERATING MODE AUTO
										deviceState.Power = true;
										deviceState.OperationMode = 8;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
										break;
									case 6: //OPERATING MODE PURIFY
										deviceState.Power = true;
										deviceState.OperationMode = 9;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
										break;
									case 10: //WANE H SWING MODE AUTO
										deviceState.Power = true;
										deviceState.VaneHorizontal = 0;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal;
										break;
									case 11: //WANE H SWING MODE 1
										deviceState.Power = true;
										deviceState.VaneHorizontal = 1;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal;
										break;
									case 12: //WANE H SWING MODE 2
										deviceState.Power = true;
										deviceState.VaneHorizontal = 2;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal;
										break;
									case 13: //WANE H SWING MODE 3
										deviceState.Power = true;
										deviceState.VaneHorizontal = 3;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal;
										break;
									case 14: //WANE H SWING MODE 4
										deviceState.Power = true;
										deviceState.VaneHorizontal = 4;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal;
										break;
									case 15: //WANE H SWING MODE 5
										deviceState.Power = true;
										deviceState.VaneHorizontal = 5;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal;
										break;
									case 16: //WANE H SWING MODE SWING
										deviceState.Power = true;
										deviceState.VaneHorizontal = 12;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal;
										break;
									case 17: //VANE V SWING MODE AUTO
										deviceState.Power = true;
										deviceState.VaneVertical = 0;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
										break;
									case 20: //VANE V SWING MODE 1
										deviceState.Power = true;
										deviceState.VaneVertical = 1;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
										break;
									case 21: //VANE V SWING MODE 2
										deviceState.Power = true;
										deviceState.VaneVertical = 2;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
										break;
									case 22: //VANE V SWING MODE 3
										deviceState.Power = true;
										deviceState.VaneVertical = 3;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
										break;
									case 23: //VANE V SWING MODE 4
										deviceState.Power = true;
										deviceState.VaneVertical = 4;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
										break;
									case 24: //VANE V SWING MODE 5
										deviceState.Power = true;
										deviceState.VaneVertical = 5;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
										break;
									case 25: //VANE V SWING MODE SWING
										deviceState.Power = true;
										deviceState.VaneVertical = 7;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
										break;
									case 30: //FAN SPEED MODE AUTO
										deviceState.Power = true;
										deviceState.SetFanSpeed = 0;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
										break;
									case 31: //FAN SPEED MODE 1
										deviceState.Power = true;
										deviceState.SetFanSpeed = 1;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
										break;
									case 32: //FAN SPEED MODE 2
										deviceState.Power = true;
										deviceState.SetFanSpeed = 2;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
										break;
									case 33: //FAN SPEED MODE 3
										deviceState.Power = true;
										deviceState.SetFanSpeed = 3;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
										break;
									case 34: //FAN MODE 4
										deviceState.Power = true;
										deviceState.SetFanSpeed = 4;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
										break;
									case 35: //FAN SPEED MODE 5
										deviceState.Power = true;
										deviceState.SetFanSpeed = 5;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
										break;
									case 36: //FAN SPEED MODE 6
										deviceState.Power = true;
										deviceState.SetFanSpeed = 6;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
										break;
									case 37: //FAN SPEED MODE 7
										deviceState.Power = true;
										deviceState.SetFanSpeed = 7;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
										break;
									case 38: //FAN SPEED MODE 8
										deviceState.Power = true;
										deviceState.SetFanSpeed = 8;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
										break
									case 40: //PHYSICAL LOCK CONTROLS
										deviceState.ProhibitSetTemperature = state;
										deviceState.ProhibitOperationMode = state;
										deviceState.ProhibitPower = state;
										break;
								};

								try {
									const newState = await this.melCloudAta.send(CONSTANS.ApiUrls.SetAta, deviceState, 0);
									const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set: ${buttonName}`);
								} catch (error) {
									this.log.error(`${deviceTypeText}: ${accessoryName}, Set button error: ${error}`);
								};
							});

						this.ataButtonsServices.push(buttonService);
						accessory.addService(this.ataButtonsServices[i])
					};
				};

				//presets services
				if (ataPresetsCount > 0) {
					this.log.debug('preparePresetsService');

					this.ataPresetsServices = new Array();
					for (let i = 0; i < ataPresetsCount; i++) {
						//get preset
						const preset = this.ataPresets[i];
						const presetName = preset.NumberDescription;

						const presetService = new Service.Outlet(`${accessoryName} ${presetName}`, `Preset ${i}`);
						presetService.getCharacteristic(Characteristic.On)
							.onGet(async () => {
								const state = this.ataPresetsStates[i];
								return state;
							})
							.onSet(async (state) => {
								state = state ? 1 : 0;
								switch (state) {
									case 1:
										deviceState.Power = preset.Power;
										deviceState.SetTemperature = preset.SetTemperature;
										deviceState.OperationMode = preset.OperationMode;
										deviceState.VaneHorizontal = preset.VaneHorizontal;
										deviceState.VaneVertical = preset.VaneVertical;
										deviceState.SetFanSpeed = preset.FanSpeed;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
										break;
								};

								try {
									const newState = await this.melCloudAta.send(CONSTANS.ApiUrls.SetAta, deviceState, 0);
									const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set: ${presetName}`);
								} catch (error) {
									this.log.error(`${deviceTypeText}: ${accessoryName}, Set preset error: ${error}`);
								};
							});

						this.ataPresetsServices.push(presetService);
						accessory.addService(this.ataPresetsServices[i]);
					};
				};
				break;
			case 1: //heat pump
				const zonesCount = this.atwZonesCount;
				if (zonesCount > 0) {
					this.log.debug('prepareMelCloudServiceAtw');
					this.atwMelCloudServices = new Array();
					const atwButtonsCount = this.atwButtonsCount;
					const atwPresetsCount = this.atwPresetsCount;

					for (let i = 0; i < zonesCount; i++) {
						const heatPump = (i == 0) ? true : false;
						const zone1i2 = (i == 1 || i == 3) ? true : false;
						const hotWater = (i == 2) ? true : false;
						const zoneName = [this.atwHeatPumpName, this.atwZone1Name, this.atwHotWaterName, this.atwZone2Name][i];
						const atwCurrentModeText = [CONSTANS.HeatPump.Status, CONSTANS.HeatPump.ZoneStatus, CONSTANS.HeatPump.OperationHotWater, CONSTANS.HeatPump.ZoneStatus][i];

						const atwTargetTempSetPropsMin = [this.useFahrenheit ? 50 : 10, this.useFahrenheit ? 50 : 10, this.useFahrenheit ? 50 : 10, this.useFahrenheit ? 50 : 10][i];
						const atwTargetTempSetPropsMax = [this.useFahrenheit ? 149 : 65, this.useFahrenheit ? 95 : 35, this.useFahrenheit ? 140 : 60, this.useFahrenheit ? 95 : 35][i];
						const atwTargetTempSetPropsStep = [this.useFahrenheit ? 1 : 0.5, this.useFahrenheit ? 1 : 0.5, this.useFahrenheit ? 1 : 0.5, this.useFahrenheit ? 1 : 0.5][i];

						const atwServiceName = `${accessoryName}: ${zoneName}`;
						const atwMelCloudService = displayMode ? new Service.Thermostat(atwServiceName, atwServiceName + i) : new Service.HeaterCooler(atwServiceName, atwServiceName + i);
						if (displayMode == 0) {
							//Only for Heater Cooler
							atwMelCloudService.getCharacteristic(Characteristic.Active)
								.onGet(async () => {
									const state = this.power;
									const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Power: ${state ? 'ON' : 'OFF'}`);
									return state;
								})
								.onSet(async (state) => {
									switch (i) {
										case 0: //Heat Pump
											deviceState.Power = heatPump ? state : deviceState.Power;
											deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power;
											break;
										case 1: //Zone 1
											//deviceState.Power = state;
											//deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power;
											break;
										case 2: //Heot Water
											//deviceState.Power = state;
											//deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power;
											break;
										case 3: //Zone 2
											//deviceState.Power = state;
											//deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power;
											break;
									};

									try {
										const newState = heatPump ? await this.melCloudAtw.send(CONSTANS.ApiUrls.SetAtw, deviceState, 0) : false;
										const logInfo = (this.disableLogInfo || !heatPump) ? false : this.log(`${deviceTypeText}: ${accessoryName}, ${zoneName}, Set power: ${state ? 'ON' : 'OFF'}`);
									} catch (error) {
										this.log.error(`${deviceTypeText}: ${accessoryName}, Set power error: ${error}`);
									};
								});
						};
						atwMelCloudService.getCharacteristic(displayMode ? Characteristic.CurrentHeatingCoolingState : Characteristic.CurrentHeaterCoolerState)
							.onGet(async () => {
								//Heat Pump - IDLE, HEAT WATER, HEAT ZONES, COOL, DEFROST, STANDBY, LEGIONELLA  / Zone - HEAT, IDLE, COOL / Hot Water - AUTO, HEAT NOW
								const value = this.currentOperationModes[i];
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, ${zoneName}, Heating cooling mode: ${atwCurrentModeText}`);
								return value;
							});
						atwMelCloudService.getCharacteristic(displayMode ? Characteristic.TargetHeatingCoolingState : Characteristic.TargetHeaterCoolerState)
							.setProps({
								minValue: this.targetOperationModesSetPropsMinValue[i],
								maxValue: this.targetOperationModesSetPropsMaxValue[i],
								validValues: this.targetOperationModesSetPropsValidValue[i]
							})
							.onGet(async () => {
								////Heat Pump - HEAT, COOL / Zone - HEAT THERMOSTAT, COOL THERMOSTAT, CURVE, HEAT FLOW, COOL FLOW / Hot Water - AUTO, HEAT NOW
								const value = this.targetOperationModes[i];
								return value;
							})
							.onSet(async (value) => {
								const heatPumpOperationModeHeat = (deviceState.OperationMode == 0);
								switch (i) {
									case 0: //Heat Pump - HEAT, COOL
										switch (value) {
											case 0: //OFF, AUTO
												deviceState.Power = displayMode ? false : true;
												deviceState.OperationMode = deviceState.OperationMode;
												deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
												break;
											case 1: //HEAT
												deviceState.Power = true;
												deviceState.OperationMode = 0;
												deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationMode;
												break;
											case 2: //COOL
												deviceState.Power = true;
												deviceState.OperationMode = 1;
												deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationMode;
												break;
											case 3: //AUTO, OFF
												deviceState.Power = displayMode ? true : false;
												deviceState.OperationMode = deviceState.OperationMode;
												deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
												break;
										};
										break;
									case 1: //Zone 1 - ROOM, FLOW, CURVE
										switch (value) {
											case 0: //OFF, AUTO - CURVE
												deviceState.Power = displayMode ? deviceState.Power : true;
												deviceState.OperationModeZone1 = displayMode ? deviceState.OperationModeZone1 : heatPumpOperationModeHeat ? 2 : deviceState.OperationModeZone1;
												deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
												break;
											case 1: //HEAT - ROOM
												deviceState.Power = true;
												deviceState.OperationModeZone1 = 0;
												deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
												break;
											case 2: //COOL - FLOOW
												deviceState.Power = true;
												deviceState.OperationModeZone1 = 1;
												deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
												break;
											case 3: //AUTO, OFF - CURVE
												deviceState.Power = displayMode ? true : deviceState.Power;
												deviceState.OperationModeZone1 = displayMode ? heatPumpOperationModeHeat ? 2 : deviceState.OperationModeZone1 : deviceState.OperationModeZone1;
												deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.Power;
												break;
										};
										break;
									case 2: //Hot Water - AUTO, HEAT NOW
										switch (value) {
											case 0: //OFF, AUTO
												deviceState.Power = displayMode ? deviceState.Power : true;
												deviceState.ForcedHotWaterMode = false;
												deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
												break;
											case 1: //HEAT
												deviceState.Power = true;
												deviceState.ForcedHotWaterMode = true;
												deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
												break;
											case 2: //COOL
												deviceState.Power = true;
												deviceState.ForcedHotWaterMode = false;
												deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
												break;
											case 3: //AUTO, OFF
												deviceState.Power = displayMode ? true : deviceState.Power;
												deviceState.ForcedHotWaterMode = false;
												deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
												break;
										};
										break;
									case 3: //Zone 2 - ROOM, FLOW, CURVE
										switch (value) {
											case 0: //OFF, AUTO - CURVE
												deviceState.Power = displayMode ? deviceState.Power : true;
												deviceState.OperationModeZone2 = displayMode ? deviceState.OperationModeZone2 : heatPumpOperationModeHeat ? 2 : deviceState.OperationModeZone2;
												deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
												break;
											case 1: //HEAT - ROOM
												deviceState.Power = true;
												deviceState.OperationModeZone2 = 0;
												deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
												break;
											case 2: //COOL - FLOOW
												deviceState.Power = true;
												deviceState.OperationModeZone2 = 1;
												deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
												break;
											case 3: //AUTO, OFF - CURVE
												deviceState.Power = displayMode ? true : deviceState.Power;
												deviceState.OperationModeZone2 = displayMode ? heatPumpOperationModeHeat ? 2 : deviceState.OperationModeZone2 : deviceState.OperationModeZone2;
												deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
												break;
										};
										break;
								};

								try {
									const newState = await this.melCloudAtw.send(CONSTANS.ApiUrls.SetAtw, deviceState, 0);
									const atwTargetModeText = [CONSTANS.HeatPump.OperationMode[deviceState.OperationMode], CONSTANS.HeatPump.ZoneOperation[deviceState.OperationModeZone1], CONSTANS.HeatPump.OperationHotWater[deviceState.ForcedHotWaterMode], CONSTANS.HeatPump.ZoneOperation[deviceState.OperationModeZone2]][i];
									const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, ${zoneName}, Set target heating cooling mode: ${atwTargetModeText}`);
								} catch (error) {
									this.log.error(`${deviceTypeText}: ${accessoryName}, ${zoneName}, Set target heating cooling mode error: ${error}`);
								};
							});
						atwMelCloudService.getCharacteristic(Characteristic.CurrentTemperature)
							.onGet(async () => {
								const value = this.currentTemperatures[i];
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, ${zoneName}, Temperature: ${value}${temperatureUnit}`);
								return value;
							});
						if (displayMode == 1) {
							//Only for Thermostat
							atwMelCloudService.getCharacteristic(Characteristic.TargetTemperature)
								.setProps({
									minValue: atwTargetTempSetPropsMin,
									maxValue: atwTargetTempSetPropsMax,
									minStep: atwTargetTempSetPropsStep
								})
								.onGet(async () => {
									const value = this.setTemperatures[i];
									const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, ${zoneName}, Target temperature: ${value}${temperatureUnit}`);
									return value;
								})
								.onSet(async (value) => {
									switch (i) {
										case 0: //Heat Pump
											//deviceState.SetTemperatureZone1 = value;
											//deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone1;
											break;
										case 1: //Zone 1
											deviceState.SetTemperatureZone1 = value;
											deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone1;
											break;
										case 2: //Hot Water
											deviceState.SetTankWaterTemperature = value;
											deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTankWaterTemperature;
											break;
										case 3: //Zone 2
											deviceState.SetTemperatureZone2 = value;
											deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone2;
											break;
									};

									try {
										const newState = !heatPump ? await this.melCloudAtw.send(CONSTANS.ApiUrls.SetAtw, deviceState, 0) : false;
										const logInfo = (this.disableLogInfo || heatPump) ? false : this.log(`${deviceTypeText}: ${accessoryName}, ${zoneName}, Set target temperature: ${value}${temperatureUnit}`);
									} catch (error) {
										this.log.error(`${deviceTypeText}: ${accessoryName}, ${zoneName}, Set target temperature error: ${error}`);
									};
								});
						};
						atwMelCloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
							.setProps({
								minValue: atwTargetTempSetPropsMin,
								maxValue: atwTargetTempSetPropsMax,
								minStep: atwTargetTempSetPropsStep
							})
							.onGet(async () => {
								const value = this.setTemperatures[i];
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, ${zoneName}, Heating threshold temperature: ${value}${temperatureUnit}`);
								return value;
							})
							.onSet(async (value) => {
								switch (i) {
									case 0: //Heat Pump
										//deviceState.SetTemperatureZone1 = value;
										//deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone1;
										break
									case 1: //Zone 1
										deviceState.SetTemperatureZone1 = value;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone1;
										break;
									case 2: //Hot Water
										deviceState.SetTankWaterTemperature = value;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTankWaterTemperature;
										break;
									case 3: //Zone 2
										deviceState.SetTemperatureZone2 = value;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone2;
										break;
								};

								try {
									const newState = !heatPump ? await this.melCloudAtw.send(CONSTANS.ApiUrls.SetAtw, deviceState, 0) : false;
									const logInfo = (this.disableLogInfo || heatPump) ? false : this.log(`${deviceTypeText}: ${accessoryName}, ${zoneName}, Set heating threshold temperature: ${value}${temperatureUnit}`);
								} catch (error) {
									this.log.error(`${deviceTypeText}: ${accessoryName}, ${zoneName}, Set heating threshold temperature error: ${error}`);
								};
							});
						atwMelCloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
							.setProps({
								minValue: atwTargetTempSetPropsMin,
								maxValue: atwTargetTempSetPropsMax,
								minStep: atwTargetTempSetPropsStep
							})
							.onGet(async () => {
								const value = this.setTemperatures[i];
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, ${zoneName}, Cooling threshold temperature: ${value}${temperatureUnit}`);
								return value;
							})
							.onSet(async (value) => {
								switch (i) {
									case 0: //Heat Pump
										//deviceState.SetTemperatureZone1 = value;
										//deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone1;
										break;
									case 1: //Zone 1
										deviceState.SetTemperatureZone1 = value;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone1;
										break;
									case 2: //Hot Water
										deviceState.SetTankWaterTemperature = value;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTankWaterTemperature;
										break;
									case 3: //Zone 2
										deviceState.SetTemperatureZone2 = value;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone2;
										break;
								};

								try {
									const newState = !heatPump ? await this.melCloudAtw.send(CONSTANS.ApiUrls.SetAtw, deviceState, 0) : false;
									const logInfo = (this.disableLogInfo || heatPump) ? false : this.log(`${deviceTypeText}: ${accessoryName}, ${zoneName}, Set cooling threshold temperature: ${value}${temperatureUnit}`);
								} catch (error) {
									this.log.error(`${deviceTypeText}: ${accessoryName}, ${zoneName}, Set cooling threshold temperature error: ${error}`);
								};
							});
						if (displayMode == 0) {
							//Only for Heater Cooler
							atwMelCloudService.getCharacteristic(Characteristic.LockPhysicalControls)
								.onGet(async () => {
									const value = this.lockPhysicalsControls[i];
									const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, ${zoneName}, Lock physical controls: ${value ? 'LOCKED' : 'UNLOCKED'}`);
									return value;
								})
								.onSet(async (value) => {
									value = value ? true : false;
									switch (i) {
										case 0: //Heat Pump
											deviceState.ProhibitZone1 = value;
											deviceState.ProhibitHotWater = value;
											deviceState.ProhibitZone2 = value;
											break;
										case 1: //Zone 1
											deviceState.ProhibitZone1 = value;
											break;
										case 2: //Hot Water
											deviceState.ProhibitHotWater = value;
											break;
										case 3: //Zone 2
											deviceState.ProhibitZone2 = value;
											break;
									};

									try {
										const newState = await this.melCloudAtw.send(CONSTANS.ApiUrls.SetAtw, deviceState, 0);
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, ${zoneName}, Set lock physical controls: ${value ? 'LOCK' : 'UNLOCK'}`);
									} catch (error) {
										this.log.error(`${deviceTypeText}: ${accessoryName}, ${zoneName}, Set lock physical controls error: ${error}`);
									};
								});
						};
						atwMelCloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
							.onGet(async () => {
								const value = this.useFahrenheit;
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Temperature display unit: ${temperatureUnit}`);
								return value;
							})
							.onSet(async (value) => {
								melCloudInfo.UseFahrenheit = value ? true : false;

								try {
									const newState = await this.melCloudAtw.send(CONSTANS.ApiUrls.UpdateApplicationOptions, melCloudInfo, 1);
									const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set temperature display unit: ${CONSTANS.TemperatureDisplayUnits[value]}`);
									this.melCloudInfo = melCloudInfo;
								} catch (error) {
									this.log.error(`${deviceTypeText}: ${accessoryName}, Set temperature display unit error: ${error}`);
								};
							});
						this.atwMelCloudServices.push(atwMelCloudService);
						accessory.addService(this.atwMelCloudServices[i]);
					};

					//buttons services
					if (atwButtonsCount > 0) {
						this.log.debug('prepareButtonsService');
						this.atwButtonsServices = new Array();

						for (let i = 0; i < atwButtonsCount; i++) {
							//get button mode
							const buttonMode = this.atwButtonsModes[i];

							//get button name
							const buttonName = (this.atwButtonsNames[i] != undefined) ? this.atwButtonsNames[i] : buttonMode;

							//get button display type
							const buttonDisplayType = (this.atwButtonsDisplayType[i] != undefined) ? this.atwButtonsDisplayType[i] : 0;

							const buttonServiceType = [Service.Outlet, Service.Switch][buttonDisplayType];
							const buttonService = new buttonServiceType(`${accessoryName} ${buttonName}`, `Button ${i}`);
							buttonService.getCharacteristic(Characteristic.On)
								.onGet(async () => {
									const state = this.atwButtonsStates[i];
									return state;
								})
								.onSet(async (state) => {
									switch (buttonMode) {
										case 50: //ALL POWER ON,OFF
											deviceState.Power = state;
											deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power;
											break;
										case 51: //HEAT PUMP HEAT
											deviceState.Power = true;
											deviceState.OperationMode = 0;
											deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
											break;
										case 52: //COOL
											deviceState.Power = true;
											deviceState.OperationMode = 1;
											deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
											break;
										case 53: //HOLIDAY
											deviceState.HolidayMode = state;
											break;
										case 60: //ALL ZONES PHYSICAL LOCK CONTROL
											deviceState.ProhibitZone1 = state;
											deviceState.ProhibitHotWater = state;
											deviceState.ProhibitZone2 = state;
											break;
										case 70: //ZONE 1 ROOM
											deviceState.Power = true;
											deviceState.OperationModeZone1 = 0;
											deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
											break;
										case 71: //FLOW
											deviceState.Power = true;
											deviceState.OperationModeZone1 = 1;
											deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
											break;
										case 72: //CURVE
											deviceState.Power = true;
											deviceState.OperationModeZone1 = 2;
											deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
											break;
										case 80: //PHYSICAL LOCK CONTROL
											deviceState.ProhibitZone1 = state;
											break;
										case 90: //HOT WATER AUTO
											deviceState.Power = true;
											deviceState.ForcedHotWaterMode = false;
											deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
											break;
										case 91: //ECO
											deviceState.Power = true;
											deviceState.EcoHotWater = state;
											deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power;
											break;
										case 92: //HEAT FORCE
											deviceState.Power = true;
											deviceState.ForcedHotWaterMode = true;
											deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
											break;
										case 100: //PHYSICAL LOCK CONTROL
											deviceState.ProhibitHotWater = state;
											break;
										case 110: //ZONE 2 ROOM
											deviceState.Power = true;
											deviceState.OperationModeZone2 = 0;
											deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
											break;
										case 111: //FLOW
											deviceState.Power = true;
											deviceState.OperationModeZone2 = 1;
											deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
											break;
										case 112: //CURVE
											deviceState.Power = true;
											deviceState.OperationModeZone2 = 2;
											deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
											break;
										case 120: //PHYSICAL LOCK CONTROL
											deviceState.ProhibitZone2 = state;
											break;
									};

									try {
										const newState = await this.melCloudAtw.send(CONSTANS.ApiUrls.SetAtw, deviceState, 0);
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set: ${buttonName}`);
									} catch (error) {
										this.log.error(`${deviceTypeText}: ${accessoryName}, Set button error: ${error}`);
									};
								});

							this.atwButtonsServices.push(buttonService);
							accessory.addService(this.atwButtonsServices[i])
						};
					};

					//presets services
					if (atwPresetsCount > 0) {
						this.log.debug('preparePresetsService');
						this.atwPresetsServices = new Array();

						for (let i = 0; i < atwPresetsCount; i++) {
							//get preset
							const preset = this.atwPresets[i];
							const presetName = preset.NumberDescription;

							const presetService = new Service.Outlet(`${accessoryName} ${presetName}`, `Preset ${i}`);
							presetService.getCharacteristic(Characteristic.On)
								.onGet(async () => {
									const state = this.atwPresetsStates[i];
									return state;
								})
								.onSet(async (state) => {
									state = state ? 1 : 0;
									switch (state) {
										case 1:
											deviceState.Power = preset.Power;
											deviceState.EcoHotWater = preset.EcoHotWater;
											deviceState.OperationModeZone1 = preset.OperationModeZone1;
											deviceState.OperationModeZone2 = preset.OperationModeZone2;
											deviceState.SetTankWaterTemperature = preset.SetTankWaterTemperature;
											deviceState.SetTemperatureZone1 = preset.SetTemperatureZone1;
											deviceState.SetTemperatureZone2 = preset.SetTemperatureZone2;
											deviceState.ForcedHotWaterMode = preset.ForcedHotWaterMode;
											deviceState.SetHeatFlowTemperatureZone1 = preset.SetHeatFlowTemperatureZone1;
											deviceState.SetHeatFlowTemperatureZone2 = preset.SetHeatFlowTemperatureZone2;
											deviceState.SetCoolFlowTemperatureZone1 = preset.SetCoolFlowTemperatureZone1;
											deviceState.SetCoolFlowTemperatureZone2 = preset.SetCoolFlowTemperatureZone2;
											deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power;
											break;
									};

									try {
										const newState = await this.melCloudAtw.send(CONSTANS.ApiUrls.SetAtw, deviceState, 0);
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set: ${presetName}`);
									} catch (error) {
										this.log.error(`${deviceTypeText}: ${accessoryName}, Set preset error: ${error}`);
									};
								});

							this.atwPresetsServices.push(presetService);
							accessory.addService(this.atwPresetsServices[i]);
						};
					};
				};
				break;
			case 2: //curtain

				break;
			case 3: //ventilation
				this.log.debug('prepareMelCloudServiceErv');
				const ervHasAutomaticFanSpeed = this.ervHasAutomaticFanSpeed;
				const ervNumberOfFanSpeeds = this.ervNumberOfFanSpeeds
				const ervButtonsCount = this.ervButtonsCount;
				const ervPresetsCount = this.ervPresetsCount;
				const ervCurrentModeText = CONSTANS.Ventilation.CurrentHeaterCoolerThermostat[displayMode];
				const ervTargetModeText = CONSTANS.Ventilation.TargetHeaterCoolerThermostat[displayMode];

				const ervTargetTempSetPropsMin = this.useFahrenheit ? 50 : 10;
				const ervTargetTempSetPropsMax = this.useFahrenheit ? 95 : 35;
				const ervTargetTempSetPropsStep = this.useFahrenheit ? 1 : 0.5

				const ervServiceName = `${accessoryName} ${deviceTypeText}`;
				this.ervMelCloudService = displayMode ? accessory.addService(Service.Thermostat, ervServiceName) : accessory.addService(Service.HeaterCooler, ervServiceName);
				if (displayMode == 0) {
					//Only for Heater Cooler
					this.ervMelCloudService.getCharacteristic(Characteristic.Active)
						.onGet(async () => {
							const state = this.power;
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Power: ${state ? 'ON' : 'OFF'}`);
							return state;
						})
						.onSet(async (state) => {
							deviceState.Power = state;
							deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power;

							try {
								const newState = await this.melCloudErv.send(CONSTANS.ApiUrls.SetErv, deviceState, 0);
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set power: ${state ? 'ON' : 'OFF'}`);
							} catch (error) {
								this.log.error(`${deviceTypeText}: ${accessoryName}, Set power error: ${error}`);
							};
						});
				};
				this.ervMelCloudService.getCharacteristic(displayMode ? Characteristic.CurrentHeatingCoolingState : Characteristic.CurrentHeaterCoolerState)
					.onGet(async () => {
						//0 = RECOVERY, 1 = BYPAS 2 = AUTO
						const value = this.currentOperationMode;
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Ventilation mode: ${ervCurrentModeText[value]}`);
						return value;
					});
				this.ervMelCloudService.getCharacteristic(displayMode ? Characteristic.TargetHeatingCoolingState : Characteristic.TargetHeaterCoolerState)
					.onGet(async () => {
						//0 = RECOVERY, 1 = BYPAS 2 = AUTO
						const value = this.targetOperationMode;
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Target ventilation mode: ${ervTargetModeText[value]}`);
						return value;
					})
					.onSet(async (value) => {
						switch (value) {
							case 0: //OFF, AUTO
								deviceState.Power = displayMode ? false : true;
								deviceState.VentilationMode = displayMode ? deviceState.VentilationMode : 2;
								deviceState.EffectiveFlags = displayMode ? CONSTANS.Ventilation.EffectiveFlags.Power : CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
								break;
							case 1: //HEAT - RECOVERY
								deviceState.Power = true;
								deviceState.VentilationMode = 0;
								deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
								break;
							case 2: //COOL - BYPAS
								deviceState.Power = true;
								deviceState.VentilationMode = 1;
								deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
								break;
							case 3: //AUTO, OFF
								deviceState.Power = displayMode ? true : false;
								deviceState.VentilationMode = displayMode ? 2 : deviceState.VentilationMode;
								deviceState.EffectiveFlags = displayMode ? CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode : CONSTANS.Ventilation.EffectiveFlags.Power;
								break;
						};

						try {
							const newState = await this.melCloudErv.send(CONSTANS.ApiUrls.SetErv, deviceState, 0);
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set target ventilation mode: ${ervTargetModeText[value]}`);
						} catch (error) {
							this.log.error(`${deviceTypeText}: ${accessoryName}, Set target ventilation mode error: ${error}`);
						};
					});
				if (displayMode == 0) {
					//Only for Heater Cooler
					this.ervMelCloudService.getCharacteristic(Characteristic.RotationSpeed)
						.setProps({
							minValue: 0,
							maxValue: this.fanSpeedSetPropsMaxValue,
							minStep: 1
						})
						.onGet(async () => {
							//AUTO, 1, 2, 3, 4, 5, 6, 7, 8
							const value = this.fanSpeed;
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Fan speed mode: ${CONSTANS.Ventilation.SetFanSpeed[this.setFanSpeed]}`);
							return value;
						})
						.onSet(async (value) => {
							//fan speed mode
							let fanSpeedMode = 0;
							let fanSpeedModeInfo = 0;

							switch (ervNumberOfFanSpeeds) {
								case 2: //Fan speed mode 2
									fanSpeedMode = ervHasAutomaticFanSpeed ? [0, 1, 2, 0][value] : [1, 1, 2][value];
									fanSpeedModeInfo = ervHasAutomaticFanSpeed ? [8, 1, 2, 0][value] : [8, 1, 2][value];
									break;
								case 3: //Fan speed mode 3
									fanSpeedMode = ervHasAutomaticFanSpeed ? [0, 1, 2, 3, 0][value] : [1, 1, 2, 3][value];
									fanSpeedModeInfo = ervHasAutomaticFanSpeed ? [8, 1, 2, 3, 0][value] : [8, 1, 2, 3][value];
									break;
								case 4: //Fan speed mode 4
									fanSpeedMode = ervHasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 0][value] : [1, 1, 2, 3, 4][value];
									fanSpeedModeInfo = ervHasAutomaticFanSpeed ? [8, 1, 2, 3, 4, 0][value] : [8, 1, 2, 3, 4][value];
									break;
								case 5: //Fan speed mode 5
									fanSpeedMode = ervHasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 0][value] : [1, 1, 2, 3, 4, 5][value];
									fanSpeedModeInfo = ervHasAutomaticFanSpeed ? [8, 1, 2, 3, 4, 5, 0][value] : [8, 1, 2, 3, 4, 5][value];
									break;
								case 6: //Fan speed mode 6
									fanSpeedMode = ervHasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 6, 0][value] : [1, 1, 2, 3, 4, 5, 6][value];
									fanSpeedModeInfo = ervHasAutomaticFanSpeed ? [8, 1, 2, 3, 4, 5, 6, 0][value] : [8, 1, 2, 3, 4, 5, 6][value];
									break;
								case 7: //Fan speed mode 7
									fanSpeedMode = ervHasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 6, 7, 0][value] : [1, 1, 2, 3, 4, 5, 6, 7][value];
									fanSpeedModeInfo = ervHasAutomaticFanSpeed ? [8, 1, 2, 3, 4, 5, 6, 7, 0][value] : [8, 1, 2, 3, 4, 5, 6, 7][value];
									break;
								case 8: //Fan speed mode 8
									fanSpeedMode = ervHasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 0][value] : [1, 1, 2, 3, 4, 5, 6, 7, 8][value];
									fanSpeedModeInfo = ervHasAutomaticFanSpeed ? [8, 1, 2, 3, 4, 5, 6, 7, 8, 0][value] : [8, 1, 2, 3, 4, 5, 6, 7, 8][value];
									break;
							};

							deviceState.Power = true;
							deviceState.SetFanSpeed = fanSpeedMode;
							deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;

							try {
								const newState = await this.melCloudErv.send(CONSTANS.ApiUrls.SetErv, deviceState, 0);
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set fan speed mode: ${CONSTANS.Ventilation.SetFanSpeed[fanSpeedModeInfo]}`);
							} catch (error) {
								this.log.error(`${deviceTypeText}: ${accessoryName}, Set fan speed mode error: ${error}`);
							};
						});
				};
				this.ervMelCloudService.getCharacteristic(Characteristic.CurrentTemperature)
					.onGet(async () => {
						const value = this.roomTemperature;
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Room temperature: ${value}${temperatureUnit}`);
						return value;
					});
				if (displayMode == 1) {
					//Only for Thermostat
					this.ervMelCloudService.getCharacteristic(Characteristic.TargetTemperature)
						.setProps({
							minValue: ervTargetTempSetPropsMin,
							maxValue: ervTargetTempSetPropsMax,
							minStep: ervTargetTempSetPropsStep
						})
						.onGet(async () => {
							const value = this.setTemperature;
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Target temperature: ${value}${temperatureUnit}`);
							return value;
						})
						.onSet(async (value) => {
							deviceState.SetTemperature = value;
							deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.SetTemperature;

							try {
								const newState = await this.melCloudErv.send(CONSTANS.ApiUrls.SetErv, deviceState, 0);
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set target temperature: ${value}${temperatureUnit}`);
							} catch (error) {
								this.log.error(`${deviceTypeText}: ${accessoryName}, Set target temperature error: ${error}`);
							};
						});
				};
				this.ervMelCloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
					.setProps({
						minValue: ervTargetTempSetPropsMin,
						maxValue: ervTargetTempSetPropsMax,
						minStep: ervTargetTempSetPropsStep
					})
					.onGet(async () => {
						const value = this.setTemperature;
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Heating threshold temperature: ${value}${temperatureUnit}`);
						return value;
					})
					.onSet(async (value) => {
						deviceState.SetTemperature = value;
						deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.SetTemperature;

						try {
							const newState = await this.melCloudErv.send(CONSTANS.ApiUrls.SetErv, deviceState, 0);
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set heating threshold temperature: ${value}${temperatureUnit}`);
						} catch (error) {
							this.log.error(`${deviceTypeText}: ${accessoryName}, Set heating threshold temperature error: ${error}`);
						};
					});
				this.ervMelCloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
					.setProps({
						minValue: ervTargetTempSetPropsMin,
						maxValue: ervTargetTempSetPropsMax,
						minStep: ervTargetTempSetPropsStep
					})
					.onGet(async () => {
						const value = this.setTemperature;
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Cooling threshold temperature: ${value}${temperatureUnit}`);
						return value;
					})
					.onSet(async (value) => {
						deviceState.SetTemperature = value;
						deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.SetTemperature;

						try {
							const newState = await this.melCloudErv.send(CONSTANS.ApiUrls.SetErv, deviceState, 0);
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set cooling threshold temperature: ${value}${temperatureUnit}`);
						} catch (error) {
							this.log.error(`${deviceTypeText}: ${accessoryName}, Set cooling threshold temperature error: ${error}`);
						};
					});
				if (displayMode == 0) {
					//Only for Heater Cooler
					this.ervMelCloudService.getCharacteristic(Characteristic.LockPhysicalControls)
						.onGet(async () => {
							const value = this.lockPhysicalControls;
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Lock physical controls: ${value ? 'LOCKED' : 'UNLOCKED'}`);
							return value;
						})
						.onSet(async (value) => {
							value = value ? true : false;
							deviceState.ProhibitSetTemperature = value;
							deviceState.ProhibitOperationMode = value;
							deviceState.ProhibitPower = value;

							try {
								const newState = await this.melCloudErv.send(CONSTANS.ApiUrls.SetErv, deviceState, 0);
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set locl physical controls: ${value ? 'LOCK' : 'UNLOCK'}`);
							} catch (error) {
								this.log.error(`${deviceTypeText}: ${accessoryName}, Set lock physical controls error: ${error}`);
							};
						});
				};
				this.ervMelCloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
					.onGet(async () => {
						const value = this.useFahrenheit;
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Temperature display unit: ${temperatureUnit}`);
						return value;
					})
					.onSet(async (value) => {
						melCloudInfo.UseFahrenheit = value ? true : false;

						try {
							const newState = await this.melCloudErv.send(CONSTANS.ApiUrls.UpdateApplicationOptions, melCloudInfo, 1);
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set temperature display unit: ${CONSTANS.TemperatureDisplayUnits[value]}`);
							this.melCloudInfo = melCloudInfo;
						} catch (error) {
							this.log.error(`${deviceTypeText}: ${accessoryName}, Set temperature display unit error: ${error}`);
						};
					});

				//buttons services
				if (ervButtonsCount > 0) {
					this.log.debug('prepareButtonsService');
					this.ervButtonsServices = new Array();

					for (let i = 0; i < ervButtonsCount; i++) {
						//get button mode
						const buttonMode = this.ervButtonsModes[i];

						//get button name
						const buttonName = (this.ervButtonsNames[i] != undefined) ? this.ervButtonsNames[i] : buttonMode;

						//get button display type
						const buttonDisplayType = (this.ervButtonsDisplayType[i] != undefined) ? this.ervButtonsDisplayType[i] : 0;

						const buttonServiceType = [Service.Outlet, Service.Switch][buttonDisplayType];
						const buttonService = new buttonServiceType(`${accessoryName} ${buttonName}`, `Button ${i}`);
						buttonService.getCharacteristic(Characteristic.On)
							.onGet(async () => {
								const state = this.ervButtonsStates[i];
								return state;
							})
							.onSet(async (state) => {
								switch (buttonMode) {
									case 130: //POWER ON,OFF
										deviceState.Power = state;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power;
										break;
									case 131: //OPERATING MODE RECOVERY
										deviceState.Power = true;
										deviceState.OperationMode = 0;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
										break;
									case 132: //OPERATING MODE BYPAS
										deviceState.Power = true;
										deviceState.OperationMode = 1;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
										break
									case 133: //OPERATING MODE AUTO
										deviceState.Power = true;
										deviceState.OperationMode = 2;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
										break;
									case 134: //NIGHT PURGE MODE
										deviceState.NightPurgeMode = state;
										break;
									case 140: //FAN SPEED MODE AUTO
										deviceState.Power = true;
										deviceState.SetFanSpeed = 0;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
										break;
									case 141: //FAN SPEED MODE 1
										deviceState.Power = true;
										deviceState.SetFanSpeed = 1;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
										break;
									case 142: //FAN SPEED MODE 2
										deviceState.Power = true;
										deviceState.SetFanSpeed = 2;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
										break;
									case 143: //FAN SPEED MODE 3
										deviceState.Power = true;
										deviceState.SetFanSpeed = 3;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
										break;
									case 144: //FAN MODE 4
										deviceState.Power = true;
										deviceState.SetFanSpeed = 4;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
										break;
									case 145: //FAN SPEED MODE 5
										deviceState.Power = true;
										deviceState.SetFanSpeed = 5;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
										break;
									case 146: //FAN SPEED MODE 6
										deviceState.Power = true;
										deviceState.SetFanSpeed = 6;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
										break;
									case 147: //FAN SPEED MODE 7
										deviceState.Power = true;
										deviceState.SetFanSpeed = 7;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
										break;
									case 148: //FAN SPEED MODE 8
										deviceState.Power = true;
										deviceState.SetFanSpeed = 8;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
										break;
									case 150: //PHYSICAL LOCK CONTROLS
										deviceState = deviceState;
										break;
								};

								try {
									const newState = await this.melCloudErv.send(CONSTANS.ApiUrls.SetErv, deviceState, 0);
									const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set: ${buttonName}`);
								} catch (error) {
									this.log.error(`${deviceTypeText}: ${accessoryName}, Set button error: ${error}`);
								};
							});

						this.ervButtonsServices.push(buttonService);
						accessory.addService(this.ervButtonsServices[i]);
					};
				};

				//presets services
				if (ervPresetsCount > 0) {
					this.log.debug('preparePresetsService');
					this.ervPresetsServices = new Array();

					for (let i = 0; i < ervPresetsCount; i++) {
						//get preset
						const preset = this.ervPresets[i];
						const presetName = preset.NumberDescription;

						const presetService = new Service.Outlet(`${accessoryName} ${presetName}`, `Preset ${i}`);
						presetService.getCharacteristic(Characteristic.On)
							.onGet(async () => {
								const state = this.ervPresetsStates[i];
								return state;
							})
							.onSet(async (state) => {
								state = state ? 1 : 0;
								switch (state) {
									case 1:
										deviceState.Power = preset.Power;
										deviceState.VentilationMode = preset.VentilationMode;
										deviceState.SetFanSpeed = preset.FanSpeed;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
										break;
								};

								try {
									const newState = await this.melCloudErv.send(CONSTANS.ApiUrls.SetErv, deviceState, 0);
									const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set: ${presetName}`);
								} catch (error) {
									this.log.error(`${deviceTypeText}: ${accessoryName}, Set preset error: ${error}`);
								};
							});

						this.ervPresetsServices.push(presetService);
						accessory.addService(this.ervPresetsServices[i]);
					};
				};
				break;
		};

		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
		const debug = this.enableDebugMode ? this.log(`${deviceTypeText}: ${accessoryName}, published as external accessory.`) : false;
		this.startPrepareAccessory = false;
	};
};