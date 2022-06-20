'use strict';

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const axios = require('axios');
const mqttClient = require('./src/mqtt.js');
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
				const name = account.name;
				const user = account.user;
				const pass = account.pass;
				const language = account.language;
				if (!name || !user || !pass || !language) {
					this.log.warn('Account name, user, password or language missing');
				} else {
					this.accountConfig = account;
					this.accountName = name;
					this.enableDebugMode = account.enableDebugMode || false;
					this.prefDir = path.join(api.user.storagePath(), 'melcloud');
					this.melCloudInfoFile = `${this.prefDir}/${name}_Info`;
					this.melCloudDevicesFile = `${this.prefDir}/${name}_Devices`;

					//check if the directory exists, if not then create it
					if (fs.existsSync(this.prefDir) == false) {
						fs.mkdirSync(this.prefDir);
					}
					if (fs.existsSync(this.melCloudInfoFile) == false) {
						fs.writeFileSync(this.melCloudInfoFile, '');
					}
					if (fs.existsSync(this.melCloudDevicesFile) == false) {
						fs.writeFileSync(this.melCloudDevicesFile, '');
					}

					this.axiosInstanceLogin = axios.create({
						method: 'POST',
						baseURL: API_URL.BaseURL
					});

					this.melCloudLogin(user, pass, language);
				}
			}
		});
	}

	async melCloudLogin(user, pass, language) {
		const options = {
			data: {
				AppVersion: '1.22.10.0',
				CaptchaChallenge: '',
				CaptchaResponse: '',
				Email: user,
				Password: pass,
				Language: language,
				Persist: 'true',
			}
		};

		try {
			const melCloudInfoData = await this.axiosInstanceLogin(API_URL.ClientLogin, options);
			const melCloudInfo = JSON.stringify(melCloudInfoData.data, null, 2);
			const debug = this.enableDebugMode ? this.log(`Account: ${this.accountName}, debug melCloudInfoData: ${melCloudInfo}`) : false;
			const writeMelCloudInfo = await fsPromises.writeFile(this.melCloudInfoFile, melCloudInfo);

			const data = melCloudInfoData.data;
			const contextKey = data.LoginData.ContextKey;
			const temperatureDisplayUnit = data.LoginData.UseFahrenheit;

			const updateDevicesList = (contextKey) ? this.updateDevicesList(contextKey, temperatureDisplayUnit, data) : this.log(`Account: ${this.accountName}, contextKey not exist.`);
		} catch (error) {
			this.log.error(`Account: ${this.accountName}, login error: ${error}`);
		};
	};

	async updateDevicesList(contextKey, temperatureDisplayUnit, melCloudInfo) {
		this.buildings = new Array();
		this.buildingsAreas = new Array();
		this.floors = new Array();
		this.florsAreas = new Array();
		this.devices = new Array();

		this.axiosInstanceGet = axios.create({
			method: 'GET',
			baseURL: API_URL.BaseURL,
			headers: {
				'X-MitsContextKey': contextKey,
			}
		});

		try {
			const devicesListData = await this.axiosInstanceGet(API_URL.ListDevices);
			const devicesList = JSON.stringify(devicesListData.data, null, 2);
			const debug = this.enableDebugMode ? this.log(`Account: ${this.accountName}, debug devicesListData: ${devicesList}`) : false;
			const writeDevicesList = await fsPromises.writeFile(this.melCloudDevicesFile, devicesList);

			//read building structure and get the devices
			const data = devicesListData.data;
			const buildingsCount = data.length;
			for (let i = 0; i < buildingsCount; i++) {
				const building = data[i].Structure;
				this.buildings.push(building);

				if (building.Devices) {
					const devicesCount = building.Devices.length;
					for (let j = 0; j < devicesCount; j++) {
						const device = building.Devices[j];
						this.devices.push(device);
					};
				};

				const floorsCount = building.Floors.length;
				for (let k = 0; k < floorsCount; k++) {
					const flor = building.Floors[k];
					this.floors.push(flor);

					if (flor.Devices) {
						const devicesCount = flor.Devices.length;
						for (let l = 0; l < devicesCount; l++) {
							const device = flor.Devices[l];
							this.devices.push(device);
						};
					};

					const florAreasCount = flor.Areas.length;
					for (let m = 0; m < florAreasCount; m++) {
						const florArea = flor.Areas[m];
						this.florsAreas.push(florArea);

						if (florArea.Devices) {
							const devicesCount = florArea.Devices.length;
							for (let n = 0; n < devicesCount; n++) {
								const device = florArea.Devices[n];
								this.devices.push(device);
							};
						};
					};
				};

				if (building.Areas) {
					const buildingsAreasCount = building.Areas.length;
					for (let o = 0; o < buildingsAreasCount; o++) {
						const buildingArea = building.Areas[o];
						this.buildingsAreas.push(buildingArea);

						if (buildingArea.Devices) {
							const devicesCount = buildingArea.Devices.length;
							for (let p = 0; p < devicesCount; p++) {
								const device = buildingArea.Devices[p];
								this.devices.push(device);
							};
						};
					};
				};
			};

			const devicesCount = this.devices.length;
			for (let i = 0; i < devicesCount; i++) {
				const device = this.devices[i];
				new melCloudDevice(this.log, this.api, this.accountConfig, contextKey, device, temperatureDisplayUnit, melCloudInfo);
			}
		} catch (error) {
			this.log.error(`Account: ${this.accountName}, Update devices list error: ${error}`);
		};
	};

	configureAccessory(accessory) {
		this.log.debug('configureAccessory');
		this.accessories.push(accessory);
	}

	removeAccessory(accessory) {
		this.log.debug('removeAccessory');
		this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
	}
}

class melCloudDevice {
	constructor(log, api, accountConfig, contextKey, device, temperatureDisplayUnit, melCloudInfo) {
		this.log = log;
		this.api = api;

		this.accountName = accountConfig.name;
		this.displayMode = accountConfig.displayMode;
		this.buttons = accountConfig.buttons || [];
		this.disableLogInfo = accountConfig.disableLogInfo || false;
		this.disableLogDeviceInfo = accountConfig.disableLogDeviceInfo || false;
		this.enableDebugMode = accountConfig.enableDebugMode || false;
		this.enableMqtt = accountConfig.enableMqtt || false;
		this.mqttHost = accountConfig.mqttHost;
		this.mqttPort = accountConfig.mqttPort || 1883;
		this.mqttPrefix = accountConfig.mqttPrefix;
		this.mqttAuth = accountConfig.mqttAuth || false;
		this.mqttUser = accountConfig.mqttUser;
		this.mqttPasswd = accountConfig.mqttPasswd;
		this.mqttDebug = accountConfig.mqttDebug || false;

		this.deviceType = device.Device.DeviceType;
		this.deviceTypeText = CONSTANS.DeviceType[this.deviceType];
		this.buildingId = device.BuildingID;
		this.deviceName = device.DeviceName;
		this.deviceId = device.DeviceID;;
		this.temperatureDisplayUnit = temperatureDisplayUnit;
		this.melcloudInfo = melCloudInfo;

		//get config info
		this.manufacturer = 'Mitsubishi';
		//read models
		const units = device.Device.Units
		const arrUnits = new Array();
		if (Array.isArray(units) && units.length > 0) {
			for (let i = 0; i < units.length; i++) {
				const model = units[i].Model;
				arrUnits.push(model);
			}
		}
		const outdorUnit = (arrUnits.length > 0 && this.deviceType == 0) ? arrUnits[0] : 'Unknown';
		const indorUnit = (arrUnits.length > 0 && this.deviceType == 0) ? arrUnits[1] : 'Unknown';
		this.modelName = indorUnit;
		this.modelName1 = outdorUnit;
		this.serialNumber = device.SerialNumber;
		this.firmwareRevision = device.MacAddress;


		//setup variables
		this.temperatureDisplayUnit = false;
		this.startPrepareAccessory = true;

		this.axiosInstanceGet = axios.create({
			method: 'GET',
			baseURL: API_URL.BaseURL,
			headers: {
				'X-MitsContextKey': contextKey,
			}
		});

		this.axiosInstancePost = axios.create({
			method: 'POST',
			baseURL: API_URL.BaseURL,
			headers: {
				'X-MitsContextKey': contextKey,
				'content-type': 'application/json'
			}
		});

		//mqtt client
		this.mqttClient = new mqttClient({
			enabled: this.enableMqtt,
			host: this.mqttHost,
			port: this.mqttPort,
			prefix: this.mqttPrefix,
			topic: this.deviceName,
			auth: this.mqttAuth,
			user: this.mqttUser,
			passwd: this.mqttPasswd,
			debug: this.mqttDebug
		});

		this.mqttClient.on('connected', (message) => {
				this.log(`${this.deviceTypeText}: ${this.deviceName}:, ${message}`);
			})
			.on('error', (error) => {
				this.log(`${this.deviceTypeText}: ${this.deviceName}:, ${error}`);
			})
			.on('debug', (message) => {
				this.log(`${this.deviceTypeText}: ${this.deviceName}:, debug: ${message}`);
			})
			.on('message', (message) => {
				this.log(`${this.deviceTypeText}: ${this.deviceName}:,${message}`);
			})
			.on('disconnected', (message) => {
				this.log(`${this.deviceTypeText}: ${this.deviceName}:, ${message}`);
			});

		if (!this.disableLogDeviceInfo) {
			this.log('------- %s --------', this.deviceTypeText);
			this.log('Account: %s', this.accountName);
			this.log('Name: %s', this.deviceName);
			this.log('Model: %s', this.modelName);
			this.log('Serial: %s', this.serialNumber);
			const device1 = (arrUnits.length > 0 && this.deviceType == 0) ? this.log('Outdoor: %s', this.modelName1) : false;
			this.log('Manufacturer: %s', this.manufacturer);
			this.log('----------------------------------');
		}

		this.updateDevicesState();
	}

	async updateDevicesState() {
		return new Promise(async (resolve, reject) => {
			const deviceType = this.deviceType;
			const deviceId = this.deviceId;
			const buildingId = this.buildingId;
			const url = API_URL.DeviceState.replace("DID", deviceId).replace("BID", buildingId);

			try {
				const deviceStateData = await this.axiosInstanceGet(url);
				const deviceState = JSON.stringify(deviceStateData.data, null, 2);
				const debug = this.enableDebugMode ? this.log(`${this.deviceTypeText}: ${this.deviceName}, debug deviceStateData: ${deviceState}`) : false;

				const data = deviceStateData.data;
				const effectiveFlags = data.EffectiveFlags;
				const localIPAddress = data.LocalIPAddress;
				const roomTemperature = data.RoomTemperature;
				const setTemperature = data.SetTemperature;
				const setTankWaterTemperature = (deviceType == 1) ? data.SetTankWaterTemperature : false;
				const setTemperatureZone1 = (deviceType == 1) ? data.SetTemperatureZone1 : false;
				const forcedHotWaterMode = (deviceType == 1) ? data.ForcedHotWaterMode : false;
				const setTemperatureZone2 = (deviceType == 1) ? data.SetTemperatureZone2 : false;
				const setHeatFlowTemperatureZone1 = (deviceType == 1) ? data.SetHeatFlowTemperatureZone1 : false;
				const setCoolFlowTemperatureZone1 = (deviceType == 1) ? data.SetCoolFlowTemperatureZone1 : false;
				const setHeatFlowTemperatureZone2 = (deviceType == 1) ? data.SetHeatFlowTemperatureZone2 : false;
				const setCoolFlowTemperatureZone2 = (deviceType == 1) ? data.SetCoolFlowTemperatureZone2 : false;
				const operationModeZone1 = (deviceType == 1) ? data.OperationModeZone1 : false;
				const operationModeZone2 = (deviceType == 1) ? data.OperationModeZone2 : false;
				const ventilationMode = (deviceType == 3) ? data.VentilationMode : false;
				const setFanSpeed = (deviceType == 0 || deviceType == 3) ? data.SetFanSpeed : false;
				const operationMode = data.OperationMode;
				const vaneHorizontal = data.VaneHorizontal;
				const vaneVertical = data.VaneVertical;
				const name = data.Name;
				const numberOfFanSpeeds = data.NumberOfFanSpeeds;
				const errorMessage = data.ErrorMessage;
				const errorCode = data.ErrorCode;
				const defaultHeatingSetTemperature = data.DefaultHeatingSetTemperature;
				const defaultCoolingSetTemperature = data.DefaultCoolingSetTemperature;
				const hideVaneControls = data.HideVaneControls;
				const hideDryModeControl = data.HideDryModeControl;
				const roomTemperatureLabel = data.RoomTemperatureLabel;
				const inStandbyMode = data.InStandbyMode;
				const temperatureIncrementOverride = data.TemperatureIncrementOverride;
				const prohibitSetTemperature = data.ProhibitSetTemperature;
				const prohibitOperationMode = data.ProhibitOperationMode;
				const prohibitPower = data.ProhibitPower;
				const demandPercentage = data.DemandPercentage;
				const deviceID = data.DeviceID;
				//const deviceType = data.DeviceType;
				const lastCommunication = data.LastCommunication;
				const nextCommunication = data.NextCommunication;
				const power = data.Power;
				const hasPendingCommand = data.HasPendingCommand;
				const offline = data.Offline;
				const scene = data.Scene;
				const sceneOwner = data.SceneOwner;

				const valueHeaterCooler = power ? inStandbyMode ? 1 : [1, 2, 1, 3, 1, 1, 1, 1, 1][operationMode] : 0;
				const valueThermostat = power ? inStandbyMode ? 0 : [0, 1, 0, 2, 0, 0, 0, 0, 0][operationMode] : 0;
				const currentMode = [valueHeaterCooler, valueThermostat][this.displayMode];
				this.currentModesHeaterCoolerThermostat = currentMode;

				const valueTargetHeaterCooler = power ? inStandbyMode ? 0 : [0, 1, 0, 2, 0, 0, 0, 0, 0][operationMode] : 0;
				const valueTargetThermostat = power ? inStandbyMode ? 0 : [0, 1, 3, 2, 3, 3, 3, 3, 3][operationMode] : 0;
				const targetMode = [valueTargetHeaterCooler, valueTargetThermostat][this.displayMode];
				this.targetModesHeaterCoolerThermostat = targetMode;
				if (this.melcloudService) {
					if (this.displayMode == 0) {
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
					}
					if (this.displayMode == 1) {
						this.melcloudService
							.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, currentMode)
							.updateCharacteristic(Characteristic.TargetHeatingCoolingState, targetMode)
							.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
							.updateCharacteristic(Characteristic.TargetTemperature, setTemperature)
							.updateCharacteristic(Characteristic.CoolingThresholdTemperature, setTemperature)
							.updateCharacteristic(Characteristic.HeatingThresholdTemperature, setTemperature)
					}
				};

				const mqtt = this.enableMqtt ? this.mqttClient.send('Device state', JSON.stringify(deviceStateData, null, 2)) : false;

				this.deviceState = data;
				this.deviceType = deviceType;
				this.refreshDeviceState();

				if (this.startPrepareAccessory) {
					this.prepareAccessory();
				}
				resolve(true);
			} catch (error) {
				this.log.error(`${this.deviceTypeText}: ${this.deviceName}, Update devices state error: ${error}`);
				reject(error);
			};
		});
	};

	refreshDeviceState() {
		setTimeout(async () => {
			try {
				await this.updateDevicesState();
			} catch (error) {
				this.log.error(`${this.deviceTypeText}: ${this.deviceName}, Update devices state error: ${error}`);
			};
		}, 30000)
	};


	//prepare accessory
	async prepareAccessory() {
		this.log.debug('prepareAccessory');

		const deviceId = this.deviceId;
		const melCloudInfo = this.melcloudInfo;
		const deviceState = this.deviceState;
		const deviceType = this.deviceType;
		const temperatureUnit = CONSTANS.TemperatureDisplayUnits[this.temperatureDisplay];
		const deviceTypeUrl = [API_URL.SetAta, API_URL.SetAtw, '', API_URL.SetErv][deviceType];

		const accessoryName = this.deviceName;
		const accessoryUUID = AccessoryUUID.generate(deviceId.toString());
		const accessoryCategory = Categories.AIR_CONDITIONER;
		const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

		//prepare information service
		this.log.debug('prepareInformationService');

		const manufacturer = this.manufacturer;
		const modelName = this.modelName;
		const serialNumber = this.serialNumber;
		const firmwareRevision = this.firmwareRevision;

		accessory.removeService(accessory.getService(Service.AccessoryInformation));
		const informationService = new Service.AccessoryInformation(accessoryName);
		informationService
			.setCharacteristic(Characteristic.Manufacturer, manufacturer)
			.setCharacteristic(Characteristic.Model, modelName)
			.setCharacteristic(Characteristic.SerialNumber, serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);
		accessory.addService(informationService);

		//prepare service
		this.log.debug('prepareService');

		const serviceType = [Service.HeaterCooler, Service.Thermostat][this.displayMode];
		const characteristicCurrentType = [Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeatingCoolingState][this.displayMode];
		const characteristicTargetType = [Characteristic.TargetHeaterCoolerState, Characteristic.TargetHeatingCoolingState][this.displayMode];
		const currentModeText = CONSTANS.AirConditioner.CurrentHeaterCoolerThermostat[this.displayMode];
		const targetModeText = CONSTANS.AirConditioner.TargetHeaterCoolerThermostat[this.displayMode];
		this.melcloudService = new serviceType(accessoryName, `Service`);
		if (this.displayMode == 0) {
			this.melcloudService.getCharacteristic(Characteristic.Active)
				.onGet(async () => {
					const state = deviceState.Power;
					const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Power state: ${state?'ON':'OFF'}`);
					return state;
				})
				.onSet(async (state) => {
					let newData = deviceState;
					switch (state) {
						case 0:
							newData.Power = false;
							newData.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power;
							break
						case 1:
							newData.Power = true;
							newData.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power;
							break
						default:
							break
					};
					newData.HasPendingCommand = true;
					const options = {
						data: newData
					}
					try {
						const newState = await this.axiosInstancePost(deviceTypeUrl, options);
						const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Set power state: ${state?'ON':'OFF'}`);
					} catch (error) {
						this.log.error(`${this.deviceTypeText}: ${accessoryName}, Set power state error: ${error}`);
					};
				});
		};
		this.melcloudService.getCharacteristic(characteristicCurrentType)
			.onGet(async () => {
				//1 = HEAT, 2 = DRY 3 = COOL, 7 = FAN, 8 = AUTO
				const currentMode = this.currentModesHeaterCoolerThermostat;
				const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Heating cooling mode: ${currentModeText[currentMode]}`);
				return currentMode;
			});
		this.melcloudService.getCharacteristic(characteristicTargetType)
			.onGet(async () => {
				//1 = HEAT, 2 = DRY 3 = COOL, 7 = FAN, 8 = AUTO
				const targetMode = this.targetModesHeaterCoolerThermostat;
				const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Target heating cooling mode: ${targetModeText[targetMode]}`);
				return targetMode;
			})
			.onSet(async (value) => {
				let newData = deviceState;
				switch (value) {
					case 0: //OFF, AUTO
						if (this.displayMode) {
							newData.Power = false;
							newData.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power;
						} else {
							newData.Power = true;
							newData.OperationMode = 8;
							newData.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
						}
						break
					case 1: //HEAT
						newData.Power = true;
						newData.OperationMode = 1;
						newData.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
						break
					case 2: //COOL
						newData.Power = true;
						newData.OperationMode = 3;
						newData.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
						break
					case 3: //AUTO
						newData.Power = true;
						newData.OperationMode = 8;
						newData.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
						break
					default:
						break
				}
				newData.HasPendingCommand = true;
				const options = {
					data: newData
				}
				try {
					const newState = await this.axiosInstancePost(deviceTypeUrl, options);
					const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Set target heating cooling mode: ${targetModeText[value]}`);
				} catch (error) {
					this.log.error(`${this.deviceTypeText}: ${accessoryName}, Set target heating cooling mode error: ${error}`);
				};
			});
		this.melcloudService.getCharacteristic(Characteristic.CurrentTemperature)
			.onGet(async () => {
				const value = deviceState.RoomTemperature;
				const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Temperature: ${value}${temperatureUnit}`);
				return value;
			});
		if (this.displayMode == 1) {
			this.melcloudService.getCharacteristic(Characteristic.TargetTemperature)
				.onGet(async () => {
					const value = deviceState.SetTemperature;
					const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Target temperature: ${value}${temperatureUnit}`);
					return value;
				})
				.onSet(async (value) => {
					const temp = Math.round((value <= 10) ? 10 : value >= 31 ? 31 : value * 2) / 2;
					deviceState.SetTemperature = temp;
					deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.SetTemperature;
					deviceState.HasPendingCommand = true;
					const options = {
						data: deviceState
					}
					try {
						const newState = await this.axiosInstancePost(deviceTypeUrl, options);
						const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Set target temperature: ${temp}${temperatureUnit}`);
					} catch (error) {
						this.log.error(`${this.deviceTypeText}: ${accessoryName}, Set target temperature error: ${error}`);
					};
				});
		};
		if (this.displayMode == 0) {
			this.melcloudService.getCharacteristic(Characteristic.RotationSpeed)
				.onGet(async () => {
					//0 = AUTO, 1 = 1, 2 = 2, 3 = 3, 4 = 4, 5 = 5
					const value = (deviceState.SetFanSpeed / deviceState.NumberOfFanSpeeds) * 100.0;
					const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Fan speed: ${value}`);
					return value;
				})
				.onSet(async (value) => {
					deviceState.SetFanSpeed = ((value / 100.0) * deviceState.NumberOfFanSpeeds).toFixed(0);
					deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.SetFanSpeed;
					deviceState.HasPendingCommand = true;
					const options = {
						data: deviceState
					}
					try {
						const newState = await this.axiosInstancePost(deviceTypeUrl, options);
						const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Set fan speed: ${value}`);
					} catch (error) {
						this.log.error(`${this.deviceTypeText}: ${accessoryName}, Set fan speed error: ${error}`);
					};
				});
			this.melcloudService.getCharacteristic(Characteristic.SwingMode)
				.onGet(async () => {
					//Vane Horizontal: 0 = Auto, 1 = 1, 2 = 2, 3 = 3, 4 = 4, 5 = 5, 12 = Swing.
					//Vane Vertical: 0 = Auto, 1 = 1, 2 = 2, 3 = 3, 4 = 4, 5 = 5, 7 = Swing.
					const value = (deviceState.VaneHorizontal == 12 && deviceState.VaneVertical == 7) ? 1 : 0;
					const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Swing mode: ${CONSTANS.AirConditioner.TargetSwing[value]}`);
					return value;
				})
				.onSet(async (value) => {
					deviceState.VaneHorizontal = value ? 12 : 0;
					deviceState.VaneVertical = value ? 7 : 0;
					deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneVertical + DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneHorizontal;
					deviceState.HasPendingCommand = true;
					const options = {
						data: deviceState
					}
					try {
						const newState = await this.axiosInstancePost(deviceTypeUrl, options);
						const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Set swing mode: ${CONSTANS.AirConditioner.TargetSwing[value]}`);
					} catch (error) {
						this.log.error(`${this.deviceTypeText}: ${accessoryName}, Set new swing mode error: ${error}`);
					};
				});
			this.melcloudService.getCharacteristic(Characteristic.CurrentHorizontalTiltAngle)
				.onGet(async () => {
					const value = deviceState.VaneHorizontal;
					const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Horizontal tilt angle: ${value}°`);
					return value;
				})
			this.melcloudService.getCharacteristic(Characteristic.TargetHorizontalTiltAngle)
				.onGet(async () => {
					const value = deviceState.VaneHorizontal;
					const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Target horizontal tilt angle: ${value}°`);
					return value;
				})
				.onSet(async (value) => {
					deviceState.VaneHorizontal = ((value + 90.0) / 45.0 + 1.0).toFixed(0);
					deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneHorizontal;
					deviceState.HasPendingCommand = true;
					const options = {
						data: deviceState
					}
					try {
						const newState = await this.axiosInstancePost(deviceTypeUrl, options);
						const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Set target horizontal tilt angle: ${value}°`);
					} catch (error) {
						this.log.error(`${this.deviceTypeText}: ${accessoryName}, Set target horizontal tilt angle error: ${error}`);
					};
				});
			this.melcloudService.getCharacteristic(Characteristic.CurrentVerticalTiltAngle)
				.onGet(async () => {
					const value = deviceState.VaneVertical;
					const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Vertical tilt angle: ${value}°`);
					return value;
				})
			this.melcloudService.getCharacteristic(Characteristic.TargetVerticalTiltAngle)
				.onGet(async () => {
					const value = deviceState.VaneVertical;
					const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Target vertical tilt angle: ${value}°`);
					return value;
				})
				.onSet(async (value) => {
					deviceState.VaneVertical = ((value + 90.0) / 45.0 + 1.0).toFixed(0);
					deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.VaneVertical;
					deviceState.HasPendingCommand = true;
					const options = {
						data: deviceState
					}
					try {
						const newState = await this.axiosInstancePost(deviceTypeUrl, options);
						const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Set target vertical tilt angle: ${value}°`);
					} catch (error) {
						this.log.error(`${this.deviceTypeText}: ${accessoryName}, Set target vertical tilt angle error: ${error}`);
					};
				});
		};
		this.melcloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
			.onGet(async () => {
				const value = deviceState.SetTemperature;
				const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Cooling threshold temperature: ${value}${temperatureUnit}`);
				return value;
			})
			.onSet(async (value) => {
				const temp = Math.round((value <= 16) ? 16 : value >= 31 ? 31 : value * 2) / 2;
				deviceState.SetTemperature = temp;
				deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.SetTemperature;
				deviceState.HasPendingCommand = true;
				const options = {
					data: deviceState
				}
				try {
					const newState = await this.axiosInstancePost(deviceTypeUrl, options);
					const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Set cooling threshold temperature: ${temp}${temperatureUnit}`);
				} catch (error) {
					this.log.error(`${this.deviceTypeText}: ${accessoryName}, Set cooling threshold temperature error: ${error}`);
				};
			});
		this.melcloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
			.onGet(async () => {
				const value = deviceState.SetTemperature;
				const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Heating threshold temperature: ${value}${temperatureUnit}`);
				return value;
			})
			.onSet(async (value) => {
				const temp = Math.round((value <= 10) ? 10 : value >= 31 ? 31 : value * 2) / 2;
				deviceState.SetTemperature = temp;
				deviceState.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.SetTemperature;
				deviceState.HasPendingCommand = true;
				const options = {
					data: deviceState
				}
				try {
					const newState = await this.axiosInstancePost(deviceTypeUrl, options);
					const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Set heating threshold temperature: ${temp}${temperatureUnit}`);
				} catch (error) {
					this.log.error(`${this.deviceTypeText}: ${accessoryName}, Set heating threshold temperature error: ${error}`);
				};
			});
		this.melcloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
			.onGet(async () => {
				const value = this.temperatureDisplayUnit;
				const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Temperature display unit: ${value?'°F': '°C'}`);
				return value;
			})
			.onSet(async (value) => {
				try {
					melCloudInfo.UseFahrenheit = value ? true : false;
					melCloudInfo.EmailOnCommsError = false;
					melCloudInfo.EmailOnUnitError = false;
					melCloudInfo.EmailCommsErrors = 1;
					melCloudInfo.EmailUnitErrors = 1;
					melCloudInfo.RestorePages = false;
					melCloudInfo.MarketingCommunication = false;
					melCloudInfo.AlternateEmailAddress = '';
					melCloudInfo.Fred = 4;
					const options = {
						data: melCloudInfo
					}
					const newState = await this.axiosInstancePost(API_URL.UpdateApplicationOptions, options);
					const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Set temperature display unit: ${value?'°F': '°C'}`);
				} catch (error) {
					this.log.error(`${this.deviceTypeText}: ${accessoryName}, Set temperature display unit error: ${error}`);
				};
			});
		accessory.addService(this.melcloudService);

		//prepare buttons service
		const buttons = this.buttons;
		const buttonsCount = buttons.length;
		if (buttonsCount > 0) {
			this.log.debug('prepareButtonsService');
			for (let i = 0; i < buttonsCount; i++) {

				//get button mode
				const buttonMode = buttons[i].mode;

				//get button name
				const buttonName = (buttons[i].name != undefined) ? buttons[i].name : buttonMode;

				//get button display type
				const buttonDisplayType = (buttons[i].displayType != undefined) ? buttons[i].displayType : 0;

				const serviceType = [Service.Outlet, Service.Switch][buttonDisplayType];
				const buttonService = new serviceType(`${accessoryName} ${buttonName}`, `Button ${i}`);
				buttonService.getCharacteristic(Characteristic.On)
					.onGet(async () => {
						const state = !deviceState.Power ? false : (buttonMode > 0) ? (deviceState.OperationMode == buttonMode) ? true : false : deviceState.Power;
						return state;
					})
					.onSet(async (state) => {
						let newData = deviceState;
						switch (buttonMode) {
							case 0: //ON,OFF
								if (state) {
									newData.Power = true;
									newData.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power;
								} else {
									newData.Power = false;
									newData.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power;
								}
								break
							case 1: //HEAT
								newData.Power = true;
								newData.OperationMode = 1;
								newData.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
								break
							case 2: //DRY
								newData.Power = true;
								newData.OperationMode = 2;
								newData.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
								break
							case 3: //COOL
								newData.Power = true;
								newData.OperationMode = 3;
								newData.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
								break
							case 7: //FAN
								newData.Power = true;
								newData.OperationMode = 7;
								newData.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
								break
							case 8: //AUTO
								newData.Power = true;
								newData.OperationMode = 8;
								newData.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
								break
							case 9: //PURIFY
								newData.Power = true;
								newData.OperationMode = 9;
								newData.EffectiveFlags = DEVICES_EFFECTIVE_FLAGS.AirConditioner.Power + DEVICES_EFFECTIVE_FLAGS.AirConditioner.OperationMode;
								break
							default:
								break
						}
						newData.HasPendingCommand = true;
						const options = {
							data: newData
						}
						try {
							const newState = await this.axiosInstancePost(deviceTypeUrl, options);
							const logInfo = this.disableLogInfo ? false : this.log(`${this.deviceTypeText}: ${accessoryName}, Set button mode: ${buttonName}`);
						} catch (error) {
							this.log.error(`${this.deviceTypeText}: ${accessoryName}, Set button error: ${error}`);
						};
					});

				accessory.addService(buttonService);
			}
		}

		this.startPrepareAccessory = false;
		const debug = this.enableDebugMode ? this.log(`${this.deviceTypeText}: ${accessoryName}, publishExternalAccessory.`) : false;
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	};
};