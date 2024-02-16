'use strict';
const path = require('path');
const fs = require('fs');
const RestFul = require('./src/restful.js');
const Mqtt = require('./src/mqtt.js');
const MelCloud = require('./src/melcloud.js')
const MelCloudDevice = require('./src/melclouddevice.js')
const CONSTANS = require('./src/constans.json');

class MelCloudPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.accounts)) {
			log.warn(`No configuration found for ${CONSTANS.PluginName}`);
			return;
		}
		this.accessories = [];

		//check if the directory exists, if not then create it
		const prefDir = path.join(api.user.storagePath(), 'melcloud');
		if (!fs.existsSync(prefDir)) {
			fs.mkdirSync(prefDir);
		};

		api.on('didFinishLaunching', () => {
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

				//config
				const enableDebugMode = account.enableDebugMode || false;
				const refreshInterval = account.refreshInterval * 1000 || 120000;
				const restFulEnabled = account.enableRestFul || false;
				const mqttEnabled = account.enableMqtt || false;

				//debug config
				const debug = enableDebugMode ? log(`Account: ${accountName}, did finish launching.`) : false;

				//remove sensitive data
				const config = {
					...account,
					user: 'removed',
					passwd: 'removed',
					mqttUser: 'removed',
					mqttPasswd: 'removed'
				};
				const debug1 = enableDebugMode ? log(`Account: ${accountName}, Config: ${JSON.stringify(config, null, 2)}`) : false;

				//melcloud account
				const melCloud = new MelCloud(prefDir, accountName, user, passwd, language, enableDebugMode, refreshInterval);
				melCloud.on('checkDevicesListComplete', (accountInfo, contextKey, deviceInfo) => {
					const deviceId = deviceInfo.DeviceID.toString();
					const deviceType = deviceInfo.Type;
					const deviceName = deviceInfo.DeviceName;
					const useFahrenheit = accountInfo.UseFahrenheit ? 1 : 0;
					const deviceTypeText = CONSTANS.DeviceType[deviceType];
					const deviceInfoFile = `${prefDir}/${accountName}_Device_${deviceId}`;

					//RESTFul server
					if (restFulEnabled) {
						this.restFulConnected = false;
						const restFulPort = deviceId.slice(-4);
						this.restFul = new RestFul({
							port: restFulPort,
							debug: account.restFulDebug || false
						});

						this.restFul.on('connected', (message) => {
							log(deviceTypeText, deviceName, message);
							this.restFulConnected = true;
						})
							.on('debug', (debug) => {
								log(`${deviceTypeText}, ${deviceName}, debug: ${debug}`);
							})
							.on('error', (error) => {
								log.error(deviceTypeText, deviceName, error);
							});
					}

					//MQTT client
					if (mqttEnabled) {
						this.mqttConnected = false;
						const mqttHost = account.mqttHost;
						const mqttPort = account.mqttPort || 1883;
						const mqttClientId = account.mqttClientId || `melcloud_${Math.random().toString(16).slice(3)}`;
						const mqttUser = account.mqttUser;
						const mqttPasswd = account.mqttPass;
						const mqttPrefix = `${account.mqttPrefix}/${deviceTypeText}/${deviceName} ${deviceId}`;
						const mqttDebug = account.mqttDebug || false;

						this.mqtt = new Mqtt({
							host: mqttHost,
							port: mqttPort,
							clientId: mqttClientId,
							user: mqttUser,
							passwd: mqttPasswd,
							prefix: mqttPrefix,
							debug: mqttDebug
						});

						this.mqtt.on('connected', (message) => {
							log(deviceTypeText, deviceName, message);
							this.mqttConnected = true;
						})
							.on('debug', (debug) => {
								log(`${deviceTypeText}, ${deviceName}, debug: ${debug}`);
							})
							.on('error', (error) => {
								log.error(deviceTypeText, deviceName, error);
							});
					}

					//melcloud device
					const melCloudDevice = new MelCloudDevice(api, account, accountName, melCloud, accountInfo, contextKey, deviceType, deviceTypeText, useFahrenheit, deviceInfoFile)
					melCloudDevice.on('publishAccessory', (accessory) => {

						//publish device
						api.publishExternalAccessories(CONSTANS.PluginName, [accessory]);
						const debug = enableDebugMode ? log(`${accountName}, ${deviceTypeText} ${deviceName}, published as external accessory.`) : false;
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
							log.error(deviceTypeText, deviceName, error);
						})
						.on('restFul', (path, data) => {
							const restFul = this.restFulConnected ? this.restFul.update(path, data) : false;
						})
						.on('mqtt', (topic, message) => {
							const mqtt = this.mqttConnected ? this.mqtt.send(topic, message) : false;
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
