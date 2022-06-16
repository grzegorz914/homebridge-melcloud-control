'use strict';

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const axios = require('axios');
const mqttClient = require('./src/mqtt.js');
const API_URL = require('./src/apiurl.json');
const {
	url
} = require('inspector');

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
		if (!config || !Array.isArray(config.devices)) {
			log('No configuration found for %s', PLUGIN_NAME);
			return;
		}
		this.log = log;
		this.api = api;
		this.devices = config.devices || [];
		this.accessories = [];

		this.api.on('didFinishLaunching', () => {
			this.log.debug('didFinishLaunching');
			for (let i = 0; i < this.devices.length; i++) {
				const device = this.devices[i];
				if (!device.name || !device.user || !device.pass) {
					this.log.warn('Device Name, user or password missing');
				} else {
					new melCloudDevice(this.log, device, this.api);
				}
			}
		});
	}

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
	constructor(log, config, api) {
		this.log = log;
		this.api = api;

		//device configuration
		this.name = config.name || 'MELCloud';
		this.user = config.user || '';
		this.pass = config.pass || '';
		this.language = config.language || 0;
		this.disableLogInfo = config.disableLogInfo || false;
		this.disableLogDeviceInfo = config.disableLogDeviceInfo || false;
		this.enableDebugMode = config.enableDebugMode || false;
		this.enableMqtt = config.enableMqtt || false;
		this.mqttHost = config.mqttHost;
		this.mqttPort = config.mqttPort || 1883;
		this.mqttPrefix = config.mqttPrefix;
		this.mqttAuth = config.mqttAuth || false;
		this.mqttUser = config.mqttUser;
		this.mqttPasswd = config.mqttPasswd;
		this.mqttDebug = config.mqttDebug || false;

		this.contextKey = null;
		this.temperatureDisplayUnit = 0;

		//get config info
		this.manufacturer = 'Mitsubishi';
		this.modelName = 'Model Name';
		this.serialNumber = 'Serial Number';
		this.firmwareRevision = 'Firmware Revision';

		//setup variables
		this.startPrepareAccessory = true;

		this.prefDir = path.join(api.user.storagePath(), 'melcloud');
		this.melCloudInfoFile = `${this.prefDir}/${this.name}`;

		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) == false) {
			fs.mkdirSync(this.prefDir);
		}
		if (fs.existsSync(this.melCloudInfoFile) == false) {
			fs.writeFileSync(this.melCloudInfoFile, '');
		}

		this.axiosInstanceLogin = axios.create({
			method: 'POST',
			baseURL: API_URL.BaseURL
		});

		//mqtt client
		this.mqttClient = new mqttClient({
			enabled: this.enableMqtt,
			host: this.mqttHost,
			port: this.mqttPort,
			prefix: this.mqttPrefix,
			topic: this.name,
			auth: this.mqttAuth,
			user: this.mqttUser,
			passwd: this.mqttPasswd,
			debug: this.mqttDebug
		});

		this.mqttClient.on('connected', (message) => {
				this.log('Device: %s %s, %s', this.host, this.name, message);
			})
			.on('error', (error) => {
				this.log('Device: %s %s, %s', this.host, this.name, error);
			})
			.on('debug', (message) => {
				this.log('Device: %s %s, debug: %s', this.host, this.name, message);
			})
			.on('message', (message) => {
				this.log('Device: %s %s, %s', this.host, this.name, message);
			})
			.on('disconnected', (message) => {
				this.log('Device: %s %s, %s', this.host, this.name, message);
			});

		this.melCloudLogin();
	}

	async melCloudLogin() {
		try {
			const options = {
				data: {
					AppVersion: '1.9.3.0',
					CaptchaChallenge: '',
					CaptchaResponse: '',
					Email: this.user,
					Language: this.language,
					Password: this.pass,
					Persist: 'true',
				}
			};

			const melCloudInfoData = await this.axiosInstanceLogin(API_URL.ClientLogin, options);
			const melCloudInfo = JSON.stringify(melCloudInfoData.data, null, 2);
			const debug = this.enableDebugMode ? this.log(`Account: ${this.name}, debug melCloudInfoData: ${melCloudInfo}`) : false;
			const writeDevInfo = await fsPromises.writeFile(this.melCloudInfoFile, melCloudInfo);

			const data = melCloudInfoData.data;
			const contextKey = data.LoginData.ContextKey;
			const temperatureDisplayUnit = data.LoginData.UseFahrenheit;

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
			this.temperatureDisplayUnit = temperatureDisplayUnit;

			this.updateDevicesList();
		} catch (error) {
			this.log.error(`Account: ${this.name}, login error: ${error}`);
		};
	};

	async updateDevicesList() {
		try {
			this.buildings = new Array();
			this.floors = new Array();
			this.areas = new Array();
			this.devices = new Array();

			const devicesListData = await this.axiosInstanceGet(API_URL.ListDevices);
			const devicesList = JSON.stringify(devicesListData.data, null, 2);
			const debug = this.enableDebugMode ? this.log(`Account: ${this.name}, debug devicesListData: ${devicesList}`) : false;

			const data = devicesListData.data;
			const buildingsLength = data.length;
			for (let i = 0; i < buildingsLength; i++) {
				const building = data[i];
				const buildingStructure = data[i].Structure;
				this.buildings.push(building);

				const florsLength = buildingStructure.Floors.length;
				for (let j = 0; j < florsLength; j++) {
					const flor = buildingStructure.Floors[j];
					this.floors.push(flor);

					const areasLength = buildingStructure.Floors[j].Areas.length;
					for (let k = 0; k < areasLength; k++) {
						const area = buildingStructure.Floors[j].Areas[k];
						this.areas.push(area);

						const devicesLength = buildingStructure.Floors[j].Areas[k].Devices.length;
						for (let l = 0; l < devicesLength; l++) {
							const device = buildingStructure.Floors[j].Areas[k].Devices[l];
							this.devices.push(device);
						};
					};
				};
			};

			this.updateDevicesState();
		} catch (error) {
			this.log.error(`Account: ${this.name}, Update devices list error: ${error}`);
		};
	};

	async updateDevicesState() {
		try {
			this.devicesState = new Array();

			const devicesLength = this.devices.length;
			for (let i = 0; i < devicesLength; i++) {
				const deviceId = this.devices[i].DeviceID;
				const buildingId = this.devices[i].BuildingID;

				let url = API_URL.DeviceState.replace("DID", deviceId);
				url = url.replace("BID", buildingId);

				const deviceStateData = await this.axiosInstanceGet(url);
				const deviceState = JSON.stringify(deviceStateData.data, null, 2);
				const debug = this.enableDebugMode ? this.log(`Account: ${this.name}, debug deviceStateData: ${deviceState}`) : false;

				const data = deviceStateData.data;
				const effectiveFlags = data.EffectiveFlags;
				const localIPAddress = data.LocalIPAddress;
				const roomTemperature = data.RoomTemperature;
				const setTemperature = data.SetTemperature;
				const setFanSpeed = data.SetFanSpeed;
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
				const deviceType = data.DeviceType;
				const lastCommunication = data.LastCommunication;
				const nextCommunication = data.NextCommunication;
				const power = data.Power;
				const hasPendingCommand = data.HasPendingCommand;
				const offline = data.Offline;
				const scene = data.Scene;
				const sceneOwner = data.SceneOwner;

				const mode = power ? inStandbyMode ? 1 : [1, 2, 1, 3, 1, 1, 1, 1, 1][operationMode] : 0;
				const rotationSpeed = setFanSpeed * 20;
				if (this.melCludServices) {
					this.melCludServices[i]
						.updateCharacteristic(Characteristic.Active, power)
						.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, mode)
						.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
						.updateCharacteristic(Characteristic.RotationSpeed, rotationSpeed)
						.updateCharacteristic(Characteristic.SwingMode, 1)
						.updateCharacteristic(Characteristic.CoolingThresholdTemperature, defaultCoolingSetTemperature)
						.updateCharacteristic(Characteristic.HeatingThresholdTemperature, defaultHeatingSetTemperature)
				};

				this.devicesState.push(data);
			}
			this.refreshDeviceState();

			if (this.startPrepareAccessory) {
				this.prepareAccessory();
			}
		} catch (error) {
			this.log.error(`Account: ${this.name}, Update devices state error: ${error}`);
		};
	};

	refreshDeviceState() {
		setTimeout(() => {
			this.updateDevicesState();
		}, 30000)
	};


	//prepare accessory
	async prepareAccessory() {
		this.log.debug('prepareAccessory');
		const accessoryName = this.name;
		const accessoryUUID = AccessoryUUID.generate(this.user);
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

		//prepare heatercooler service
		this.log.debug('prepareHeaterCoolerService');

		this.melCludServices = new Array();
		const devicesLength = this.devices.length;
		for (let i = 0; i < devicesLength; i++) {
			const deviceName = this.devices[i].DeviceName;
			const deviceId = this.devices[i].DeviceID;
			const melCloudService = new Service.HeaterCooler(`${deviceName}`, `melCloudService${i}`);
			melCloudService.getCharacteristic(Characteristic.Active)
				.onGet(async () => {
					const state = this.devicesState[i].Power;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${deviceName}, power state: ${state}`);
					return state;
				})
				.onSet(async (state) => {
					try {
						const options = {
							data: {
								Power: state
							}
						};
						const newState = await this.axiosInstancePost(API_URL.SetAta, options);
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${deviceName}, set power state: ${state}`);
					} catch (error) {
						this.log.error(`Device: ${deviceName}, Set power state error: ${error}`);
					};
				});
			melCloudService.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
				.onGet(async () => {
					const state = this.devicesState[i].Power ? this.devicesState[i].InStandbyMode ? 1 : [1, 2, 1, 3, 1, 1, 1, 1, 1][this.devicesState[i].OperationMode] : 0;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${deviceName}, current heater cooler state: ${state}`);
					return state;
				});
			melCloudService.getCharacteristic(Characteristic.TargetHeaterCoolerState)
				.onGet(async () => {
					const state = this.devicesState[i].Power ? this.devicesState[i].InStandbyMode ? 1 : [0, 1, 0, 2, 0, 0, 0, 0, 0][this.devicesState[i].OperationMode] : 0;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${deviceName}, target heater cooler state: ${state}`);
					return state;
				})
				.onSet(async (state) => {
					try {
						const newState = await this.axiosInstancePost(API_URL.SetAta);
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${deviceName}, set target heater cooler state: ${state}`);
					} catch (error) {
						this.log.error(`Device: ${deviceName}, Set target heater cooler state error: ${error}`);
					};
				});
			melCloudService.getCharacteristic(Characteristic.CurrentTemperature)
				.onGet(async () => {
					const value = this.devicesState[i].RoomTemperature;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${deviceName}, current temperature: ${value}`);
					return value;
				});
			melCloudService.getCharacteristic(Characteristic.RotationSpeed)
				.onGet(async () => {
					const value = 50;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${deviceName}, fan rotation speed: ${value}`);
					return value;
				})
				.onSet(async (value) => {
					try {
						const newState = await this.axiosInstancePost(API_URL.SetAta);
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${deviceName}, set fan rotation speed: ${value}`);
					} catch (error) {
						this.log.error(`Device: ${deviceName}, Set fan rotation speed error: ${error}`);
					};
				});
			melCloudService.getCharacteristic(Characteristic.SwingMode)
				.onGet(async () => {
					const state = 0;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${deviceName}, swing mode: ${state}`);
					return state;
				})
				.onSet(async (state) => {
					try {
						const newState = await this.axiosInstancePost(API_URL.SetAta);
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${deviceName}, set swing mode: ${state}`);
					} catch (error) {
						this.log.error(`Device: ${deviceName}, Set new power state error: ${error}`);
					};
				});
			melCloudService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
				.onGet(async () => {
					const value = this.devicesState[i].DefaultCoolingSetTemperature;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${deviceName}, cooling threshold temperature: ${value}`);
					return value;
				})
				.onSet(async (value) => {
					try {
						const newState = await this.axiosInstancePost(API_URL.SetAta);
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${deviceName}, set cooling threshold temperature: ${value}`);
					} catch (error) {
						this.log.error(`Device: ${deviceName}, Set new power state error: ${error}`);
					};
				});
			melCloudService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
				.onGet(async () => {
					const value = this.devicesState[i].DefaultHeatingSetTemperature;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${deviceName}, heating threshold temperature: ${value}`);
					return value;
				})
				.onSet(async (value) => {
					try {
						const newState = await this.axiosInstancePost(API_URL.SetAta);
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${deviceName}, set  heating threshold temperature: ${value}`);
					} catch (error) {
						this.log.error(`Device: ${deviceName}, Set new power state error: ${error}`);
					};
				});
			melCloudService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
				.onGet(async () => {
					const value = this.temperatureDisplayUnit;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${deviceName}, temperature display unit: ${value? 'Fahrenheit':'Celsius'}`);
					return value;
				})
				.onSet(async (value) => {
					try {
						const newState = await this.axiosInstancePost(API_URL.SetAta);
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${deviceName}, set temperature display unit to: ${value? 'Fahrenheit':'Celsius'}`);
					} catch (error) {
						this.log.error(`Device: ${deviceName}, Set temperature display unit error: ${error}`);
					};
				});


			this.melCludServices.push(melCloudService);
			accessory.addService(this.melCludServices[i]);
		};

		this.startPrepareAccessory = false;
		const debug3 = this.enableDebugMode ? this.log(`Account: ${this.name}, publishExternalAccessory.`) : false;
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	};
};