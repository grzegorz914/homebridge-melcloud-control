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
			log.error(`Prepare directory error: ${error.message ?? error}`);
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
					continue;
				}

				//check duplicate account name
				if (accountsName.includes(accountName)) {
					log.warn(`Account name: ${accountName}, must be unique.`);
					continue;
				}
				accountsName.push(accountName);

				//external integrations
				const restFul = account.restFul ?? {};
				const mqtt = account.mqtt ?? {};

				//log config
				const enableDebugMode = account.enableDebugMode || false;
				const logLevel = {
					debug: enableDebugMode,
					info: !account.disableLogInfo,
					success: !account.disableLogSuccess,
					warn: !account.disableLogWarn,
					error: !account.disableLogError,
					devInfo: !account.disableLogDeviceInfo,
				};

				if (logLevel.debug) log.info(`${accountName}, debug: Did finish launching.`);

				//remove sensitive data
				const safeConfig = {
					...account,
					passwd: 'removed',
					mqtt: {
						...account.mqtt,
						passwd: 'removed'
					}
				};
				if (logLevel.debug) log.info(`${accountName}, Config: ${JSON.stringify(safeConfig, null, 2)}`);

				//define directory and file paths
				const accountFile = `${prefDir}/${accountName}_Account`;
				const buildingsFile = `${prefDir}/${accountName}_Buildings`;
				const devicesFile = `${prefDir}/${accountName}_Devices`;

				//set account refresh interval
				const refreshInterval = (account.refreshInterval ?? 120) * 1000;

				try {
					//melcloud account
					const melCloud = new MelCloud(user, passwd, language, accountFile, buildingsFile, devicesFile, enableDebugMode, false)
						.on('success', (msg) => logLevel.success && log.success(`${accountName}, ${msg}`))
						.on('info', (msg) => logLevel.info && log.info(`${accountName}, ${msg}`))
						.on('debug', (msg) => logLevel.debug && log.info(`${accountName}, debug: ${msg}`))
						.on('warn', (msg) => logLevel.warn && log.warn(`${accountName}, ${msg}`))
						.on('error', (msg) => logLevel.error && log.error(`${accountName}, ${msg}`));


					//connect
					let response;
					try {
						response = await melCloud.connect();
					} catch (error) {
						if (logLevel.error) log.error(`${accountName}, Connect error: ${error.message ?? error}`);
						continue;
					}

					const accountInfo = response.accountInfo ?? false;
					const contextKey = response.contextKey ?? false;
					const useFahrenheit = response.useFahrenheit ?? false;

					if (contextKey === false) {
						continue;
					}

					//check devices list
					let devicesInMelcloud;
					try {
						devicesInMelcloud = await melCloud.checkDevicesList(contextKey);
					} catch (error) {
						if (logLevel.error) log.error(`${accountName}, Check devices list error: ${error.message ?? error}`);
						continue;
					}
					if (!devicesInMelcloud || !Array.isArray(devicesInMelcloud)) continue;

					//start account impulse generator
					await melCloud.impulseGenerator.start([{ name: 'checkDevicesList', sampling: refreshInterval }]);

					//configured devices
					const ataDevices = account.ataDevices ?? [];
					const atwDevices = account.atwDevices ?? [];
					const ervDevices = account.ervDevices ?? [];
					const devices = [...ataDevices, ...atwDevices, ...ervDevices];
					if (logLevel.debug) log.info(`Found configured devices ATA: ${ataDevices.length}, ATW: ${atwDevices.length}, ERV: ${ervDevices.length}.`);
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
						const deviceRefreshInterval = (device.refreshInterval ?? 5) * 1000;
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
									if (logLevel.warn) log.warn(`${accountName}, ${deviceTypeText}, ${deviceName}, unknown device: ${deviceType}.`);
									continue;
							}

							configuredDevice.on('melCloud', async (key, value) => {
								try {
									accountInfo[key] = value;
									await melCloud.send(accountInfo);
								} catch (error) {
									if (logLevel.error) log.error(`${accountName}, ${deviceTypeText}, ${deviceName}, ${error}.`);
								}
							})
								.on('devInfo', (info) => logLevel.devInfo && log.info(info))
								.on('success', (msg) => logLevel.success && log.success(`${accountName}, ${deviceTypeText}, ${deviceName}, ${msg}`))
								.on('info', (msg) => logLevel.info && log.info(`${accountName}, ${deviceTypeText}, ${deviceName}, ${msg}`))
								.on('debug', (msg) => logLevel.debug && log.info(`${accountName}, ${deviceTypeText}, ${deviceName}, debug: ${msg}`))
								.on('warn', (msg) => logLevel.warn && log.warn(`${accountName}, ${deviceTypeText}, ${deviceName}, ${msg}`))
								.on('error', (msg) => logLevel.error && log.error(`${accountName}, ${deviceTypeText}, ${deviceName}, ${msg}`));

							//create impulse generator
							const impulseGenerator = new ImpulseGenerator();
							impulseGenerator.on('start', async () => {
								try {
									const accessory = await configuredDevice.start();
									if (accessory) {
										api.publishExternalAccessories(PluginName, [accessory]);
										if (logLevel.success) log.success(`${accountName}, ${deviceTypeText}, ${deviceName}, Published as external accessory.`);

										await impulseGenerator.stop();
										await configuredDevice.startImpulseGenerator();
									}
								} catch (error) {
									if (logLevel.error) log.error(`${accountName}, ${deviceTypeText}, ${deviceName}, ${error.message ?? error}, trying again.`);
								}
							}).on('state', (state) => {
								if (logLevel.debug) log.info(`${accountName}, ${deviceTypeText}, ${deviceName}, Start impulse generator ${state ? 'started' : 'stopped'}.`);
							});

							//start impulse generator
							await impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
						} catch (error) {
							if (logLevel.error) log.error(`${accountName}, ${deviceTypeText}, ${deviceName}, did finish launching error: ${error.message ?? error}.`);
						}
					}
				} catch (error) {
					if (logLevel.error) log.error(`${accountName}, did finish launching error: ${error.message ?? error}.`);
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
