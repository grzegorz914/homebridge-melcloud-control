'use strict';

const fs = require('fs');
const path = require('path');
const mqtt = require('./src/mqtt.js');
const melCloud = require('./src/melcloud.js')
const melCloudAta = require('./src/melcloudata.js');
const melCloudAtw = require('./src/melcloudatw.js');
const melCloudErv = require('./src/melclouderv.js');

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
		this.displayMode = account.displayMode || 0;
		this.buttons = account.buttons || [];
		this.enableDevicePresets = account.enableDevicePresets || false;
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
				this.melCloudAta = new melCloudAta({
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

				this.melCloudAta.on('deviceInfo', (deviceInfo, manufacturer, modelName, modelName1, serialNumber, firmwareRevision, devicePresets, devicePresetsCount) => {
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
						this.devicePresets = devicePresets;
						this.devicePresetsCount = this.enableDevicePresets ? devicePresetsCount : 0;

						this.manufacturer = manufacturer;
						this.modelName = modelName;
						this.serialNumber = serialNumber;
						this.firmwareRevision = firmwareRevision;
					})
					.on('deviceState', (deviceState, currentTemperature, setTemperature, setFanSpeed, operationMode, vaneHorizontal, vaneVertical, inStandbyMode, power) => {
						//device info
						const hasAutomaticFanSpeed = this.hasAutomaticFanSpeed;
						const swingFunction = this.swingFunction;
						const numberOfFanSpeeds = this.numberOfFanSpeeds;
						const modelSupportsFanSpeed = this.modelSupportsFanSpeed;
						const modelSupportsStandbyMode = this.modelSupportsStandbyMode;
						const useFahrenheit = this.useFahrenheit;

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
						this.currentTemperature = currentTemperature;
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
								case 8: //Fan speed mode 8
									fanSpeedMode = hasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 0][setFanSpeed] : [1, 1, 2, 3, 4, 5, 6, 7, 8][setFanSpeed]
									fanSpeedSetProps = hasAutomaticFanSpeed ? 9 : 8;
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

						if (this.melCloudServiceAta) {
							switch (displayMode) {
								case 0: //heater/cooler
									this.melCloudServiceAta
										.updateCharacteristic(Characteristic.Active, power)
										.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentOperationMode)
										.updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetOperationMode)
										.updateCharacteristic(Characteristic.CurrentTemperature, currentTemperature)
										.updateCharacteristic(Characteristic.HeatingThresholdTemperature, setTemperature)
										.updateCharacteristic(Characteristic.CoolingThresholdTemperature, setTemperature)
										.updateCharacteristic(Characteristic.LockPhysicalControls, lockPhysicalControls)
										.updateCharacteristic(Characteristic.TemperatureDisplayUnits, useFahrenheit);
									const updateRotationSpeed = modelSupportsFanSpeed ? this.melCloudServiceAta.updateCharacteristic(Characteristic.RotationSpeed, fanSpeed) : false;
									const updateSwingMode = swingFunction ? this.melCloudServiceAta.updateCharacteristic(Characteristic.SwingMode, swingMode) : false;
									break;
								case 1: //thermostat
									this.melCloudServiceAta
										.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, currentOperationMode)
										.updateCharacteristic(Characteristic.TargetHeatingCoolingState, targetOperationMode)
										.updateCharacteristic(Characteristic.CurrentTemperature, currentTemperature)
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
									case 33: //FAN SPEED  MODE 8
										buttonState = power ? (setFanSpeed == 8) : false;
										break;
								};
								this.buttonsStates.push(buttonState);

								if (this.buttonsServices) {
									this.buttonsServices[i]
										.updateCharacteristic(Characteristic.On, buttonState)
								};
							};

						};

						if (this.devicePresetsCount > 0) {
							this.devicePresetsStates = new Array();

							for (let i = 0; i < this.devicePresetsCount; i++) {
								//get preset
								const preset = this.devicePresets[i];
								const presetState = (preset.Power = power && preset.SetTemperature == setTemperature && preset.OperationMode == operationMode && preset.VaneHorizontal == vaneHorizontal && preset.VaneVertical == vaneVertical && preset.FanSpeed == setFanSpeed) ? true : false;
								this.devicePresetsStates.push(presetState);

								if (this.presetsServices) {
									this.presetsServices[i]
										.updateCharacteristic(Characteristic.On, presetState)
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
				this.melCloudAtw = new melCloudAtw({
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

				this.melCloudAtw.on('deviceInfo', (deviceInfo, manufacturer, modelName, serialNumber, firmwareRevision, devicePresets, devicePresetsCount) => {
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

						this.devicePresets = devicePresets;
						this.devicePresetsCount = this.enableDevicePresets ? devicePresetsCount : 0;

						//device info
						this.deviceInfo = deviceInfo;
						this.manufacturer = manufacturer;
						this.modelName = modelName;
						this.serialNumber = serialNumber;
						this.firmwareRevision = firmwareRevision;
					})
					.on('deviceState', (deviceState, zonesCount, power, roomTemperatureZone1, setTemperatureZone1, roomTemperatureZone2, setTemperatureZone2, tankWaterTemperature, setTankWaterTemperature, operationMode, operationModeZone1, operationModeZone2) => {
						//device state
						this.deviceState = deviceState;
						this.power = power;
						this.zonesCount = zonesCount;
						const useFahrenheit = this.useFahrenheit;
						const lockPhysicalControls = (deviceState.ProhibitHotWater == true || deviceState.ProhibitHeatingZone1 == true || deviceState.ProhibitHeatingZone2 == true) ? 1 : 0;
						this.lockPhysicalControls = lockPhysicalControls;

						if (zonesCount > 0) {
							this.currentTemperatures = new Array();
							this.setTemperatures = new Array();
							this.currentOperationModes = new Array();
							this.targetOperationModes = new Array();

							for (let i = 0; i < zonesCount; i++) {

								//operating mode
								const mode = [operationModeZone1, operationMode, operationModeZone2][i]
								let currentOperationMode = 0;
								let targetOperationMode = 0;
								switch (displayMode) {
									case 0: //Heater Cooler INACTIVE, IDLE, HEATING, COOLING - current, AUTO, HEAT, COOL - target
										currentOperationMode = power ? inStandby ? 1 : [1, 2, 2, 3, 3, 3, 3, 3, 3][mode] : 0;
										targetOperationMode = power ? [0, 1, 1, 2, 2, 2, 2, 2, 0][mode] : 0;
										break;
									case 1: //Thermostat //OFF, HEAT, COOL - current, //OFF, HEAT, COOL, AUTO - target
										currentOperationMode = power ? inStandby ? 0 : [0, 1, 2, 2, 2, 2, 2, 2, 2][mode] : 0;
										targetOperationMode = power ? [0, 1, 1, 2, 2, 2, 2, 2, 3][mode] : 0;
										break;
								};
								this.currentOperationModes.push(currentOperationMode);
								this.targetOperationModes.push(targetOperationMode);

								//currentTemperature
								const currentTemperature = [roomTemperatureZone1, tankWaterTemperature, roomTemperatureZone2][i];
								const setTemperature = [setTemperatureZone1, setTankWaterTemperature, setTemperatureZone2][i];
								this.currentTemperature = this.currentTemperatures.push(currentTemperature);
								this.setTemperature = this.setTemperature.push(setTemperature);

								if (this.melCloudServicesAtw) {
									switch (displayMode) {
										case 0: //heater/cooler
											this.melCloudServicesAtw[i]
												.updateCharacteristic(Characteristic.Active, power)
												.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentOperationMode)
												.updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetOperationMode)
												.updateCharacteristic(Characteristic.CurrentTemperature, currentTemperature)
												.updateCharacteristic(Characteristic.HeatingThresholdTemperature, setTemperature)
												.updateCharacteristic(Characteristic.CoolingThresholdTemperature, setTemperature)
												.updateCharacteristic(Characteristic.LockPhysicalControls, lockPhysicalControls)
												.updateCharacteristic(Characteristic.TemperatureDisplayUnits, useFahrenheit);
											break;
										case 1: //thermostat
											this.melCloudServicesAtw[i]
												.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, currentOperationMode)
												.updateCharacteristic(Characteristic.TargetHeatingCoolingState, targetOperationMode)
												.updateCharacteristic(Characteristic.CurrentTemperature, currentTemperature)
												.updateCharacteristic(Characteristic.TargetTemperature, setTemperature)
												.updateCharacteristic(Characteristic.HeatingThresholdTemperature, setTemperature)
												.updateCharacteristic(Characteristic.CoolingThresholdTemperature, setTemperature)
												.updateCharacteristic(Characteristic.TemperatureDisplayUnits, useFahrenheit);
											break;
									};
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
										case 10: //PHYSICAL LOCK CONTROLS
											buttonState = (lockPhysicalControls == 1);
											break;
										case 40: //HEAT THERMOSTAT
											buttonState = power ? (operationMode == 0) : false;
											break;
										case 41: //COOL THERMOSTAT
											buttonState = power ? (operationMode == 1) : false;
											break;
										case 42: //HEAT FLOW
											buttonState = power ? (operationMode == 2) : false;
											break;
										case 43: //COOL FLOW
											buttonState = power ? (operationMode == 3) : false;
											break;
										case 44: //CURVE
											buttonState = power ? (operationMode == 4) : false;
											break;
										case 45: //UNKNOWN
											buttonState = power ? (operationMode == 5) : false;
											break;
										case 50: //HEAT THERMOSTAT
											buttonState = power ? (operationModeZone1 == 0) : false;
											break;
										case 51: //COOL THERMOSTAT
											buttonState = power ? (operationModeZone1 == 1) : false;
											break;
										case 52: //HEAT FLOW
											buttonState = power ? (operationModeZone1 == 2) : false;
											break;
										case 53: //COOL FLOW
											buttonState = power ? (operationModeZone1 == 3) : false;
											break;
										case 54: //CURVE
											buttonState = power ? (operationModeZone1 == 4) : false;
											break;
										case 55: //UNKNOWN
											buttonState = power ? (operationModeZone1 == 5) : false;
											break;
										case 60: //HEAT THERMOSTAT
											buttonState = power ? (operationModeZone2 == 0) : false;
											break;
										case 61: //COOL THERMOSTAT
											buttonState = power ? (operationModeZone2 == 1) : false;
											break;
										case 62: //HEAT FLOW
											buttonState = power ? (operationModeZone2 == 2) : false;
											break;
										case 63: //COOL FLOW
											buttonState = power ? (operationModeZone2 == 3) : false;
											break;
										case 64: //CURVE
											buttonState = power ? (operationModeZone2 == 4) : false;
											break;
										case 65: //UNKNOWN
											buttonState = power ? (operationModeZone2 == 5) : false;
											break;
									};
									this.buttonsStates.push(buttonState);

									if (this.buttonsServices) {
										this.buttonsServices[i]
											.updateCharacteristic(Characteristic.On, buttonState)
									};
								};
							};

							if (this.devicePresetsCount > 0) {
								this.devicePresetsStates = new Array();

								for (let i = 0; i < this.devicePresetsCount; i++) {
									//get preset
									const preset = this.devicePresets[i];
									const presetState = (preset.Power = power && preset.SetTemperature == setTemperature && preset.OperationMode == operationMode) ? true : false;
									this.devicePresetsStates.push(presetState);

									if (this.presetsServices) {
										this.presetsServices[i]
											.updateCharacteristic(Characteristic.On, presetState)
									};
								};
							};

							//start prepare accessory
							if (this.startPrepareAccessory) {
								this.prepareAccessory();
							};
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
				this.melCloudAtw = new melCloudErv({
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

				this.melCloudErv.on('deviceInfo', (deviceInfo, manufacturer, modelName, modelName1, serialNumber, firmwareRevision, devicePresets, devicePresetsCount) => {
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
						this.devicePresets = devicePresets;
						this.devicePresetsCount = this.enableDevicePresets ? devicePresetsCount : 0;

						this.manufacturer = manufacturer;
						this.modelName = modelName;
						this.serialNumber = serialNumber;
						this.firmwareRevision = firmwareRevision;
					})
					.on('deviceState', (deviceState, power, currentTemperature, supplyTemperature, outdoorTemperature, roomCO2Level, setTemperature, setFanSpeed, operationMode, ventilationMode) => {
						//device info
						const modelSupportsFanSpeed = this.modelSupportsFanSpeed;
						const hasAutomaticFanSpeed = this.hasAutomaticFanSpeed;
						const numberOfFanSpeeds = this.numberOfFanSpeeds;
						const useFahrenheit = this.useFahrenheit;

						//device state
						this.deviceState = deviceState;
						this.power = power;

						//operating mode
						let currentOperationMode = 0;
						let targetOperationMode = 0;
						switch (displayMode) {
							case 0: //Heater Cooler INACTIVE, IDLE, HEATING, COOLING - current, AUTO, HEAT, COOL - target
								currentOperationMode = power ? inStandby ? 1 : [2, 3, 1][operationMode] : 0;
								targetOperationMode = power ? [2, 1, 0][operationMode] : 0;
								break;
							case 1: //Thermostat //OFF, HEAT, COOL - current, //OFF, HEAT, COOL, AUTO - target
								currentOperationMode = power ? inStandby ? 0 : [1, 2, 2][operationMode] : 0;
								targetOperationMode = power ? [1, 2, 3][operationMode] : 0;
								break;
						};
						this.currentOperationMode = currentOperationMode;
						this.targetOperationMode = targetOperationMode;

						//ventilation mode
						this.ventilationMode = ventilationMode;

						//currentTemperature
						this.currentTemperature = currentTemperature;
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
								case 8: //Fan speed mode 8
									fanSpeedMode = hasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 0][setFanSpeed] : [1, 1, 2, 3, 4, 5, 6, 7, 8][setFanSpeed]
									fanSpeedSetProps = hasAutomaticFanSpeed ? 9 : 8;
									break;
							};
						};
						this.fanSpeed = fanSpeed;
						this.fanSpeedSetProps = fanSpeedSetProps;
						this.fanSpeedModeInfoGet = setFanSpeed;

						if (this.melCloudServiceErv) {
							switch (displayMode) {
								case 0: //heater/cooler
									this.melCloudServiceErv
										.updateCharacteristic(Characteristic.Active, power)
										.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentOperationMode)
										.updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetOperationMode)
										.updateCharacteristic(Characteristic.CurrentTemperature, currentTemperature)
										.updateCharacteristic(Characteristic.HeatingThresholdTemperature, setTemperature)
										.updateCharacteristic(Characteristic.CoolingThresholdTemperature, setTemperature)
										.updateCharacteristic(Characteristic.LockPhysicalControls, lockPhysicalControls)
										.updateCharacteristic(Characteristic.TemperatureDisplayUnits, useFahrenheit);
									const updateRotationSpeed = modelSupportsFanSpeed ? this.melCloudServiceErv.updateCharacteristic(Characteristic.RotationSpeed, fanSpeed) : false;
									break;
								case 1: //thermostat
									this.melCloudServiceErv
										.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, currentOperationMode)
										.updateCharacteristic(Characteristic.TargetHeatingCoolingState, targetOperationMode)
										.updateCharacteristic(Characteristic.CurrentTemperature, currentTemperature)
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
									case 10: //PHYSICAL LOCK CONTROLS
										buttonState = (lockPhysicalControls == 1);
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
									case 33: //FAN SPEED  MODE 8
										buttonState = power ? (setFanSpeed == 8) : false;
										break;
									case 70: //OPERATION MODE RECOVERY
										buttonState = power ? (operationMode == 0) : false;
										break;
									case 71: //OPERATION MODE BYPAS
										buttonState = power ? (operationMode == 1) : false;
										break;
									case 72: //OPERATION MODE AUTO
										buttonState = power ? (operationMode == 2) : false;
										break;
								};
								this.buttonsStates.push(buttonState);

								if (this.buttonsServices) {
									this.buttonsServices[i]
										.updateCharacteristic(Characteristic.On, buttonState)
								};
							};

						};

						if (this.devicePresetsCount > 0) {
							this.devicePresetsStates = new Array();

							for (let i = 0; i < this.devicePresetsCount; i++) {
								//get preset
								const preset = this.devicePresets[i];
								const presetState = (preset.Power = power && preset.SetTemperature == setTemperature && preset.OperationMode == operationMode && preset.FanSpeed == setFanSpeed) ? true : false;
								this.devicePresetsStates.push(presetState);

								if (this.presetsServices) {
									this.presetsServices[i]
										.updateCharacteristic(Characteristic.On, presetState)
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
		const currentModeText = CONSTANS.CurrentHeaterCoolerThermostat[displayMode];
		const targetModeText = CONSTANS.TargetHeaterCoolerThermostat[displayMode];

		//accessory
		const accessoryName = deviceName;
		const accessoryUUID = UUID.generate(deviceId);
		const accessoryCategory = [Categories.AIR_CONDITIONER, Categories.AIR_HEATER, Categories.OTHER, Categories.FAN][deviceType];
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);
		const buttonsCount = this.buttons.length;

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
				const ataServiceName = `${accessoryName} ${deviceTypeText}`;
				this.melCloudServiceAta = displayMode ? accessory.addService(Service.Thermostat, ataServiceName) : accessory.addService(Service.HeaterCooler, ataServiceName);
				if (displayMode == 0) {
					//Only for Heater Cooler
					this.melCloudServiceAta.getCharacteristic(Characteristic.Active)
						.onGet(async () => {
							const state = this.power;
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Power: ${state?'ON':'OFF'}`);
							return state;
						})
						.onSet(async (state) => {
							deviceState.Power = state;
							deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power;

							try {
								const newState = await this.melCloudAta.send(CONSTANS.ApiUrls.SetAta, deviceState, 0);
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set power: ${state?'ON':'OFF'}`);
							} catch (error) {
								this.log.error(`${deviceTypeText}: ${accessoryName}, Set power error: ${error}`);
							};
						});
				};
				this.melCloudServiceAta.getCharacteristic(displayMode ? Characteristic.CurrentHeatingCoolingState : Characteristic.CurrentHeaterCoolerState)
					.onGet(async () => {
						//1 = HEAT, 2 = DRY 3 = COOL, 7 = FAN, 8 = AUTO
						const value = this.currentOperationMode;
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Heating cooling mode: ${currentModeText[value]}`);
						return value;
					});
				this.melCloudServiceAta.getCharacteristic(displayMode ? Characteristic.TargetHeatingCoolingState : Characteristic.TargetHeaterCoolerState)
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
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set target heating cooling mode: ${targetModeText[value]}`);
						} catch (error) {
							this.log.error(`${deviceTypeText}: ${accessoryName}, Set target heating cooling mode error: ${error}`);
						};
					});
				if (displayMode == 0) {
					//Only for Heater Cooler
					if (modelSupportsFanSpeed) {
						this.melCloudServiceAta.getCharacteristic(Characteristic.RotationSpeed)
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
									case 8: //Fan speed mode 8
										fanSpeedMode = hasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 0][value] : [1, 1, 2, 3, 4, 5, 6, 7, 8][value]
										fanSpeedModeInfo = hasAutomaticFanSpeed ? [8, 1, 2, 3, 4, 5, 6, 7, 8, 0][value] : [8, 1, 2, 3, 4, 5, 6, 7, 8][value]
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
					if (swingFunction) {
						this.melCloudServiceAta.getCharacteristic(Characteristic.SwingMode)
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
				this.melCloudServiceAta.getCharacteristic(Characteristic.CurrentTemperature)
					.onGet(async () => {
						const value = this.currentTemperature;
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Room temperature: ${value}${temperatureUnit}`);
						return value;
					});
				if (displayMode == 1) {
					//Only for Thermostat
					this.melCloudServiceAta.getCharacteristic(Characteristic.TargetTemperature)

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
				this.melCloudServiceAta.getCharacteristic(Characteristic.HeatingThresholdTemperature)
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
						deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.SetTemperature;

						try {
							const newState = await this.melCloudAta.send(CONSTANS.ApiUrls.SetAta, deviceState, 0);
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set heating threshold temperature: ${value}${temperatureUnit}`);
						} catch (error) {
							this.log.error(`${deviceTypeText}: ${accessoryName}, Set heating threshold temperature error: ${error}`);
						};
					});
				this.melCloudServiceAta.getCharacteristic(Characteristic.CoolingThresholdTemperature)
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
					this.melCloudServiceAta.getCharacteristic(Characteristic.LockPhysicalControls)
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
								const newState = await this.melCloudAta.send(CONSTANS.ApiUrls.SetAta, deviceState, 0);
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set locl physical controls: ${value ? 'LOCK':'UNLOCK'}`);
							} catch (error) {
								this.log.error(`${deviceTypeText}: ${accessoryName}, Set lock physical controls error: ${error}`);
							};
						});
				};
				this.melCloudServiceAta.getCharacteristic(Characteristic.TemperatureDisplayUnits)
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
									case 7: //OPERATING MODE FAN
										deviceState.Power = true;
										deviceState.OperationMode = 7;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
										break;
									case 8: //OPERATING MODE AUTO
										deviceState.Power = true;
										deviceState.OperationMode = 8;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
										break;
									case 9: //OPERATING MODE PURIFY
										deviceState.Power = true;
										deviceState.OperationMode = 9;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
										break;
									case 10: //PHYSICAL LOCK CONTROLS
										deviceState.ProhibitSetTemperature = state;
										deviceState.ProhibitOperationMode = state;
										deviceState.ProhibitPower = state;
										break;
									case 11: //WANE H SWING MODE AUTO
										deviceState.Power = true;
										deviceState.VaneHorizontal = 0;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal;
										break;
									case 12: //WANE H SWING MODE 1
										deviceState.Power = true;
										deviceState.VaneHorizontal = 1;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal;
										break;
									case 13: //WANE H SWING MODE 2
										deviceState.Power = true;
										deviceState.VaneHorizontal = 2;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal;
										break;
									case 14: //WANE H SWING MODE 3
										deviceState.Power = true;
										deviceState.VaneHorizontal = 3;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal;
										break;
									case 15: //WANE H SWING MODE 4
										deviceState.Power = true;
										deviceState.VaneHorizontal = 4;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal;
										break;
									case 16: //WANE H SWING MODE 5
										deviceState.Power = true;
										deviceState.VaneHorizontal = 5;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal;
										break;
									case 17: //WANE H SWING MODE SWING
										deviceState.Power = true;
										deviceState.VaneHorizontal = 12;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal;
										break;
									case 18: //VANE V SWING MODE AUTO
										deviceState.Power = true;
										deviceState.VaneVertical = 0;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
										break;
									case 19: //VANE V SWING MODE 1
										deviceState.Power = true;
										deviceState.VaneVertical = 1;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
										break;
									case 20: //VANE V SWING MODE 2
										deviceState.Power = true;
										deviceState.VaneVertical = 2;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
										break;
									case 21: //VANE V SWING MODE 3
										deviceState.Power = true;
										deviceState.VaneVertical = 3;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
										break;
									case 22: //VANE V SWING MODE 4
										deviceState.Power = true;
										deviceState.VaneVertical = 4;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
										break;
									case 23: //VANE V SWING MODE 5
										deviceState.Power = true;
										deviceState.VaneVertical = 5;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
										break;
									case 24: //VANE V SWING MODE SWING
										deviceState.Power = true;
										deviceState.VaneVertical = 7;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
										break;
									case 25: //FAN SPEED MODE AUTO
										deviceState.Power = true;
										deviceState.SetFanSpeed = 0;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
										break;
									case 26: //FAN SPEED MODE 1
										deviceState.Power = true;
										deviceState.SetFanSpeed = 1;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
										break;
									case 27: //FAN SPEED MODE 2
										deviceState.Power = true;
										deviceState.SetFanSpeed = 2;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
										break;
									case 28: //FAN SPEED MODE 3
										deviceState.Power = true;
										deviceState.SetFanSpeed = 3;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
										break;
									case 29: //FAN MODE 4
										deviceState.Power = true;
										deviceState.SetFanSpeed = 4;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
										break;
									case 30: //FAN SPEED MODE 5
										deviceState.Power = true;
										deviceState.SetFanSpeed = 5;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
										break;
									case 31: //FAN SPEED MODE 6
										deviceState.Power = true;
										deviceState.SetFanSpeed = 6;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
										break;
									case 32: //FAN SPEED MODE 7
										deviceState.Power = true;
										deviceState.SetFanSpeed = 7;
										deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
										break;
								};

								try {
									const newState = await this.melCloudAta.send(CONSTANS.ApiUrls.SetAta, deviceState, 0);
									const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set: ${buttonName}`);
								} catch (error) {
									this.log.error(`${deviceTypeText}: ${accessoryName}, Set button error: ${error}`);
								};
							});

						this.buttonsServices.push(buttonService);
						accessory.addService(this.buttonsServices[i])
					};
				};

				//presets services
				if (this.devicePresetsCount > 0) {
					this.log.debug('preparePresetsService');

					this.presetsServices = new Array();
					for (let i = 0; i < this.devicePresetsCount; i++) {
						//get preset
						const preset = this.devicePresets[i];
						const presetName = preset.NumberDescription;
						const power = preset.Power;
						const setTemperature = preset.SetTemperature;
						const operationMode = preset.OperationMode;
						const vaneHorizontal = preset.VaneHorizontal;
						const vaneVertical = preset.VaneVertical;
						const fanSpeed = preset.FanSpeed;

						const presetService = new Service.Outlet(`${accessoryName} ${presetName}`, `Preset ${i}`);
						presetService.getCharacteristic(Characteristic.On)
							.onGet(async () => {
								const state = this.devicePresetsStates[i];
								return state;
							})
							.onSet(async (state) => {
								state = state ? 1 : 0;
								switch (state) {
									case 1:
										deviceState.Power = power;
										deviceState.SetTemperature = setTemperature;
										deviceState.OperationMode = operationMode;
										deviceState.VaneHorizontal = vaneHorizontal;
										deviceState.VaneVertical = vaneVertical;
										deviceState.FanSpeed = fanSpeed;
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

						this.presetsServices.push(presetService);
						accessory.addService(this.presetsServices[i]);
					};
				};
				break;
			case 1: //heat pump
				if (this.zonesCount > 0) {
					this.log.debug('prepareMelCloudServiceAtw');
					this.melCloudServicesAtw = new Array();
					const hetPumpZone = CONSTANS.HeatPump.Zones[i];
					const heatPumpOperationMode = [CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.operationModeZone1, CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode, CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.operationModeZone2][i];
					const heatPumpSetTemperature = [CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone1, CONSTANS.HeatPump.EffectiveFlags.SetTankWaterTemperature, CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone2][i];
					const atwServiceName = (accessoryName + ' ' + hetPumpZone);

					for (let i = 0; i < this.zonesCount; i++) {
						const melCloudServiceAtw = displayMode ? new Service.Thermostat(atwServiceName, atwServiceName + i) : new Service.HeaterCooler(atwServiceName, atwServiceName + i);
						if (displayMode == 0) {
							//Only for Heater Cooler
							this.melCloudServiceErv.getCharacteristic(Characteristic.Active)
								.onGet(async () => {
									const state = this.power;
									const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Power: ${state?'ON':'OFF'}`);
									return state;
								})
								.onSet(async (state) => {
									deviceState.Power = state;
									deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power;

									try {
										const newState = await this.melCloudAtw.send(CONSTANS.ApiUrls.SetAtw, deviceState, 0);
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set power: ${state?'ON':'OFF'}`);
									} catch (error) {
										this.log.error(`${deviceTypeText}: ${accessoryName}, Set power error: ${error}`);
									};
								});
						};
						melCloudServiceAtw.getCharacteristic(displayMode ? Characteristic.CurrentHeatingCoolingState : Characteristic.CurrentHeaterCoolerState)
							.onGet(async () => {
								//1 = HEAT, 2 = DRY 3 = COOL, 7 = FAN, 8 = AUTO
								const value = this.currentOperationModes[i];
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, ${hetPumpZone}, Heating cooling mode: ${currentModeText[value]}`);
								return value;
							});
						melCloudServiceAtw.getCharacteristic(displayMode ? Characteristic.TargetHeatingCoolingState : Characteristic.TargetHeaterCoolerState)
							.onGet(async () => {
								//1 = HEAT, 2 = DRY 3 = COOL, 7 = FAN, 8 = AUTO
								const value = this.targetOperationModes[i];
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, ${hetPumpZone}, Target heating cooling mode: ${targetModeText[value]}`);
								return value;
							})
							.onSet(async (value) => {
								switch (value) {
									case 0: //OFF, AUTO
										deviceState.Power = displayMode ? false : true;
										deviceState.OperationMode = displayMode ? deviceState.OperationMode : 8;
										deviceState.EffectiveFlags = displayMode ? CONSTANS.HeatPump.EffectiveFlags.Power : heatPumpOperationMode;
										break;
									case 1: //HEAT
										deviceState.Power = true;
										deviceState.OperationMode = 1;
										deviceState.EffectiveFlags = heatPumpOperationMode;
										break;
									case 2: //COOL
										deviceState.Power = true;
										deviceState.OperationMode = 3;
										deviceState.EffectiveFlags = heatPumpOperationMode;
										break;
									case 3: //AUTO, OFF
										deviceState.Power = displayMode ? true : false;
										deviceState.OperationMode = displayMode ? 8 : deviceState.OperationMode;
										deviceState.EffectiveFlags = displayMode ? heatPumpOperationMode : CONSTANS.HeatPump.EffectiveFlags.Power;
										break;
								};

								try {
									const newState = await this.melCloudAtw.send(CONSTANS.ApiUrls.SetAtw, deviceState, 0);
									const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, ${hetPumpZone}, Set target heating cooling mode: ${targetModeText[value]}`);
								} catch (error) {
									this.log.error(`${deviceTypeText}: ${accessoryName}, ${hetPumpZone}, Set target heating cooling mode error: ${error}`);
								};
							});
						melCloudServiceAtw.getCharacteristic(Characteristic.CurrentTemperature)
							.onGet(async () => {
								const value = this.currentTemperatures[i];
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, ${hetPumpZone}, Temperature: ${value}${temperatureUnit}`);
								return value;
							});
						if (displayMode == 1) {
							//Only for Thermostat
							this.melCloudServiceErv.getCharacteristic(Characteristic.TargetTemperature)

								.onGet(async () => {
									const value = this.setTemperatures[i];
									const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, ${hetPumpZone}, Target temperature: ${value}${temperatureUnit}`);
									return value;
								})
								.onSet(async (value) => {
									deviceState.Power = true;
									deviceState.SetTemperature = value;
									deviceState.EffectiveFlags = heatPumpSetTemperature;

									try {
										const newState = await this.melCloudAtw.send(CONSTANS.ApiUrls.SetAtw, deviceState, 0);
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, ${hetPumpZone}, Set target temperature: ${value}${temperatureUnit}`);
									} catch (error) {
										this.log.error(`${deviceTypeText}: ${accessoryName}, ${hetPumpZone}, Set target temperature error: ${error}`);
									};
								});
						};
						melCloudServiceAtw.getCharacteristic(Characteristic.HeatingThresholdTemperature)
							.setProps({
								minValue: this.useFahrenheit ? 50 : 10,
								maxValue: this.useFahrenheit ? 95 : 35,
								minStep: this.useFahrenheit ? 1 : 0.5
							})
							.onGet(async () => {
								const value = this.setTemperatures[i];
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, ${hetPumpZone}, Heating threshold temperature: ${value}${temperatureUnit}`);
								return value;
							})
							.onSet(async (value) => {
								deviceState.Power = true;
								deviceState.SetTemperature = value;
								deviceState.EffectiveFlags = heatPumpSetTemperature;

								try {
									const newState = await this.melCloudAtw.send(CONSTANS.ApiUrls.SetAtw, deviceState, 0);
									const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, ${hetPumpZone}, Set heating threshold temperature: ${value}${temperatureUnit}`);
								} catch (error) {
									this.log.error(`${deviceTypeText}: ${accessoryName}, ${hetPumpZone}, Set heating threshold temperature error: ${error}`);
								};
							});
						melCloudServiceAtw.getCharacteristic(Characteristic.CoolingThresholdTemperature)
							.setProps({
								minValue: this.useFahrenheit ? 50 : 10,
								maxValue: this.useFahrenheit ? 95 : 35,
								minStep: this.useFahrenheit ? 1 : 0.5
							})
							.onGet(async () => {
								const value = this.setTemperatures[i];
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, ${hetPumpZone}, Cooling threshold temperature: ${value}${temperatureUnit}`);
								return value;
							})
							.onSet(async (value) => {
								deviceState.Power = true;
								deviceState.SetTemperature = value;
								deviceState.EffectiveFlags = heatPumpSetTemperature;

								try {
									const newState = await this.melCloudAtw.send(CONSTANS.ApiUrls.SetAtw, deviceState, 0);
									const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, ${hetPumpZone}, Set cooling threshold temperature: ${value}${temperatureUnit}`);
								} catch (error) {
									this.log.error(`${deviceTypeText}: ${accessoryName}, ${hetPumpZone}, Set cooling threshold temperature error: ${error}`);
								};
							});
						if (displayMode == 0) {
							//Only for Heater Cooler
							melCloudServiceAtw.getCharacteristic(Characteristic.LockPhysicalControls)
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
										const newState = await this.melCloudAtw.send(CONSTANS.ApiUrls.SetAtw, deviceState, 0);
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set lock physical controls: ${value ? 'LOCK':'UNLOCK'}`);
									} catch (error) {
										this.log.error(`${deviceTypeText}: ${accessoryName}, Set lock physical controls error: ${error}`);
									};
								});
						};
						melCloudServiceAtw.getCharacteristic(Characteristic.TemperatureDisplayUnits)
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
						this.melCloudServicesAtw.push(melCloudServiceAtw);
						accessory.addService(this.melCloudServicesAtw[0]);
					};
				};

				//buttons services
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
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power;
										break;
									case 10: //PHYSICAL LOCK CONTROLS
										deviceState.ProhibitSetTemperature = state;
										deviceState.ProhibitOperationMode = state;
										deviceState.ProhibitPower = state;
										break;
									case 40: //HEAT THERMOSTAT
										deviceState.Power = true;
										deviceState.OperationMode = 1;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
										break;
									case 41: //COOL THERMOSTAT
										deviceState.Power = true;
										deviceState.OperationMode = 3;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
										break;
									case 42: //HEAT FLOW
										deviceState.Power = true;
										deviceState.OperationMode = 8;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
										break;
									case 43: //COOL FLOW
										deviceState.Power = true;
										deviceState.OperationMode = 8;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
										break;
									case 44: //CURVE
										deviceState.Power = true;
										deviceState.OperationMode = 8;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
										break;
									case 45: //UNKNOWN
										deviceState.Power = true;
										deviceState.OperationMode = 8;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
										break;
									case 50: //HEAT THERMOSTAT
										deviceState.Power = true;
										deviceState.OperationMode = 1;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
										break;
									case 51: //COOL THERMOSTAT
										deviceState.Power = true;
										deviceState.OperationMode = 3;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
										break;
									case 52: //HEAT FLOW
										deviceState.Power = true;
										deviceState.OperationMode = 8;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
										break;
									case 53: //COOL FLOW
										deviceState.Power = true;
										deviceState.OperationMode = 8;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
										break;
									case 54: //CURVE
										deviceState.Power = true;
										deviceState.OperationMode = 8;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
										break;
									case 55: //UNKNOWN
										deviceState.Power = true;
										deviceState.OperationMode = 8;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
										break;
									case 60: //HEAT THERMOSTAT
										deviceState.Power = true;
										deviceState.OperationMode = 1;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
										break;
									case 61: //COOL THERMOSTAT
										deviceState.Power = true;
										deviceState.OperationMode = 3;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
										break;
									case 62: //HEAT FLOW
										deviceState.Power = true;
										deviceState.OperationMode = 8;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
										break;
									case 63: //COOL FLOW
										deviceState.Power = true;
										deviceState.OperationMode = 8;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
										break;
									case 64: //CURVE
										deviceState.Power = true;
										deviceState.OperationMode = 8;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
										break;
									case 65: //UNKNOWN
										deviceState.Power = true;
										deviceState.OperationMode = 8;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
										break;
								};

								try {
									const newState = await this.melCloudAtw.send(CONSTANS.ApiUrls.SetAtw, deviceState, 0);
									const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set: ${buttonName}`);
								} catch (error) {
									this.log.error(`${deviceTypeText}: ${accessoryName}, Set button error: ${error}`);
								};
							});

						this.buttonsServices.push(buttonService);
						accessory.addService(this.buttonsServices[i])
					};
				};

				//presets services
				if (this.devicePresetsCount > 0) {
					this.log.debug('preparePresetsService');
					this.presetsServices = new Array();

					for (let i = 0; i < this.devicePresetsCount; i++) {
						//get preset
						const preset = this.devicePresets[i];
						const presetName = preset.NumberDescription;
						const power = preset.Power;
						const setTemperature = preset.SetTemperature;
						const operationMode = preset.OperationMode;

						const presetService = new Service.Outlet(`${accessoryName} ${presetName}`, `Preset ${i}`);
						presetService.getCharacteristic(Characteristic.On)
							.onGet(async () => {
								const state = this.devicePresetsStates[i];
								return state;
							})
							.onSet(async (state) => {
								state = state ? 1 : 0;
								switch (state) {
									case 1:
										deviceState.Power = state ? power : false;
										deviceState.SetTemperature = setTemperature;
										deviceState.OperationMode = operationMode;
										deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
										break;
								};

								try {
									const newState = await this.melCloudAtw.send(CONSTANS.ApiUrls.SetAtw, deviceState, 0);
									const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set: ${presetName}`);
								} catch (error) {
									this.log.error(`${deviceTypeText}: ${accessoryName}, Set preset error: ${error}`);
								};
							});

						this.presetsServices.push(presetService);
						accessory.addService(this.presetsServices[i]);
					};
				};
				break;
			case 2: //curtain

				break;
			case 3: //ventilation
				this.log.debug('prepareMelCloudServiceErv');
				const ervServiceName = `${accessoryName} ${deviceTypeText}`;
				this.melCloudServiceErv = displayMode ? accessory.addService(Service.Thermostat, ervServiceName) : accessory.addService(Service.HeaterCooler, ervServiceName);
				if (displayMode == 0) {
					//Only for Heater Cooler
					this.melCloudServiceErv.getCharacteristic(Characteristic.Active)
						.onGet(async () => {
							const state = this.power;
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Power: ${state?'ON':'OFF'}`);
							return state;
						})
						.onSet(async (state) => {
							deviceState.Power = state;
							deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power;

							try {
								const newState = await this.melCloudErv.send(CONSTANS.ApiUrls.SetErv, deviceState, 0);
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set power: ${state?'ON':'OFF'}`);
							} catch (error) {
								this.log.error(`${deviceTypeText}: ${accessoryName}, Set power error: ${error}`);
							};
						});
				};
				this.melCloudServiceErv.getCharacteristic(displayMode ? Characteristic.CurrentHeatingCoolingState : Characteristic.CurrentHeaterCoolerState)
					.onGet(async () => {
						//1 = HEAT, 2 = DRY 3 = COOL, 7 = FAN, 8 = AUTO
						const value = this.currentOperationMode;
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Heating cooling mode: ${currentModeText[value]}`);
						return value;
					});
				this.melCloudServiceErv.getCharacteristic(displayMode ? Characteristic.TargetHeatingCoolingState : Characteristic.TargetHeaterCoolerState)
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
								deviceState.EffectiveFlags = displayMode ? CONSTANS.Ventilation.EffectiveFlags.Power : CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.OperationMode;
								break;
							case 1: //HEAT
								deviceState.Power = true;
								deviceState.OperationMode = 1;
								deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.OperationMode;
								break;
							case 2: //COOL
								deviceState.Power = true;
								deviceState.OperationMode = 3;
								deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.OperationMode;
								break;
							case 3: //AUTO, OFF
								deviceState.Power = displayMode ? true : false;
								deviceState.OperationMode = displayMode ? 8 : deviceState.OperationMode;
								deviceState.EffectiveFlags = displayMode ? CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.OperationMode : CONSTANS.Ventilation.EffectiveFlags.Power;
								break;
						};

						try {
							const newState = await this.melCloudErv.send(CONSTANS.ApiUrls.SetErv, deviceState, 0);
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set target heating cooling mode: ${targetModeText[value]}`);
						} catch (error) {
							this.log.error(`${deviceTypeText}: ${accessoryName}, Set target heating cooling mode error: ${error}`);
						};
					});
				if (displayMode == 0) {
					//Only for Heater Cooler
					if (modelSupportsFanSpeed) {
						this.melCloudServiceErv.getCharacteristic(Characteristic.RotationSpeed)
							.setProps({
								minValue: 0,
								maxValue: this.fanSpeedSetProps,
								minStep: 1
							})
							.onGet(async () => {
								//AUTO, 1, 2, 3, 4, 5
								const value = this.fanSpeed;
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Fan speed mode: ${CONSTANS.Ventilation.SetFanSpeed[this.fanSpeedModeInfoGet]}`);
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
									case 8: //Fan speed mode 8
										fanSpeedMode = hasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 0][value] : [1, 1, 2, 3, 4, 5, 6, 7, 8][value]
										fanSpeedModeInfo = hasAutomaticFanSpeed ? [8, 1, 2, 3, 4, 5, 6, 7, 8, 0][value] : [8, 1, 2, 3, 4, 5, 6, 7, 8][value]
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
				};
				this.melCloudServiceErv.getCharacteristic(Characteristic.CurrentTemperature)
					.onGet(async () => {
						const value = this.currentTemperature;
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Room temperature: ${value}${temperatureUnit}`);
						return value;
					});
				if (displayMode == 1) {
					//Only for Thermostat
					this.melCloudServiceErv.getCharacteristic(Characteristic.TargetTemperature)

						.onGet(async () => {
							const value = this.setTemperature;
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Target temperature: ${value}${temperatureUnit}`);
							return value;
						})
						.onSet(async (value) => {
							deviceState.Power = true;
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
				this.melCloudServiceErv.getCharacteristic(Characteristic.HeatingThresholdTemperature)
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
						deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.SetTemperature;

						try {
							const newState = await this.melCloudErv.send(CONSTANS.ApiUrls.SetErv, deviceState, 0);
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set heating threshold temperature: ${value}${temperatureUnit}`);
						} catch (error) {
							this.log.error(`${deviceTypeText}: ${accessoryName}, Set heating threshold temperature error: ${error}`);
						};
					});
				this.melCloudServiceErv.getCharacteristic(Characteristic.CoolingThresholdTemperature)
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
					this.melCloudServiceErv.getCharacteristic(Characteristic.LockPhysicalControls)
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
								const newState = await this.melCloudErv.send(CONSTANS.ApiUrls.SetErv, deviceState, 0);
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set locl physical controls: ${value ? 'LOCK':'UNLOCK'}`);
							} catch (error) {
								this.log.error(`${deviceTypeText}: ${accessoryName}, Set lock physical controls error: ${error}`);
							};
						});
				};
				this.melCloudServiceErv.getCharacteristic(Characteristic.TemperatureDisplayUnits)
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
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power;
										break;
									case 10: //PHYSICAL LOCK CONTROLS
										deviceState.ProhibitSetTemperature = state;
										deviceState.ProhibitOperationMode = state;
										deviceState.ProhibitPower = state;
										break;
									case 25: //FAN SPEED MODE AUTO
										deviceState.Power = true;
										deviceState.SetFanSpeed = 0;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
										break;
									case 26: //FAN SPEED MODE 1
										deviceState.Power = true;
										deviceState.SetFanSpeed = 1;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
										break;
									case 27: //FAN SPEED MODE 2
										deviceState.Power = true;
										deviceState.SetFanSpeed = 2;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
										break;
									case 28: //FAN SPEED MODE 3
										deviceState.Power = true;
										deviceState.SetFanSpeed = 3;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
										break;
									case 29: //FAN MODE 4
										deviceState.Power = true;
										deviceState.SetFanSpeed = 4;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
										break;
									case 30: //FAN SPEED MODE 5
										deviceState.Power = true;
										deviceState.SetFanSpeed = 5;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
										break;
									case 31: //FAN SPEED MODE 6
										deviceState.Power = true;
										deviceState.SetFanSpeed = 6;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
										break;
									case 32: //FAN SPEED MODE 7
										deviceState.Power = true;
										deviceState.SetFanSpeed = 7;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
										break;
									case 33: //FAN SPEED MODE 8
										deviceState.Power = true;
										deviceState.SetFanSpeed = 8;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
										break;
									case 70: //OPERATING MODE RECOVERY
										deviceState.Power = true;
										deviceState.OperationMode = 0;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.OperationMode;
										break;
									case 71: //OPERATING MODE BYPAS
										deviceState.Power = true;
										deviceState.OperationMode = 1;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.OperationMode;
										break
									case 72: //OPERATING MODE AUTO
										deviceState.Power = true;
										deviceState.OperationMode = 2;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.OperationMode;
										break;
								};

								try {
									const newState = await this.melCloudErv.send(CONSTANS.ApiUrls.SetErv, deviceState, 0);
									const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set: ${buttonName}`);
								} catch (error) {
									this.log.error(`${deviceTypeText}: ${accessoryName}, Set button error: ${error}`);
								};
							});

						this.buttonsServices.push(buttonService);
						accessory.addService(this.buttonsServices[i]);
					};
				};

				//presets services
				if (this.devicePresetsCount > 0) {
					this.log.debug('preparePresetsService');
					this.presetsServices = new Array();

					for (let i = 0; i < this.devicePresetsCount; i++) {
						//get preset
						const preset = this.devicePresets[i];
						const presetName = preset.NumberDescription;
						const power = preset.Power;
						const setTemperature = preset.SetTemperature;
						const operationMode = preset.OperationMode;
						const fanSpeed = preset.FanSpeed;

						const presetService = new Service.Outlet(`${accessoryName} ${presetName}`, `Preset ${i}`);
						presetService.getCharacteristic(Characteristic.On)
							.onGet(async () => {
								const state = this.devicePresetsStates[i];
								return state;
							})
							.onSet(async (state) => {
								state = state ? 1 : 0;
								switch (state) {
									case 1:
										deviceState.Power = state ? power : false;
										deviceState.SetTemperature = setTemperature;
										deviceState.OperationMode = operationMode;
										deviceState.FanSpeed = fanSpeed;
										deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.OperationMode;
										break;
								};

								try {
									const newState = await this.melCloudErv.send(CONSTANS.ApiUrls.SetErv, deviceState, 0);
									const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set: ${presetName}`);
								} catch (error) {
									this.log.error(`${deviceTypeText}: ${accessoryName}, Set preset error: ${error}`);
								};
							});

						this.presetsServices.push(presetService);
						accessory.addService(this.presetsServices[i]);
					};
				};
				break;
		};

		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
		const debug = this.enableDebugMode ? this.log(`${deviceTypeText}: ${accessoryName}, published as external accessory.`) : false;
		this.startPrepareAccessory = false;
	};
};