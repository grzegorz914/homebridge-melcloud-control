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
		if (!config || !Array.isArray(config.accounts)) {
			log.warn(`No configuration found for ${PluginName}`);
			return;
		}

		this.accessories = [];

		const prefDir = join(api.user.storagePath(), 'melcloud');
		try {
			mkdirSync(prefDir, { recursive: true });
		} catch (error) {
			log.error(`Prepare directory error: ${error.message ?? error}`);
			return;
		}

		api.on('didFinishLaunching', () => {
			const accountsName = [];

			// Each account is set up independently — a failure in one does not
			// block the others. Promise.allSettled runs all in parallel.
			Promise.allSettled(
				config.accounts.map(account =>
					this.setupAccount(account, accountsName, prefDir, log, api)
				)
			).then(results => {
				results.forEach((result, i) => {
					if (result.status === 'rejected') {
						log.error(`Account[${i}] setup error: ${result.reason?.message ?? result.reason}`);
					}
				});
			});
		});
	}

	// ── Per-account setup ─────────────────────────────────────────────────────

	async setupAccount(account, accountsName, prefDir, log, api) {
		const { name, user, passwd, language, type } = account;

		if (type === 'disabled') return;

		if (!name || accountsName.includes(name) || !user || !passwd || !language) {
			const reason = !name ? 'name missing'
				: accountsName.includes(name) ? 'name duplicated'
					: !user ? 'user missing'
						: !passwd ? 'password missing'
							: 'language missing';
			log.warn(`Account ${name ?? '(unnamed)'}: ${reason} — will not be published in the Home app`);
			return;
		}
		accountsName.push(name);

		const accountRefreshInterval = (account.refreshInterval ?? 120) * 1000;
		const accountMelcloud = type === 'melcloud';

		const logLevel = {
			devInfo: account.log?.deviceInfo,
			success: account.log?.success,
			info: account.log?.info,
			warn: account.log?.warn,
			error: account.log?.error,
			debug: account.log?.debug,
		};

		if (logLevel.debug) {
			log.info(`${name}, debug: did finish launching`);
			// Scrub all known sensitive fields before logging
			const safeConfig = {
				...account,
				user: 'removed',
				passwd: 'removed',
				mqtt: account.mqtt ? {
					...account.mqtt,
					auth: account.mqtt.auth ? {
						...account.mqtt.auth,
						user: 'removed',
						passwd: 'removed',
					} : undefined,
				} : undefined,
			};
			log.info(`${name}, config: ${JSON.stringify(safeConfig, null, 2)}`);
		}

		// The startup impulse generator retries the full connect+discover cycle
		// every 120 s until it succeeds, then hands off to the melcloud class
		// impulse generator and stops itself.
		const impulseGenerator = new ImpulseGenerator()
			.on('start', async () => {
				try {
					await this.startAccount(
						account, name, type, accountMelcloud,
						accountRefreshInterval, prefDir, logLevel,
						log, api, impulseGenerator
					);
				} catch (error) {
					if (logLevel.error) log.error(`${name}, Start impulse generator error, ${error.message ?? error}, trying again.`);
				}
			})
			.on('state', (state) => {
				if (logLevel.debug) log.info(`${name}, Start impulse generator ${state ? 'started' : 'stopped'}.`);
			});

		await impulseGenerator.state(true, [{ name: 'start', sampling: 120_000 }]);
	}

	// ── Connect, discover and register accessories for one account ────────────

	async startAccount(account, name, type, accountMelcloud, accountRefreshInterval, prefDir, logLevel, log, api, impulseGenerator) {
		let timers;
		let melCloudClass;

		switch (type) {
			case 'melcloud':
				timers = [{ name: 'checkDevicesList', sampling: accountRefreshInterval }];
				melCloudClass = new MelCloud(account, true);
				break;
			case 'melcloudhome':
				timers = [{ name: 'checkDevicesList', sampling: 10_000 }]; // fixed 100s interval for MELCloud Home, as it has its own internal timer
				melCloudClass = new MelCloudHome(account, true);
				break;
			default:
				if (logLevel.warn) log.warn(`Unknown account type: ${type}.`);
				return;
		}

		melCloudClass
			.on('success', (msg) => log.success(`${name}, ${msg}`))
			.on('info', (msg) => log.info(`${name}, ${msg}`))
			.on('debug', (msg) => log.info(`${name}, debug: ${msg}`))
			.on('warn', (msg) => log.warn(`${name}, ${msg}`))
			.on('error', (msg) => log.error(`${name}, ${msg}`));

		// Connect
		const melCloudAccountData = await melCloudClass.connect();
		if (!melCloudAccountData?.State) {
			if (logLevel.warn) log.warn(`${name}, ${melCloudAccountData?.Status ?? 'connect failed'}`);
			return;
		}
		if (logLevel.success) log.success(`${name}, ${melCloudAccountData.Status}`);

		// Discover devices
		const melCloudDevicesData = await melCloudClass.checkDevicesList();
		if (!melCloudDevicesData.State) {
			if (logLevel.warn) log.warn(`${name}, ${melCloudDevicesData.Status}`);
			return;
		}
		if (logLevel.debug) log.info(`${name}, ${melCloudDevicesData.Status}`);

		// Filter configured devices — both sides coerced to string to avoid type mismatch
		const devicesIds = (melCloudDevicesData.Devices ?? []).map(d => String(d.DeviceID));
		const ataDevices = (account.ataDevices || []).filter(d => (d.displayType ?? 0) > 0 && devicesIds.includes(String(d.id)));
		const atwDevices = (account.atwDevices || []).filter(d => (d.displayType ?? 0) > 0 && devicesIds.includes(String(d.id)));
		const ervDevices = (account.ervDevices || []).filter(d => (d.displayType ?? 0) > 0 && devicesIds.includes(String(d.id)));
		const devices = [...ataDevices, ...atwDevices, ...ervDevices];

		if (logLevel.debug) log.info(`${name}, found configured devices ATA: ${ataDevices.length}, ATW: ${atwDevices.length}, ERV: ${ervDevices.length}.`);

		// Register each device as a Homebridge accessory
		for (const [index, device] of devices.entries()) {
			await this.registerDevice({
				account, device, index, name, type, accountMelcloud,
				prefDir, logLevel, log, api,
				melCloudClass, melCloudAccountData, melCloudDevicesData,
			});
		}

		// Stop startup generator and hand off to the melcloud class generator
		await impulseGenerator.state(false);
		await melCloudClass.impulseGenerator.state(true, timers, false);
	}

	// ── Register a single device as a Homebridge accessory ───────────────────

	async registerDevice({ account, device, index, name, type, accountMelcloud, prefDir, logLevel, log, api, melCloudClass, melCloudAccountData, melCloudDevicesData }) {
		device.id = String(device.id);

		const deviceName = device.name;
		const deviceType = device.type;
		const deviceTypeString = DeviceType[deviceType] ?? `type${deviceType}`;
		const defaultTempsFile = `${prefDir}/${name}_${device.id}_Temps`;

		// Find the matching API device — both sides coerced to string
		const melCloudDeviceData = melCloudDevicesData.Devices.find(d => String(d.DeviceID) === device.id);
		if (!melCloudDeviceData) {
			log.warn(`${name}, device ${device.id} not found in API response, skipping`);
			return;
		}

		melCloudDeviceData.Scenes = melCloudDevicesData.Scenes ?? [];

		// Presets, schedules, scenes — filtered to IDs present in the API response
		const presetIds = (melCloudDeviceData.Presets ?? []).map(p => String(p.ID));
		const schedulesIds = (melCloudDeviceData.Schedule ?? []).map(s => String(s.Id));
		const scenesIds = (melCloudDevicesData.Scenes ?? []).map(s => String(s.Id));

		const presets = accountMelcloud ? (device.presets || []).filter(p => (p.displayType ?? 0) > 0 && presetIds.includes(String(p.id))) : [];
		const schedules = !accountMelcloud ? (device.schedules || []).filter(s => (s.displayType ?? 0) > 0 && schedulesIds.includes(String(s.id))) : [];
		const scenes = !accountMelcloud ? (device.scenes || []).filter(s => (s.displayType ?? 0) > 0 && scenesIds.includes(String(s.id))) : [];
		const buttons = (device.buttonsSensors || []).filter(b => (b.displayType ?? 0) > 0);

		// Store port on device — never mutate the shared account object
		account.restFul.port = type === 'melcloudhome'
			? `${3000}${index}`
			: (device.id).slice(-4).replace(/^0/, '9');

		if (type === 'melcloudhome') {
			try {
				const temps = {
					defaultCoolingSetTemperature: 24,
					defaultHeatingSetTemperature: 20,
				};
				if (!existsSync(defaultTempsFile)) {
					writeFileSync(defaultTempsFile, JSON.stringify(temps, null, 2));
					if (logLevel.debug) log.info(`${name}, default temperature file created: ${defaultTempsFile}`);
				}
			} catch (error) {
				if (logLevel.error) log.error(`${name}, ${deviceTypeString}, ${deviceName}, File init error: ${error.message}`);
				return;
			}
		}

		// Construct the device class — original arg order preserved
		let deviceClass;
		switch (deviceType) {
			case 0: deviceClass = new DeviceAta(api, account, device, presets, schedules, scenes, buttons, defaultTempsFile, melCloudClass, melCloudAccountData, melCloudDeviceData); break; // ATA
			case 1: deviceClass = new DeviceAtw(api, account, device, presets, schedules, scenes, buttons, defaultTempsFile, melCloudClass, melCloudAccountData, melCloudDeviceData); break; // ATW
			case 2: return;                                                                                                                                                                   // reserved
			case 3: deviceClass = new DeviceErv(api, account, device, presets, schedules, scenes, buttons, defaultTempsFile, melCloudClass, melCloudAccountData, melCloudDeviceData); break; // ERV
			default:
				if (logLevel.warn) log.warn(`${name}, ${deviceTypeString}, ${deviceName}, received unknown device type: ${deviceType}.`);
				return;
		}

		deviceClass
			.on('devInfo', (info) => log.info(info))
			.on('success', (msg) => log.success(`${name}, ${deviceTypeString}, ${deviceName}, ${msg}`))
			.on('info', (msg) => log.info(`${name}, ${deviceTypeString}, ${deviceName}, ${msg}`))
			.on('debug', (msg) => log.info(`${name}, ${deviceTypeString}, ${deviceName}, debug: ${msg}`))
			.on('warn', (msg) => log.warn(`${name}, ${deviceTypeString}, ${deviceName}, ${msg}`))
			.on('error', (msg) => log.error(`${name}, ${deviceTypeString}, ${deviceName}, ${msg}`));

		const accessory = await deviceClass.start();
		if (accessory) {
			api.publishExternalAccessories(PluginName, [accessory]);
			if (logLevel.success) log.success(`${name}, ${deviceTypeString}, ${deviceName}, Published as external accessory.`);
		}
	}

	// ── Homebridge accessory cache ────────────────────────────────────────────

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}
}

export default (api) => {
	api.registerPlatform(PluginName, PlatformName, MelCloudPlatform);
};