'use strict';

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const axios = require('axios');
const mqttClient = require('./src/mqtt.js');
const API_URL = require('./src/apiurl.json');

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

		const accounts = config.accounts || [];
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
		try {
			const options = {
				data: {
					AppVersion: '1.9.3.0',
					CaptchaChallenge: '',
					CaptchaResponse: '',
					Email: user,
					Password: pass,
					Language: language,
					Persist: 'true',
				}
			};

			const melCloudInfoData = await this.axiosInstanceLogin(API_URL.ClientLogin, options);
			const melCloudInfo = JSON.stringify(melCloudInfoData.data, null, 2);
			const debug = this.enableDebugMode ? this.log(`Account: ${this.accountName}, debug melCloudInfoData: ${melCloudInfo}`) : false;
			const writeMelCloudInfo = await fsPromises.writeFile(this.melCloudInfoFile, melCloudInfo);

			const data = melCloudInfoData.data;
			const contextKey = data.LoginData.ContextKey;
			const temperatureDisplayUnit = data.LoginData.UseFahrenheit;

			this.updateDevicesList(contextKey, temperatureDisplayUnit);
		} catch (error) {
			this.log.error(`Account: ${this.accountName}, login error: ${error}`);
		};
	};

	async updateDevicesList(contextKey, temperatureDisplayUnit) {
		try {
			this.buildings = new Array();
			this.floors = new Array();
			this.areas = new Array();
			this.devices = new Array();

			this.axiosInstanceGet = axios.create({
				method: 'GET',
				baseURL: API_URL.BaseURL,
				headers: {
					'X-MitsContextKey': contextKey,
				}
			});

			const devicesListData = await this.axiosInstanceGet(API_URL.ListDevices);
			const devicesList = JSON.stringify(devicesListData.data, null, 2);
			const debug = this.enableDebugMode ? this.log(`Account: ${this.accountName}, debug devicesListData: ${devicesList}`) : false;
			const writeDevicesList = await fsPromises.writeFile(this.melCloudDevicesFile, devicesList);

			const data = devicesListData.data;
			const buildingsCount = data.length;
			for (let i = 0; i < buildingsCount; i++) {
				const building = data[i];
				const buildingStructure = data[i].Structure;
				this.buildings.push(building);

				const floorsCount = buildingStructure.Floors.length;
				for (let j = 0; j < floorsCount; j++) {
					const flor = buildingStructure.Floors[j];
					this.floors.push(flor);

					const areasCount = buildingStructure.Floors[j].Areas.length;
					for (let k = 0; k < areasCount; k++) {
						const area = buildingStructure.Floors[j].Areas[k];
						this.areas.push(area);

						const devicesCount = buildingStructure.Floors[j].Areas[k].Devices.length;
						for (let l = 0; l < devicesCount; l++) {
							const device = buildingStructure.Floors[j].Areas[k].Devices[l];
							this.devices.push(device);
						};
					};
				};
			};

			this.buildingsCount = this.buildings.length;
			this.floorsCount = this.floors.length;
			this.areasCount = this.areas.length;
			this.devicesCount = this.devices.length;

			for (let i = 0; i < this.devicesCount; i++) {
				const device = this.devices[i];
				new melCloudDevice(this.log, this.api, this.accountConfig, contextKey, device, temperatureDisplayUnit);
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
	constructor(log, api, accountConfig, contextKey, device, temperatureDisplayUnit) {
		this.log = log;
		this.api = api;

		this.accountName = accountConfig.name;
		this.displayMode = accountConfig.displayMode;
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

		this.buildingId = device.BuildingID;
		this.deviceName = device.DeviceName;
		this.deviceId = device.DeviceID;;
		this.temperatureDisplayUnit = temperatureDisplayUnit;

		//get config info
		this.manufacturer = 'Mitsubishi';
		this.modelName = device.Device.Units[1].Model;
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
				this.log('Device: %s, %s', this.deviceName, message);
			})
			.on('error', (error) => {
				this.log('Device: %s, %s', this.deviceName, error);
			})
			.on('debug', (message) => {
				this.log('Device: %s, debug: %s', this.deviceName, message);
			})
			.on('message', (message) => {
				this.log('Device: %s, %s', this.deviceName, message);
			})
			.on('disconnected', (message) => {
				this.log('Device: %s, %s', this.deviceName, message);
			});

		if (!this.disableLogDeviceInfo) {
			this.log('-------- %s --------', this.accountName);
			this.log('Manufacturer: %s', this.manufacturer);
			this.log('Device: %s', this.deviceName);
			this.log('Model: %s', this.modelName);
			this.log('Serial: %s', this.serialNumber);
			this.log('Mac: %s', this.firmwareRevision);
			this.log('----------------------------------');
		}

		this.updateDevicesState();
	}

	async updateDevicesState() {
		try {
			const deviceId = this.deviceId;
			const buildingId = this.buildingId;

			let url = API_URL.DeviceState.replace("DID", deviceId);
			url = url.replace("BID", buildingId);

			const deviceStateData = await this.axiosInstanceGet(url);
			const deviceState = JSON.stringify(deviceStateData.data, null, 2);
			const debug = this.enableDebugMode ? this.log(`Device: ${this.deviceName}, debug deviceStateData: ${deviceState}`) : false;

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

			const valueHeaterCooler = power ? inStandbyMode ? 1 : [1, 2, 1, 3, 1, 1, 1, 1, 1][operationMode] : 0;
			const valueThermostat = power ? inStandbyMode ? 0 : [0, 1, 0, 2, 0, 0, 0, 0, 0][operationMode] : 0;
			const mode = [valueHeaterCooler, valueThermostat][this.displayMode];
			const valueTargetHeaterCooler = power ? inStandbyMode ? 0 : [0, 1, 0, 2, 0, 0, 0, 0, 0][operationMode] : 0;
			const valueTargetThermostat = power ? inStandbyMode ? 3 : [0, 1, 3, 2, 0, 0, 0, 3, 3][operationMode] : 0;
			const modeTarget = [valueTargetHeaterCooler, valueTargetThermostat][this.displayMode];
			if (this.heaterCoolerService) {
				if (this.displayMode == 0) {
					this.heaterCoolerService
						.updateCharacteristic(Characteristic.Active, power)
						.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, mode)
						.updateCharacteristic(Characteristic.TargetHeaterCoolerState, modeTarget)
						.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
						.updateCharacteristic(Characteristic.RotationSpeed, (setFanSpeed / numberOfFanSpeeds) * 100.0)
						.updateCharacteristic(Characteristic.SwingMode, (vaneHorizontal == 12 && vaneVertical == 7) ? 1 : 0)
						.updateCharacteristic(Characteristic.CoolingThresholdTemperature, defaultCoolingSetTemperature)
						.updateCharacteristic(Characteristic.HeatingThresholdTemperature, defaultHeatingSetTemperature)
						.updateCharacteristic(Characteristic.CurrentHorizontalTiltAngle, vaneHorizontal)
						.updateCharacteristic(Characteristic.TargetHorizontalTiltAngle, vaneHorizontal)
						.updateCharacteristic(Characteristic.CurrentVerticalTiltAngle, vaneVertical)
						.updateCharacteristic(Characteristic.TargetVerticalTiltAngle, vaneVertical)
				}
				if (this.displayMode == 1) {
					this.heaterCoolerService
						.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, mode)
						.updateCharacteristic(Characteristic.TargetHeatingCoolingState, modeTarget)
						.updateCharacteristic(Characteristic.CurrentTemperature, roomTemperature)
						.updateCharacteristic(Characteristic.TargetTemperature, setTemperature)
						.updateCharacteristic(Characteristic.CoolingThresholdTemperature, defaultCoolingSetTemperature)
						.updateCharacteristic(Characteristic.HeatingThresholdTemperature, defaultHeatingSetTemperature)
				}
			};

			const mqtt = this.enableMqtt ? this.mqttClient.send('Device state', JSON.stringify(deviceStateData, null, 2)) : false;

			this.deviceState = data;
			this.refreshDeviceState();

			if (this.startPrepareAccessory) {
				this.prepareAccessory();
			}
		} catch (error) {
			this.log.error(`Account: ${this.accountName}, Update devices state error: ${error}`);
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

		const deviceId = this.deviceId.toString();
		const deviceState = this.deviceState;
		const temperatureUnit = this.temperatureDisplayUnit ? '°F' : '°C'

		const accessoryName = this.deviceName;
		const accessoryUUID = AccessoryUUID.generate(deviceId);
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
		this.heaterCoolerService = new serviceType(accessoryName, `Service`);
		if (this.displayMode == 0) {
			this.heaterCoolerService.getCharacteristic(Characteristic.Active)
				.onGet(async () => {
					const state = deviceState.Power;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Power state: ${state?'ON':'OFF'}`);
					return state;
				})
				.onSet(async (state) => {
					try {
						const options = {
							data: {
								DeviceID: deviceId,
								Power: state,
								EffectiveFlags: state ? 1 + 2 : 1
							}
						};
						const newState = await this.axiosInstancePost(API_URL.SetAta, options);
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Set power state: ${state?'ON':'OFF'}`);
					} catch (error) {
						this.log.error(`Device: ${accessoryName}, Set power state error: ${error}`);
					};
				});
		};
		this.heaterCoolerService.getCharacteristic(characteristicCurrentType)
			.onGet(async () => {
				//1 = HEAT, 2 = DRY 3 = COOL, 7 = FAN, 8 = AUTO
				const valueHeaterCooler = deviceState.Power ? deviceState.InStandbyMode ? 1 : [1, 2, 1, 3, 1, 1, 1, 1, 1][deviceState.OperationMode] : 0;
				const valueThermostat = deviceState.Power ? deviceState.InStandbyMode ? 0 : [0, 1, 0, 2, 0, 0, 0, 0, 0][deviceState.OperationMode] : 0;
				const value = [valueHeaterCooler, valueThermostat][this.displayMode];
				const valueText = [
					['INACTIVE', 'IDLE', 'HEAT', 'COOL'],
					['OFF', 'HEAT', 'COOL']
				][this.displayMode];
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Heating cooling mode: ${valueText[value]}`);
				return value;
			});
		this.heaterCoolerService.getCharacteristic(characteristicTargetType)
			.onGet(async () => {
				//1 = HEAT, 2 = DRY 3 = COOL, 7 = FAN, 8 = AUTO
				const valueHeaterCooler = deviceState.Power ? deviceState.InStandbyMode ? 0 : [0, 1, 0, 2, 0, 0, 0, 0, 0][deviceState.OperationMode] : 0;
				const valueThermostat = deviceState.Power ? deviceState.InStandbyMode ? 3 : [0, 1, 3, 2, 0, 0, 0, 3, 3][deviceState.OperationMode] : 0;
				const value = [valueHeaterCooler, valueThermostat][this.displayMode];
				const valueText = [
					['AUTO', 'HEAT', 'COOL'],
					['OFF', 'HEAT', 'COOL', 'AUTO']
				][this.displayMode];
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Target heating cooling mode: ${valueText[value]}`);
				return value;
			})
			.onSet(async (value) => {
				let options = '';
				switch (value) {
					case 0: //OFF, AUTO
						options = this.displayMode ? {
							data: {
								DeviceID: deviceId,
								Power: false,
								EffectiveFlags: 1,
							}
						} : {
							data: {
								DeviceID: deviceId,
								Power: true,
								OperationMode: 8,
								EffectiveFlags: 1 + 2,
							}
						};
						break;
					case 1: //HEAT
						options = {
							data: {
								DeviceID: deviceId,
								Power: true,
								OperationMode: 1,
								EffectiveFlags: 1 + 2,
							}
						};
						break;
					case 2: //COOL
						options = {
							data: {
								DeviceID: deviceId,
								Power: true,
								OperationMode: 3,
								EffectiveFlags: 1 + 2,
							}
						};
						break;
					case 3: //AUTO
						options = {
							data: {
								DeviceID: deviceId,
								Power: true,
								OperationMode: 8,
								EffectiveFlags: 1 + 2,
							}
						};
						break;
				}
				try {
					const valueText = [
						['AUTO', 'HEAT', 'COOL'],
						['OFF', 'HEAT', 'COOL', 'AUTO']
					][this.displayMode];
					const newState = await this.axiosInstancePost(API_URL.SetAta, options);
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Set target heating cooling mode: ${valueText[value]}`);
				} catch (error) {
					this.log.error(`Device: ${accessoryName}, Set target heating cooling mode error: ${error}`);
				};
			});
		this.heaterCoolerService.getCharacteristic(Characteristic.CurrentTemperature)
			.onGet(async () => {
				const value = deviceState.RoomTemperature;
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Temperature: ${value}${temperatureUnit}`);
				return value;
			});
		if (this.displayMode == 1) {
			this.heaterCoolerService.getCharacteristic(Characteristic.TargetTemperature)
				.onGet(async () => {
					const value = deviceState.SetTemperature;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Target temperature: ${value}${temperatureUnit}`);
					return value;
				})
				.onSet(async (value) => {
					try {
						const options = {
							data: {
								DeviceID: deviceId,
								SetTemperature: value.toFixed(0),
								EffectiveFlags: 4,
							}
						};
						const newState = await this.axiosInstancePost(API_URL.SetAta, options);
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Set target temperature: ${value}${temperatureUnit}`);
					} catch (error) {
						this.log.error(`Device: ${accessoryName}, Set target temperature error: ${error}`);
					};
				});
		};
		if (this.displayMode == 0) {
			this.heaterCoolerService.getCharacteristic(Characteristic.RotationSpeed)
				.onGet(async () => {
					//0 = AUTO, 1 = 1, 2 = 2, 3 = 3, 4 = 4, 5 = 5
					const value = (deviceState.SetFanSpeed / deviceState.NumberOfFanSpeeds) * 100.0;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Fan rotation speed: ${value}%`);
					return value;
				})
				.onSet(async (value) => {
					try {
						const options = {
							data: {
								DeviceID: deviceId,
								SetFanSpeed: ((value / 100.0) * deviceState.NumberOfFanSpeeds).toFixed(0),
								EffectiveFlags: 8
							}
						};
						const newState = await this.axiosInstancePost(API_URL.SetAta, options);
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Set fan rotation speed: ${value}`);
					} catch (error) {
						this.log.error(`Device: ${accessoryName}, Set fan rotation speed error: ${error}`);
					};
				});
			this.heaterCoolerService.getCharacteristic(Characteristic.SwingMode)
				.onGet(async () => {
					//Vane Horizontal: 0 = Auto, 1 = 1, 2 = 2, 3 = 3, 4 = 4, 5 = 5, 12 = Swing.
					//Vane Vertical: 0 = Auto, 1 = 1, 2 = 2, 3 = 3, 4 = 4, 5 = 5, 7 = Swing.
					const value = (deviceState.VaneHorizontal == 12 && deviceState.VaneVertical == 7) ? 1 : 0;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Swing mode: ${['AUTO', '1', '2','3','4','5'][value]}`);
					return value;
				})
				.onSet(async (value) => {
					try {
						const options = {
							data: {
								DeviceID: deviceId,
								VaneHorizontal: value ? 12 : 0,
								VaneVertical: value ? 7 : 0,
								EffectiveFlags: 256 + 16
							}
						}
						const newState = await this.axiosInstancePost(API_URL.SetAta, options);
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Set swing mode: ${['AUTO', '1', '2','3','4','5'][value]}`);
					} catch (error) {
						this.log.error(`Device: ${accessoryName}, Set new swing mode error: ${error}`);
					};
				});
			this.heaterCoolerService.getCharacteristic(Characteristic.CurrentHorizontalTiltAngle)
				.onGet(async () => {
					const value = deviceState.VaneHorizontal;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Horizontal tilt angle: ${value}°`);
					return value;
				})
			this.heaterCoolerService.getCharacteristic(Characteristic.TargetHorizontalTiltAngle)
				.onGet(async () => {
					const value = deviceState.VaneHorizontal;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Target horizontal tilt angle: ${value}°`);
					return value;
				})
				.onSet(async (value) => {
					try {
						const options = {
							data: {
								DeviceID: deviceId,
								VaneHorizontal: ((value + 90.0) / 45.0 + 1.0).toFixed(0),
								EffectiveFlags: 256
							}
						};
						const newState = await this.axiosInstancePost(API_URL.SetAta, options);
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Set target horizontal tilt angle: ${value}°`);
					} catch (error) {
						this.log.error(`Device: ${accessoryName}, Set target horizontal tilt angle error: ${error}`);
					};
				});
			this.heaterCoolerService.getCharacteristic(Characteristic.CurrentVerticalTiltAngle)
				.onGet(async () => {
					const value = deviceState.VaneVertical;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Vertical tilt angle: ${value}°`);
					return value;
				})
			this.heaterCoolerService.getCharacteristic(Characteristic.TargetVerticalTiltAngle)
				.onGet(async () => {
					const value = deviceState.VaneVertical;
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Target vertical tilt angle: ${value}°`);
					return value;
				})
				.onSet(async (value) => {
					try {
						const options = {
							data: {
								DeviceID: deviceId,
								VaneVertical: ((value + 90.0) / 45.0 + 1.0).toFixed(0),
								EffectiveFlags: 16
							}
						};
						const newState = await this.axiosInstancePost(API_URL.SetAta, options);
						const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Set target vertical tilt angle: ${value}°`);
					} catch (error) {
						this.log.error(`Device: ${accessoryName}, Set target vertical tilt angle error: ${error}`);
					};
				});
		};
		this.heaterCoolerService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
			.onGet(async () => {
				const value = deviceState.DefaultCoolingSetTemperature;
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Cooling threshold temperature: ${value}${temperatureUnit}`);
				return value;
			})
			.onSet(async (value) => {
				try {
					const options = {
						data: {
							DeviceID: deviceId,
							DefaultCoolingSetTemperature: 21.0,
							EffectiveFlags: 4
						}
					};
					const newState = await this.axiosInstancePost(API_URL.SetAta, options);
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Set cooling threshold temperature: ${value}${temperatureUnit}`);
				} catch (error) {
					this.log.error(`Device: ${accessoryName}, Set cooling threshold temperature error: ${error}`);
				};
			});
		this.heaterCoolerService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
			.onGet(async () => {
				const value = deviceState.DefaultHeatingSetTemperature;
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Heating threshold temperature: ${value}${temperatureUnit}`);
				return value;
			})
			.onSet(async (value) => {
				try {
					const options = {
						data: {
							DeviceID: deviceId,
							DefaultHeatingSetTemperature: 23.0,
							EffectiveFlags: 4
						}
					};
					const newState = await this.axiosInstancePost(API_URL.SetAta, options);
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Set heating threshold temperature: ${value}${temperatureUnit}`);
				} catch (error) {
					this.log.error(`Device: ${accessoryName}, Set heating threshold temperature error: ${error}`);
				};
			});
		this.heaterCoolerService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
			.onGet(async () => {
				const value = this.temperatureDisplayUnit;
				const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Temperature display unit: ${value ? '°F' : '°C'}`);
				return value;
			})
			.onSet(async (value) => {
				try {
					const options = {
						data: {
							UseFahrenheit: value ? true : false,
							EmailOnCommsError: false,
							EmailOnUnitError: false,
							EmailCommsErrors: 1,
							EmailUnitErrors: 1,
							RestorePages: false,
							MarketingCommunication: false,
							AlternateEmailAddress: '',
							Fred: 4
						}
					}
					const newState = await this.axiosInstancePost(API_URL.UpdateApplicationOptions, options);
					const logInfo = this.disableLogInfo ? false : this.log(`Device: ${accessoryName}, Set temperature display unit: ${value? '°F':'°C'}`);
				} catch (error) {
					this.log.error(`Device: ${accessoryName}, Set temperature display unit error: ${error}`);
				};
			});
		accessory.addService(this.heaterCoolerService);

		this.startPrepareAccessory = false;
		const debug = this.enableDebugMode ? this.log(`Device: ${accessoryName}, publishExternalAccessory.`) : false;
		this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
	};
};