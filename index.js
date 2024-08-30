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

		api.on('didFinishLaunching', async () => {
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

				//define directory and file paths
				const prefDir = path.join(api.user.storagePath(), 'melcloud');
				const accountInfoFile = `${prefDir}/${accountName}_Account`;
				const buildingsFile = `${prefDir}/${accountName}_Buildings`;
				const deviceFile = `${prefDir}/${accountName}_Device_`;

				//create directory if it doesn't exist
				try {
					//create directory if it doesn't exist
					fs.mkdirSync(prefDir, { recursive: true });
				} catch (error) {
					log.error(`Account: ${accountName}, prepare directory error: ${error.message ?? error}`);
					return;
				}

				//set refresh interval
				const refreshInterval = account.refreshInterval * 1000 || 120000;
				const deviceRefreshInterval = account.deviceRefreshInterval * 1000 || 5000;

				//melcloud account
				try {
					const melCloud = new MelCloud(user, passwd, language, accountInfoFile, buildingsFile, deviceFile, enableDebugMode, refreshInterval, false);
					const response = await melCloud.connect();
					const accountInfo = response.accountInfo;
					const contextKey = response.contextKey;
					const devices = await melCloud.chackDevicesList(contextKey);

					//Air Conditioner
					for (const device of account.ataDevices) {
						if (!device.id || device.displayMode === 0) {
							continue;
						};

						const deviceId = device.id.toString();
						const deviceName = device.name;
						const deviceTypeText = device.typeString;
						const deviceInfoFile = `${prefDir}/${accountName}_Device_${deviceId}`;
						const airConditioner = new DeviceAta(api, account, device, melCloud, accountInfo, contextKey, accountName, deviceId, deviceName, deviceTypeText, accountInfoFile, deviceInfoFile, deviceRefreshInterval)
						airConditioner.on('publishAccessory', (accessory) => {

							//publish device
							api.publishExternalAccessories(CONSTANTS.PluginName, [accessory]);
							log.success(`${accountName}, ${deviceTypeText} ${deviceName}, published as external accessory.`);
						})
							.on('devInfo', (devInfo) => {
								log.info(devInfo);
							})
							.on('success', (message) => {
								log.success(`${deviceTypeText}, ${deviceName}, ${message}`);
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
					};

					//Heat Pump
					for (const device of account.atwDevices) {
						if (!device.id || device.displayMode === 0) {
							continue;
						};

						const deviceId = device.id.toString();
						const deviceType = device.type ?? 1;
						const deviceName = device.name;
						const deviceTypeText = CONSTANTS.DeviceType[deviceType];
						const deviceInfoFile = `${prefDir}/${accountName}_Device_${deviceId}`;
						const heatPump = new DeviceAtw(api, account, melCloud, device, accountInfo, contextKey, accountName, deviceId, deviceName, deviceTypeText, accountInfoFile, deviceInfoFile, deviceRefreshInterval)
						heatPump.on('publishAccessory', (accessory) => {

							//publish device
							api.publishExternalAccessories(CONSTANTS.PluginName, [accessory]);
							log.success(`${accountName}, ${deviceTypeText} ${deviceName}, published as external accessory.`);
						})
							.on('devInfo', (devInfo) => {
								log.info(devInfo);
							})
							.on('success', (message) => {
								log.success(`${deviceTypeText}, ${deviceName}, ${message}`);
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
					};

					//Energy Recovery Ventilation
					for (const device of account.ervDevices) {
						if (!device.id || device.displayMode === 0) {
							continue;
						};

						const deviceId = device.id.toString();
						const deviceType = device.type ?? 3;
						const deviceName = device.name;
						const deviceTypeText = CONSTANTS.DeviceType[deviceType];
						const deviceInfoFile = `${prefDir}/${accountName}_Device_${deviceId}`;
						const energyRecoveryVentilation = new DeviceErv(api, account, device, melCloud, accountInfo, contextKey, accountName, deviceId, deviceName, deviceTypeText, accountInfoFile, deviceInfoFile, deviceRefreshInterval)
						energyRecoveryVentilation.on('publishAccessory', (accessory) => {

							//publish device
							api.publishExternalAccessories(CONSTANTS.PluginName, [accessory]);
							log.success(`${accountName}, ${deviceTypeText} ${deviceName}, published as external accessory.`);
						})
							.on('devInfo', (devInfo) => {
								log.info(devInfo);
							})
							.on('success', (message) => {
								log.success(`${deviceTypeText}, ${deviceName}, ${message}`);
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
					};
					melCloud.on('success', (message) => {
						log.success(`Account ${accountName}, ${message}`);
					})
						.on('message', (message) => {
							log.info(`Account ${accountName}, ${message}`);
						})
						.on('debug', (debug) => {
							log.info(`Account ${accountName}, debug: ${debug}`);
						})
						.on('warn', (warn) => {
							log.warn(`Account ${accountName}, ${warn}`);
						})
						.on('error', (error) => {
							log.error(`Account ${accountName}, ${error}.`);
						});
				} catch (error) {
					log.error(`Account: ${accountName}, MELCloud error: ${error.message ?? error}`);
				}
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
