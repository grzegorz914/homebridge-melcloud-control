'use strict';
const path = require('path');
const fs = require('fs');
const MelCloud = require('./src/melcloud.js')
const MelCloudDevice = require('./src/melclouddevice.js')
const CONSTANS = require('./src/constans.json');
class MelCloudPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.accounts)) {
			log(`No configuration found for ${CONSTANS.PluginName}`);
			return;
		}
		this.accessories = [];

		api.on('didFinishLaunching', () => {
			log.debug('didFinishLaunching');
			for (const account of config.accounts) {
				const accountName = account.name;
				const user = account.user;
				const passwd = account.passwd;
				const language = account.language;
				const enableDebugMode = account.enableDebugMode;

				//check if the directory exists, if not then create it
				const prefDir = path.join(api.user.storagePath(), 'melcloud');
				if (!fs.existsSync(prefDir)) {
					fs.mkdirSync(prefDir);
				};

				//check mandatory properties
				if (!accountName || !user || !passwd || !language) {
					this.log(`Name, user, password or language in config missing.`);
					return;
				}

				//connect to melcloud
				const melCloud = new MelCloud(accountName, user, passwd, language, enableDebugMode, prefDir);
				melCloud.on('checkDevicesListComplete', (accountInfo, contextKey, buildingId, deviceId, deviceType, deviceName, deviceTypeText) => {

					//prepare devices
					const melCloudDevice = new MelCloudDevice(api, account, accountName, prefDir, melCloud, accountInfo, contextKey, buildingId, deviceId, deviceType, deviceName, deviceTypeText)
					melCloudDevice.on('publishAccessory', (accessory) => {

						//publish devices
						api.publishExternalAccessories(CONSTANS.PluginName, [accessory]);
						const debug = enableDebugMode ? log(`${deviceTypeText} ${deviceName}, published as external accessory.`) : false;
					})
						.on('removeAccessory', (accessory) => {
							api.unregisterPlatformAccessories(CONSTANS.PluginName, CONSTANS.PlatformName, [accessory]);
							const debug = enableDebugMode ? log(`${deviceTypeText} ${accessory}, removed.`) : false;
						})
						.on('devInfo', (devInfo) => {
							log(devInfo);
						})
						.on('message', (message) => {
							log(deviceTypeText, deviceName, message);
						})
						.on('debug', (debug) => {
							log(`${deviceTypeText}, ${deviceName}, debug: ${debug}`);
						})
						.on('error', (error) => {
							log(deviceTypeText, deviceName, error);
						});
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
	api.registerPlatform(CONSTANS.PluginName, CONSTANS.PlatformName, MelCloudPlatform, true);
};
