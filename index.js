import { join } from 'path';
import { mkdirSync } from 'fs';
import MelCloud from './src/melcloud.js';
import DeviceAta from './src/deviceata.js';
import DeviceAtw from './src/deviceatw.js';
import DeviceErv from './src/deviceerv.js';
import ImpulseGenerator from './src/impulsegenerator.js';
import { PluginName, PlatformName } from './src/constants.js';

class MelCloudPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.accounts)) {
			log.warn(`No configuration found for ${PluginName}`);
			return;
		}
		this.accessories = [];
		const accountsName = [];

		//create directory if it doesn't exist
		const prefDir = join(api.user.storagePath(), 'melcloud');
		try {
			//create directory if it doesn't exist
			mkdirSync(prefDir, { recursive: true });
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

				//external integrations
				const restFul = account.restFul ?? {};
				const mqtt = account.mqtt ?? {};

				//log config
				const enableDebugMode = account.enableDebugMode || false;
				const disableLogDeviceInfo = account.disableLogDeviceInfo || false;
				const disableLogInfo = account.disableLogInfo || false;
				const disableLogSuccess = account.disableLogSuccess || false;
				const disableLogWarn = account.disableLogWarn || false;
				const disableLogError = account.disableLogError || false;
				const debug = enableDebugMode ? log.info(`${accountName}, debug: Did finish launching.`) : false;

				//remove sensitive data
				const debugData = {
					...account,
					passwd: 'removed',
					mqtt: {
						...account.mqtt,
						passwd: 'removed'
					}
				};
				const debug1 = !enableDebugMode ? false : log.info(`${accountName}, Config: ${JSON.stringify(debugData, null, 2)}`);

				//define directory and file paths
				const accountFile = `${prefDir}/${accountName}_Account`;
				const buildingsFile = `${prefDir}/${accountName}_Buildings`;
				const devicesFile = `${prefDir}/${accountName}_Devices`;

				//set account refresh interval
				const refreshInterval = account.refreshInterval * 1000 || 120000;

				try {
					//melcloud account
					const melCloud = new MelCloud(user, passwd, language, accountFile, buildingsFile, devicesFile, enableDebugMode, false);
					melCloud.on('success', (success) => {
						const emitLog = disableLogSuccess ? false : log.success(`${accountName}, ${success}.`);
					})
						.on('info', (info) => {
							const emitLog = disableLogInfo ? false : log.info(`${accountName}, ${info}.`);
						})
						.on('debug', (debug) => {
							const emitLog = !enableDebugMode ? false : log.info(`${accountName}, debug: ${debug}.`);
						})
						.on('warn', (warn) => {
							const emitLog = disableLogWarn ? false : log.warn(`${accountName}, ${warn}.`);
						})
						.on('error', (error) => {
							const emitLog = disableLogError ? false : log.error(`${accountName}, ${error}.`);
						});

					//connect
					const response = await melCloud.connect();
					const accountInfo = response.accountInfo ?? false;
					const contextKey = response.contextKey ?? false;
					const useFahrenheit = response.useFahrenheit ?? false;

					if (contextKey === false) {
						return;
					}

					//check devices list
					const devicesInMelcloud = await melCloud.chackDevicesList(contextKey);
					if (devicesInMelcloud === false) {
						return;
					}

					//start account impulse generator
					await melCloud.impulseGenerator.start([{ name: 'checkDevicesList', sampling: refreshInterval }]);

					//configured devices
					const ataDevices = account.ataDevices ?? [];
					const atwDevices = account.atwDevices ?? [];
					const ervDevices = account.ervDevices ?? [];
					const devices = [...ataDevices, ...atwDevices, ...ervDevices];
					const emitLog = !enableDebugMode ? false : log.info(`Found configured devices ATA: ${ataDevices.length}, ATW: ${atwDevices.length}, ERV: ${ervDevices.length}.`);
					for (const device of devices) {
						//chack device from config exist on melcloud
						const deviceId = device.id;
						const displayMode = device.displayMode > 0;
						const deviceExistInMelCloud = devicesInMelcloud.some(dev => dev.DeviceID === deviceId);
						if (!deviceExistInMelCloud || !displayMode) {
							continue;
						}

						const deviceName = device.name;
						const deviceType = device.type;
						const deviceTypeText = device.typeString;
						const deviceRefreshInterval = device.refreshInterval * 1000 || 5000;
						try {
							let configuredDevice;
							switch (deviceType) {
								case 0: //ATA
									configuredDevice = new DeviceAta(api, account, device, contextKey, accountName, deviceId, deviceName, deviceTypeText, devicesFile, deviceRefreshInterval, useFahrenheit, restFul, mqtt);
									break;
								case 1: //ATW
									configuredDevice = new DeviceAtw(api, account, device, contextKey, accountName, deviceId, deviceName, deviceTypeText, devicesFile, deviceRefreshInterval, useFahrenheit, restFul, mqtt);
									break;
								case 2:
									break;
								case 3: //ERV
									configuredDevice = new DeviceErv(api, account, device, contextKey, accountName, deviceId, deviceName, deviceTypeText, devicesFile, deviceRefreshInterval, useFahrenheit, restFul, mqtt);
									break;
								default:
									const emitLog = disableLogWarn ? false : log.warn(`${accountName}, ${deviceTypeText}, ${deviceName}, unknown device: ${deviceType}.`);
									return;
							}

							configuredDevice.on('publishAccessory', (accessory) => {
								api.publishExternalAccessories(PluginName, [accessory]);
								const emitLog = disableLogSuccess ? false : log.success(`${accountName}, ${deviceTypeText}, ${deviceName}, published as external accessory.`);
							})
								.on('melCloud', async (key, value) => {
									try {
										accountInfo[key] = value;
										await melCloud.send(accountInfo);
									} catch (error) {
										const emitLog = disableLogError ? false : log.error(`${accountName}, ${deviceTypeText}, ${deviceName}, ${error}.`);
									}
								})
								.on('devInfo', (devInfo) => {
									const emitLog = disableLogDeviceInfo ? false : log.info(devInfo);
								})
								.on('success', (success) => {
									const emitLog = disableLogSuccess ? false : log.success(`${accountName}, ${deviceTypeText}, ${deviceName}, ${success}.`);
								})
								.on('info', (info) => {
									const emitLog = disableLogInfo ? false : log.info(`${accountName}, ${deviceTypeText}, ${deviceName}, ${info}.`);
								})
								.on('debug', (debug) => {
									const emitLog = !enableDebugMode ? false : log.info(`${accountName}, ${deviceTypeText}, ${deviceName}, debug: ${debug}.`);
								})
								.on('warn', (warn) => {
									const emitLog = disableLogWarn ? false : log.warn(`${accountName}, ${deviceTypeText}, ${deviceName}, ${warn}.`);
								})
								.on('error', (error) => {
									const emitLog = disableLogError ? false : log.error(`${accountName}, ${deviceTypeText}, ${deviceName}, ${error}.`);
								});

							//create impulse generator
							const impulseGenerator = new ImpulseGenerator();
							impulseGenerator.on('start', async () => {
								try {
									const startDone = await configuredDevice.start();
									const stopImpulseGenerator = startDone ? await impulseGenerator.stop() : false;

									//start impulse generator 
									const startImpulseGenerator = stopImpulseGenerator ? await configuredDevice.startImpulseGenerator() : false
								} catch (error) {
									const emitLog = disableLogError ? false : log.error(`${accountName}, ${deviceTypeText}, ${deviceName}, ${error}, trying again.`);
								}
							}).on('state', (state) => {
								const emitLog = !enableDebugMode ? false : state ? log.info(`${accountName}, ${deviceTypeText}, ${deviceName}, Start impulse generator started.`) : log.info(`${accountName}, ${deviceTypeText}, ${deviceName}, Start impulse generator stopped.`);
							});

							//start impulse generator
							await impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
						} catch (error) {
							const emitLog = disableLogError ? false : log.error(`${accountName}, ${deviceTypeText}, ${deviceName}, did finish launching error: ${error}.`);
						}
					}
				} catch (error) {
					const emitLog = disableLogError ? false : log.error(`${accountName}, did finish launching error: ${error}.`);
				}
			}
		});
	}

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}
}

export default (api) => {
	api.registerPlatform(PluginName, PlatformName, MelCloudPlatform);
}
