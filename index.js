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

				//set refresh interval
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
					const devices = await melCloud.chackDevicesList(contextKey);
					if (devices === false) {
						return;
					}

					//start impulse generator
					await melCloud.impulseGenerator.start([{ name: 'checkDevicesList', sampling: refreshInterval }]);

					//Air Conditioner 0
					try {
						const ataDevices = account.ataDevices ?? [];
						for (const device of ataDevices) {
							//chack device from config exist on melcloud
							const deviceId = device.id;
							const displayMode = device.displayMode > 0 ?? false;
							const deviceExistInMelCloud = devices.some(dev => dev.DeviceID === deviceId);
							if (!deviceExistInMelCloud || !displayMode) {
								continue;
							};

							const deviceName = device.name;
							const deviceTypeText = device.typeString;
							const deviceRefreshInterval = device.refreshInterval * 1000 || 5000;
							const airConditioner = new DeviceAta(api, account, device, melCloud, accountInfo, contextKey, accountName, deviceId, deviceName, deviceTypeText, devicesFile, deviceRefreshInterval, useFahrenheit)
							airConditioner.on('publishAccessory', (accessory) => {

								//publish device
								api.publishExternalAccessories(PluginName, [accessory]);
								const emitLog = disableLogSuccess ? false : log.success(`${accountName}, ${deviceTypeText} ${deviceName}, published as external accessory.`);
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
									const startDone = await airConditioner.start();
									const stopImpulseGenerator = startDone ? await impulseGenerator.stop() : false;

									//start impulse generator 
									const startImpulseGenerator = startDone ? await airConditioner.startImpulseGenerator() : false
								} catch (error) {
									const emitLog = disableLogError ? false : log.error(`${accountName}, ${deviceTypeText}, ${deviceName}, ${error}, trying again.`);
								};
							}).on('state', (state) => {
								const emitLog = !enableDebugMode ? false : state ? log.info(`${accountName}, ${deviceTypeText}, ${deviceName}, Start impulse generator started.`) : log.info(`${accountName}, ${deviceTypeText}, ${deviceName}, Start impulse generator stopped.`);
							});

							//start impulse generator
							await impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
						};
					} catch (error) {
						throw new Error(`${accountName}, ATA did finish launching error: ${error}.`);
					}

					//Heat Pump 1
					try {
						const atwDevices = account.atwDevices ?? [];
						for (const device of atwDevices) {
							//chack device from config exist on melcloud
							const deviceId = device.id;
							const displayMode = device.displayMode > 0 ?? false;
							const deviceExistInMelCloud = devices.some(dev => dev.DeviceID === deviceId);
							if (!deviceExistInMelCloud || !displayMode) {
								continue;
							};

							const deviceName = device.name;
							const deviceTypeText = device.typeString;
							const deviceRefreshInterval = device.refreshInterval * 1000 || 5000;
							const heatPump = new DeviceAtw(api, account, device, melCloud, accountInfo, contextKey, accountName, deviceId, deviceName, deviceTypeText, devicesFile, deviceRefreshInterval, useFahrenheit)
							heatPump.on('publishAccessory', (accessory) => {

								//publish device
								api.publishExternalAccessories(PluginName, [accessory]);
								const emitLog = disableLogSuccess ? false : log.success(`${accountName}, ${deviceTypeText} ${deviceName}, published as external accessory.`);
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
									const startDone = await heatPump.start();
									const stopImpulseGenerator = startDone ? await impulseGenerator.stop() : false;

									//start impulse generator 
									const startImpulseGenerator = startDone ? await heatPump.startImpulseGenerator() : false
								} catch (error) {
									const emitLog = disableLogError ? false : log.error(`${accountName}, ${deviceTypeText}, ${deviceName}, ${error}, trying again.`);
								};
							}).on('state', (state) => {
								const emitLog = !enableDebugMode ? false : state ? log.info(`${accountName}, ${deviceTypeText}, ${deviceName}, Start impulse generator started.`) : log.info(`${accountName}, ${deviceTypeText}, ${deviceName}, Start impulse generator stopped.`);
							});

							//start impulse generator
							await impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
						};
					} catch (error) {
						throw new Error(`${accountName}, ATE did finish launching error: ${error}.`);
					}

					//Energy Recovery Ventilation 3
					try {
						const ervDevices = account.ervDevices ?? [];
						for (const device of ervDevices) {
							//chack device from config exist on melcloud
							const deviceId = device.id;
							const displayMode = device.displayMode > 0 ?? false;
							const deviceExistInMelCloud = devices.some(dev => dev.DeviceID === deviceId);
							if (!deviceExistInMelCloud || !displayMode) {
								continue;
							};

							const deviceName = device.name;
							const deviceTypeText = device.typeString;
							const deviceRefreshInterval = device.refreshInterval * 1000 || 5000;
							const energyRecoveryVentilation = new DeviceErv(api, account, device, melCloud, accountInfo, contextKey, accountName, deviceId, deviceName, deviceTypeText, devicesFile, deviceRefreshInterval, useFahrenheit)
							energyRecoveryVentilation.on('publishAccessory', (accessory) => {

								//publish device
								api.publishExternalAccessories(PluginName, [accessory]);
								const emitLog = disableLogSuccess ? false : log.success(`${accountName}, ${deviceTypeText} ${deviceName}, published as external accessory.`);
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
									const startDone = await energyRecoveryVentilation.start();
									const stopImpulseGenerator = startDone ? await impulseGenerator.stop() : false;

									//start impulse generator 
									const startImpulseGenerator = startDone ? await energyRecoveryVentilation.startImpulseGenerator() : false
								} catch (error) {
									const emitLog = disableLogError ? false : log.error(`${accountName}, ${deviceTypeText}, ${deviceName}, ${error}, trying again.`);
								};
							}).on('state', (state) => {
								const emitLog = !enableDebugMode ? false : state ? log.info(`${accountName}, ${deviceTypeText}, ${deviceName}, Start impulse generator started.`) : log.info(`${accountName}, ${deviceTypeText}, ${deviceName}, Start impulse generator stopped.`);
							});

							//start impulse generator
							await impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
						};
					} catch (error) {
						throw new Error(`${accountName}, ERV did finish launching error: ${error}.`);
					}
				} catch (error) {
					throw new Error(`${accountName}, Account did finish launching error: ${error}.`);
				}
			};
		});
	};

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	};
};

export default (api) => {
	api.registerPlatform(PluginName, PlatformName, MelCloudPlatform, true);
};
