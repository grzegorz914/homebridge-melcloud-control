'use strict';
const path = require('path');
const fs = require('fs');
const MelCloud = require('./src/melcloud.js')
const DeviceAta = require('./src/deviceata.js')
const DeviceAtw = require('./src/deviceatw.js')
const DeviceErv = require('./src/deviceerv.js')
const CONSTANTS = require('./src/constants.json');

class MelCloudPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.accounts)) {
			log.warn(`No configuration found for ${CONSTANTS.PluginName}`);
			return;
		}
		this.accessories = [];

		//check if the directory exists, if not then create it
		const prefDir = path.join(api.user.storagePath(), 'melcloud');
		if (!fs.existsSync(prefDir)) {
			fs.mkdirSync(prefDir);
		};

		api.on('didFinishLaunching', () => {
			//loop through accounts
			for (const account of config.accounts) {
				const accountName = account.name;
				const user = account.user;
				const passwd = account.passwd;
				const language = account.language;

				//check mandatory properties
				if (!accountName || !user || !passwd || !language) {
					log.warn(`Name: ${accountName ? 'OK' : accountName}, user: ${user ? 'OK' : user}, password: ${passwd ? 'OK' : passwd}, language: ${language ? 'OK' : language} in config missing.`);
					return;
				}

				//hide devices
				const ataHideDeviceById = account.ataHideDeviceById || [];
				const atwHideDeviceById = account.atwHideDeviceById || [];
				const ervHideDeviceById = account.ervHideDeviceById || [];

				//debug config
				const enableDebugMode = account.enableDebugMode || false;
				const debug = enableDebugMode ? log(`Account: ${accountName}, did finish launching.`) : false;

				//remove sensitive data
				const debugData = {
					...account,
					user: 'removed',
					passwd: 'removed',
					mqttUser: 'removed',
					mqttPasswd: 'removed'
				};
				const debug1 = enableDebugMode ? log(`Account: ${accountName}, Config: ${JSON.stringify(debugData, null, 2)}`) : false;

				//set refresh interval
				const accountInfoFile = `${prefDir}/${accountName}_Account`;
				const buildingsFile = `${prefDir}/${accountName}_Buildings`;
				const refreshInterval = account.refreshInterval * 1000 || 120000;

				//melcloud account
				const melCloud = new MelCloud(prefDir, accountName, user, passwd, language, enableDebugMode, accountInfoFile, buildingsFile, refreshInterval);
				melCloud.on('checkDevicesListComplete', (accountInfo, contextKey, deviceInfo) => {
					const deviceId = deviceInfo.DeviceID.toString();
					const deviceType = deviceInfo.Type;
					const deviceName = deviceInfo.DeviceName;
					const deviceTypeText = CONSTANTS.DeviceType[deviceType];
					const deviceInfoFile = `${prefDir}/${accountName}_Device_${deviceId}`;

					//melcloud devices
					switch (deviceType) {
						case 0: //Air Conditioner
							const ataHideDevice = ataHideDeviceById.some(device => device.id === deviceId);
							if (ataHideDevice) {
								return;
							};

							const airConditioner = new DeviceAta(api, account, melCloud, accountInfo, accountName, contextKey, deviceId, deviceName, deviceTypeText, accountInfoFile, deviceInfoFile)
							airConditioner.on('publishAccessory', (accessory) => {

								//publish device
								api.publishExternalAccessories(CONSTANTS.PluginName, [accessory]);
								const debug = enableDebugMode ? log(`${accountName}, ${deviceTypeText} ${deviceName}, published as external accessory.`) : false;
							})
								.on('devInfo', (devInfo) => {
									log(devInfo);
								})
								.on('message', (message) => {
									log(`${deviceTypeText}, ${deviceName}, ${message}`);
								})
								.on('debug', (debug) => {
									log(`${deviceTypeText}, ${deviceName}, debug: ${debug}`);
								})
								.on('error', (error) => {
									log.error(`${deviceTypeText}, ${deviceName}, ${error}`);
								});
							break;
						case 1: //Heat Pump
							const atwHideDevice = atwHideDeviceById.some(device => device.id === deviceId);
							if (atwHideDevice) {
								return;
							};

							const heatPump = new DeviceAtw(api, account, melCloud, accountInfo, accountName, contextKey, deviceId, deviceName, deviceTypeText, accountInfoFile, deviceInfoFile)
							heatPump.on('publishAccessory', (accessory) => {

								//publish device
								api.publishExternalAccessories(CONSTANTS.PluginName, [accessory]);
								const debug = enableDebugMode ? log(`${accountName}, ${deviceTypeText} ${deviceName}, published as external accessory.`) : false;
							})
								.on('devInfo', (devInfo) => {
									log(devInfo);
								})
								.on('message', (message) => {
									log(`${deviceTypeText}, ${deviceName}, ${message}`);
								})
								.on('debug', (debug) => {
									log(`${deviceTypeText}, ${deviceName}, debug: ${debug}`);
								})
								.on('error', (error) => {
									log.error(`${deviceTypeText}, ${deviceName}, ${error}`);
								});
							break;
						case 3: //Energy Recovery Ventilation
							const ervHideDevice = ervHideDeviceById.some(device => device.id === deviceId);
							if (ervHideDevice) {
								return;
							};

							const energyRecoveryVentilation = new DeviceErv(api, account, melCloud, accountInfo, accountName, contextKey, deviceId, deviceName, deviceTypeText, accountInfoFile, deviceInfoFile)
							energyRecoveryVentilation.on('publishAccessory', (accessory) => {

								//publish device
								api.publishExternalAccessories(CONSTANTS.PluginName, [accessory]);
								const debug = enableDebugMode ? log(`${accountName}, ${deviceTypeText} ${deviceName}, published as external accessory.`) : false;
							})
								.on('devInfo', (devInfo) => {
									log(devInfo);
								})
								.on('message', (message) => {
									log(`${deviceTypeText}, ${deviceName}, ${message}`);
								})
								.on('debug', (debug) => {
									log(`${deviceTypeText}, ${deviceName}, debug: ${debug}`);
								})
								.on('error', (error) => {
									log.error(`${deviceTypeText}, ${deviceName}, ${error}`);
								});
							break;
						default:
							log(`Unknown device type: ${deviceType},`);
							break;
					}
				})
					.on('message', (message) => {
						log(`Account ${accountName}, ${message}`);
					})
					.on('debug', (debug) => {
						log(`Account ${accountName}, debug: ${debug}`);
					})
					.on('error', (error) => {
						log.error(`Account ${accountName}, ${error}`);
					});
			};
		});
	};

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	};
};

module.exports = (api) => {
	api.registerPlatform(CONSTANTS.PluginName, CONSTANTS.PlatformName, MelCloudPlatform, true);
};
