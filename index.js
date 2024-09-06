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

		//create directory if it doesn't exist
		const prefDir = path.join(api.user.storagePath(), 'melcloud');
		try {
			//create directory if it doesn't exist
			fs.mkdirSync(prefDir, { recursive: true });
		} catch (error) {
			log.error(`Prepare directory error: ${error}`);
			return;
		}

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
				const accountFile = `${prefDir}/${accountName}_Account`;
				const buildingsFile = `${prefDir}/${accountName}_Buildings`;
				const devicesFile = `${prefDir}/${accountName}_Devices`;

				//set refresh interval
				const refreshInterval = account.refreshInterval * 1000 || 120000;
				const deviceRefreshInterval = account.deviceRefreshInterval * 1000 || 5000;

				try {
					//melcloud account
					const melCloud = new MelCloud(user, passwd, language, accountFile, buildingsFile, devicesFile, enableDebugMode, false);
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

					//connect
					const response = await melCloud.connect();
					const accountInfo = response.accountInfo;
					const contextKey = response.contextKey;

					//check devices list
					const devices = await melCloud.chackDevicesList(contextKey);

					//start impulse generator
					const timers = [{ name: 'checkDevicesList', sampling: refreshInterval }];
					melCloud.impulseGenerator.start(timers);

					//Air Conditioner 0
					for (const device of account.ataDevices) {
						//chack device from config exist on melcloud
						const deviceId = device.id;
						const displayMode = device.displayMode > 0 ?? false;
						const deviceExistInMelCloud = devices.some(dev => dev.DeviceID === deviceId);
						if (!deviceExistInMelCloud || !displayMode) {
							continue;
						};

						const deviceName = device.name;
						const deviceTypeText = device.typeString;
						const airConditioner = new DeviceAta(api, account, device, melCloud, accountInfo, contextKey, accountName, deviceId, deviceName, deviceTypeText, accountFile, devicesFile, deviceRefreshInterval)
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

					//Heat Pump 1
					for (const device of account.atwDevices) {
						//chack device from config exist on melcloud
						const deviceId = device.id;
						const displayMode = device.displayMode > 0 ?? false;
						const deviceExistInMelCloud = devices.some(dev => dev.DeviceID === deviceId);
						if (!deviceExistInMelCloud || !displayMode) {
							continue;
						};

						const deviceName = device.name;
						const deviceTypeText = device.typeString;
						const heatPump = new DeviceAtw(api, account, melCloud, device, accountInfo, contextKey, accountName, deviceId, deviceName, deviceTypeText, accountFile, devicesFile, deviceRefreshInterval)
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

					//Energy Recovery Ventilation 3
					for (const device of account.ervDevices) {
						//chack device from config exist on melcloud
						const deviceId = device.id;
						const displayMode = device.displayMode > 0 ?? false;
						const deviceExistInMelCloud = devices.some(dev => dev.DeviceID === deviceId);
						if (!deviceExistInMelCloud || !displayMode) {
							continue;
						};

						const deviceName = device.name;
						const deviceTypeText = device.typeString;
						const energyRecoveryVentilation = new DeviceErv(api, account, device, melCloud, accountInfo, contextKey, accountName, deviceId, deviceName, deviceTypeText, accountFile, devicesFile, deviceRefreshInterval)
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
				} catch (error) {
					log.error(`Account: ${accountName}, Did finish launching error: ${error.message ?? error}`);
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
