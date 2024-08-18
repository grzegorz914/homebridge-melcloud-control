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
		const accountsName = [];

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

				//check duplicate account name
				if (accountsName.includes(accountName)) {
					log.warn(`Account name: ${accountName}, must be unique.`);
					return;
				}
				accountsName.push(accountName);

				//hide devices
				const ataHideDeviceById = account.ataHideDeviceById || [];
				const atwHideDeviceById = account.atwHideDeviceById || [];
				const ervHideDeviceById = account.ervHideDeviceById || [];

				//debug config
				const enableDebugMode = account.enableDebugMode || false;
				const debug = enableDebugMode ? log.info(`Account: ${accountName}, did finish launching.`) : false;

				//remove sensitive data
				const debugData = {
					...account,
					passwd: 'removed',
					mqtt: {
						...account.mqtt,
						passwd: 'removed'
					}
				};
				const debug1 = enableDebugMode ? log.info(`Account: ${accountName}, Config: ${JSON.stringify(debugData, null, 2)}`) : false;

				//set refresh interval
				const accountInfoFile = `${prefDir}/${accountName}_Account`;
				const buildingsFile = `${prefDir}/${accountName}_Buildings`;
				const refreshInterval = account.refreshInterval * 1000 || 120000;
				const deviceRefreshInterval = account.deviceRefreshInterval * 1000 || 5000;

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
							const ataHideDevice = ataHideDeviceById.some(device => device.id === deviceId) ?? false;
							if (ataHideDevice) {
								return;
							};

							const airConditioner = new DeviceAta(api, account, melCloud, accountInfo, accountName, contextKey, deviceId, deviceName, deviceTypeText, accountInfoFile, deviceInfoFile, deviceRefreshInterval)
							airConditioner.on('publishAccessory', (accessory) => {

								//publish device
								api.publishExternalAccessories(CONSTANTS.PluginName, [accessory]);
								log.success(`${accountName}, ${deviceTypeText} ${deviceName}, published as external accessory.`);
							})
								.on('devInfo', (devInfo) => {
									log.info(devInfo);
								})
								.on('message', (message) => {
									log.info(`${deviceTypeText}, ${deviceName}, ${message}`);
								})
								.on('debug', (debug) => {
									log.info(`${deviceTypeText}, ${deviceName}, debug: ${debug}`);
								})
								.on('warn', (warn) => {
									log.warn(`${deviceTypeText}, ${deviceName}, ${warn}`);
								})
								.on('error', (error) => {
									log.error(`${deviceTypeText}, ${deviceName}, ${error}`);
								});
							break;
						case 1: //Heat Pump
							const atwHideDevice = atwHideDeviceById.some(device => device.id === deviceId) ?? false;
							if (atwHideDevice) {
								return;
							};

							const heatPump = new DeviceAtw(api, account, melCloud, accountInfo, accountName, contextKey, deviceId, deviceName, deviceTypeText, accountInfoFile, deviceInfoFile, deviceRefreshInterval)
							heatPump.on('publishAccessory', (accessory) => {

								//publish device
								api.publishExternalAccessories(CONSTANTS.PluginName, [accessory]);
								log.success(`${accountName}, ${deviceTypeText} ${deviceName}, published as external accessory.`);
							})
								.on('devInfo', (devInfo) => {
									log.info(devInfo);
								})
								.on('message', (message) => {
									log.info(`${deviceTypeText}, ${deviceName}, ${message}`);
								})
								.on('debug', (debug) => {
									log.info(`${deviceTypeText}, ${deviceName}, debug: ${debug}`);
								})
								.on('warn', (warn) => {
									log.warn(`${deviceTypeText}, ${deviceName}, ${warn}`);
								})
								.on('error', (error) => {
									log.error(`${deviceTypeText}, ${deviceName}, ${error}`);
								});
							break;
						case 3: //Energy Recovery Ventilation
							const ervHideDevice = ervHideDeviceById.some(device => device.id === deviceId) ?? false;
							if (ervHideDevice) {
								return;
							};

							const energyRecoveryVentilation = new DeviceErv(api, account, melCloud, accountInfo, accountName, contextKey, deviceId, deviceName, deviceTypeText, accountInfoFile, deviceInfoFile, deviceRefreshInterval)
							energyRecoveryVentilation.on('publishAccessory', (accessory) => {

								//publish device
								api.publishExternalAccessories(CONSTANTS.PluginName, [accessory]);
								log.success(`${accountName}, ${deviceTypeText} ${deviceName}, published as external accessory.`);
							})
								.on('devInfo', (devInfo) => {
									log.info(devInfo);
								})
								.on('message', (message) => {
									log.info(`${deviceTypeText}, ${deviceName}, ${message}`);
								})
								.on('debug', (debug) => {
									log.info(`${deviceTypeText}, ${deviceName}, debug: ${debug}`);
								})
								.on('warn', (warn) => {
									log.warn(`${deviceTypeText}, ${deviceName}, ${warn}`);
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
						log.info(`Account ${accountName}, ${message}`);
					})
					.on('debug', (debug) => {
						log.info(`Account ${accountName}, debug: ${debug}`);
					})
					.on('warn', (warn) => {
						log.warn(`${deviceTypeText}, ${deviceName}, ${warn}`);
					})
					.on('error', async (error) => {
						log.error(`Account ${accountName}, ${error}, check again in: ${refreshInterval / 1000}s.`);
						melCloud.impulseGenerator.stop();
						await new Promise(resolve => setTimeout(resolve, refreshInterval));
						melCloud.connect();
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
