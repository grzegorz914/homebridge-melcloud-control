'use strict';

const fs = require('fs');
const path = require('path');
const mqttClient = require('./src/mqtt.js');
const melcloud = require('./src/melcloud')
const melclouddevice = require('./src/melclouddevice')

const API_URL = require('./src/apiurl.json');
const DEVICES_EFFECTIVE_FLAGS = require('./src/effectiveflags.json');
const CONSTANS = require('./src/constans.json');

const PLUGIN_NAME = 'homebridge-melcloud-control';
const PLATFORM_NAME = 'MELCloud';

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
				if (!accountName || !user || !pass || !language) {
					this.log('Name, user, password or language for %s accout missing.', i);
					return;
				} else {
					this.displayMode = account.displayMode;
					this.buttons = account.buttons || [];
					this.buttonsCount = account.buttons.length;
					this.disableLogInfo = account.disableLogInfo || false;
					const disableLogDeviceInfo = account.disableLogDeviceInfo || false;
					const enableDebugMode = account.enableDebugMode || false;

					const enableMqtt = account.enableMqtt || false;
					const mqttHost = account.mqttHost;
					const mqttPort = account.mqttPort || 1883;
					const mqttPrefix = account.mqttPrefix;
					const mqttAuth = account.mqttAuth || false;
					const mqttUser = account.mqttUser;
					const mqttPasswd = account.mqttPass;
					const mqttDebug = account.mqttDebug || false;

					const prefDir = path.join(api.user.storagePath(), 'melcloud');
					const melCloudInfoFile = `${this.prefDir}/${accountName}_Account`;
					const melCloudBuildingsFile = `${this.prefDir}/${accountName}_Buildings`;
					const melCloudDevicesFile = `${this.prefDir}/${accountName}_Devices`;

					//check if the directory exists, if not then create it
					if (fs.existsSync(prefDir) == false) {
						fs.mkdirSync(prefDir);
					}
					if (fs.existsSync(melCloudInfoFile) == false) {
						fs.writeFileSync(melCloudInfoFile, '');
					}
					if (fs.existsSync(melCloudBuildingsFile) == false) {
						fs.writeFileSync(melCloudBuildingsFile, '');
					}
					if (fs.existsSync(melCloudDevicesFile) == false) {
						fs.writeFileSync(melCloudDevicesFile, '');
					}

					//mqtt client
					if (!enableMqtt) {
						this.mqttClient = new mqttClient({
							enabled: enableMqtt,
							host: mqttHost,
							port: mqttPort,
							prefix: mqttPrefix,
							topic: accountName,
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

					//melcloud login
					this.melCloud = new melcloud({
						name: accountName,
						user: user,
						pass: passwd,
						language: language,
						debugLog: enableDebugMode,
						melCloudInfoFile: melCloudInfoFile,
						melCloudBuildingsFile: melCloudBuildingsFile,
						melCloudDevicesFile: melCloudDevicesFile,
						mqttEnabled: enableMqtt
					});

					this.melCloud.on('connected', (melCloudInfo, contextKey, devicesList, devicesCount) => {
							this.melCloudInfo = melCloudInfo;
							this.temperatureDisplayUnit = melCloudInfo.LoginData.UseFahrenheit || false;

							//melcloud devices
							if (devicesCount > 0) {
								for (let i = 0; i < devicesCount; i++) {
									this.melCloudDevice = new melclouddevice({
										contextKey: contextKey,
										devices: devicesList,
										devicesCount: devicesCount,
										debugLog: enableDebugMode,
										mqttEnabled: enableMqtt
									});
								};

								this.melCloudDevice.on('deviceInfo', (deviceInfo) => {
										const deviceId = deviceInfo.DeviceID;
										const deviceName = deviceInfo.DeviceName;
										const deviceType = deviceInfo.Type;
										const deviceTypeText = CONSTANS.DeviceType[deviceType];
										const accessLevel = deviceInfo.AccessLevel;
										const minTemperature = deviceInfo.MinTemperature;
										const maxTemperature = deviceInfo.MaxTemperature;
										const hideVaneControls = deviceInfo.HideVaneControls;
										const hideDryModeControl = deviceInfo.HideDryModeControl;
										const hideRoomTemperature = deviceInfo.HideRoomTemperature;
										const hideSupplyTemperature = deviceInfo.HideSupplyTemperature;
										const hideOutdoorTemperature = deviceInfo.HideOutdoorTemperature;
										const macAddress = deviceInfo.MacAddress;
										const serialNumber = deviceInfo.SerialNumber;
										const firmwareRevision = deviceInfo.FirmwareRevision;
										const pCycleActual = deviceInfo.Device.PCycleActual;
										const canCool = deviceInfo.Device.CanCool;
										const canHeat = deviceInfo.Device.CanHeat;
										const canDry = deviceInfo.Device.CanDry;
										const hasAutomaticFanSpeed = deviceInfo.Device.HasAutomaticFanSpeed;
										const airDirectionFunction = deviceInfo.Device.AirDirectionFunction;
										const swingFunction = deviceInfo.Device.SwingFunction;
										const numberOfFanSpeeds = deviceInfo.Device.NumberOfFanSpeeds;
										const useTemperatureA = deviceInfo.Device.UseTemperatureA;
										const temperatureIncrementOverride = deviceInfo.Device.TemperatureIncrementOverride;
										const temperatureIncrement = deviceInfo.Device.TemperatureIncrement;
										const minTempCoolDry = deviceInfo.Device.MinTempCoolDry;
										const maxTempCoolDry = deviceInfo.Device.MaxTempCoolDry;
										const minTempHeat = deviceInfo.Device.MinTempHeat;
										const maxTempHeat = deviceInfo.Device.MaxTempHeat;
										const minTempAutomatic = deviceInfo.Device.MinTempAutomatic;
										const maxTempAutomatic = deviceInfo.Device.MaxTempAutomatic;
										const legacyDevice = deviceInfo.Device.LegacyDevice;
										const unitSupportsStandbyMode = deviceInfo.Device.UnitSupportsStandbyMode;
										const isSplitSystem = deviceInfo.Device.IsSplitSystem;
										const modelIsAirCurtain = deviceInfo.Device.ModelIsAirCurtain;
										const modelSupportsFanSpeed = deviceInfo.Device.ModelSupportsFanSpeed;
										const modelSupportsAuto = deviceInfo.Device.ModelSupportsAuto;
										const modelSupportsHeat = deviceInfo.Device.ModelSupportsHeat;
										const modelSupportsDry = deviceInfo.Device.ModelSupportsDry;
										const modelSupportsVaneVertical = deviceInfo.Device.ModelSupportsVaneVertical;
										const modelSupportsVaneHorizontal = deviceInfo.Device.ModelSupportsVaneHorizontal;
										const modelSupportsWideVane = deviceInfo.Device.ModelSupportsWideVane;
										const modelSupportsStandbyMode = deviceInfo.Device.ModelSupportsStandbyMode;
										const modelSupportsEnergyReporting = deviceInfo.Device.ModelSupportsEnergyReporting;
										const prohibitSetTemperature = deviceInfo.Device.ProhibitSetTemperature;
										const prohibitOperationMode = deviceInfo.Device.ProhibitOperationMode;
										const prohibitPower = deviceInfo.Device.ProhibitPower;
										const hasZone2 = deviceInfo.Device.HasZone2;

										//units info
										const units = deviceInfo.Device.Units;
										const sunitsSerialsNumbers = new Array();
										const unitsModelsNumbers = new Array();
										const unitsModels = new Array();
										const unitsTypes = new Array();
										const unitsIsIndors = new Array();
										if (Array.isArray(units) && units.length > 0) {
											for (let i = 0; i < units.length; i++) {
												const unit = units[i];
												const unitId = unit.ID;
												const unitDevice = unit.Device;
												const unitSerialNumber = unit.SerialNumber;
												const unitModelNumber = unit.ModelNumber;
												const unitModel = unit.Model;
												const unitType = unit.UnitType;
												const unitIsIndor = unit.IsIndor;
												sunitsSerialsNumbers.push(unitSerialNumber);
												unitsModelsNumbers.push(unitModelNumber);
												unitsModels.push(unitModel);
												unitsTypes.push(unitType);
												unitsIsIndors.push(unitIsIndor);
											}
										}
										const unit0 = (models.length > 0 && deviceType == 0) ? unitsModels[0] : 'Unknown';
										const unit1 = (models.length > 0 && deviceType == 0) ? unitsModels[1] : 'Unknown';

										const manufacturer = 'Mitsubishi';
										const modelName = unit1;
										const modelName1 = unit0;

										if (!disableLogDeviceInfo) {
											this.log('------- %s --------', deviceTypeText);
											this.log('Account: %s', accountName);
											this.log('Name: %s', deviceName);
											this.log('Model: %s', modelName);
											this.log('Serial: %s', serialNumber);
											const device1 = (modelName1 != undefined && deviceType == 0) ? this.log('Outdoor: %s', modelName1) : false;
											this.log('Manufacturer: %s', manufacturer);
											this.log('----------------------------------');
										};

										this.deviceId = deviceId;
										this.deviceName = deviceName;
										this.deviceType = deviceType;
										this.deviceTypeText = deviceTypeText;
										this.manufacturer = manufacturer;
										this.modelName = modelName;
										this.serialNumber = serialNumber;
										this.firmwareRevision = firmwareRevision;
									})
									.on('deviceState', (deviceState, startPrepareAccessory) => {
										// device state
										const deviceType = deviceState.DeviceType;
										const effectiveFlags = deviceState.EffectiveFlags;
										const localIPAddress = deviceState.LocalIPAddress;
										const roomTemperature = deviceState.RoomTemperature;
										const setTemperature = deviceState.SetTemperature;
										const setTankWaterTemperature = (deviceType == 1) ? deviceState.SetTankWaterTemperature : false;
										const setTemperatureZone1 = (deviceType == 1) ? deviceState.SetTemperatureZone1 : false;
										const forcedHotWaterMode = (deviceType == 1) ? deviceState.ForcedHotWaterMode : false;
										const setTemperatureZone2 = (deviceType == 1) ? deviceState.SetTemperatureZone2 : false;
										const setHeatFlowTemperatureZone1 = (deviceType == 1) ? deviceState.SetHeatFlowTemperatureZone1 : false;
										const setCoolFlowTemperatureZone1 = (deviceType == 1) ? deviceState.SetCoolFlowTemperatureZone1 : false;
										const setHeatFlowTemperatureZone2 = (deviceType == 1) ? deviceState.SetHeatFlowTemperatureZone2 : false;
										const setCoolFlowTemperatureZone2 = (deviceType == 1) ? deviceState.SetCoolFlowTemperatureZone2 : false;
										const operationModeZone1 = (deviceType == 1) ? deviceState.OperationModeZone1 : false;
										const operationModeZone2 = (deviceType == 1) ? deviceState.OperationModeZone2 : false;
										const ventilationMode = (deviceType == 3) ? deviceState.VentilationMode : false;
										const setFanSpeed = (deviceType == 0 || deviceType == 3) ? deviceState.SetFanSpeed : false;
										const operationMode = deviceState.OperationMode;
										const vaneHorizontal = deviceState.VaneHorizontal;
										const vaneVertical = deviceState.VaneVertical;
										const name = deviceState.Name;
										const numberOfFanSpeeds = deviceState.NumberOfFanSpeeds;
										const errorMessage = deviceState.ErrorMessage;
										const errorCode = deviceState.ErrorCode;
										const defaultHeatingSetTemperature = deviceState.DefaultHeatingSetTemperature;
										const defaultCoolingSetTemperature = deviceState.DefaultCoolingSetTemperature;
										const hideVaneControls = deviceState.HideVaneControls;
										const hideDryModeControl = deviceState.HideDryModeControl;
										const roomTemperatureLabel = deviceState.RoomTemperatureLabel;
										const inStandbyMode = deviceState.InStandbyMode;
										const temperatureIncrementOverride = deviceState.TemperatureIncrementOverride;
										const prohibitSetTemperature = deviceState.ProhibitSetTemperature;
										const prohibitOperationMode = deviceState.ProhibitOperationMode;
										const prohibitPower = deviceState.ProhibitPower;
										const demandPercentage = deviceState.DemandPercentage;
										const deviceID = deviceState.DeviceID;
										const lastCommunication = deviceState.LastCommunication;
										const nextCommunication = deviceState.NextCommunication;
										const power = deviceState.Power;
										const hasPendingCommand = deviceState.HasPendingCommand;
										const offline = deviceState.Offline;
										const scene = deviceState.Scene;
										const sceneOwner = deviceState.SceneOwner;
										this.deviceState = deviceState;

										const displayMode = this.displayMode;
										const valueHeaterCooler = power ? inStandbyMode ? 1 : [1, 2, 1, 3, 1, 1, 1, 1, 1][operationMode] : 0;
										const valueThermostat = power ? inStandbyMode ? 0 : [0, 1, 0, 2, 0, 0, 0, 0, 0][operationMode] : 0;
										const currentMode = [valueHeaterCooler, valueThermostat][displayMode];
										this.currentModesHeaterCoolerThermostat = currentMode;

										const valueTargetHeaterCooler = power ? inStandbyMode ? 0 : [0, 1, 0, 2, 0, 0, 0, 0, 0][operationMode] : 0;
										const valueTargetThermostat = power ? inStandbyMode ? 0 : [0, 1, 3, 2, 3, 3, 3, 3, 3][operationMode] : 0;
										const targetMode = [valueTargetHeaterCooler, valueTargetThermostat][displayMode];
										this.targetModesHeaterCoolerThermostat = targetMode;

										if (this.melcloudService) {
											if (displayMode == 0) {
												this.melcloudService
													.updateCharacteristic(Characteristic.Active, power)
													.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentMode)
													.updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetMode)
													.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
													.updateCharacteristic(Characteristic.RotationSpeed, (setFanSpeed / numberOfFanSpeeds) * 100.0)
													.updateCharacteristic(Characteristic.SwingMode, (vaneHorizontal == 12 && vaneVertical == 7) ? 1 : 0)
													.updateCharacteristic(Characteristic.CoolingThresholdTemperature, setTemperature)
													.updateCharacteristic(Characteristic.HeatingThresholdTemperature, setTemperature)
													.updateCharacteristic(Characteristic.CurrentHorizontalTiltAngle, vaneHorizontal)
													.updateCharacteristic(Characteristic.TargetHorizontalTiltAngle, vaneHorizontal)
													.updateCharacteristic(Characteristic.CurrentVerticalTiltAngle, vaneVertical)
													.updateCharacteristic(Characteristic.TargetVerticalTiltAngle, vaneVertical)
											};
											if (displayMode == 1) {
												this.melcloudService
													.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, currentMode)
													.updateCharacteristic(Characteristic.TargetHeatingCoolingState, targetMode)
													.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
													.updateCharacteristic(Characteristic.TargetTemperature, setTemperature)
													.updateCharacteristic(Characteristic.CoolingThresholdTemperature, setTemperature)
													.updateCharacteristic(Characteristic.HeatingThresholdTemperature, setTemperature)
											};
										};

										this.buttonsStates = new Array();
										const buttonsCount = this.buttonsCount;
										if (buttonsCount > 0) {
											for (let i = 0; i < buttonsCount; i++) {
												const button = buttons[i];
												const buttonMode = button.mode;
												const buttonState = (power == false) ? false : (buttonMode == operationMode) ? true : false;
												const state = (buttonMode == 0) ? power : buttonState;
												this.buttonsStates.push(state);
												this.log('button mode %s, %s', buttonMode, state)
												if (this.buttonsServices) {
													this.buttonsServices[i]
														.updateCharacteristic(Characteristic.On, state)
												};
											};
										};

										if (startPrepareAccessory) {
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

	//prepare accessory
	async prepareAccessory() {
		this.log.debug('prepareAccessory');
		const meCloudInfo = this.meCloudInfo;
		const deviceState = this.deviceState;
		const deviceId = this.deviceId;
		const deviceName = this.deviceName;
		const deviceType = this.deviceType;
		const deviceTypeText = this.deviceTypeText;
		const temperatureUnit = CONSTANS.TemperatureDisplayUnits[this.temperatureDisplayUnit];
		const deviceTypeUrl = [API_URL.SetAta, API_URL.SetAtw, '', API_URL.SetErv][deviceType];

		const manufacturer = this.manufacturer;
		const modelName = this.modelName;
		const serialNumber = this.serialNumber;
		const firmwareRevision = this.firmwareRevision;

		const displayMode = this.displayMode;
		const serviceType = [Service.HeaterCooler, Service.Thermostat][displayMode];
		const characteristicCurrentType = [Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeatingCoolingState][displayMode];
		const characteristicTargetType = [Characteristic.TargetHeaterCoolerState, Characteristic.TargetHeatingCoolingState][displayMode];
		const currentModeText = CONSTANS.AirConditioner.CurrentHeaterCoolerThermostat[displayMode];
		const targetModeText = CONSTANS.AirConditioner.TargetHeaterCoolerThermostat[displayMode];

		//accessory
		const accessoryName = deviceName;
		const accessoryUUID = AccessoryUUID.generate(deviceId.toString());
		const accessoryCategory = Categories.AIR_CONDITIONER;
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

		//accessory information
		this.log.debug('prepareInformationService');
		accessory.removeService(accessory.getService(Service.AccessoryInformation));
		const informationService = new Service.AccessoryInformation(accessoryName);
		informationService
			.setCharacteristic(Characteristic.Manufacturer, manufacturer)
			.setCharacteristic(Characteristic.Model, modelName)
			.setCharacteristic(Characteristic.SerialNumber, serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);
		accessory.addService(informationService);

		//accessory services
		this.log.debug('prepareMelCloudService');
		this.melcloudService = new serviceType(accessoryName, `MelCloudService`);
		if (displayMode == 0) {
			//Only for Heater Cooler Service
			this.melcloudService.getCharacteristic(Characteristic.Active)
				.onGet(async () => {
					const state = deviceState.Power;
					const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Power state: ${state?'ON':'OFF'}`);
					return state;
				})
				.onSet(async (state) => {
					switch (state) {
						case 0:
							deviceState.Power = false;
							deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power;
							break
						case 1:
							deviceState.Power = true;
							deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power;
							break
						default:
							break
					};

					try {
						const newState = await this.melCloudDevice.send(deviceTypeUrl, deviceState, 0);
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set power state: ${state?'ON':'OFF'}`);
					} catch (error) {
						this.log.error(`${deviceTypeText}: ${accessoryName}, Set power state error: ${error}`);
					};
				});
			this.melcloudService.getCharacteristic(Characteristic.RotationSpeed)
				.onGet(async () => {
					//0 = AUTO, 1 = 1, 2 = 2, 3 = 3, 4 = 4, 5 = 5
					const value = (deviceState.SetFanSpeed / deviceState.NumberOfFanSpeeds) * 100.0;
					const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Fan speed: ${value}`);
					return value;
				})
				.onSet(async (value) => {
					deviceState.SetFanSpeed = ((value / 100.0) * deviceState.NumberOfFanSpeeds).toFixed(0);
					deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.SetFanSpeed;

					try {
						const newState = await this.melCloudDevice.send(deviceTypeUrl, deviceState, 0);
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set fan speed: ${value}`);
					} catch (error) {
						this.log.error(`${deviceTypeText}: ${accessoryName}, Set fan speed error: ${error}`);
					};
				});
			this.melcloudService.getCharacteristic(Characteristic.SwingMode)
				.onGet(async () => {
					//Vane Horizontal: 0 = Auto, 1 = 1, 2 = 2, 3 = 3, 4 = 4, 5 = 5, 12 = Swing.
					//Vane Vertical: 0 = Auto, 1 = 1, 2 = 2, 3 = 3, 4 = 4, 5 = 5, 7 = Swing.
					const value = (deviceState.VaneHorizontal == 12 && deviceState.VaneVertical == 7) ? 1 : 0;
					const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Swing mode: ${CONSTANS.AirConditioner.TargetSwing[value]}`);
					return value;
				})
				.onSet(async (value) => {
					deviceState.VaneHorizontal = value ? 12 : 0;
					deviceState.VaneVertical = value ? 7 : 0;
					deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneVertical + DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneHorizontal;

					try {
						const newState = await this.melCloudDevice.send(deviceTypeUrl, deviceState, 0);
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set swing mode: ${CONSTANS.AirConditioner.TargetSwing[value]}`);
					} catch (error) {
						this.log.error(`${deviceTypeText}: ${accessoryName}, Set new swing mode error: ${error}`);
					};
				});
			this.melcloudService.getCharacteristic(Characteristic.CurrentHorizontalTiltAngle)
				.onGet(async () => {
					const value = deviceState.VaneHorizontal;
					const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Horizontal tilt angle: ${value}°`);
					return value;
				})
			this.melcloudService.getCharacteristic(Characteristic.TargetHorizontalTiltAngle)
				.onGet(async () => {
					const value = deviceState.VaneHorizontal;
					const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Target horizontal tilt angle: ${value}°`);
					return value;
				})
				.onSet(async (value) => {
					deviceState.VaneHorizontal = ((value + 90.0) / 45.0 + 1.0).toFixed(0);
					deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneHorizontal;

					try {
						const newState = await this.melCloudDevice.send(deviceTypeUrl, deviceState, 0);
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set target horizontal tilt angle: ${value}°`);
					} catch (error) {
						this.log.error(`${deviceTypeText}: ${accessoryName}, Set target horizontal tilt angle error: ${error}`);
					};
				});
			this.melcloudService.getCharacteristic(Characteristic.CurrentVerticalTiltAngle)
				.onGet(async () => {
					const value = deviceState.VaneVertical;
					const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Vertical tilt angle: ${value}°`);
					return value;
				})
			this.melcloudService.getCharacteristic(Characteristic.TargetVerticalTiltAngle)
				.onGet(async () => {
					const value = deviceState.VaneVertical;
					const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Target vertical tilt angle: ${value}°`);
					return value;
				})
				.onSet(async (value) => {
					deviceState.VaneVertical = ((value + 90.0) / 45.0 + 1.0).toFixed(0);
					deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneVertical;

					try {
						const newState = await this.melCloudDevice.send(deviceTypeUrl, deviceState, 0);
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set target vertical tilt angle: ${value}°`);
					} catch (error) {
						this.log.error(`${deviceTypeText}: ${accessoryName}, Set target vertical tilt angle error: ${error}`);
					};
				});
		};
		this.melcloudService.getCharacteristic(characteristicCurrentType)
			.onGet(async () => {
				//1 = HEAT, 2 = DRY 3 = COOL, 7 = FAN, 8 = AUTO
				const currentMode = this.currentModesHeaterCoolerThermostat;
				const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Heating cooling mode: ${currentModeText[currentMode]}`);
				return currentMode;
			});
		this.melcloudService.getCharacteristic(characteristicTargetType)
			.onGet(async () => {
				//1 = HEAT, 2 = DRY 3 = COOL, 7 = FAN, 8 = AUTO
				const targetMode = this.targetModesHeaterCoolerThermostat;
				const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Target heating cooling mode: ${targetModeText[targetMode]}`);
				return targetMode;
			})
			.onSet(async (value) => {
				switch (value) {
					case 0: //OFF, AUTO
						if (displayMode) {
							deviceState.Power = false;
							deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power;
						} else {
							deviceState.Power = true;
							deviceState.OperationMode = 8;
							deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
						}
						break
					case 1: //HEAT
						deviceState.Power = true;
						deviceState.OperationMode = 1;
						deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
						break
					case 2: //COOL
						deviceState.Power = true;
						deviceState.OperationMode = 3;
						deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
						break
					case 3: //AUTO
						deviceState.Power = true;
						deviceState.OperationMode = 8;
						deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
						break
					default:
						break
				}

				try {
					const newState = await this.melCloudDevice.send(deviceTypeUrl, deviceState, 0);
					const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set target heating cooling mode: ${targetModeText[value]}`);
				} catch (error) {
					this.log.error(`${deviceTypeText}: ${accessoryName}, Set target heating cooling mode error: ${error}`);
				};
			});
		this.melcloudService.getCharacteristic(Characteristic.CurrentTemperature)
			.onGet(async () => {
				const value = deviceState.RoomTemperature;
				const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Temperature: ${value}${temperatureUnit}`);
				return value;
			});
		if (displayMode == 1) {
			//Only for Thermostat Service
			this.melcloudService.getCharacteristic(Characteristic.TargetTemperature)
				.onGet(async () => {
					const value = deviceState.SetTemperature;
					const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Target temperature: ${value}${temperatureUnit}`);
					return value;
				})
				.onSet(async (value) => {
					const temp = Math.round((value <= 10) ? 10 : value >= 31 ? 31 : value * 2) / 2;
					deviceState.SetTemperature = temp;
					deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.SetTemperature;

					try {
						const newState = await this.melCloudDevice.send(deviceTypeUrl, deviceState, 0);
						const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set target temperature: ${temp}${temperatureUnit}`);
					} catch (error) {
						this.log.error(`${deviceTypeText}: ${accessoryName}, Set target temperature error: ${error}`);
					};
				});
		};
		this.melcloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
			.onGet(async () => {
				const value = deviceState.SetTemperature;
				const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Cooling threshold temperature: ${value}${temperatureUnit}`);
				return value;
			})
			.onSet(async (value) => {
				const temp = Math.round((value <= 16) ? 16 : value >= 31 ? 31 : value * 2) / 2;
				deviceState.SetTemperature = temp;
				deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.SetTemperature;

				try {
					const newState = await this.melCloudDevice.send(deviceTypeUrl, deviceState, 0);
					const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set cooling threshold temperature: ${temp}${temperatureUnit}`);
				} catch (error) {
					this.log.error(`${deviceTypeText}: ${accessoryName}, Set cooling threshold temperature error: ${error}`);
				};
			});
		this.melcloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
			.onGet(async () => {
				const value = deviceState.SetTemperature;
				const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Heating threshold temperature: ${value}${temperatureUnit}`);
				return value;
			})
			.onSet(async (value) => {
				const temp = Math.round((value <= 10) ? 10 : value >= 31 ? 31 : value * 2) / 2;
				deviceState.SetTemperature = temp;
				deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.SetTemperature;

				try {
					const newState = await this.melCloudDevice.send(deviceTypeUrl, deviceState, 0);
					const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set heating threshold temperature: ${temp}${temperatureUnit}`);
				} catch (error) {
					this.log.error(`${deviceTypeText}: ${accessoryName}, Set heating threshold temperature error: ${error}`);
				};
			});
		this.melcloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
			.onGet(async () => {
				const value = this.temperatureDisplayUnit;
				const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Temperature display unit: ${value?'°F': '°C'}`);
				return value;
			})
			.onSet(async (value) => {
				try {
					meCloudInfo.UseFahrenheit = value ? true : false;
					meCloudInfo.EmailOnCommsError = false;
					meCloudInfo.EmailOnUnitError = false;
					meCloudInfo.EmailCommsErrors = 1;
					meCloudInfo.EmailUnitErrors = 1;
					meCloudInfo.RestorePages = false;
					meCloudInfo.MarketingCommunication = false;
					meCloudInfo.AlternateEmailAddress = '';
					meCloudInfo.Fred = 4;

					const newState = await this.melCloudDevice.send(API_URL.UpdateApplicationOptions, meCloudInfo, 1);
					const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set temperature display unit: ${value?'°F': '°C'}`);
				} catch (error) {
					this.log.error(`${deviceTypeText}: ${accessoryName}, Set temperature display unit error: ${error}`);
				};
			});
		accessory.addService(this.melcloudService);

		//accessory buttons services
		const buttonsCount = this.buttonsCount;
		if (buttonsCount > 0) {
			this.log.debug('prepareButtonsService');
			this.buttonsServices = new Array();
			for (let i = 0; i < buttonsCount; i++) {
				//get button
				const button = this.buttons[i];

				//get button mode
				const buttonMode = button.mode;

				//get button name
				const buttonName = (button.name != undefined) ? button.name : buttonMode;

				//get button display type
				const buttonDisplayType = (button.displayType != undefined) ? button.displayType : 0;

				const serviceType = [Service.Outlet, Service.Switch][buttonDisplayType];
				const buttonService = new serviceType(`${accessoryName} ${buttonName}`, `ButtonService${i}`);
				buttonService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = this.buttonsStates[i];
						return state;
					})
					.onSet(async (state) => {
						switch (buttonMode) {
							case 0: //ON,OFF
								if (state) {
									deviceState.Power = true;
									deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power;
								} else {
									deviceState.Power = false;
									deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power;
								}
								break
							case 1: //HEAT
								deviceState.Power = true;
								deviceState.OperationMode = 1;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
								break
							case 2: //DRY
								deviceState.Power = true;
								deviceState.OperationMode = 2;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
								break
							case 3: //COOL
								deviceState.Power = true;
								deviceState.OperationMode = 3;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
								break
							case 7: //FAN
								deviceState.Power = true;
								deviceState.OperationMode = 7;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
								break
							case 8: //AUTO
								deviceState.Power = true;
								deviceState.OperationMode = 8;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
								break
							case 9: //PURIFY
								deviceState.Power = true;
								deviceState.OperationMode = 9;
								deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
								break
							default:
								break
						}
						try {
							const newState = await this.melCloudDevice.send(deviceTypeUrl, deviceState, 0);
							const logInfo = this.disableLogInfo ? false : this.log(`${deviceTypeText}: ${accessoryName}, Set button mode: ${buttonName}`);
						} catch (error) {
							this.log.error(`${deviceTypeText}: ${accessoryName}, Set button error: ${error}`);
						};
					});

				this.buttonsServices.push(buttonService);
				accessory.addService(this.buttonsServices[i]);
			}
		}

		this.melCloudDevice.refreshDeviceState();
		const debug = this.enableDebugMode ? this.log(`${deviceTypeText}: ${accessoryName}, publishExternalAccessory.`) : false;
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	};
};