import axios from 'axios';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import Functions from './functions.js';
import { ApiUrls } from './constants.js';

class MelCloud extends EventEmitter {
    constructor(account, accountFile, buildingsFile, pluginStart = false) {
        super();
        this.accountType = account.type;
        this.user = account.user;
        this.passwd = account.passwd;
        this.language = account.language;
        this.logWarn = account.log?.warn;
        this.logError = account.log?.error;
        this.logDebug = account.log?.debug;

        this.accountFile = accountFile;
        this.buildingsFile = buildingsFile;

        this.client = null;
        this.functions = new Functions(this.logWarn, this.logError, this.logDebug)
            .on('warn', warn => this.emit('warn', warn))
            .on('error', error => this.emit('error', error))
            .on('debug', debug => this.emit('debug', debug));

        if (pluginStart) {
            //lock flags
            this.locks = {
                checkDevicesList: false
            };
            this.impulseGenerator = new ImpulseGenerator()
                .on('checkDevicesList', () => this.handleWithLock('checkDevicesList', async () => {
                    await this.checkDevicesList();
                }))
                .on('state', (state) => {
                    this.emit(state ? 'success' : 'warn', `Impulse generator ${state ? 'started' : 'stopped'}`);
                });
        }
    }

    async handleWithLock(lockKey, fn) {
        if (this.locks[lockKey]) return;

        this.locks[lockKey] = true;
        try {
            await fn();
        } catch (error) {
            this.emit('error', `Inpulse generator error: ${error}`);
        } finally {
            this.locks[lockKey] = false;
        }
    }

    async checkDevicesList() {
        try {
            const devicesList = { State: false, Info: null, Buildings: [], Devices: [], Scenes: [] }
            if (this.logDebug) this.emit('debug', `Scanning for devices...`);
            const listDevicesData = await this.client(ApiUrls.Get.ListDevices, { method: 'GET', });

            if (!listDevicesData || !listDevicesData.data) {
                devicesList.Info = 'Invalid or empty response from MELCloud API'
                return devicesList;
            }

            const buildingsList = listDevicesData.data;
            if (this.logDebug) this.emit('debug', `Buildings: ${JSON.stringify(buildingsList, null, 2)}`);

            if (!Array.isArray(buildingsList) || buildingsList.length === 0) {
                devicesList.Info = 'No building found'
                return devicesList;
            }

            const devices = [];
            for (const building of buildingsList) {
                if (!building.Structure) {
                    this.emit('warn', `Building missing structure: ${building.BuildingName || 'Unnamed'}`);
                    continue;
                }

                const { Structure } = building;

                const allDevices = [
                    ...(Structure.Floors?.flatMap(floor => [
                        ...(floor.Areas?.flatMap(area => area.Devices || []) || []),
                        ...(floor.Devices || [])
                    ]) || []),
                    ...(Structure.Areas?.flatMap(area => area.Devices || []) || []),
                    ...(Structure.Devices || [])
                ].filter(d => d != null);

                // Zamiana ID na string
                allDevices.forEach(device => {
                    device.DeviceID = String(device.DeviceID);
                });

                devices.push(...allDevices);
            }

            const devicesCount = devices.length;
            if (devicesCount === 0) {
                devicesList.Info = 'No devices found'
                return devicesList;
            }

            devicesList.State = true;
            devicesList.Info = `Found ${devicesCount} devices`;
            devicesList.Buildings = buildingsList;
            devicesList.Devices = devices;

            await this.functions.saveData(this.buildingsFile, devicesList);
            if (this.logDebug) this.emit('debug', `Buildings list saved`);

            this.emit('devicesList', devicesList);

            return devicesList;
        } catch (error) {
            throw new Error(`Check devices list error: ${error.message}`);
        }
    }

    async connect() {
        if (this.logDebug) this.emit('debug', `Connecting to MELCloud`);

        try {
            const accountInfo = { State: false, Info: '', Account: null, UseFahrenheit: false }

            const payload = {
                Email: this.user,
                Password: this.passwd,
                Language: this.language,
                AppVersion: '1.34.12',
                CaptchaChallenge: '',
                CaptchaResponse: '',
                Persist: true
            };
            const accountData = await axios(ApiUrls.Post.ClientLogin, {
                method: 'POST',
                baseURL: ApiUrls.Base,
                timeout: 15000,
                data: payload
            });
            const account = accountData.data;
            const loginData = account.LoginData ?? {};
            const contextKey = loginData.ContextKey;

            const safeConfig = {
                ...loginData,
                ContextKey: 'removed',
                ClientId: 'removed',
                Client: 'removed',
                Name: 'removed',
                MapLongitude: 'removed',
                MapLatitude: 'removed'
            };
            if (this.logDebug) this.emit('debug', `MELCloud Info: ${JSON.stringify(safeConfig, null, 2)}`);

            if (!contextKey) {
                accountInfo.Info = 'Context key missing'
                return accountInfo;
            }

            const headers = {
                'X-MitsContextKey': contextKey,
                'Content-Type': 'application/json'
            };

            this.client = axios.create({
                baseURL: ApiUrls.Base,
                timeout: 30000,
                headers: headers
            });
            this.emit('client', this.client);

            accountInfo.State = true;
            accountInfo.Info = 'Connect Success';
            accountInfo.UseFahrenheit = loginData.UseFahrenheit;
            accountInfo.Account = account;
            await this.functions.saveData(this.accountFile, accountInfo);

            return accountInfo
        } catch (error) {
            throw new Error(`Connect error: ${error.message}`);
        }
    }
}

export default MelCloud;

