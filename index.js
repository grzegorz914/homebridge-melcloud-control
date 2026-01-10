import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import MelCloud from './src/melcloud.js';
import MelCloudHome from './src/melcloudhome.js';
import DeviceAta from './src/deviceata.js';
import DeviceAtw from './src/deviceatw.js';
import DeviceErv from './src/deviceerv.js';
import ImpulseGenerator from './src/impulsegenerator.js';
import { PluginName, PlatformName, DeviceType } from './src/constants.js';

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
				const { name, user, passwd, language, type } = account;
				if (!name || accountsName.includes(name) || !user || !passwd || !language || !type) {
					log.warn(`Account ${!name ? 'name missing' : (accountsName.includes(name) ? 'name duplicated' : name)} ${!user ? ', user missing' : ''}${!passwd ? ', password missing' : ''}${!language ? ', language missing' : ''}${!type ? ', type disabled' : ''} in config, will not be published in the Home app`);
					continue;
				}
				accountsName.push(name);
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
					log.info(`${name}, debug: did finish launching.`);
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
					log.info(`${name}, Config: ${JSON.stringify(safeConfig, null, 2)}`);
				}

				//define directory and file paths
				const accountFile = `${prefDir}/${name}_Account`;
				const buildingsFile = `${prefDir}/${name}_Buildings`;

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
										timmers = [{ name: 'connect', sampling: 3300000 }, { name: 'checkDevicesList', sampling: 5000 }];
										melcloud = new MelCloudHome(account, accountFile, buildingsFile, true);
										break;
									default:
										if (logLevel.warn) log.warn(`Unknown account type: ${account.type}.`);
										return;
								}
								melcloud.on('success', (msg) => logLevel.success && log.success(`${name}, ${msg}`))
									.on('info', (msg) => log.info(`${name}, ${msg}`))
									.on('debug', (msg) => log.info(`${name}, debug: ${msg}`))
									.on('warn', (msg) => log.warn(`${name}, ${msg}`))
									.on('error', (msg) => log.error(`${name}, ${msg}`));

								//connect
								const accountInfo = await melcloud.connect();
								if (!accountInfo?.State) {
									if (logLevel.warn) log.warn(`${name}, ${accountInfo?.Info}`);
									return;
								}
								if (logLevel.success) log.success(`${name}, ${accountInfo.Info}`);

								//check devices list
								const melcloudDevicesList = await melcloud.checkDevicesList();
								if (!melcloudDevicesList.State) {
									if (logLevel.warn) log.warn(`${name}, ${melcloudDevicesList.Info}`);
									return;
								}
								if (logLevel.debug) log.info(melcloudDevicesList.Info);
								await new Promise(r => setTimeout(r, 1000));

								//start account impulse generator
								await melcloud.impulseGenerator.state(true, timmers, false);

								//filter configured devices
								const devicesIds = (melcloudDevicesList.Devices ?? []).map(d => String(d.DeviceID));
								const ataDevices = (account.ataDevices || []).filter(d => (d.displayType ?? 0) > 0 && devicesIds.includes(d.id));
								const atwDevices = (account.atwDevices || []).filter(d => (d.displayType ?? 0) > 0 && devicesIds.includes(d.id));
								const ervDevices = (account.ervDevices || []).filter(d => (d.displayType ?? 0) > 0 && devicesIds.includes(d.id));
								const devices = [...ataDevices, ...atwDevices, ...ervDevices];
								if (logLevel.debug) log.info(`${name}, found configured devices ATA: ${ataDevices.length}, ATW: ${atwDevices.length}, ERV: ${ervDevices.length}.`);

								//loop through devices
								for (const [index, device] of devices.entries()) {
									device.id = String(device.id);
									const deviceName = device.name;
									const deviceType = device.type;
									const deviceTypeString = DeviceType[device.type];
									const defaultTempsFile = `${prefDir}/${name}_${device.id}_Temps`;

									//device in melcloud
									const deviceInMelCloud = melcloudDevicesList.Devices.find(d => d.DeviceID === device.id);

									//presets
									const presetIds = (deviceInMelCloud.Presets ?? []).map(p => String(p.ID));
									const presets = account.type === 'melcloud' ? (device.presets || []).filter(p => (p.displayType ?? 0) > 0 && presetIds.includes(p.id)) : [];

									//schedules
									const schedulesIds = (deviceInMelCloud.Schedule ?? []).map(s => String(s.Id));
									const schedules = account.type === 'melcloudhome' ? (device.schedules || []).filter(s => (s.displayType ?? 0) > 0 && schedulesIds.includes(s.id)) : [];

									//scenes
									const scenesIds = (melcloudDevicesList.Scenes ?? []).map(s => String(s.Id));
									const scenes = account.type === 'melcloudhome' ? (device.scenes || []).filter(s => (s.displayType ?? 0) > 0 && scenesIds.includes(s.id)) : [];

									//buttons
									const buttons = (device.buttonsSensors || []).filter(b => (b.displayType ?? 0) > 0);

									// set rest ful port
									account.restFul.port = (device.id).slice(-4).replace(/^0/, '9');

									if (type === 'melcloudhome') {
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
											if (logLevel.error) log.error(`${name}, ${deviceTypeString}, ${deviceName}, File init error: ${error.message}`);
											continue;
										}
									}

									let configuredDevice;
									switch (deviceType) {
										case 0: //ATA
											configuredDevice = new DeviceAta(api, account, device, presets, schedules, scenes, buttons, defaultTempsFile, accountInfo, accountFile, melcloud, melcloudDevicesList);
											break;
										case 1: //ATW
											configuredDevice = new DeviceAtw(api, account, device, presets, schedules, scenes, buttons, defaultTempsFile, accountInfo, accountFile, melcloud, melcloudDevicesList);
											break;
										case 2:
											break;
										case 3: //ERV
											configuredDevice = new DeviceErv(api, account, device, presets, schedules, scenes, buttons, defaultTempsFile, accountInfo, accountFile, melcloud, melcloudDevicesList);
											break;
										default:
											if (logLevel.warn) log.warn(`${name}, ${deviceTypeString}, ${deviceName}, unknown device: ${deviceType}.`);
											return;
									}

									configuredDevice.on('devInfo', (info) => logLevel.devInfo && log.info(info))
										.on('success', (msg) => logLevel.success && log.success(`${name}, ${deviceTypeString}, ${deviceName}, ${msg}`))
										.on('info', (msg) => log.info(`${name}, ${deviceTypeString}, ${deviceName}, ${msg}`))
										.on('debug', (msg) => log.info(`${name}, ${deviceTypeString}, ${deviceName}, debug: ${msg}`))
										.on('warn', (msg) => log.warn(`${name}, ${deviceTypeString}, ${deviceName}, ${msg}`))
										.on('error', (msg) => log.error(`${name}, ${deviceTypeString}, ${deviceName}, ${msg}`));

									const accessory = await configuredDevice.start();
									if (accessory) {
										api.publishExternalAccessories(PluginName, [accessory]);
										if (logLevel.success) log.success(`${name}, ${deviceTypeString}, ${deviceName}, Published as external accessory.`);
									}
								}

								//stop start impulse generator
								await impulseGenerator.state(false);
							} catch (error) {
								if (logLevel.error) log.error(`${name}, Start impulse generator error, ${error.message ?? error}, trying again.`);
							}
						}).on('state', (state) => {
							if (logLevel.debug) log.info(`${name}, Start impulse generator ${state ? 'started' : 'stopped'}.`);
						});

					//start impulse generator
					await impulseGenerator.state(true, [{ name: 'start', sampling: 120000 }]);
				} catch (error) {
					if (logLevel.error) log.error(`${name}, Did finish launching error: ${error.message ?? error}.`);
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
