'use strict';
const path = require('path');
const fs = require('fs');
const Mqtt = require('./src/mqtt.js');
const MelCloud = require('./src/melcloud.js')
const MelCloudAta = require('./src/melcloudata.js');
const MelCloudAtw = require('./src/melcloudatw.js');
const MelCloudErv = require('./src/melclouderv.js');
const CONSTANS = require('./src/constans.json');

let Accessory, Characteristic, Service, Categories, UUID;

module.exports = (api) => {
	Accessory = api.platformAccessory;
	Characteristic = api.hap.Characteristic;
	Service = api.hap.Service;
	Categories = api.hap.Categories;
	UUID = api.hap.uuid;
	api.registerPlatform(CONSTANS.PluginName, CONSTANS.PlatformName, melCloudPlatform, true);
};

class melCloudPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.accounts)) {
			log(`No configuration found for ${CONSTANS.PluginName}`);
			return;
		}
		this.log = log;
		this.api = api;
		this.accessories = [];
		const accounts = config.accounts;

		this.api.on('didFinishLaunching', () => {
			this.log.debug('didFinishLaunching');
			for (const account of accounts) {
				const accountName = account.name;
				const user = account.user;
				const passwd = account.passwd;
				const language = account.language;
				const enableDebugMode = account.enableDebugMode;

				//check mandatory properties
				if (!accountName || !user || !passwd || !language) {
					this.log(`Name, user, password or language in config missing.`);
					return;
				}

				//check if the directory exists, if not then create it
				const prefDir = path.join(api.user.storagePath(), 'melcloud');
				if (!fs.existsSync(prefDir)) {
					fs.mkdirSync(prefDir);
				};

				//melcloud client
				this.melCloud = new MelCloud({
					accountName: accountName,
					user: user,
					passwd: passwd,
					language: language,
					debugLog: enableDebugMode,
					prefDir: prefDir
				});

				this.melCloud.on('connected', (melCloudInfo, contextKey) => {
					this.log(`Account ${accountName}, Connected.`)
					this.melCloudInfo = melCloudInfo;
					this.contextKey = contextKey;
				})
					.on('checkDevicesListComplete', (buildingId, deviceId, deviceType, deviceName, deviceTypeText) => {
						new melCloudDevice(this.log, this.api, account, accountName, prefDir, this.melCloud, this.melCloudInfo, this.contextKey, buildingId, deviceId, deviceType, deviceName, deviceTypeText);
					})
					.on('message', (message) => {
						this.log(`Account ${accountName}, ${message}`);
					})
					.on('error', (error) => {
						this.log.error(`Account ${accountName}, ${error}`);
					})
					.on('debug', (debug) => {
						this.log(`Account ${accountName}, ${debug}`);
					});
			};
		});
	};

	configureAccessory(accessory) {
		this.log.debug('configureAccessory');
		this.accessories.push(accessory);
	};

	removeAccessory(accessory) {
		this.log.debug('removeAccessory');
		this.api.unregisterPlatformAccessories(CONSTANS.PluginName, CONSTANS.PlatformName, [accessory]);
	};
};


class melCloudDevice {
	constructor(log, api, account, accountName, prefDir, melCloud, melCloudInfo, contextKey, buildingId, deviceId, deviceType, deviceName, deviceTypeText) {
		this.log = log;
		this.api = api;

		//account config
		this.ataDisplayMode = account.ataDisplayMode || 0;
		this.ataPresetsEnabled = account.ataPresets || false;
		this.ataDisableAutoMode = account.ataDisableAutoMode || false;
		this.ataDisableHeatMode = account.ataDisableHeatMode || false;
		this.ataAutoHeatMode = account.ataAutoHeatMode || 0; //DRY, FAN
		this.ataButtons = account.ataButtons || [];
		this.ataButtonsCount = this.ataButtons.length;
		this.atwDisplayMode = account.atwDisplayMode || 0;
		this.atwPresetsEnabled = account.atwPresets || false;
		this.atwButtons = account.atwButtons || [];
		this.atwButtonsCount = this.atwButtons.length;
		this.ervDisplayMode = account.ervDisplayMode || 0;
		this.ervPresetsEnabled = account.ervPresets || false;
		this.ervButtons = account.ervButtons || [];
		this.ervButtonsCount = this.ervButtons.length;
		this.disableLogInfo = account.disableLogInfo || false;
		this.disableLogDeviceInfo = account.disableLogDeviceInfo || false;
		this.enableDebugMode = account.enableDebugMode || false;

		//variables
		this.melCloud = melCloud; //function
		this.melCloudInfo = melCloudInfo;
		this.deviceId = deviceId;
		this.deviceType = deviceType;
		this.deviceName = deviceName;
		this.deviceTypeText = deviceTypeText;
		this.startPrepareAccessory = true;
		this.displayDeviceInfo = true;

		//mqtt client
		const mqttEnabled = account.enableMqtt || false;
		if (mqttEnabled) {
			const mqttDebug = account.mqttDebug || false;
			const mqttHost = account.mqttHost;
			const mqttPort = account.mqttPort || 1883;
			const mqttClientId = account.mqttClientId || '';
			const mqttPrefix = `${account.mqttPrefix}/${deviceTypeText}/${deviceName} ${deviceId}`;
			const mqttAuth = account.mqttAuth || false;
			const mqttUser = account.mqttUser;
			const mqttPasswd = account.mqttPass;

			this.mqtt = new Mqtt({
				debug: mqttDebug,
				host: mqttHost,
				port: mqttPort,
				clientId: mqttClientId,
				prefix: mqttPrefix,
				auth: mqttAuth,
				user: mqttUser,
				passwd: mqttPasswd
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
		}

		//melcloud device
		switch (deviceType) {
			case 0: //air conditioner
				this.melCloudAta = new MelCloudAta({
					accountName: accountName,
					contextKey: contextKey,
					buildingId: buildingId,
					deviceId: deviceId,
					debugLog: this.enableDebugMode,
					mqttEnabled: mqttEnabled,
					prefDir: prefDir
				});

				this.melCloudAta.on('deviceInfo', (manufacturer, modelIndoor, modelOutdoor, serialNumber, firmwareAppVersion, presets, presetsCount, hasAutomaticFanSpeed, airDirectionFunction, swingFunction, numberOfFanSpeeds, temperatureIncrement, minTempCoolDry, maxTempCoolDry, minTempHeat, maxTempHeat, minTempAutomatic, maxTempAutomatic, modelSupportsFanSpeed, modelSupportsAuto, modelSupportsHeat, modelSupportsDry) => {
					if (!this.disableLogDeviceInfo && this.displayDeviceInfo) {
						this.log(`---- ${this.deviceTypeText}: ${this.deviceName} ----`);
						this.log(`Account: ${accountName}`);
						this.log(`Model: ${modelIndoor}`);
						this.log(`Serial: ${serialNumber}`);
						this.log(`Firmware: ${firmwareAppVersion}`);
						const outdoorDevice = (modelOutdoor !== 'Undefined') ? this.log(`Outdoor: ${modelOutdoor}`) : false;
						this.log(`Manufacturer: ${manufacturer}`);
						this.log('----------------------------------');
						this.displayDeviceInfo = false;
					};

					//accout info
					this.useFahrenheit = this.melCloudInfo.UseFahrenheit ? 1 : 0;

					//accessory info 					
					this.manufacturer = manufacturer;
					this.modelName = modelIndoor;
					this.serialNumber = serialNumber;
					this.firmwareRevision = firmwareAppVersion;

					//device info
					this.ataHasAutomaticFanSpeed = hasAutomaticFanSpeed;
					this.ataAirDirectionFunction = airDirectionFunction;
					this.ataSwingFunction = swingFunction;
					this.ataNumberOfFanSpeeds = numberOfFanSpeeds;
					this.ataTemperatureIncrement = temperatureIncrement;
					this.ataMinTempCoolDry = minTempCoolDry;
					this.ataMaxTempCoolDry = maxTempCoolDry;
					this.ataMinTempHeat = minTempHeat;
					this.ataMaxTempHeat = maxTempHeat;
					this.ataMinTempAutomatic = minTempAutomatic;
					this.ataMaxTempAutomatic = maxTempAutomatic;
					this.ataTargetCoolTempSetPropsMinValue = [16, 61][this.useFahrenheit];
					this.ataTargetTempSetPropsMinValue = [10, 50][this.useFahrenheit];
					this.ataTargetTempSetPropsMaxValue = [31, 88][this.useFahrenheit];
					this.ataModelSupportsFanSpeed = modelSupportsFanSpeed;
					this.ataModelSupportsAuto = !this.ataDisableAutoMode && modelSupportsAuto;
					this.ataModelSupportsHeat = !this.ataDisableHeatMode && modelSupportsHeat;
					this.ataModelSupportsDry = modelSupportsDry;
					this.ataPresets = presets;
					this.ataPresetsCount = this.ataPresetsEnabled ? presetsCount : 0;
				}).on('deviceState', async (deviceState, roomTemperature, setTemperature, setFanSpeed, operationMode, vaneHorizontal, vaneVertical, defaultHeatingSetTemperature, defaultCoolingSetTemperature, hideVaneControls, hideDryModeControl, inStandbyMode, prohibitSetTemperature, prohibitOperationMode, prohibitPower, power, offline) => {
					//device info
					const displayMode = this.ataDisplayMode;
					const hasAutomaticFanSpeed = this.ataHasAutomaticFanSpeed;
					const swingFunction = this.ataSwingFunction;
					const numberOfFanSpeeds = this.ataNumberOfFanSpeeds;
					const modelSupportsFanSpeed = this.ataModelSupportsFanSpeed;
					const modelSupportsAuto = this.ataModelSupportsAuto;
					const modelSupportsHeat = this.ataModelSupportsHeat;
					const modelSupportsDry = this.ataModelSupportsDry;
					const buttonsCount = this.ataButtonsCount;
					const presets = this.ataPresets;
					const presetsCount = this.ataPresetsCount;

					//device state
					this.deviceState = deviceState || {};
					this.power = power || false;
					this.offline = offline || false;
					this.defaultHeatingSetTemperature = defaultHeatingSetTemperature;
					this.defaultCoolingSetTemperature = defaultCoolingSetTemperature;

					//operating mode
					let autoHeatDryFanMode = 0;
					let currentOperationMode = 0;
					let targetOperationMode = 0;
					let fanSpeed = 0;
					let swingMode = 0;
					let lockPhysicalControls = 0;

					let operationModeSetPropsMinValue = 0;
					let operationModeSetPropsMaxValue = 3;
					let operationModeSetPropsValidValues = [0, 1, 2, 3];
					let fanSpeedSetPropsMaxValue = 2;

					switch (displayMode) {
						case 0: //Heater Cooler
							//operating mode 0, HEAT, DRY, COOL, 4, 5, 6, FAN, AUTO, ISEE HEAT, ISEE DRY, ISEE COOL
							autoHeatDryFanMode = !modelSupportsAuto && !modelSupportsHeat ? [operationMode === 2 ? 0 : 1, operationMode === 6 ? 0 : 1][this.ataAutoHeatMode] : !modelSupportsAuto && modelSupportsHeat ? 0 : modelSupportsAuto && !modelSupportsHeat ? 1 : 1;
							currentOperationMode = !power ? 0 : inStandbyMode ? 1 : [0, 2, 3, 3, 3, 3, 3, 3, (setTemperature < roomTemperature) ? 3 : 2, 2, 2, 3][operationMode]; //INACTIVE, IDLE, HEATING, COOLING
							targetOperationMode = [0, 1, autoHeatDryFanMode, 2, 2, 2, 2, autoHeatDryFanMode, 0, 1, 1, 2][operationMode]; //AUTO, HEAT, COOL
							operationModeSetPropsMinValue = 0;
							operationModeSetPropsMaxValue = 2;
							operationModeSetPropsValidValues = [0, 1, 2];

							//fan speed mode
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
								};
							};

							//swing and vane mode
							swingMode = swingFunction && vaneHorizontal === 12 && vaneVertical === 7 ? 1 : 0;

							//lock physical controls
							lockPhysicalControls = prohibitSetTemperature || prohibitOperationMode || prohibitPower ? 1 : 0;

							//update characteristics
							if (this.ataMelCloudServices) {
								this.ataMelCloudServices[0]
									.updateCharacteristic(Characteristic.Active, power)
									.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentOperationMode)
									.updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetOperationMode)
									.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
									.updateCharacteristic(Characteristic.HeatingThresholdTemperature, setTemperature)
									.updateCharacteristic(Characteristic.CoolingThresholdTemperature, setTemperature)
									.updateCharacteristic(Characteristic.LockPhysicalControls, lockPhysicalControls)
									.updateCharacteristic(Characteristic.TemperatureDisplayUnits, this.useFahrenheit);
								const updateRotationSpeed = modelSupportsFanSpeed ? this.ataMelCloudServices[0].updateCharacteristic(Characteristic.RotationSpeed, fanSpeed) : false;
								const updateSwingMode = swingFunction ? this.ataMelCloudServices[0].updateCharacteristic(Characteristic.SwingMode, swingMode) : false;
							};
							break;
						case 1: //Thermostat
							//operating mode 0, HEAT, DRY, COOL, 4, 5, 6, FAN, AUTO, ISEE HEAT, ISEE DRY, ISEE COOL
							autoHeatDryFanMode = !modelSupportsAuto && !modelSupportsHeat ? [operationMode === 2 ? 3 : 1, operationMode === 6 ? 3 : 1][this.ataAutoHeatMode] : !modelSupportsAuto && modelSupportsHeat ? 3 : modelSupportsAuto && !modelSupportsHeat ? 1 : 1;
							currentOperationMode = !power || inStandbyMode ? 0 : [0, 1, 2, 2, 2, 2, 2, 2, (setTemperature < roomTemperature) ? 2 : 1, 1, 1, 2][operationMode]; //OFF, HEAT, COOL
							targetOperationMode = !power || inStandbyMode ? 0 : [0, 1, autoHeatDryFanMode, 2, 2, 2, 2, autoHeatDryFanMode, 3, 1, 1, 2][operationMode]; //OFF, HEAT, COOL, AUTO
							operationModeSetPropsMinValue = 0;
							operationModeSetPropsMaxValue = 3;
							operationModeSetPropsValidValues = [0, 1, 2, 3];

							//update characteristics
							if (this.ataMelCloudServices) {
								this.ataMelCloudServices[0]
									.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, currentOperationMode)
									.updateCharacteristic(Characteristic.TargetHeatingCoolingState, targetOperationMode)
									.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
									.updateCharacteristic(Characteristic.TargetTemperature, setTemperature)
									.updateCharacteristic(Characteristic.TemperatureDisplayUnits, this.useFahrenheit);
							};
							break;
					};

					this.currentOperationMode = currentOperationMode;
					this.targetOperationMode = targetOperationMode;
					this.roomTemperature = roomTemperature;
					this.setTemperature = setTemperature;
					this.fanSpeed = fanSpeed;
					this.setFanSpeed = setFanSpeed;
					this.swingMode = swingMode;
					this.vaneHorizontal = vaneHorizontal;
					this.vaneVertical = vaneVertical;
					this.lockPhysicalControls = lockPhysicalControls;

					//update buttons state
					if (buttonsCount > 0) {
						this.ataButtonsStates = [];
						this.ataButtonsModes = [];
						this.ataButtonsNames = [];
						this.ataButtonsDisplayType = [];

						for (const button of this.ataButtons) {
							const buttonMode = button.mode || 0;
							const buttonName = button.name || 'Not configured';
							const buttonDisplayType = button.displayType || -1;

							if (buttonDisplayType >= 0) {
								let buttonState = false;
								switch (buttonMode) {
									case 0: //POWER ON,OFF
										buttonState = (power === true);
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 1: //OPERATING MODE HEAT
										buttonState = power ? (operationMode === 1) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 2: //OPERATING MODE DRY
										buttonState = power ? (operationMode === 2) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break
									case 3: //OPERATING MODE COOL
										buttonState = power ? (operationMode === 3) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 4: //OPERATING MODE FAN
										buttonState = power ? (operationMode === 7) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 5: //OPERATING MODE AUTO
										buttonState = power ? (operationMode === 8) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 6: //OPERATING MODE PURIFY
										buttonState = power ? (operationMode === 9) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 7: //OPERATING MODE DRY CONTROL HIDE
										buttonState = power ? (hideDryModeControl === true) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 10: //WANE H SWING MODE AUTO
										buttonState = power ? (vaneHorizontal === 0) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 11: //WANE H SWING MODE 1
										buttonState = power ? (vaneHorizontal === 1) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 12: //WANE H SWING MODE 2
										buttonState = power ? (vaneHorizontal === 2) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 13: //WANE H SWING MODE 3
										buttonState = power ? (vaneHorizontal === 3) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 14: //WANE H SWING MODE 4
										buttonState = power ? (vaneHorizontal === 4) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 15: //WANE H SWING MODE 5
										buttonState = power ? (vaneHorizontal === 5) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 16: //WANE H SWING MODE SWING
										buttonState = power ? (vaneHorizontal === 12) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 20: //VANE V SWING MODE AUTO
										buttonState = power ? (vaneVertical === 0) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 21: //VANE V SWING MODE 1
										buttonState = power ? (vaneVertical === 1) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 22: //VANE V SWING MODE 2
										buttonState = power ? (vaneVertical === 2) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 23: //VANE V SWING MODE 3
										buttonState = power ? (vaneVertical === 3) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 24: //VANE V SWING MODE 4
										buttonState = power ? (vaneVertical === 4) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 25: //VANE V SWING MODE 5
										buttonState = power ? (vaneVertical === 5) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 26: //VANE V SWING MODE SWING
										buttonState = power ? (vaneVertical === 7) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 27: //VANE H/V CONTROLS HIDE
										buttonState = power ? (hideVaneControls === true) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 30: //FAN SPEED MODE AUTO
										buttonState = power ? (setFanSpeed === 0) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 31: //FAN SPEED MODE 1
										buttonState = power ? (setFanSpeed === 1) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 32: //FAN SPEED MODE 2
										buttonState = power ? (setFanSpeed === 2) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 33: //FAN SPEED MODE 3
										buttonState = power ? (setFanSpeed === 3) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 34: //FAN SPEED MODE 4
										buttonState = power ? (setFanSpeed === 4) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 35: //FAN SPEED  MODE 5
										buttonState = power ? (setFanSpeed === 5) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 36: //FAN SPEED  MODE 6
										buttonState = power ? (setFanSpeed === 6) : false;
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 37: //PHYSICAL LOCK CONTROLS ALL
										buttonState = (lockPhysicalControls === 1);
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 38: //PHYSICAL LOCK CONTROLS POWER
										buttonState = (prohibitPower === true);
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 39: //PHYSICAL LOCK CONTROLS MODE
										buttonState = (prohibitOperationMode === true);
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
									case 40: //PHYSICAL LOCK CONTROLS TEMP
										buttonState = (prohibitSetTemperature === true);
										this.ataButtonsStates.push(buttonState);
										this.ataButtonsModes.push(buttonMode);
										this.ataButtonsNames.push(buttonName);
										this.ataButtonsDisplayType.push(buttonDisplayType);
										break;
								};
							};
						};

						this.ataButtonsConfiguredCount = this.ataButtonsStates.length;
						for (let i = 0; i < this.ataButtonsConfiguredCount; i++) {
							const buttonState = this.ataButtonsStates[i];
							const buttonDisplayType = this.ataButtonsDisplayType[i];
							const characteristicType = [Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][buttonDisplayType];
							if (this.ataButtonsServices) {
								this.ataButtonsServices[i]
									.updateCharacteristic(characteristicType, buttonState)
							};
						};

					};

					//update presets state
					if (presetsCount > 0) {
						this.ataPresetsStates = [];
						for (let i = 0; i < presetsCount; i++) {
							//get preset
							const preset = presets[i];
							const presetState =
								preset.Power === power
								&& preset.SetTemperature === setTemperature
								&& preset.OperationMode === operationMode
								&& preset.VaneHorizontal === vaneHorizontal
								&& preset.VaneVertical === vaneVertical
								&& preset.FanSpeed === setFanSpeed;
							this.ataPresetsStates.push(presetState);

							if (this.ataPresetsServices) {
								this.ataPresetsServices[i]
									.updateCharacteristic(Characteristic.On, presetState)
							};
						};
					};

					//start prepare accessory
					if (this.startPrepareAccessory) {
						try {
							this.operationModeSetPropsMinValue = operationModeSetPropsMinValue;
							this.operationModeSetPropsMaxValue = operationModeSetPropsMaxValue;
							this.operationModeSetPropsValidValues = operationModeSetPropsValidValues;
							this.fanSpeedSetPropsMaxValue = fanSpeedSetPropsMaxValue;

							await this.prepareAccessory();
						} catch (error) {
							this.log.error(`${deviceTypeText} ${deviceName}, prepare accessory error: ${error}`);
						};
					};
				}).on('message', (message) => {
					this.log(`${deviceTypeText} ${deviceName}, ${message}`);
				}).on('error', (error) => {
					this.log.error(`${deviceTypeText} ${deviceName}, ${error}`);
				}).on('debug', (debug) => {
					this.log(`${deviceTypeText} ${deviceName}, ${debug}`);
				}).on('mqtt', (topic, message) => {
					this.mqtt.send(topic, message);
				});
				break;
			case 1: //heat pump
				this.melCloudAtw = new MelCloudAtw({
					accountName: accountName,
					contextKey: contextKey,
					buildingId: buildingId,
					deviceId: deviceId,
					debugLog: this.enableDebugMode,
					mqttEnabled: mqttEnabled,
					prefDir: prefDir
				});

				this.melCloudAtw.on('deviceInfo', (manufacturer, modelIndoor, modelOutdoor, serialNumber, firmwareRevision, presets, presetsCount, zonesCount, heatPumpZoneName, hotWaterZoneName, hasHotWaterTank, temperatureIncrement, maxTankTemperature, hasZone2, zone1Name, zone2Name, heatCoolModes, caseHotWater, caseZone2) => {
					if (!this.disableLogDeviceInfo && this.displayDeviceInfo) {
						this.log(`---- ${this.deviceTypeText}: ${this.deviceName} ----`);
						this.log(`Account: ${accountName}`);
						this.log(`Model: ${modelIndoor}`);
						this.log(`Serial: ${serialNumber}`);
						this.log(`Firmware: ${firmwareRevision}`);
						this.log(`Hot Water Tank: ${hasHotWaterTank ? 'Yes' : 'No'}`);
						this.log(`Zone 2: ${hasZone2 ? 'Yes' : 'No'}`);
						this.log(`Manufacturer: ${manufacturer}`);
						this.log('----------------------------------');
						this.displayDeviceInfo = false;
					};

					//accout info
					this.useFahrenheit = this.melCloudInfo.UseFahrenheit ? 1 : 0;

					//accessory info 					
					this.manufacturer = manufacturer;
					this.modelName = modelOutdoor;
					this.serialNumber = serialNumber;
					this.firmwareRevision = firmwareRevision;

					//device info
					this.atwZonesCount = zonesCount;
					this.atwHeatPumpName = heatPumpZoneName;
					this.atwZone1Name = zone1Name;
					this.atwHasHotWaterTank = hasHotWaterTank;
					this.atwTemperatureIncrement = temperatureIncrement;
					this.atwMaxTankTemperature = maxTankTemperature;
					this.atwHotWaterName = hotWaterZoneName;
					this.atwHasZone2 = hasZone2;
					this.atwZone2Name = zone2Name;
					this.atwHeatCoolModes = heatCoolModes;
					this.atwCaseHotWater = caseHotWater;
					this.atwCaseZone2 = caseZone2;
					this.atwPresets = presets;
					this.atwPresetsCount = this.atwPresetsEnabled ? presetsCount : 0;
				}).on('deviceState', async (deviceState, setTemperatureZone1, setTemperatureZone2, roomTemperatureZone1, roomTemperatureZone2, operationMode, operationModeZone1, operationModeZone2, setHeatFlowTemperatureZone1, setHeatFlowTemperatureZone2, setCoolFlowTemperatureZone1, setCoolFlowTemperatureZone2, hcControlType, tankWaterTemperature, setTankWaterTemperature, forcedHotWaterMode, unitStatus, outdoorTemperature, ecoHotWater, holidayMode, prohibitZone1, prohibitZone2, prohibitHotWater, idleZone1, idleZone2, power, offline) => {
					//check device and zones count
					const zonesCount = this.atwZonesCount;
					if (zonesCount === 0) {
						this.log(`${deviceTypeText} ${deviceName}, No device or zones found.`);
						return;
					};

					//device info
					const displayMode = this.atwDisplayMode;
					const buttonsCount = this.atwButtonsCount;
					const hasHotWaterTank = this.atwHasHotWaterTank;
					const hasZone2 = this.atwHasZone2;
					const heatCoolModes = this.atwHeatCoolModes;
					const presets = this.atwPresets;
					const presetsCount = this.atwPresetsCount;
					const caseHotWater = this.atwCaseHotWater;
					const caseZone2 = this.atwCaseZone2;

					//device state
					this.deviceState = deviceState || {};
					this.hcControlType = hcControlType || 0;
					this.unitStatus = unitStatus || 0;
					this.idleZone1 = idleZone1 || false;
					this.idleZone2 = idleZone2 || false;
					this.power = power || false;
					this.offline = offline || false

					//zones array
					this.currentOperationModes = [];
					this.targetOperationModes = [];
					this.roomTemperatures = [];
					this.setTemperatures = [];
					this.lockPhysicalsControls = [];

					this.operationModesSetPropsMinValue = [];
					this.operationModesSetPropsMaxValue = [];
					this.operationModesSetPropsValidValues = [];
					this.temperaturesSetPropsMinValue = [];
					this.temperaturesSetPropsMaxValue = [];

					//default values
					let currentOperationMode = 0;
					let targetOperationMode = 0;
					let roomTemperature = 20;
					let setTemperature = 20;
					let lockPhysicalControls = 0;

					let operationModeSetPropsMinValue = 0;
					let operationModeSetPropsMaxValue = 3;
					let operationModeSetPropsValidValues = [];
					let temperatureSetPropsMinValue = -35;
					let temperatureSetPropsMaxValue = 140;

					for (let i = 0; i < zonesCount; i++) {
						switch (displayMode) {
							case 0: //Heater Cooler
								switch (i) {
									case 0: //Heat Pump Operation Mode - IDLE, HOT WATER, HEATING ZONES, COOLING, HOT WATER STORAGE, FREZE STAT, LEGIONELLA, HEATING ECO, MODE 1, MODE 2, MODE 3, HEATING UP /// Unit Status - HEAT, COOL
										currentOperationMode = !power ? 0 : [1, 2, 2, 3, 2, 1, 1, 2, 1, 1, 1, 2][operationMode]; //INACTIVE, IDLE, HEATING, COOLING 
										targetOperationMode = [1, 2][unitStatus]; //AUTO, HEAT, COOL
										roomTemperature = outdoorTemperature;
										setTemperature = outdoorTemperature;
										lockPhysicalControls = hasHotWaterTank && hasZone2 ? (prohibitZone1 && prohibitHotWater && prohibitZone2 ? 1 : 0) : hasHotWaterTank ? (prohibitZone1 && prohibitHotWater ? 1 : 0) : hasZone2 ? (prohibitZone1 && prohibitZone2 ? 1 : 0) : 0;

										operationModeSetPropsMinValue = [1, 1, 2][heatCoolModes];
										operationModeSetPropsMaxValue = [2, 1, 2][heatCoolModes];
										operationModeSetPropsValidValues = [[1, 2], [1], [2]][heatCoolModes];
										temperatureSetPropsMinValue = [-35, -31][this.useFahrenheit];
										temperatureSetPropsMaxValue = [50, 122][this.useFahrenheit];
										break;
									case 1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
										currentOperationMode = !power ? 0 : idleZone1 ? 1 : [2, 2, 2, 3, 3, 2][operationModeZone1]; //INACTIVE, IDLE, HEATING, COOLING
										targetOperationMode = [1, 2, 0, 1, 2, 1][operationModeZone1]; //AUTO, HEAT, COOL
										roomTemperature = roomTemperatureZone1;
										setTemperature = setTemperatureZone1;
										lockPhysicalControls = prohibitZone1 ? 1 : 0;

										operationModeSetPropsMinValue = [0, 0, 1][heatCoolModes];
										operationModeSetPropsMaxValue = [2, 2, 2][heatCoolModes];
										operationModeSetPropsValidValues = [[0, 1, 2], [0, 1, 2], [1, 2]][heatCoolModes];
										temperatureSetPropsMinValue = [10, 50][this.useFahrenheit];
										temperatureSetPropsMaxValue = [35, 95][this.useFahrenheit];
										break;
									case caseHotWater: //Hot Water - NORMAL, HEAT NOW
										currentOperationMode = !power ? 0 : operationMode === 1 ? 2 : [1, 2][forcedHotWaterMode]; //INACTIVE, IDLE, HEATING, COOLING
										targetOperationMode = [0, 1][forcedHotWaterMode] //AUTO, HEAT, COOL
										roomTemperature = tankWaterTemperature;
										setTemperature = setTankWaterTemperature;
										lockPhysicalControls = prohibitHotWater ? 1 : 0;

										operationModeSetPropsMinValue = 0;
										operationModeSetPropsMaxValue = 1;
										operationModeSetPropsValidValues = [0, 1];
										temperatureSetPropsMinValue = [30, 86][this.useFahrenheit];
										temperatureSetPropsMaxValue = [60, 140][this.useFahrenheit];;
										break;
									case caseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
										currentOperationMode = !power ? 0 : idleZone2 ? 1 : [2, 2, 2, 3, 3, 2][operationModeZone2]; //INACTIVE, IDLE, HEATING, COOLING
										targetOperationMode = [1, 2, 0, 1, 2, 1][operationModeZone2]; //AUTO, HEAT, COOL
										roomTemperature = roomTemperatureZone2;
										setTemperature = setTemperatureZone2;
										lockPhysicalControls = prohibitZone2 ? 1 : 0;

										operationModeSetPropsMinValue = [0, 0, 1][heatCoolModes];
										operationModeSetPropsMaxValue = [2, 2, 2][heatCoolModes];
										operationModeSetPropsValidValues = [[0, 1, 2], [0, 1, 2], [1, 2]][heatCoolModes];
										temperatureSetPropsMinValue = [10, 50][this.useFahrenheit];
										temperatureSetPropsMaxValue = [35, 95][this.useFahrenheit];
										break;
								};

								//update characteristics
								if (this.atwMelCloudServices && currentOperationMode != undefined && targetOperationMode != undefined) {
									this.atwMelCloudServices[i]
										.updateCharacteristic(Characteristic.Active, power)
										.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentOperationMode)
										.updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetOperationMode)
										.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
										.updateCharacteristic(Characteristic.LockPhysicalControls, lockPhysicalControls)
										.updateCharacteristic(Characteristic.TemperatureDisplayUnits, this.useFahrenheit)
									if (this.atwHeatCoolModes === 0 || this.atwHeatCoolModes === 1) {
										this.atwMelCloudServices[i].updateCharacteristic(Characteristic.HeatingThresholdTemperature, setTemperature)
									}
									if ((this.atwHeatCoolModes === 0 || this.atwHeatCoolModes === 2) && i !== this.atwCaseHotWate) {
										this.atwMelCloudServices[i].updateCharacteristic(Characteristic.CoolingThresholdTemperature, setTemperature)
									}
								}
								break;
							case 1: //Thermostat
								switch (i) {
									case 0: //Heat Pump Operation Mode - IDLE, HOT WATER, HEATING ZONES, COOLING, HOT WATER STORAGE, FREZE STAT, LEGIONELLA, HEATING ECO, MODE 1, MODE 2, MODE 3, HEATING UP /// Unit Status - HEAT, COOL
										currentOperationMode = !power ? 0 : [0, 1, 1, 2, 1, 0, 0, 1, 0, 0, 0, 1][operationMode]; //OFF, HEAT, COOL
										targetOperationMode = !power ? 0 : [1, 2][unitStatus]; //OFF, HEAT, COOL, AUTO
										roomTemperature = outdoorTemperature;
										setTemperature = outdoorTemperature;

										operationModeSetPropsMinValue = [0, 0, 0][heatCoolModes];
										operationModeSetPropsMaxValue = [2, 1, 2][heatCoolModes];
										operationModeSetPropsValidValues = [[0, 1, 2], [0, 1], [0, 2]][heatCoolModes];
										temperatureSetPropsMinValue = [-35, -31][this.useFahrenheit];
										temperatureSetPropsMaxValue = [50, 122][this.useFahrenheit];
										break;
									case 1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
										currentOperationMode = !power ? 0 : idleZone1 ? 0 : [1, 1, 1, 2, 2, 1][operationModeZone1]; //OFF, HEAT, COOL
										targetOperationMode = [1, 2, 3, 1, 2, 1][operationModeZone1]; //OFF, HEAT, COOL, AUTO
										roomTemperature = roomTemperatureZone1;
										setTemperature = setTemperatureZone1;

										operationModeSetPropsMinValue = [1, 1, 1][heatCoolModes];
										operationModeSetPropsMaxValue = [3, 3, 2][heatCoolModes];
										operationModeSetPropsValidValues = [[1, 2, 3], [1, 2, 3], [1, 2]][heatCoolModes];
										temperatureSetPropsMinValue = [10, 50][this.useFahrenheit];
										temperatureSetPropsMaxValue = [35, 95][this.useFahrenheit];
										break;
									case caseHotWater: //Hot Water - NORMAL, HEAT NOW
										currentOperationMode = !power ? 0 : operationMode === 1 ? 1 : [0, 1][forcedHotWaterMode]; //OFF, HEAT, COOL
										targetOperationMode = [3, 1][forcedHotWaterMode] //OFF, HEAT, COOL, AUTO
										roomTemperature = tankWaterTemperature;
										setTemperature = setTankWaterTemperature;

										operationModeSetPropsMinValue = 1;
										operationModeSetPropsMaxValue = 3;
										operationModeSetPropsValidValues = [1, 3];
										temperatureSetPropsMinValue = [30, 86][this.useFahrenheit];
										temperatureSetPropsMaxValue = [60, 140][this.useFahrenheit];
										break;
									case caseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
										currentOperationMode = !power ? 0 : idleZone2 ? 0 : [1, 1, 1, 2, 2, 1][operationModeZone2]; //OFF, HEAT, COOL
										targetOperationMode = [1, 2, 3, 1, 2, 1][operationModeZone2]; //OFF, HEAT, COOL, AUTO
										roomTemperature = roomTemperatureZone2;
										setTemperature = setTemperatureZone2;

										operationModeSetPropsMinValue = [1, 1, 1][heatCoolModes];
										operationModeSetPropsMaxValue = [3, 3, 2][heatCoolModes];
										operationModeSetPropsValidValues = [[1, 2, 3], [1, 2, 3], [1, 2]][heatCoolModes];
										temperatureSetPropsMinValue = [10, 10][this.useFahrenheit];
										temperatureSetPropsMaxValue = [35, 95][this.useFahrenheit];
										break;
								};

								//update characteristics
								if (this.atwMelCloudServices) {
									this.atwMelCloudServices[i]
										.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentOperationMode)
										.updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetOperationMode)
										.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
										.updateCharacteristic(Characteristic.TargetTemperature, setTemperature)
										.updateCharacteristic(Characteristic.TemperatureDisplayUnits, this.useFahrenheit)
								}
								break;
						};

						//push value to arrays
						this.currentOperationModes.push(currentOperationMode);
						this.targetOperationModes.push(targetOperationMode);
						this.roomTemperatures.push(roomTemperature);
						this.setTemperatures.push(setTemperature);
						this.lockPhysicalsControls.push(lockPhysicalControls);

						if (this.startPrepareAccessory) {
							this.operationModesSetPropsMinValue.push(operationModeSetPropsMinValue);
							this.operationModesSetPropsMaxValue.push(operationModeSetPropsMaxValue);
							this.operationModesSetPropsValidValues.push(operationModeSetPropsValidValues);
							this.temperaturesSetPropsMinValue.push(temperatureSetPropsMinValue);
							this.temperaturesSetPropsMaxValue.push(temperatureSetPropsMaxValue);
						};
					};

					//update buttons state
					if (buttonsCount > 0) {
						this.atwButtonsStates = [];
						this.atwButtonsModes = [];
						this.atwButtonsNames = [];
						this.atwButtonsDisplayType = [];

						for (const button of this.atwButtons) {
							const buttonMode = button.mode || 0;
							const buttonName = button.name || 'Not configured';
							const buttonDisplayType = button.displayType || -1;

							if (buttonDisplayType >= 0) {
								let buttonState = false;
								switch (buttonMode) {
									case 0: //POWER ON,OFF
										buttonState = (power === true);
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 1: //HEAT PUMP HEAT
										buttonState = power ? (operationMode === 0) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 2: //COOL
										buttonState = power ? (operationMode === 1) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 53: //HOLIDAY
										buttonState = power ? (holidayMode === true) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 10: //ALL ZONES PHYSICAL LOCK CONTROL
										buttonState = power ? (prohibitZone1 === true && prohibitHotWater === true && prohibitZone2 === true) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 20: //HOT WATER AUTO
										buttonState = power ? (forcedHotWaterMode === false) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 21: //ECO
										buttonState = power ? (ecoHotWater === true) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 22: //FORCE HEAT
										buttonState = power ? (forcedHotWaterMode === true) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 30: //PHYSICAL LOCK CONTROL
										buttonState = (prohibitHotWater === true);
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 40: //ZONE 1 HEAT THERMOSTAT
										buttonState = power ? (operationModeZone1 === 0) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 41: //HEAT FLOW
										buttonState = power ? (operationModeZone1 === 1) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 42: //HEAT CURVE
										buttonState = power ? (operationModeZone1 === 2) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 43: //COOL THERMOSTAT
										buttonState = power ? (operationModeZone1 === 3) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 44: //COOL FLOW
										buttonState = power ? (operationModeZone1 === 4) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 45: //FLOOR DRYUP
										buttonState = power ? (operationModeZone1 === 5) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 50: //PHYSICAL LOCK CONTROL
										buttonState = (prohibitZone1 === true);
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 60: //ZONE 2 HEAT THERMOSTAT
										buttonState = power ? (operationModeZone2 === 0) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 61: //HEAT FLOW
										buttonState = power ? (operationModeZone2 === 1) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 62: //HEAT CURVE
										buttonState = power ? (operationModeZone2 === 2) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 63: //COOL THERMOSTAT
										buttonState = power ? (operationModeZone2 === 3) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 64: //COOL FLOW
										buttonState = power ? (operationModeZone2 === 4) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 65: //FLOOR DRYUP
										buttonState = power ? (operationModeZone2 === 5) : false;
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
									case 70: //PHYSICAL LOCK CONTROL
										buttonState = (prohibitZone2 === true);
										this.atwButtonsStates.push(buttonState);
										this.atwButtonsModes.push(buttonMode);
										this.atwButtonsNames.push(buttonName);
										this.atwButtonsDisplayType.push(buttonDisplayType);
										break;
								};
							};
						};

						this.atwButtonsConfiguredCount = this.atwButtonsStates.length;
						for (let i = 0; i < this.atwButtonsConfiguredCount; i++) {
							const buttonState = this.atwButtonsStates[i];
							const buttonDisplayType = this.atwButtonsDisplayType[i];
							const characteristicType = [Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][buttonDisplayType];
							if (this.atwButtonsServices) {
								this.atwButtonsServices[i]
									.updateCharacteristic(characteristicType, buttonState)
							};
						};
					};

					//update presets state
					if (presetsCount > 0) {
						this.atwPresetsStates = [];

						for (let i = 0; i < presetsCount; i++) {
							//get preset
							const preset = presets[i];
							const presetState =
								preset.Power === power
								&& preset.EcoHotWater === ecoHotWater
								&& preset.OperationModeZone1 === operationModeZone1
								&& preset.OperationModeZone2 === operationModeZone2
								&& preset.SetTankWaterTemperature === setTankWaterTemperature
								&& preset.SetTemperatureZone1 === setTemperatureZone1
								&& preset.SetTemperatureZone2 === setTemperatureZone2
								&& preset.ForcedHotWaterMode === forcedHotWaterMode
								&& preset.SetHeatFlowTemperatureZone1 === setHeatFlowTemperatureZone1
								&& preset.SetHeatFlowTemperatureZone2 === setHeatFlowTemperatureZone2
								&& preset.SetCoolFlowTemperatureZone1 === setCoolFlowTemperatureZone1
								&& preset.SetCoolFlowTemperatureZone2 === setCoolFlowTemperatureZone2;
							this.atwPresetsStates.push(presetState);

							if (this.atwPresetsServices) {
								this.atwPresetsServices[i]
									.updateCharacteristic(Characteristic.On, presetState)
							};
						};
					};

					//start prepare accessory
					if (this.startPrepareAccessory) {
						try {
							await this.prepareAccessory();
						} catch (error) {
							this.log.error(`${deviceTypeText} ${deviceName}, prepare accessory error: ${error}`);
						};
					};
				}).on('message', (message) => {
					this.log(`${deviceTypeText} ${deviceName}, ${message}`);
				}).on('error', (error) => {
					this.log.error(`${deviceTypeText} ${deviceName}, ${error}`);
				}).on('debug', (debug) => {
					this.log(`${deviceTypeText} ${deviceName}, ${debug}`);
				}).on('mqtt', (topic, message) => {
					this.mqtt.send(topic, message);
				});
				break;
			case 2: //energy recovery ventilation
				this.melCloudErv = new MelCloudErv({
					accountName: accountName,
					contextKey: contextKey,
					buildingId: buildingId,
					deviceId: deviceId,
					debugLog: this.enableDebugMode,
					mqttEnabled: mqttEnabled,
					prefDir: prefDir
				});

				this.melCloudErv.on('deviceInfo', (manufacturer, modelIndoor, modelOutdoor, serialNumber, firmwareRevision, presets, presetsCount, hasAutoVentilationMode, hasBypassVentilationMode, hasAutomaticFanSpeed, numberOfFanSpeeds, temperatureIncrement, coreMaintenanceRequired, filterMaintenanceRequired) => {
					if (!this.disableLogDeviceInfo && this.displayDeviceInfo) {
						this.log(`---- ${this.deviceTypeText}: ${this.deviceName} ----`);
						this.log(`Account: ${accountName}`);
						this.log(`Model: ${modelOutdoor}`);
						this.log(`Serial: ${serialNumber}`);
						this.log(`Firmware: ${firmwareRevision}`);
						const indoorDevice = (modelIndoor !== 'Undefined') ? this.log(`Indoor: ${modelIndoor}`) : false;
						this.log(`Manufacturer: ${manufacturer}`);
						this.log('----------------------------------');
						this.displayDeviceInfo = false;
					};

					//accout info
					this.useFahrenheit = this.melCloudInfo.UseFahrenheit ? 1 : 0;

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
					this.ervTemperatureIncrement = temperatureIncrement;
					this.ervFilterMaintenanceRequired = filterMaintenanceRequired ? 1 : 0;
					this.ervTargetTempSetPropsMinValue = [10, 50][this.useFahrenheit];
					this.ervTargetTempSetPropsMaxValue = [31, 88][this.useFahrenheit];
					this.ervPresets = presets;
					this.ervPresetsCount = this.ervPresetsEnabled ? presetsCount : 0;
				}).on('deviceState', async (deviceState, roomTemperature, supplyTemperature, outdoorTemperature, roomCO2Level, nightPurgeMode, setTemperature, setFanSpeed, operationMode, ventilationMode, actualVentilationMode, defaultHeatingSetTemperature, defaultCoolingSetTemperature, hideRoomTemperature, hideSupplyTemperature, hideOutdoorTemperature, power, offline) => {
					//device info
					const displayMode = this.ervDisplayMode;
					const hasAutoVentilationMode = this.ervHasAutoVentilationMode;
					const hasBypassVentilationMode = this.ervHasBypassVentilationMode;
					const hasAutomaticFanSpeed = this.ervHasAutomaticFanSpeed;
					const numberOfFanSpeeds = this.ervNumberOfFanSpeeds;
					const ervFilterMaintenanceRequired = ervFilterMaintenanceRequired;
					const buttonsCount = this.ervButtonsCount;
					const presets = this.ervPresets;
					const presetsCount = this.ervPresetsCount;

					//device state
					this.deviceState = deviceState || {};
					this.power = power || false;
					this.offline = offline || false

					//operating mode
					let currentOperationMode = 0;
					let targetOperationMode = 0;
					let fanSpeed = 0;
					let lockPhysicalControls = 0;

					let operationModeSetPropsMinValue = 0;
					let operationModeSetPropsMaxValue = 3;
					let operationModeSetPropsValidValues = [0, 1, 2, 3];
					let fanSpeedSetPropsMaxValue = 2;

					switch (displayMode) {
						case 0: //Heater Cooler
							//operation mode - LOSSNAY, BYPAS, AUTO
							currentOperationMode = !power ? 0 : [2, 3, [2, 3][actualVentilationMode]][ventilationMode]; //INACTIVE, IDLE, HEATING, COOLING
							targetOperationMode = [1, 2, 0][ventilationMode]; //AUTO, HEAT, COOL
							operationModeSetPropsMinValue = hasAutoVentilationMode ? 0 : 1;
							operationModeSetPropsMaxValue = hasAutoVentilationMode ? 2 : 2;
							operationModeSetPropsValidValues = hasAutoVentilationMode ? (hasBypassVentilationMode ? [0, 1, 2] : [0, 2]) : (hasBypassVentilationMode ? [1, 2] : [2]);

							//fan speed mode
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
							};

							//lock physical controls
							lockPhysicalControls = 0;

							//update characteristics
							if (this.ervMelCloudServices) {
								this.ervMelCloudServices[0]
									.updateCharacteristic(Characteristic.Active, power)
									.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentOperationMode)
									.updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetOperationMode)
									.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
									.updateCharacteristic(Characteristic.HeatingThresholdTemperature, setTemperature)
									.updateCharacteristic(Characteristic.CoolingThresholdTemperature, setTemperature)
									.updateCharacteristic(Characteristic.RotationSpeed, fanSpeed)
									.updateCharacteristic(Characteristic.LockPhysicalControls, lockPhysicalControls)
									.updateCharacteristic(Characteristic.TemperatureDisplayUnits, this.useFahrenheit);
							};
							break;
						case 1: //Thermostat
							//operation mode - LOSSNAY, BYPAS, AUTO
							currentOperationMode = !power ? 0 : [1, 2, [1, 2][actualVentilationMode]][ventilationMode]; //OFF, HEAT, COOL
							targetOperationMode = !power ? 0 : [1, 2, 3][ventilationMode]; //OFF, HEAT, COOL, AUTO
							operationModeSetPropsMinValue = hasAutoVentilationMode ? 0 : 0;
							operationModeSetPropsMaxValue = hasAutoVentilationMode ? 3 : 2;
							operationModeSetPropsValidValues = hasAutoVentilationMode ? (hasBypassVentilationMode ? [0, 1, 2, 3] : [0, 2, 3]) : (hasBypassVentilationMode ? [0, 1, 2] : [0, 2]);

							//update characteristics
							if (this.ervMelCloudServices) {
								this.ervMelCloudServices[0]
									.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, currentOperationMode)
									.updateCharacteristic(Characteristic.TargetHeatingCoolingState, targetOperationMode)
									.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
									.updateCharacteristic(Characteristic.TargetTemperature, setTemperature)
									.updateCharacteristic(Characteristic.TemperatureDisplayUnits, this.useFahrenheit);
							};
							break;
					};

					this.currentOperationMode = currentOperationMode;
					this.targetOperationMode = targetOperationMode;
					this.roomTemperature = roomTemperature;
					this.supplyTemperature = supplyTemperature;
					this.outdoorTemperature = outdoorTemperature;
					this.roomCO2Level = roomCO2Level;
					this.setTemperature = setTemperature;
					this.fanSpeed = fanSpeed;
					this.setFanSpeed = setFanSpeed;
					this.lockPhysicalControls = lockPhysicalControls;

					//update default heating temperature set
					if (this.ervFilterMaintenanceService) {
						this.ervFilterMaintenanceService
							.updateCharacteristic(Characteristic.FilterChangeIndication, this.ervFilterMaintenanceRequired)
					}

					//update buttons state
					if (buttonsCount > 0) {
						this.ervButtonsStates = [];
						this.ervButtonsModes = [];
						this.ervButtonsNames = [];
						this.ervButtonsDisplayType = [];

						for (const button of this.ervButtons) {
							const buttonMode = button.mode || 0;
							const buttonName = button.name || 'Not configured';
							const buttonDisplayType = button.displayType || -1;

							if (buttonDisplayType >= 0) {
								let buttonState = false;
								switch (buttonMode) {
									case 0: //POWER ON,OFF
										buttonState = (power === true);
										this.ervButtonsStates.push(buttonState);
										this.ervButtonsModes.push(buttonMode);
										this.ervButtonsNames.push(buttonName);
										this.ervButtonsDisplayType.push(buttonDisplayType);
										break;
									case 1: //OPERATION MODE RECOVERY
										buttonState = power ? (ventilationMode === 0) : false;
										this.ervButtonsStates.push(buttonState);
										this.ervButtonsModes.push(buttonMode);
										this.ervButtonsNames.push(buttonName);
										this.ervButtonsDisplayType.push(buttonDisplayType);
										break;
									case 2: //OPERATION MODE BYPAS
										buttonState = power ? (ventilationMode === 1) : false;
										this.ervButtonsStates.push(buttonState);
										this.ervButtonsModes.push(buttonMode);
										this.ervButtonsNames.push(buttonName);
										this.ervButtonsDisplayType.push(buttonDisplayType);
										break;
									case 3: //OPERATION MODE AUTO
										buttonState = power ? (ventilationMode === 2) : false;
										this.ervButtonsStates.push(buttonState);
										this.ervButtonsModes.push(buttonMode);
										this.ervButtonsNames.push(buttonName);
										this.ervButtonsDisplayType.push(buttonDisplayType);
										break;
									case 4: //NIGHT PURGE MODE
										buttonState = power ? (nightPurgeMode === true) : false;
										this.ervButtonsStates.push(buttonState);
										this.ervButtonsModes.push(buttonMode);
										this.ervButtonsNames.push(buttonName);
										this.ervButtonsDisplayType.push(buttonDisplayType);
										break;
									case 10: //FAN SPEED MODE AUTO
										buttonState = power ? (setFanSpeed === 0) : false;
										this.ervButtonsStates.push(buttonState);
										this.ervButtonsModes.push(buttonMode);
										this.ervButtonsNames.push(buttonName);
										this.ervButtonsDisplayType.push(buttonDisplayType);
										break;
									case 11: //FAN SPEED MODE 1
										buttonState = power ? (setFanSpeed === 1) : false;
										this.ervButtonsStates.push(buttonState);
										this.ervButtonsModes.push(buttonMode);
										this.ervButtonsNames.push(buttonName);
										this.ervButtonsDisplayType.push(buttonDisplayType);
										break;
									case 12: //FAN SPEED MODE 2
										buttonState = power ? (setFanSpeed === 2) : false;
										this.ervButtonsStates.push(buttonState);
										this.ervButtonsModes.push(buttonMode);
										this.ervButtonsNames.push(buttonName);
										this.ervButtonsDisplayType.push(buttonDisplayType);
										break;
									case 13: //FAN SPEED MODE 3
										buttonState = power ? (setFanSpeed === 3) : false;
										this.ervButtonsStates.push(buttonState);
										this.ervButtonsModes.push(buttonMode);
										this.ervButtonsNames.push(buttonName);
										this.ervButtonsDisplayType.push(buttonDisplayType);
										break;
									case 14: //FAN SPEED MODE 4
										buttonState = power ? (setFanSpeed === 4) : false;
										this.ervButtonsStates.push(buttonState);
										this.ervButtonsModes.push(buttonMode);
										this.ervButtonsNames.push(buttonName);
										this.ervButtonsDisplayType.push(buttonDisplayType);
										break;
									case 15: //PHYSICAL LOCK CONTROLS
										buttonState = (lockPhysicalControls === 1);
										this.ervButtonsStates.push(buttonState);
										this.ervButtonsModes.push(buttonMode);
										this.ervButtonsNames.push(buttonName);
										this.ervButtonsDisplayType.push(buttonDisplayType);
										break;
									case 16: //ROOM TEMP HIDE
										buttonState = (hideRoomTemperature === true);
										this.ervButtonsStates.push(buttonState);
										this.ervButtonsModes.push(buttonMode);
										this.ervButtonsNames.push(buttonName);
										this.ervButtonsDisplayType.push(buttonDisplayType);
										break;
									case 17: //SUPPLY TEMP HIDE
										buttonState = (hideSupplyTemperature === true);
										this.ervButtonsStates.push(buttonState);
										this.ervButtonsModes.push(buttonMode);
										this.ervButtonsNames.push(buttonName);
										this.ervButtonsDisplayType.push(buttonDisplayType);
										break;
									case 18: //OUTDOOR TEMP HIDE
										buttonState = (hideOutdoorTemperature === true);
										this.ervButtonsStates.push(buttonState);
										this.ervButtonsModes.push(buttonMode);
										this.ervButtonsNames.push(buttonName);
										this.ervButtonsDisplayType.push(buttonDisplayType);
										break;
								};
							};
						};

						this.ervButtonsConfiguredCount = this.ervButtonsStates.length;
						for (let i = 0; i < this.ervButtonsConfiguredCount; i++) {
							const buttonState = this.ervButtonsStates[i];
							const buttonDisplayType = this.ervButtonsDisplayType[i];
							const characteristicType = [Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][buttonDisplayType];
							if (this.ervButtonsServices) {
								this.ervButtonsServices[i]
									.updateCharacteristic(characteristicType, buttonState)
							};
						};
					};

					//update presets state
					if (presetsCount > 0) {
						this.ervPresetsStates = [];

						for (let i = 0; i < presetsCount; i++) {
							//get preset
							const preset = presets[i];
							const presetState =
								preset.Power === power
								&& preset.VentilationMode === ventilationMode
								&& preset.FanSpeed === setFanSpeed;
							this.ervPresetsStates.push(presetState);

							if (this.ervPresetsServices) {
								this.ervPresetsServices[i]
									.updateCharacteristic(Characteristic.On, presetState)
							};
						};
					};

					//start prepare accessory
					if (this.startPrepareAccessory) {
						try {
							this.operationModeSetPropsMinValue = operationModeSetPropsMinValue;
							this.operationModeSetPropsMaxValue = operationModeSetPropsMaxValue;
							this.operationModeSetPropsValidValues = operationModeSetPropsValidValues;
							this.fanSpeedSetPropsMaxValue = fanSpeedSetPropsMaxValue;

							await this.prepareAccessory();
						} catch (error) {
							this.log.error(`${deviceTypeText} ${deviceName}, prepare accessory error: ${error}`);
						};
					};
				}).on('message', (message) => {
					this.log(`${deviceTypeText} ${deviceName}, ${message}`);
				}).on('error', (error) => {
					this.log.error(`${deviceTypeText} ${deviceName}, ${error}`);
				}).on('debug', (debug) => {
					this.log(`${deviceTypeText} ${deviceName}, ${debug}`);
				}).on('mqtt', (topic, message) => {
					this.mqtt.send(topic, message);
				});
				break;
			default: //unknown system detected
				this.log(`${deviceTypeText} ${deviceName}, Unknown system detected.`);
				break;
		};
	};

	//prepare accessory
	prepareAccessory() {
		return new Promise((resolve, reject) => {
			this.log.debug('prepareAccessory');
			try {
				const melCloudInfo = this.melCloudInfo;
				const deviceId = this.deviceId;
				const deviceState = this.deviceState;
				const deviceName = this.deviceName;
				const deviceType = this.deviceType;
				const deviceTypeText = this.deviceTypeText;
				const temperatureUnit = CONSTANS.TemperatureDisplayUnits[this.useFahrenheit];

				//accessory
				const accessoryName = deviceName;
				const accessoryUUID = UUID.generate(deviceId);
				const accessoryCategory = [Categories.AIR_CONDITIONER, Categories.AIR_HEATER, Categories.OTHER, Categories.FAN][deviceType];
				const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

				//information service
				this.log.debug('prepareInformationService');
				accessory.getService(Service.AccessoryInformation)
					.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
					.setCharacteristic(Characteristic.Model, this.modelName)
					.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
					.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

				//melcloud services
				switch (deviceType) {
					case 0: //air conditioner
						this.log.debug('prepareMelCloudServiceAta');
						const ataDisplayMode = this.ataDisplayMode;
						const ataHasAutomaticFanSpeed = this.ataHasAutomaticFanSpeed;
						const ataModelSupportsFanSpeed = this.ataModelSupportsFanSpeed;
						const ataModelSupportsAuto = this.ataModelSupportsAuto;
						const ataModelSupportsHeat = this.ataModelSupportsHeat;
						const ataModelSupportsDry = this.ataModelSupportsDry;
						const ataNumberOfFanSpeeds = this.ataNumberOfFanSpeeds;
						const ataSwingFunction = this.ataSwingFunction;
						const ataButtonsCount = this.ataButtonsConfiguredCount;
						const ataPresetsCount = this.ataPresetsCount;
						const ataServiceName = `${accessoryName} ${deviceTypeText}`;
						const ataAutoDryFan = [ataModelSupportsDry ? 2 : 7, 7][this.ataAutoHeatMode];
						const ataHeatFanDry = [7, ataModelSupportsDry ? 2 : 7][this.ataAutoHeatMode];

						this.ataMelCloudServices = [];
						switch (ataDisplayMode) {
							case 0: //Heater Cooler
								const ataMelCloudService = new Service.HeaterCooler(ataServiceName, 'HeaterCooler');
								ataMelCloudService.getCharacteristic(Characteristic.Active)
									.onGet(async () => {
										const state = this.power;
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Power: ${state ? 'ON' : 'OFF'}`);
										return state;
									})
									.onSet(async (state) => {
										try {
											deviceState.Power = state;
											deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power;
											await this.melCloudAta.send(deviceState);
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set power: ${state ? 'ON' : 'OFF'}`);
										} catch (error) {
											this.log.error(`${deviceTypeText} ${accessoryName}, Set power error: ${error}`);
											ataMelCloudService.updateCharacteristic(Characteristic.Active, false)
										};
									});
								ataMelCloudService.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
									.onGet(async () => {
										const value = this.currentOperationMode;
										const operationModeText = !this.power ? CONSTANS.AirConditioner.System[0] : CONSTANS.AirConditioner.DriveMode[deviceState.OperationMode];
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Operation mode: ${operationModeText}`);
										return value;
									});
								ataMelCloudService.getCharacteristic(Characteristic.TargetHeaterCoolerState)
									.setProps({
										minValue: this.operationModeSetPropsMinValue,
										maxValue: this.operationModeSetPropsMaxValue,
										validValues: this.operationModeSetPropsValidValues
									})
									.onGet(async () => {
										const value = this.targetOperationMode; //1 = HEAT, 2 = DRY 3 = COOL, 7 = FAN, 8 = AUTO
										return value;
									})
									.onSet(async (value) => {
										try {
											switch (value) {
												case 0: //AUTO - AUTO
													deviceState.Power = true;
													deviceState.OperationMode = ataModelSupportsAuto ? 8 : ataAutoDryFan;
													deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
													break;
												case 1: //HEAT - HEAT
													deviceState.Power = true;
													deviceState.OperationMode = ataModelSupportsHeat ? 1 : ataHeatFanDry;
													deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
													break;
												case 2: //COOL - COOL
													deviceState.Power = true;
													deviceState.OperationMode = 3;
													deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
													break;
											};

											await this.melCloudAta.send(deviceState);
											const operationModeText = CONSTANS.AirConditioner.DriveMode[deviceState.OperationMode];
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set operation mode: ${operationModeText}`);
										} catch (error) {
											this.log.error(`${deviceTypeText} ${accessoryName}, Set operation mode error: ${error}`);
										};
									});
								if (ataModelSupportsFanSpeed) {
									ataMelCloudService.getCharacteristic(Characteristic.RotationSpeed)
										.setProps({
											minValue: 0,
											maxValue: this.fanSpeedSetPropsMaxValue,
											minStep: 1
										})
										.onGet(async () => {
											const value = this.fanSpeed; //AUTO, 1, 2, 3, 4, 5, 6, OFF
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Fan speed mode: ${CONSTANS.AirConditioner.FanSpeed[this.setFanSpeed]}`);
											return value;
										})
										.onSet(async (value) => {
											try {
												const power = (ataHasAutomaticFanSpeed && value > 0) || (!ataHasAutomaticFanSpeed && value > 1) ? true : false;
												const fanSpeed = ataHasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 5, 6, 0][value] : [1, 1, 2, 3, 4, 5, 6][value]; //AUTO, 1, 2, 3, 4, 5, 6
												const fanSpeedModeText = ataHasAutomaticFanSpeed ? [7, 1, 2, 3, 4, 5, 6, 0][value] : [7, 1, 2, 3, 4, 5, 6][value]; //AUTO, 1, 2, 3, 4, 5, 6, OFF

												deviceState.Power = power;
												deviceState.SetFanSpeed = fanSpeed;
												deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.SetFanSpeed;
												await this.melCloudAta.send(deviceState);
												const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set fan speed mode: ${CONSTANS.AirConditioner.FanSpeed[fanSpeedModeText]}`);
											} catch (error) {
												this.log.error(`${deviceTypeText} ${accessoryName}, Set fan speed mode error: ${error}`);
											};
										});
								};
								if (ataSwingFunction) {
									ataMelCloudService.getCharacteristic(Characteristic.SwingMode)
										.onGet(async () => {
											//Vane Horizontal: Auto, 1, 2, 3, 4, 5, 12 = Swing //Vertical: Auto, 1, 2, 3, 4, 5, 7 = Swing
											const value = this.swingMode;
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Vane swing mode: ${CONSTANS.AirConditioner.AirDirection[value ? 6 : 0]}`);
											return value;
										})
										.onSet(async (value) => {
											try {
												deviceState.Power = true;
												deviceState.VaneHorizontal = value ? 12 : 0;
												deviceState.VaneVertical = value ? 7 : 0;
												deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.VaneHorizontal + CONSTANS.AirConditioner.EffectiveFlags.VaneVertical;
												await this.melCloudAta.send(deviceState);
												const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set vane swing mode: ${CONSTANS.AirConditioner.AirDirection[value ? 6 : 0]}`);
											} catch (error) {
												this.log.error(`${deviceTypeText} ${accessoryName}, Set vane swing mode error: ${error}`);
											};
										});
								};
								ataMelCloudService.getCharacteristic(Characteristic.CurrentTemperature)
									.setProps({
										minValue: -35,
										maxValue: 150,
										minStep: this.ataTemperatureIncrement
									})
									.onGet(async () => {
										const value = this.roomTemperature;
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Room temperature: ${value}${temperatureUnit}`);
										return value;
									});
								ataMelCloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
									.setProps({
										minValue: this.ataTargetTempSetPropsMinValue,
										maxValue: this.ataTargetTempSetPropsMaxValue,
										minStep: this.ataTemperatureIncrement
									})
									.onGet(async () => {
										const value = this.setTemperature;
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Heating threshold temperature: ${value}${temperatureUnit}`);
										return value;
									})
									.onSet(async (value) => {
										try {
											deviceState.Power = true;
											deviceState.SetTemperature = value;
											deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.SetTemperature;
											await this.melCloudAta.send(deviceState);
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set heating threshold temperature: ${value}${temperatureUnit}`);
										} catch (error) {
											this.log.error(`${deviceTypeText} ${accessoryName}, Set heating threshold temperature error: ${error}`);
										};
									});
								ataMelCloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
									.setProps({
										minValue: this.ataTargetTempSetPropsMinValue,
										maxValue: this.ataTargetTempSetPropsMaxValue,
										minStep: this.ataTemperatureIncrement
									})
									.onGet(async () => {
										const value = this.setTemperature;
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Cooling threshold temperature: ${value}${temperatureUnit}`);
										return value;
									})
									.onSet(async (value) => {
										try {
											deviceState.Power = true;
											deviceState.SetTemperature = value;
											deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.SetTemperature;
											await this.melCloudAta.send(deviceState);
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set cooling threshold temperature: ${value}${temperatureUnit}`);
										} catch (error) {
											this.log.error(`${deviceTypeText} ${accessoryName}, Set cooling threshold temperature error: ${error}`);
										};
									});
								ataMelCloudService.getCharacteristic(Characteristic.LockPhysicalControls)
									.onGet(async () => {
										const value = this.lockPhysicalControls;
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Lock physical controls: ${value ? 'LOCKED' : 'UNLOCKED'}`);
										return value;
									})
									.onSet(async (value) => {
										try {
											value = value ? true : false;
											deviceState.ProhibitSetTemperature = value;
											deviceState.ProhibitOperationMode = value;
											deviceState.ProhibitPower = value;
											await this.melCloudAta.send(deviceState);
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set locl physical controls: ${value ? 'LOCK' : 'UNLOCK'}`);
										} catch (error) {
											this.log.error(`${deviceTypeText} ${accessoryName}, Set lock physical controls error: ${error}`);
										};
									});
								ataMelCloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
									.onGet(async () => {
										const value = this.useFahrenheit;
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Temperature display unit: ${temperatureUnit}`);
										return value;
									})
									.onSet(async (value) => {
										try {
											melCloudInfo.UseFahrenheit = value ? true : false;
											await this.melCloud.send(melCloudInfo);
											this.melCloudInfo = melCloudInfo;
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set temperature display unit: ${CONSTANS.TemperatureDisplayUnits[value]}`);
										} catch (error) {
											this.log.error(`${deviceTypeText} ${accessoryName}, Set temperature display unit error: ${error}`);
										};
									});
								this.ataMelCloudServices.push(ataMelCloudService);
								accessory.addService(this.ataMelCloudServices[0]);
								break;
							case 1: //Thermostat
								const ataMelCloudServiceT = new Service.Thermostat(ataServiceName, 'Thermostat');
								ataMelCloudServiceT.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
									.onGet(async () => {
										const value = this.currentOperationMode;
										const operationModeText = !this.power ? CONSTANS.HeatPump.System[0] : CONSTANS.HeatPump.OperationMode[deviceState.OperationMode];
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Operation mode: ${operationModeText}`);
										return value;
									});
								ataMelCloudServiceT.getCharacteristic(Characteristic.TargetHeatingCoolingState)
									.setProps({
										minValue: this.operationModeSetPropsMinValue,
										maxValue: this.operationModeSetPropsMaxValue,
										validValues: this.operationModeSetPropsValidValues
									})
									.onGet(async () => {
										const value = this.targetOperationMode; //1 = HEAT, 2 = DRY 3 = COOL, 7 = FAN, 8 = AUTO
										return value;
									})
									.onSet(async (value) => {
										try {
											switch (value) {
												case 0: //OFF - POWER OFF
													deviceState.Power = false;
													deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power;
													break;
												case 1: //HEAT - HEAT
													deviceState.Power = true;
													deviceState.OperationMode = ataModelSupportsHeat ? 1 : ataHeatFanDry;
													deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
													break;
												case 2: //COOL - COOL
													deviceState.Power = true;
													deviceState.OperationMode = 3;
													deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
													break;
												case 3: //AUTO - AUTO
													deviceState.Power = true;
													deviceState.OperationMode = ataModelSupportsAuto ? 8 : ataAutoDryFan;
													deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power + CONSTANS.AirConditioner.EffectiveFlags.OperationMode;
													break;
											};

											await this.melCloudAta.send(deviceState);
											const operationModeText = CONSTANS.AirConditioner.DriveMode[deviceState.OperationMode];
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set operation mode: ${operationModeText}`);
										} catch (error) {
											this.log.error(`${deviceTypeText} ${accessoryName}, Set operation mode error: ${error}`);
										};
									});
								ataMelCloudServiceT.getCharacteristic(Characteristic.CurrentTemperature)
									.setProps({
										minValue: -35,
										maxValue: 150,
										minStep: this.ataTemperatureIncrement
									})
									.onGet(async () => {
										const value = this.roomTemperature;
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Room temperature: ${value}${temperatureUnit}`);
										return value;
									});
								ataMelCloudServiceT.getCharacteristic(Characteristic.TargetTemperature)
									.setProps({
										minValue: this.ataTargetTempSetPropsMinValue,
										maxValue: this.ataTargetTempSetPropsMaxValue,
										minStep: this.ataTemperatureIncrement
									})
									.onGet(async () => {
										const value = this.setTemperature;
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Target temperature: ${value}${temperatureUnit}`);
										return value;
									})
									.onSet(async (value) => {
										try {
											deviceState.Power = true;
											deviceState.SetTemperature = value;
											deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.SetTemperature;
											await this.melCloudAta.send(deviceState);
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set temperature: ${value}${temperatureUnit}`);
										} catch (error) {
											this.log.error(`${deviceTypeText} ${accessoryName}, Set temperature error: ${error}`);
										};
									});
								ataMelCloudServiceT.getCharacteristic(Characteristic.TemperatureDisplayUnits)
									.onGet(async () => {
										const value = this.useFahrenheit;
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Temperature display unit: ${temperatureUnit}`);
										return value;
									})
									.onSet(async (value) => {
										try {
											melCloudInfo.UseFahrenheit = value ? true : false;
											await this.melCloud.send(melCloudInfo);
											this.melCloudInfo = melCloudInfo;
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set temperature display unit: ${CONSTANS.TemperatureDisplayUnits[value]}`);
										} catch (error) {
											this.log.error(`${deviceTypeText} ${accessoryName}, Set temperature display unit error: ${error}`);
										};
									});
								this.ataMelCloudServices.push(ataMelCloudServiceT);
								accessory.addService(this.ataMelCloudServices[0]);
								break;
						};

						//buttons services
						if (ataButtonsCount > 0) {
							this.log.debug('prepareButtonsService');
							this.ataButtonsServices = [];

							for (let i = 0; i < ataButtonsCount; i++) {
								//get button mode
								const buttonMode = this.ataButtonsModes[i];

								//get button name
								const buttonName = this.ataButtonsNames[i];

								//get button display type
								const buttonDisplayType = this.ataButtonsDisplayType[i];

								const buttonServiceType = [Service.Outlet, Service.Switch, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][buttonDisplayType];
								const characteristicType = [Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][buttonDisplayType];
								const buttonService = new buttonServiceType(`${accessoryName} ${buttonName}`, `Button ${i}`);
								buttonService.getCharacteristic(characteristicType)
									.onGet(async () => {
										const state = this.ataButtonsStates[i];
										return state;
									})
									.onSet(async (state) => {
										if (buttonDisplayType <= 1) {
											try {
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
													case 7: //OPERATING MODE DRY CONTROL HIDE
														deviceState.HideDryModeControl = state;
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
													case 27: //VANE H/V CONTROLS HIDE
														deviceState.HideVaneControls = state;
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
													case 37: //PHYSICAL LOCK CONTROLS
														deviceState.ProhibitSetTemperature = state;
														deviceState.ProhibitOperationMode = state;
														deviceState.ProhibitPower = state;
														break;
													case 38: //PHYSICAL LOCK CONTROLS POWER
														deviceState.ProhibitPower = state;
														break;
													case 39: //PHYSICAL LOCK CONTROLS MODE
														deviceState.ProhibitOperationMode = state;
														break;
													case 40: //PHYSICAL LOCK CONTROLS TTEMP
														deviceState.ProhibitSetTemperature = state;
														break;
													default:
														deviceState = deviceState;
														break;
												};

												await this.melCloudAta.send(deviceState);
												const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set: ${buttonName}`);
											} catch (error) {
												this.log.error(`${deviceTypeText} ${accessoryName}, Set button error: ${error}`);
											};
										};
									});

								this.ataButtonsServices.push(buttonService);
								accessory.addService(this.ataButtonsServices[i])
							};
						};

						//presets services
						if (ataPresetsCount > 0) {
							this.log.debug('preparePresetsService');
							this.ataPresetsServices = [];
							const ataPreviousPresets = [];

							for (let i = 0; i < ataPresetsCount; i++) {
								const preset = this.ataPresets[i];
								const presetName = preset.NumberDescription;

								const presetService = new Service.Outlet(`${accessoryName} ${presetName}`, `Preset ${i}`);
								presetService.getCharacteristic(Characteristic.On)
									.onGet(async () => {
										const state = this.ataPresetsStates[i];
										return state;
									})
									.onSet(async (state) => {
										try {
											switch (state) {
												case true:
													deviceState.Power = preset.Power;
													deviceState.SetTemperature = preset.SetTemperature;
													deviceState.OperationMode = preset.OperationMode;
													deviceState.VaneHorizontal = preset.VaneHorizontal;
													deviceState.VaneVertical = preset.VaneVertical;
													deviceState.SetFanSpeed = preset.FanSpeed;
													deviceState.EffectiveFlags = CONSTANS.AirConditioner.EffectiveFlags.Power;
													break;
												case false:
													deviceState = ataPreviousPresets[i];
													ataPreviousPresets[i] = deviceState;
													break;
											};

											await this.melCloudAta.send(deviceState);
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set: ${presetName}`);
										} catch (error) {
											this.log.error(`${deviceTypeText} ${accessoryName}, Set preset error: ${error}`);
										};
									});

								ataPreviousPresets.push(deviceState);
								this.ataPresetsServices.push(presetService);
								accessory.addService(this.ataPresetsServices[i]);
							};
						};
						break;
					case 1: //heat pump
						this.log.debug('prepareMelCloudServiceAtw');
						this.atwMelCloudServices = [];
						const atwZonesCount = this.atwZonesCount;
						if (atwZonesCount > 0) {
							const atwDisplayMode = this.atwDisplayMode;
							const atwCaseHotWater = this.atwCaseHotWater;
							const atwCaseZone2 = this.atwCaseZone2;
							const atwButtonsCount = this.atwButtonsConfiguredCount;
							const atwPresetsCount = this.atwPresetsCount;

							for (let i = 0; i < atwZonesCount; i++) {
								const zoneName = [this.atwHeatPumpName, this.atwZone1Name, this.atwHotWaterName, this.atwZone2Name][i];
								const atwServiceName = `${accessoryName}: ${zoneName}`;
								switch (atwDisplayMode) {
									case 0: //Heater Cooler
										const atwMelCloudService = new Service.HeaterCooler(atwServiceName, 'HeaterCooler' + i);
										atwMelCloudService.getCharacteristic(Characteristic.Active)
											.onGet(async () => {
												const state = this.power;
												const logInfo = this.disableLogInfo || i > 0 ? false : this.log(`${deviceTypeText} ${accessoryName}, ${zoneName}, Power: ${state ? 'ON' : 'OFF'}`);
												return state;
											})
											.onSet(async (state) => {
												try {
													switch (i) {
														case 0: //Heat Pump
															deviceState.Power = state;
															deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power;
															await this.melCloudAtw.send(deviceState);
															const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, ${zoneName}, Set power: ${state ? 'ON' : 'OFF'}`);
															break;
													};
												} catch (error) {
													this.log.error(`${deviceTypeText} ${accessoryName}, Set power error: ${error}`);
													atwMelCloudService.updateCharacteristic(Characteristic.Active, false)
												};
											});
										atwMelCloudService.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
											.onGet(async () => {
												const value = this.currentOperationModes[i];
												let operationModeText = '';
												switch (i) {
													case 0: //Heat Pump - HEAT, COOL, OFF
														operationModeText = CONSTANS.HeatPump.System[deviceState.UnitStatus];
														break;
													case 1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
														operationModeText = this.idleZone1 ? CONSTANS.HeatPump.ZoneOperation[6] : CONSTANS.HeatPump.ZoneOperation[deviceState.OperationModeZone1];
														break;
													case atwCaseHotWater: //Hot Water - AUTO, HEAT NOW
														operationModeText = deviceState.OperationMode === 1 ? CONSTANS.HeatPump.ForceDhw[1] : CONSTANS.HeatPump.ForceDhw[deviceState.ForcedHotWaterMode ? 1 : 0];
														break;
													case atwCaseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
														operationModeText = this.idleZone2 ? CONSTANS.HeatPump.ZoneOperation[6] : CONSTANS.HeatPump.ZoneOperation[deviceState.OperationModeZone2];
														break;
												};

												operationModeText = !this.power ? CONSTANS.HeatPump.System[0] : operationModeText;
												const logInfo = this.disableLogInfo && i >= atwZonesCount ? false : this.log(`${deviceTypeText} ${accessoryName}, ${zoneName}, Operation mode: ${operationModeText}`);
												return value;
											});
										atwMelCloudService.getCharacteristic(Characteristic.TargetHeaterCoolerState)
											.setProps({
												minValue: this.operationModesSetPropsMinValue[i],
												maxValue: this.operationModesSetPropsMaxValue[i],
												validValues: this.operationModesSetPropsValidValues[i]
											})
											.onGet(async () => {
												const value = this.targetOperationModes[i];
												return value;
											})
											.onSet(async (value) => {
												try {
													let operationModeText = '';
													switch (i) {
														case 0: //Heat Pump - ON, HEAT, COOL
															switch (value) {
																case 0: //AUTO
																	deviceState.Power = true;
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power;
																	break;
																case 1: //HEAT
																	deviceState.Power = true;
																	deviceState.UnitStatus = 0;
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
																	break;
																case 2: //COOL
																	deviceState.Power = true;
																	deviceState.UnitStatus = 1;
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
																	break;
															};
															operationModeText = !this.power ? CONSTANS.HeatPump.System[0] : CONSTANS.HeatPump.System[deviceState.UnitStatus];
															break;
														case 1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
															switch (value) {
																case 0: //AUTO - HEAT CURVE
																	deviceState.OperationModeZone1 = 2;
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
																	break;
																case 1: //HEAT - HEAT THERMOSTAT / COOL THERMOSTAT
																	deviceState.OperationModeZone1 = [0, 3][this.unitStatus];
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
																	break;
																case 2: //COOL - HEAT FLOOW / COOL FLOW
																	deviceState.OperationModeZone1 = [1, 4][this.unitStatus];
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
																	break;
															};
															operationModeText = CONSTANS.HeatPump.ZoneOperation[deviceState.OperationModeZone1];
															break;
														case atwCaseHotWater: //Hot Water - AUTO, HEAT NOW
															switch (value) {
																case 0: //AUTO
																	deviceState.ForcedHotWaterMode = false;
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
																	break;
																case 1: //HEAT
																	deviceState.ForcedHotWaterMode = true;
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
																	break;
																case 2: //COOL
																	deviceState.ForcedHotWaterMode = false;
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
																	break
															};
															operationModeText = deviceState.OperationMode === 1 ? CONSTANS.HeatPump.ForceDhw[1] : CONSTANS.HeatPump.ForceDhw[deviceState.ForcedHotWaterMode ? 1 : 0];
															break;
														case atwCaseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
															switch (value) {
																case 0: //AUTO
																	deviceState.OperationModeZone2 = 2;
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
																	break;
																case 1: //HEAT - HEAT THERMOSTAT / COOL THERMOSTAT
																	deviceState.OperationModeZone2 = [0, 3][this.unitStatus];
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
																	break;
																case 2: //COOL - HEAT FLOOW / COOL FLOW
																	deviceState.OperationModeZone2 = [1, 4][this.unitStatus];
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
																	break;
															};
															operationModeText = CONSTANS.HeatPump.ZoneOperation[deviceState.OperationModeZone2];
															break;
													};

													await this.melCloudAtw.send(deviceState);
													const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, ${zoneName}, Set operation mode: ${operationModeText}`);
												} catch (error) {
													this.log.error(`${deviceTypeText} ${accessoryName}, ${zoneName}, Set operation mode error: ${error}`);
												};
											});
										atwMelCloudService.getCharacteristic(Characteristic.CurrentTemperature)
											.setProps({
												minValue: -35,
												maxValue: 150,
												minStep: this.atwTemperatureIncrement
											})
											.onGet(async () => {
												const value = this.roomTemperatures[i];
												const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, ${zoneName}, ${i === 0 ? 'Outdoor temperature:' : 'Temperature:'} ${value}${temperatureUnit}`);
												return value;
											});
										//device can heat/cool or only heat
										if (this.atwHeatCoolModes === 0 || this.atwHeatCoolModes === 1) {
											atwMelCloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
												.setProps({
													minValue: this.temperaturesSetPropsMinValue[i],
													maxValue: this.temperaturesSetPropsMaxValue[i],
													minStep: this.atwTemperatureIncrement
												})
												.onGet(async () => {
													const value = this.setTemperatures[i];
													const logInfo = this.disableLogInfo || i === 0 ? false : this.log(`${deviceTypeText} ${accessoryName}, ${zoneName}, Heating threshold temperature: ${value}${temperatureUnit}`);
													return value;
												})
												.onSet(async (value) => {
													try {
														switch (i) {
															case 0: //Heat Pump
																//deviceState.SetTemperatureZone1 = value;
																//deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone1;
																break;
															case 1: //Zone 1
																deviceState.SetTemperatureZone1 = value;
																deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone1;
																break;
															case atwCaseHotWater: //Hot Water
																deviceState.SetTankWaterTemperature = value;
																deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTankWaterTemperature;
																break;
															case atwCaseZone2: //Zone 2
																deviceState.SetTemperatureZone2 = value;
																deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone2;
																break;
														};

														const set = i > 0 ? await this.melCloudAtw.send(deviceState) : false;
														const logInfo = this.disableLogInfo || i === 0 ? false : this.log(`${deviceTypeText} ${accessoryName}, ${zoneName}, Set heating threshold temperature: ${value}${temperatureUnit}`);
													} catch (error) {
														this.log.error(`${deviceTypeText} ${accessoryName}, ${zoneName}, Set heating threshold temperature error: ${error}`);
													};
												});
										};
										//only for heat/cool, only cool and not for hot water tank
										if ((this.atwHeatCoolModes === 0 || this.atwHeatCoolModes === 2) && i !== atwCaseHotWater) {
											atwMelCloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
												.setProps({
													minValue: this.temperaturesSetPropsMinValue[i],
													maxValue: this.temperaturesSetPropsMaxValue[i],
													minStep: this.atwTemperatureIncrement
												})
												.onGet(async () => {
													const value = this.setTemperatures[i];
													const logInfo = this.disableLogInfo || i === 0 ? false : this.log(`${deviceTypeText} ${accessoryName}, ${zoneName}, Cooling threshold temperature: ${value}${temperatureUnit}`);
													return value;
												})
												.onSet(async (value) => {
													try {
														switch (i) {
															case 0: //Heat Pump
																//deviceState.SetTemperatureZone1 = value;
																//deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone1;
																break;
															case 1: //Zone 1
																deviceState.SetTemperatureZone1 = value;
																deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone1;
																break;
															case atwCaseHotWater: //Hot Water
																deviceState.SetTankWaterTemperature = value;
																deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTankWaterTemperature;
																break;
															case atwCaseZone2: //Zone 2
																deviceState.SetTemperatureZone2 = value;
																deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone2;
																break;
														};

														const set = i > 0 ? await this.melCloudAtw.send(deviceState) : false;
														const logInfo = this.disableLogInfo || i === 0 ? false : this.log(`${deviceTypeText} ${accessoryName}, ${zoneName}, Set cooling threshold temperature: ${value}${temperatureUnit}`);
													} catch (error) {
														this.log.error(`${deviceTypeText} ${accessoryName}, ${zoneName}, Set cooling threshold temperature error: ${error}`);
													};
												});
										};
										atwMelCloudService.getCharacteristic(Characteristic.LockPhysicalControls)
											.onGet(async () => {
												const value = this.lockPhysicalsControls[i];
												const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, ${zoneName}, Lock physical controls: ${value ? 'LOCKED' : 'UNLOCKED'}`);
												return value;
											})
											.onSet(async (value) => {
												try {
													value = value ? true : false;
													switch (i) {
														case 0: //Heat Pump
															deviceState.ProhibitZone1 = value;
															deviceState.ProhibitHotWater = value;
															deviceState.ProhibitZone2 = value;
															break;
														case 1: //Zone 1
															deviceState.ProhibitZone1 = value;
															CONSTANS.HeatPump.EffectiveFlags.ProhibitHeatingZone1;
															break;
														case atwCaseHotWater: //Hot Water
															deviceState.ProhibitHotWater = value;
															CONSTANS.HeatPump.EffectiveFlags.ProhibitHotWater;
															break;
														case atwCaseZone2: //Zone 2
															deviceState.ProhibitZone2 = value;
															CONSTANS.HeatPump.EffectiveFlags.ProhibitHeatingZone2;
															break;
													};

													await this.melCloudAtw.send(deviceState);
													const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, ${zoneName}, Set lock physical controls: ${value ? 'LOCK' : 'UNLOCK'}`);
												} catch (error) {
													this.log.error(`${deviceTypeText} ${accessoryName}, ${zoneName}, Set lock physical controls error: ${error}`);
												};
											});
										atwMelCloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
											.onGet(async () => {
												const value = this.useFahrenheit;
												const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Temperature display unit: ${temperatureUnit}`);
												return value;
											})
											.onSet(async (value) => {
												try {
													melCloudInfo.UseFahrenheit = value ? true : false;
													await this.melCloud.send(melCloudInfo);
													this.melCloudInfo = melCloudInfo;
													const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set temperature display unit: ${CONSTANS.TemperatureDisplayUnits[value]}`);
												} catch (error) {
													this.log.error(`${deviceTypeText} ${accessoryName}, Set temperature display unit error: ${error}`);
												};
											});
										this.atwMelCloudServices.push(atwMelCloudService);
										accessory.addService(this.atwMelCloudServices[i]);
										break;
									case 1: //Thermostat
										const atwMelCloudServiceT = new Service.Thermostat(atwServiceName, 'Thermostat' + i);
										atwMelCloudServiceT.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
											.onGet(async () => {
												let operationModeText = '';
												switch (i) {
													case 0: //Heat Pump - IDLE, HOT WATER, HEATING ZONES, COOLING, "FREZE STAT, LEGIONELLA, HEATING ECO, MODE 1, MODE 2, MODE 3, HEATING UP
														operationModeText = CONSTANS.HeatPump.System[deviceState.UnitStatus];
														break;
													case 1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
														operationModeText = CONSTANS.HeatPump.ZoneOperation[deviceState.OperationModeZone1];
														break;
													case atwCaseHotWater: //Hot Water - AUTO, HEAT NOW
														operationModeText = deviceState.OperationMode === 1 ? CONSTANS.HeatPump.ForceDhw[1] : CONSTANS.HeatPump.ForceDhw[deviceState.ForcedHotWaterMode ? 1 : 0];
														break;
													case atwCaseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
														operationModeText = CONSTANS.HeatPump.ZoneOperation[deviceState.OperationModeZone2];
														break;
												};

												const value = this.currentOperationModes[i];
												operationModeText = !this.power ? CONSTANS.HeatPump.System[0] : operationModeText;
												const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, ${zoneName}, Operation mode: ${operationModeText}`);
												return value;
											});
										atwMelCloudServiceT.getCharacteristic(Characteristic.TargetHeatingCoolingState)
											.setProps({
												minValue: this.operationModesSetPropsMinValue[i],
												maxValue: this.operationModesSetPropsMaxValue[i],
												validValues: this.operationModesSetPropsValidValues[i]
											})
											.onGet(async () => {
												const value = this.targetOperationModes[i];
												return value;
											})
											.onSet(async (value) => {
												try {
													let operationModeText = '';
													switch (i) {
														case 0: //Heat Pump - HEAT, COOL
															switch (value) {
																case 0: //OFF
																	deviceState.Power = false;
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power;
																	break;
																case 1: //HEAT
																	deviceState.Power = true;
																	deviceState.UnitStatus = 0;
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
																	break;
																case 2: //COOL
																	deviceState.Power = true;
																	deviceState.UnitStatus = 1;
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
																	break;
																case 3: //AUTO
																	deviceState.Power = true;
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power;
																	break;
															};
															operationModeText = !this.power ? CONSTANS.HeatPump.System[0] : CONSTANS.HeatPump.System[deviceState.UnitStatus];
															break;
														case 1: //Zone 1 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
															switch (value) {
																case 0: //OFF - HEAT CURVE
																	deviceState.OperationModeZone1 = 2;
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
																	break;
																case 1: //HEAT - HEAT THERMOSTAT / COOL THERMOSTAT
																	deviceState.OperationModeZone1 = [0, 3][this.unitStatus];
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
																	break;
																case 2: //COOL - HEAT FLOOW / COOL FLOW
																	deviceState.OperationModeZone1 = [1, 4][this.unitStatus];
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
																	break;
																case 3: //AUTO - HEAT CURVE
																	deviceState.OperationModeZone1 = 2;
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
																	break;
															};
															operationModeText = CONSTANS.HeatPump.ZoneOperation[deviceState.OperationModeZone1];
															break;
														case atwCaseHotWater: //Hot Water - AUTO, HEAT NOW
															switch (value) {
																case 0: //OFF
																	deviceState.ForcedHotWaterMode = false;
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
																	break;
																case 1: //HEAT
																	deviceState.ForcedHotWaterMode = true;
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
																	break;
																case 2: //COOL
																	deviceState.ForcedHotWaterMode = false;
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
																	break;
																case 3: //AUTO
																	deviceState.ForcedHotWaterMode = false;
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
																	break;
															};
															operationModeText = deviceState.OperationMode === 1 ? CONSTANS.HeatPump.ForceDhw[1] : CONSTANS.HeatPump.ForceDhw[deviceState.ForcedHotWaterMode ? 1 : 0];
															break;
														case atwCaseZone2: //Zone 2 - HEAT THERMOSTAT, HEAT FLOW, HEAT CURVE, COOL THERMOSTAT, COOL FLOW, FLOOR DRYUP
															switch (value) {
																case 0: //OFF - HEAT CURVE
																	deviceState.OperationModeZone2 = 2;
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
																	break;
																case 1: //HEAT - HEAT THERMOSTAT / COOL THERMOSTAT
																	deviceState.OperationModeZone2 = [0, 3][this.unitStatus];
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
																	break;
																case 2: //COOL - HEAT FLOOW / COOL FLOW
																	deviceState.OperationModeZone2 = [1, 4][this.unitStatus];
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
																	break;
																case 3: //AUTO - HEAT CURVE
																	deviceState.OperationModeZone2 = 2;
																	deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
																	break;
															};
															operationModeText = CONSTANS.HeatPump.ZoneOperation[deviceState.OperationModeZone2];
															break;
													};

													await this.melCloudAtw.send(deviceState);
													const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, ${zoneName}, Set operation mode: ${operationModeText}`);
												} catch (error) {
													this.log.error(`${deviceTypeText} ${accessoryName}, ${zoneName}, Set operation mode error: ${error}`);
												};
											});
										atwMelCloudServiceT.getCharacteristic(Characteristic.CurrentTemperature)
											.setProps({
												minValue: -35,
												maxValue: 150,
												minStep: this.atwTemperatureIncrement
											})
											.onGet(async () => {
												const value = this.roomTemperatures[i];
												const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, ${zoneName}, ${i === 0 ? 'Outdoor temperature:' : 'Temperature:'} ${value}${temperatureUnit}`);
												return value;
											});
										atwMelCloudServiceT.getCharacteristic(Characteristic.TargetTemperature)
											.setProps({
												minValue: this.temperaturesSetPropsMinValue[i],
												maxValue: this.temperaturesSetPropsMaxValue[i],
												minStep: this.atwTemperatureIncrement
											})
											.onGet(async () => {
												const value = this.setTemperatures[i];
												const logInfo = this.disableLogInfo || i === 0 ? false : this.log(`${deviceTypeText} ${accessoryName}, ${zoneName}, Target temperature: ${value}${temperatureUnit}`);
												return value;
											})
											.onSet(async (value) => {
												try {
													switch (i) {
														case 0: //Heat Pump
															//deviceState.SetTemperatureZone1 = value;
															//deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone1;
															break;
														case 1: //Zone 1
															deviceState.SetTemperatureZone1 = value;
															deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone1;
															break;
														case atwCaseHotWater: //Hot Water
															deviceState.SetTankWaterTemperature = value;
															deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTankWaterTemperature;
															break;
														case atwCaseZone2: //Zone 2
															deviceState.SetTemperatureZone2 = value;
															deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.SetTemperatureZone2;
															break;
													};

													const set = i > 0 ? await this.melCloudAtw.send(deviceState) : false;
													const logInfo = this.disableLogInfo || i === 0 ? false : this.log(`${deviceTypeText} ${accessoryName}, ${zoneName}, Set temperature: ${value}${temperatureUnit}`);
												} catch (error) {
													this.log.error(`${deviceTypeText} ${accessoryName}, ${zoneName}, Set temperature error: ${error}`);
												};
											});
										atwMelCloudServiceT.getCharacteristic(Characteristic.TemperatureDisplayUnits)
											.onGet(async () => {
												const value = this.useFahrenheit;
												const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Temperature display unit: ${temperatureUnit}`);
												return value;
											})
											.onSet(async (value) => {
												try {
													melCloudInfo.UseFahrenheit = value ? true : false;
													await this.melCloud.send(melCloudInfo);
													this.melCloudInfo = melCloudInfo;
													const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set temperature display unit: ${CONSTANS.TemperatureDisplayUnits[value]}`);
												} catch (error) {
													this.log.error(`${deviceTypeText} ${accessoryName}, Set temperature display unit error: ${error}`);
												};
											});
										this.atwMelCloudServices.push(atwMelCloudServiceT);
										accessory.addService(this.atwMelCloudServices[i]);
										break;
								};
							};

							//buttons services
							if (atwButtonsCount > 0) {
								this.log.debug('prepareButtonsService');
								this.atwButtonsServices = [];

								for (let i = 0; i < atwButtonsCount; i++) {
									//get button mode
									const buttonMode = this.atwButtonsModes[i];

									//get button name
									const buttonName = this.atwButtonsNames[i];

									//get button display type
									const buttonDisplayType = this.atwButtonsDisplayType[i];

									const buttonServiceType = [Service.Outlet, Service.Switch, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][buttonDisplayType];
									const characteristicType = [Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][buttonDisplayType];
									const buttonService = new buttonServiceType(`${accessoryName} ${buttonName}`, `Button ${i}`);
									buttonService.getCharacteristic(characteristicType)
										.onGet(async () => {
											const state = this.atwButtonsStates[i];
											return state;
										})
										.onSet(async (state) => {
											if (buttonDisplayType <= 1) {
												try {
													switch (buttonMode) {
														case 0: //POWER ON,OFF
															deviceState.Power = state;
															deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power;
															break;
														case 1: //HEAT PUMP HEAT
															deviceState.Power = true;
															deviceState.UnitStatus = 0;
															deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
															break;
														case 2: //COOL
															deviceState.Power = true;
															deviceState.UnitStatus = 1;
															deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationMode;
															break;
														case 3: //HOLIDAY
															deviceState.HolidayMode = state;
															deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.HolidayMode;
															break;
														case 10: //ALL ZONES PHYSICAL LOCK CONTROL
															deviceState.ProhibitZone1 = state;
															deviceState.ProhibitHotWater = state;
															deviceState.ProhibitZone2 = state;
															break;
														case 20: //ZONE 1 HEAT THERMOSTAT
															deviceState.Power = true;
															deviceState.OperationModeZone1 = 0;
															deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
															break;
														case 21: //HEAT FLOW
															deviceState.Power = true;
															deviceState.OperationModeZone1 = 1;
															deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
															break;
														case 22: //HEAT CURVE
															deviceState.Power = true;
															deviceState.OperationModeZone1 = 2;
															deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
															break;
														case 23: //COOL THERMOSTAT
															deviceState.Power = true;
															deviceState.OperationModeZone1 = 3;
															deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
															break;
														case 24: //COOL FLOW
															deviceState.Power = true;
															deviceState.OperationModeZone1 = 4;
															deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
															break;
														case 25: //FLOOR DRYUP
															deviceState.Power = true;
															deviceState.OperationModeZone1 = 5;
															deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone1;
															break;
														case 30: //PHYSICAL LOCK CONTROL
															deviceState.ProhibitZone1 = state;
															CONSTANS.HeatPump.EffectiveFlags.ProhibitHeatingZone1;
															break;
														case 40: //HOT WATER NORMAL/FORCE HOT WATER
															deviceState.Power = true;
															deviceState.ForcedHotWaterMode = state;
															deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.ForcedHotWaterMode;
															break;
														case 41: //NORMAL/ECO
															deviceState.Power = true;
															deviceState.EcoHotWater = state;
															deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.EcoHotWater;
															break;
														case 50: //PHYSICAL LOCK CONTROL
															deviceState.ProhibitHotWater = state;
															CONSTANS.HeatPump.EffectiveFlags.ProhibitHotWater;
															break;
														case 60: //ZONE 2 HEAT THERMOSTAT
															deviceState.Power = true;
															deviceState.OperationModeZone2 = 0;
															deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
															break;
														case 61: // HEAT FLOW
															deviceState.Power = true;
															deviceState.OperationModeZone2 = 1;
															deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
															break;
														case 62: //HEAT CURVE
															deviceState.Power = true;
															deviceState.OperationModeZone2 = 2;
															deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
															break;
														case 63: //COOL THERMOSTAT
															deviceState.Power = true;
															deviceState.OperationModeZone2 = 3;
															deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
															break;
														case 64: //COOL FLOW
															deviceState.Power = true;
															deviceState.OperationModeZone2 = 4;
															deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
															break;
														case 65: //FLOOR DRYUP
															deviceState.Power = true;
															deviceState.OperationModeZone2 = 5;
															deviceState.EffectiveFlags = CONSTANS.HeatPump.EffectiveFlags.Power + CONSTANS.HeatPump.EffectiveFlags.OperationModeZone2;
															break;
														case 70: //PHYSICAL LOCK CONTROL
															deviceState.ProhibitZone2 = state;
															CONSTANS.HeatPump.EffectiveFlags.ProhibitHeatingZone2;
															break;
														default:
															deviceState = deviceState;
															break;
													};

													await this.melCloudAtw.send(deviceState);
													const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set: ${buttonName}`);
												} catch (error) {
													this.log.error(`${deviceTypeText} ${accessoryName}, Set button error: ${error}`);
												};
											};
										});

									this.atwButtonsServices.push(buttonService);
									accessory.addService(this.atwButtonsServices[i])
								};
							};

							//presets services
							if (atwPresetsCount > 0) {
								this.log.debug('preparePresetsService');
								this.atwPresetsServices = [];
								const atwPreviousPresets = [];

								for (let i = 0; i < atwPresetsCount; i++) {
									const preset = this.atwPresets[i];
									const presetName = preset.NumberDescription;

									const presetService = new Service.Outlet(`${accessoryName} ${presetName}`, `Preset ${i}`);
									presetService.getCharacteristic(Characteristic.On)
										.onGet(async () => {
											const state = this.atwPresetsStates[i];
											return state;
										})
										.onSet(async (state) => {
											try {
												switch (state) {
													case true:
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
													case false:
														deviceState = atwPreviousPresets[i];
														atwPreviousPresets[i] = deviceState;
														break;
												};

												await this.melCloudAtw.send(deviceState);
												const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set: ${presetName}`);
											} catch (error) {
												this.log.error(`${deviceTypeText} ${accessoryName}, Set preset error: ${error}`);
											};
										});

									atwPreviousPresets.push(deviceState);
									this.atwPresetsServices.push(presetService);
									accessory.addService(this.atwPresetsServices[i]);
								};
							};
						};
						break;
					case 2: //energy recovery ventilation
						this.log.debug('prepareMelCloudServiceErv');
						const ervDisplayMode = this.ervDisplayMode;
						const ervHasAutoVentilationMode = this.ervHasAutoVentilationMode;
						const ervHasAutomaticFanSpeed = this.ervHasAutomaticFanSpeed;
						const ervNumberOfFanSpeeds = this.ervNumberOfFanSpeeds
						const ervButtonsCount = this.ervButtonsConfiguredCount;
						const ervPresetsCount = this.ervPresetsCount;
						const ervServiceName = `${accessoryName} ${deviceTypeText}`;

						this.ervMelCloudServices = [];
						switch (ervDisplayMode) {
							case 0: //Heater Cooler
								const ervMelCloudService = new Service.HeaterCooler(ervServiceName, 'HeaterCooler');
								ervMelCloudService.getCharacteristic(Characteristic.Active)
									.onGet(async () => {
										const state = this.power;
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Power: ${state ? 'ON' : 'OFF'}`);
										return state;
									})
									.onSet(async (state) => {
										try {
											deviceState.Power = state;
											deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power;
											await this.melCloudErv.send(deviceState);
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set power: ${state ? 'ON' : 'OFF'}`);
										} catch (error) {
											this.log.error(`${deviceTypeText} ${accessoryName}, Set power error: ${error}`);
											ervMelCloudService.updateCharacteristic(Characteristic.Active, false)
										};
									});
								ervMelCloudService.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
									.onGet(async () => {
										const value = this.currentOperationMode;
										const operationModeText = !this.power ? CONSTANS.Ventilation.System[0] : CONSTANS.Ventilation.OperationMode[deviceState.VentilationMode];
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Operation mode: ${operationModeText}`);
										return value;
									});
								ervMelCloudService.getCharacteristic(Characteristic.TargetHeaterCoolerState)
									.setProps({
										minValue: this.operationModeSetPropsMinValue,
										maxValue: this.operationModeSetPropsMaxValue,
										validValues: this.operationModeSetPropsValidValues
									})
									.onGet(async () => {
										const value = this.targetOperationMode; //LOSSNAY, BYPAS, AUTO
										return value;
									})
									.onSet(async (value) => {
										try {
											switch (value) {
												case 0: //AUTO - AUTO
													deviceState.Power = true;
													deviceState.VentilationMode = ervHasAutoVentilationMode ? 2 : 0;
													deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
													break;
												case 1: //HEAT - LOSSNAY
													deviceState.Power = true;
													deviceState.VentilationMode = 0;
													deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
													break;
												case 2: //COOL - BYPASS
													deviceState.Power = true;
													deviceState.VentilationMode = 1;
													deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
													break;
											};

											await this.melCloudErv.send(deviceState);
											const operationModeText = CONSTANS.Ventilation.VentilationMode[deviceState.VentilationMode];
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set operation mode: ${operationModeText}`);
										} catch (error) {
											this.log.error(`${deviceTypeText} ${accessoryName}, Set operation mode error: ${error}`);
										};
									});
								ervMelCloudService.getCharacteristic(Characteristic.RotationSpeed)
									.setProps({
										minValue: 0,
										maxValue: this.fanSpeedSetPropsMaxValue,
										minStep: 1
									})
									.onGet(async () => {
										const value = this.fanSpeed; //STOP, 1, 2, 3, 4, OFF
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Fan speed mode: ${CONSTANS.Ventilation.FanSpeed[this.setFanSpeed]}`);
										return value;
									})
									.onSet(async (value) => {
										try {
											const power = (ervHasAutomaticFanSpeed && value > 0) || (!ervHasAutomaticFanSpeed && value > 1) ? true : false;
											const fanSpeed = ervHasAutomaticFanSpeed ? [0, 1, 2, 3, 4, 0][value] : [1, 1, 2, 3, 4][value]; //AUTO, 1, 2, 3, 4, OFF
											const fanSpeedModeText = ervHasAutomaticFanSpeed ? [5, 1, 2, 3, 4, 0][value] : [5, 1, 2, 3, 4][value];

											deviceState.Power = power;
											deviceState.SetFanSpeed = fanSpeed;
											deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
											await this.melCloudErv.send(deviceState);
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set fan speed mode: ${CONSTANS.Ventilation.FanSpeed[fanSpeedModeText]}`);
										} catch (error) {
											this.log.error(`${deviceTypeText} ${accessoryName}, Set fan speed mode error: ${error}`);
										};
									});
								ervMelCloudService.getCharacteristic(Characteristic.CurrentTemperature)
									.setProps({
										minValue: -35,
										maxValue: 150,
										minStep: this.ervTemperatureIncrement
									})
									.onGet(async () => {
										const value = this.roomTemperature;
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Room temperature: ${value}${temperatureUnit}`);
										return value;
									});
								ervMelCloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
									.setProps({
										minValue: this.ervTargetTempSetPropsMinValue,
										maxValue: this.ervTargetTempSetPropsMaxValue,
										minStep: this.ervTemperatureIncrement
									})
									.onGet(async () => {
										const value = this.setTemperature;
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Heating threshold temperature: ${value}${temperatureUnit}`);
										return value;
									})
									.onSet(async (value) => {
										try {
											deviceState.SetTemperature = value;
											deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.SetTemperature;
											await this.melCloudErv.send(deviceState);
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set heating threshold temperature: ${value}${temperatureUnit}`);
										} catch (error) {
											this.log.error(`${deviceTypeText} ${accessoryName}, Set heating threshold temperature error: ${error}`);
										};
									});
								ervMelCloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
									.setProps({
										minValue: this.ervTargetTempSetPropsMinValue,
										maxValue: this.ervTargetTempSetPropsMaxValue,
										minStep: this.ervTemperatureIncrement
									})
									.onGet(async () => {
										const value = this.setTemperature;
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Cooling threshold temperature: ${value}${temperatureUnit}`);
										return value;
									})
									.onSet(async (value) => {
										try {
											deviceState.SetTemperature = value;
											deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.SetTemperature;
											await this.melCloudErv.send(deviceState);
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set cooling threshold temperature: ${value}${temperatureUnit}`);
										} catch (error) {
											this.log.error(`${deviceTypeText} ${accessoryName}, Set cooling threshold temperature error: ${error}`);
										};
									});
								ervMelCloudService.getCharacteristic(Characteristic.LockPhysicalControls)
									.onGet(async () => {
										const value = this.lockPhysicalControls;
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Lock physical controls: ${value ? 'LOCKED' : 'UNLOCKED'}`);
										return value;
									})
									.onSet(async (value) => {
										try {
											value = value ? true : false;
											deviceState.ProhibitSetTemperature = value;
											deviceState.ProhibitOperationMode = value;
											deviceState.ProhibitPower = value;
											await this.melCloudErv.send(deviceState);
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set locl physical controls: ${value ? 'LOCK' : 'UNLOCK'}`);
										} catch (error) {
											this.log.error(`${deviceTypeText} ${accessoryName}, Set lock physical controls error: ${error}`);
										};
									});
								ervMelCloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
									.onGet(async () => {
										const value = this.useFahrenheit;
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Temperature display unit: ${temperatureUnit}`);
										return value;
									})
									.onSet(async (value) => {
										try {
											melCloudInfo.UseFahrenheit = value ? true : false;
											await this.melCloud.send(melCloudInfo);
											this.melCloudInfo = melCloudInfo;
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set temperature display unit: ${CONSTANS.TemperatureDisplayUnits[value]}`);
										} catch (error) {
											this.log.error(`${deviceTypeText} ${accessoryName}, Set temperature display unit error: ${error}`);
										};
									});
								this.ataMelCloudServices.push(ervMelCloudService);
								accessory.addService(this.ervMelCloudServices[0]);
							case 1: //Thermostat
								const ervMelCloudServiceT = new Service.Thermostat(ervServiceName, 'Thermostat');
								ervMelCloudServiceT.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
									.onGet(async () => {
										const value = this.currentOperationMode;
										const operationModeText = !this.power ? CONSTANS.Ventilation.System[0] : CONSTANS.Ventilation.OperationMode[deviceState.OperationMode];
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Operation mode: ${operationModeText}`);
										return value;
									});
								ervMelCloudServiceT.getCharacteristic(Characteristic.TargetHeatingCoolingState)
									.setProps({
										minValue: this.operationModeSetPropsMinValue,
										maxValue: this.operationModeSetPropsMaxValue,
										validValues: this.operationModeSetPropsValidValues
									})
									.onGet(async () => {
										const value = this.targetOperationMode; //LOSSNAY, BYPASS, AUTO
										return value;
									})
									.onSet(async (value) => {
										try {
											switch (value) {
												case 0: //OFF - POWER OFF
													deviceState.Power = false;
													deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power;
													break;
												case 1: //HEAT - LOSSNAY
													deviceState.Power = true;
													deviceState.VentilationMode = 0;
													deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
													break;
												case 2: //COOL - BYPASS
													deviceState.Power = true;
													deviceState.VentilationMode = 1;
													deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
													break;
												case 3: //AUTO - AUTO
													deviceState.Power = true;
													deviceState.VentilationMode = 2;
													deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
													break;
											};

											await this.melCloudErv.send(deviceState);
											const operationModeText = CONSTANS.Ventilation.VentilationMode[deviceState.VentilationMode];
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set operation mode: ${operationModeText}`);
										} catch (error) {
											this.log.error(`${deviceTypeText} ${accessoryName}, Set operation mode error: ${error}`);
										};
									});
								ervMelCloudServiceT.getCharacteristic(Characteristic.CurrentTemperature)
									.setProps({
										minValue: -35,
										maxValue: 150,
										minStep: this.ervTemperatureIncrement
									})
									.onGet(async () => {
										const value = this.roomTemperature;
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Room temperature: ${value}${temperatureUnit}`);
										return value;
									});
								ervMelCloudServiceT.getCharacteristic(Characteristic.TargetTemperature)
									.setProps({
										minValue: this.ervTargetTempSetPropsMinValue,
										maxValue: this.ervTargetTempSetPropsMaxValue,
										minStep: this.ervTemperatureIncrement
									})
									.onGet(async () => {
										const value = this.setTemperature;
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Target temperature: ${value}${temperatureUnit}`);
										return value;
									})
									.onSet(async (value) => {
										try {
											deviceState.SetTemperature = value;
											deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.SetTemperature;
											await this.melCloudErv.send(deviceState);
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set temperature: ${value}${temperatureUnit}`);
										} catch (error) {
											this.log.error(`${deviceTypeText} ${accessoryName}, Set temperature error: ${error}`);
										};
									});
								ervMelCloudServiceT.getCharacteristic(Characteristic.TemperatureDisplayUnits)
									.onGet(async () => {
										const value = this.useFahrenheit;
										const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Temperature display unit: ${temperatureUnit}`);
										return value;
									})
									.onSet(async (value) => {
										try {
											melCloudInfo.UseFahrenheit = value ? true : false;
											await this.melCloud.send(melCloudInfo);
											this.melCloudInfo = melCloudInfo;
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set temperature display unit: ${CONSTANS.TemperatureDisplayUnits[value]}`);
										} catch (error) {
											this.log.error(`${deviceTypeText} ${accessoryName}, Set temperature display unit error: ${error}`);
										};
									});
								this.ataMelCloudServices.push(ervMelCloudServiceT);
								accessory.addService(this.ervMelCloudServices[i]);
								break;
						};

						//filter maintenance
						this.ervFilterMaintenanceService = new Service.FilterMaintenance(`${accessoryName} Filter Maintenance`, `FilterMaintenance${deviceId}`);
						this.ervFilterMaintenanceService.getCharacteristic(Characteristic.FilterChangeIndication)
							.onGet(async () => {
								const value = this.ervFilterMaintenanceRequired;
								const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Filter maintenance: ${CONSTANS.Ventilation.FilterMaintenance[value]}`);
								return value;
							});
						this.ervFilterMaintenanceService.getCharacteristic(Characteristic.ResetFilterIndication)
							.onSet(async (state) => {
							});
						accessory.addService(this.ervFilterMaintenanceService);

						//buttons services
						if (ervButtonsCount > 0) {
							this.log.debug('prepareButtonsService');
							this.ervButtonsServices = [];

							for (let i = 0; i < ervButtonsCount; i++) {
								//get button mode
								const buttonMode = this.ervButtonsModes[i];

								//get button name
								const buttonName = this.ervButtonsNames[i];

								//get button display type
								const buttonDisplayType = this.ervButtonsDisplayType[i];

								const buttonServiceType = [Service.Outlet, Service.Switch, Service.MotionSensor, Service.OccupancySensor, Service.ContactSensor][buttonDisplayType];
								const characteristicType = [Characteristic.On, Characteristic.On, Characteristic.MotionDetected, Characteristic.OccupancyDetected, Characteristic.ContactSensorState][buttonDisplayType];
								const buttonService = new buttonServiceType(`${accessoryName} ${buttonName}`, `Button ${i}`);
								buttonService.getCharacteristic(characteristicType)
									.onGet(async () => {
										const state = this.ervButtonsStates[i];
										return state;
									})
									.onSet(async (state) => {
										if (buttonDisplayType <= 1) {
											try {
												switch (buttonMode) {
													case 0: //POWER ON,OFF
														deviceState.Power = state;
														deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power;
														break;
													case 1: //OPERATING MODE RECOVERY
														deviceState.Power = true;
														deviceState.VentilationMode = 0;
														deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
														break;
													case 2: //OPERATING MODE BYPAS
														deviceState.Power = true;
														deviceState.VentilationMode = 1;
														deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
														break
													case 3: //OPERATING MODE AUTO
														deviceState.Power = true;
														deviceState.VentilationMode = 2;
														deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.VentilationMode;
														break;
													case 4: //NIGHT PURGE MODE
														deviceState.NightPurgeMode = state;
														break;
													case 10: //FAN SPEED MODE AUTO
														deviceState.Power = true;
														deviceState.SetFanSpeed = 0;
														deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
														break;
													case 11: //FAN SPEED MODE 1
														deviceState.Power = true;
														deviceState.SetFanSpeed = 1;
														deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
														break;
													case 12: //FAN SPEED MODE 2
														deviceState.Power = true;
														deviceState.SetFanSpeed = 2;
														deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
														break;
													case 13: //FAN SPEED MODE 3
														deviceState.Power = true;
														deviceState.SetFanSpeed = 3;
														deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
														break;
													case 14: //FAN MODE 4
														deviceState.Power = true;
														deviceState.SetFanSpeed = 4;
														deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power + CONSTANS.Ventilation.EffectiveFlags.SetFanSpeed;
														break;
													case 15: //PHYSICAL LOCK CONTROLS
														deviceState = deviceState;
														break;
													case 16: //ROOM TEMP HIDE
														deviceState.HideRoomTemperature = state;
														break;
													case 17: //SUPPLY TEMP HIDE
														deviceState.HideSupplyTemperature = state;
														break;
													case 18: //OUTDOOR EMP HIDE
														deviceState.hideOutdoorTemperature = state;
														break;
													default:
														deviceState = deviceState;
														break;
												};

												await this.melCloudErv.send(deviceState);
												const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set: ${buttonName}`);
											} catch (error) {
												this.log.error(`${deviceTypeText} ${accessoryName}, Set button error: ${error}`);
											};
										};
									});

								this.ervButtonsServices.push(buttonService);
								accessory.addService(this.ervButtonsServices[i]);
							};
						};

						//presets services
						if (ervPresetsCount > 0) {
							this.log.debug('preparePresetsService');
							this.ervPresetsServices = [];
							const ervPreviousPresets = [];

							for (let i = 0; i < ervPresetsCount; i++) {
								const preset = this.ervPresets[i];
								const presetName = preset.NumberDescription;

								const presetService = new Service.Outlet(`${accessoryName} ${presetName}`, `Preset ${i}`);
								presetService.getCharacteristic(Characteristic.On)
									.onGet(async () => {
										const state = this.ervPresetsStates[i];
										return state;
									})
									.onSet(async (state) => {
										try {
											switch (state) {
												case true:
													deviceState.Power = preset.Power;
													deviceState.VentilationMode = preset.VentilationMode;
													deviceState.SetFanSpeed = preset.FanSpeed;
													deviceState.EffectiveFlags = CONSTANS.Ventilation.EffectiveFlags.Power;
													break;
												case false:
													deviceState = ervPreviousPresets[i];
													ervPreviousPresets[i] = deviceState;
													break;
											};

											await this.melCloudErv.send(deviceState);
											const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText} ${accessoryName}, Set: ${presetName}`);
										} catch (error) {
											this.log.error(`${deviceTypeText} ${accessoryName}, Set preset error: ${error}`);
										};
									});

								ervPreviousPresets.push(deviceState);
								this.ervPresetsServices.push(presetService);
								accessory.addService(this.ervPresetsServices[0]);
							};
						};
						break;
					default: //unknown system detected
						this.log(`${deviceTypeText} ${accessoryName}, Unknown system detected.`);
						break;
				};

				this.api.publishExternalAccessories(CONSTANS.PluginName, [accessory]);
				const debug = this.enableDebugMode ? this.log(`${deviceTypeText} ${accessoryName}, published as external accessory.`) : false;
				this.startPrepareAccessory = false;
				resolve();
			} catch (error) {
				reject(error)
			};
		});
	};
};
