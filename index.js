import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import MelCloud from './src/melcloud.js';
import MelCloudHome from './src/melcloudhome.js';
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
				const accountType = account.type || 'disabled';
				if (accountType === 'disabled') continue;

				const accountName = account.name;
				const user = account.user;
				const passwd = account.passwd;
				const language = account.language;

				//check mandatory properties
				if (!accountName || accountsName.includes(accountName) || !user || !passwd || !language) {
					log.warn(`Account name: ${accountName ? accountsName.includes(accountName) ? 'Duplicated' : 'OK' : accountName}, user: ${user ? 'OK' : user}, password: ${passwd ? 'OK' : passwd}, language: ${language ? 'OK' : language} in config missing.`);
					continue;
				}
				accountsName.push(accountName);
				const accountRefreshInterval = (account.refreshInterval ?? 120) * 1000

				//log config
				const logLevel = {
					devInfo: account.log?.deviceInfo,
					success: account.log?.success,
					info: account.log?.info,
					warn: account.log?.warn,
					error: account.log?.error,
					debug: account.log?.debug
				};

				if (logLevel.debug) {
					log.info(`${accountName}, debug: did finish launching.`);
					const safeConfig = {
						...account,
						passwd: 'removed',
						mqtt: {
							auth: {
								...account.mqtt?.auth,
								passwd: 'removed',
							}
						},
					};
					log.info(`${accountName}, Config: ${JSON.stringify(safeConfig, null, 2)}`);
				}

				//define directory and file paths
				const accountFile = `${prefDir}/${accountName}_Account`;
				const buildingsFile = `${prefDir}/${accountName}_Buildings`;

				try {
					//create impulse generator
					const impulseGenerator = new ImpulseGenerator()
						.on('start', async () => {
							try {
								//melcloud account
								let melcloud;
								let timmers = []
								switch (account.type) {
									case 'melcloud':
										timmers = [{ name: 'checkDevicesList', sampling: accountRefreshInterval }];
										melcloud = new MelCloud(account, accountFile, buildingsFile, true);
										break;
									case 'melcloudhome':
										timmers = [{ name: 'connect', sampling: 3300000 }, { name: 'checkDevicesList', sampling: 3000 }];
										melcloud = new MelCloudHome(account, accountFile, buildingsFile, true);
										break;
									default:
										if (logLevel.warn) log.warn(`Unknown account type: ${account.type}.`);
										return;
								}
								melcloud.on('success', (msg) => log.success(`${accountName}, ${msg}`))
									.on('info', (msg) => log.info(`${accountName}, ${msg}`))
									.on('debug', (msg) => log.info(`${accountName}, debug: ${msg}`))
									.on('warn', (msg) => log.warn(`${accountName}, ${msg}`))
									.on('error', (msg) => log.error(`${accountName}, ${msg}`));

								//connect
								const accountInfo = await melcloud.connect();
								if (!accountInfo.State) {
									if (logLevel.warn) log.warn(`${accountName}, ${accountInfo.Info}`);
									return;
								}
								if (logLevel.success) log.success(`${accountName}, ${accountInfo.Info}`);

								//check devices list
								const melcloudDevicesList = await melcloud.checkDevicesList();
								if (!melcloudDevicesList.State) {
									if (logLevel.warn) log.warn(`${accountName}, ${melcloudDevicesList.Info}`);
									return;
								}
								if (logLevel.debug) log.info(melcloudDevicesList.Info);
								await new Promise(r => setTimeout(r, 1000));

								//start account impulse generator
								await melcloud.impulseGenerator.state(true, timmers, false);

								//configured devices
								const ataDevices = (account.ataDevices || []).filter(device => device.id != null && String(device.id) !== '0');
								const atwDevices = (account.atwDevices || []).filter(device => device.id != null && String(device.id) !== '0');
								const ervDevices = (account.ervDevices || []).filter(device => device.id != null && String(device.id) !== '0');
								const devices = [...ataDevices, ...atwDevices, ...ervDevices];
								if (logLevel.debug) log.info(`${accountName}, found configured devices ATA: ${ataDevices.length}, ATW: ${atwDevices.length}, ERV: ${ervDevices.length}.`);

								for (const [index, device] of devices.entries()) {
									device.id = String(device.id);
									const deviceName = device.name;
									const deviceType = device.type;
									const deviceTypeString = device.typeString;
									const defaultTempsFile = `${prefDir}/${accountName}_${device.id}_Temps`;

									//chack device is not disabled in config
									const displayType = device.displayType > 0;
									if (!displayType) {
										if (logLevel.warn) log.warn(`${accountName}, ${deviceTypeString}, ${deviceName}, disabled in configuration, will not be published in the Home app.`);
										continue;
									}

									//chack device from config exist on melcloud
									const deviceExistInMelCloud = melcloudDevicesList.Devices.some(dev => dev.DeviceID === device.id);
									if (!deviceExistInMelCloud) {
										if (logLevel.warn) log.warn(`${accountName}, ${deviceTypeString}, ${deviceName}, not exist on server, please login to MELCLoud from plugin UI to fix this issue.`);
										continue;
									}

									// set rest ful port
									account.restFul.port = (device.id).slice(-4).replace(/^0/, '9');

									if (accountType === 'melcloudhome') {
										account.restFul.port = `${3000}${index}`;

										try {
											const temps = {
												defaultCoolingSetTemperature: 24,
												defaultHeatingSetTemperature: 20
											};

											if (!existsSync(defaultTempsFile)) {
												writeFileSync(defaultTempsFile, JSON.stringify(temps, null, 2));
												if (logLevel.debug) log.debug(`Default temperature file created: ${defaultTempsFile}`);
											}
										} catch (error) {
											if (logLevel.error) log.error(`${accountName}, ${deviceTypeString}, ${deviceName}, File init error: ${error.message}`);
											continue;
										}
									}

									let configuredDevice;
									switch (deviceType) {
										case 0: //ATA
											configuredDevice = new DeviceAta(api, account, device, defaultTempsFile, accountInfo, accountFile, melcloud, melcloudDevicesList);
											break;
										case 1: //ATW
											configuredDevice = new DeviceAtw(api, account, device, defaultTempsFile, accountInfo, accountFile, melcloud, melcloudDevicesList);
											break;
										case 2:
											break;
										case 3: //ERV
											configuredDevice = new DeviceErv(api, account, device, defaultTempsFile, accountInfo, accountFile, melcloud, melcloudDevicesList);
											break;
										default:
											if (logLevel.warn) log.warn(`${accountName}, ${deviceTypeString}, ${deviceName}, unknown device: ${deviceType}.`);
											return;
									}

									configuredDevice.on('devInfo', (info) => logLevel.devInfo && log.info(info))
										.on('success', (msg) => log.success(`${accountName}, ${deviceTypeString}, ${deviceName}, ${msg}`))
										.on('info', (msg) => log.info(`${accountName}, ${deviceTypeString}, ${deviceName}, ${msg}`))
										.on('debug', (msg) => log.info(`${accountName}, ${deviceTypeString}, ${deviceName}, debug: ${msg}`))
										.on('warn', (msg) => log.warn(`${accountName}, ${deviceTypeString}, ${deviceName}, ${msg}`))
										.on('error', (msg) => log.error(`${accountName}, ${deviceTypeString}, ${deviceName}, ${msg}`));

									const accessory = await configuredDevice.start();
									if (accessory) {
										api.publishExternalAccessories(PluginName, [accessory]);
										if (logLevel.success) log.success(`${accountName}, ${deviceTypeString}, ${deviceName}, Published as external accessory.`);
									}
								}

								//stop start impulse generator
								await impulseGenerator.state(false);
							} catch (error) {
								if (logLevel.error) log.error(`${accountName}, Start impulse generator error, ${error.message ?? error}, trying again.`);
							}
						}).on('state', (state) => {
							if (logLevel.debug) log.info(`${accountName}, Start impulse generator ${state ? 'started' : 'stopped'}.`);
						});

					//start impulse generator
					await impulseGenerator.state(true, [{ name: 'start', sampling: 120000 }]);
				} catch (error) {
					if (logLevel.error) log.error(`${accountName}, Did finish launching error: ${error.message ?? error}.`);
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
