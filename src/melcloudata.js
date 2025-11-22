import WebSocket from 'ws';
import axios from 'axios';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import Functions from './functions.js';
import { ApiUrls, ApiUrlsHome, AirConditioner } from './constants.js';

class MelCloudAta extends EventEmitter {
    constructor(account, device, devicesFile, defaultTempsFile, accountFile) {
        super();
        this.accountType = account.type;
        this.logSuccess = account.log?.success;
        this.logWarn = account.log?.warn;
        this.logError = account.log?.error;
        this.logDebug = account.log?.debug;
        this.restFulEnabled = account.restFul?.enable;
        this.mqttEnabled = account.mqtt?.enable;
        this.deviceId = device.id;
        this.devicesFile = devicesFile;
        this.defaultTempsFile = defaultTempsFile;
        this.accountFile = accountFile;
        this.functions = new Functions(this.logWarn, this.logError, this.logDebug)
            .on('warn', warn => this.emit('warn', warn))
            .on('error', error => this.emit('error', error))
            .on('debug', debug => this.emit('debug', debug));

        //set default values
        this.deviceData = {};
        this.headers = {};
        this.socket = null;
        this.connecting = false;
        this.socketConnected = false;
        this.heartbeat = null;

        //lock flag
        this.locks = false;
        this.impulseGenerator = new ImpulseGenerator()
            .on('checkState', () => this.handleWithLock(async () => {
                await this.checkState();
            }))
            .on('state', (state) => {
                this.emit(state ? 'success' : 'warn', `Impulse generator ${state ? 'started' : 'stopped'}`);
            });
    }

    async handleWithLock(fn) {
        if (this.locks) return;

        this.locks = true;
        try {
            await fn();
        } catch (error) {
            this.emit('error', `Inpulse generator error: ${error}`);
        } finally {
            this.locks = false;
        }
    }

    cleanupSocket() {
        if (this.heartbeat) {
            clearInterval(this.heartbeat);
            this.heartbeat = null;
        }

        if (this.socket) {
            try { this.socket.close(); } catch { }
            this.socket = null;
        }

        this.socketConnected = false;
    }

    async updateState(deviceData) {
        try {
            if (this.accountType === 'melcloudhome') {
                deviceData.Device.OperationMode = AirConditioner.OperationModeMapStringToEnum[deviceData.Device.OperationMode] ?? deviceData.Device.OperationMode;
                deviceData.Device.ActualFanSpeed = AirConditioner.FanSpeedMapStringToEnum[deviceData.Device.ActualFanSpeed] ?? deviceData.Device.ActualFanSpeed;
                deviceData.Device.SetFanSpeed = AirConditioner.FanSpeedMapStringToEnum[deviceData.Device.SetFanSpeed] ?? deviceData.Device.SetFanSpeed;
                deviceData.Device.VaneHorizontalDirection = AirConditioner.VaneHorizontalDirectionMapStringToEnum[deviceData.Device.VaneHorizontalDirection] ?? deviceData.Device.VaneHorizontalDirection
                deviceData.Device.VaneVerticalDirection = AirConditioner.VaneVerticalDirectionMapStringToEnum[deviceData.Device.VaneVerticalDirection] ?? deviceData.Device.VaneVerticalDirection;

                //read default temps
                const temps = await this.functions.readData(this.defaultTempsFile, true);
                deviceData.Device.DefaultHeatingSetTemperature = temps?.defaultHeatingSetTemperature ?? 20;
                deviceData.Device.DefaultCoolingSetTemperature = temps?.defaultCoolingSetTemperature ?? 24;

            }
            if (this.logDebug) this.emit('debug', `Device Data: ${JSON.stringify(deviceData, null, 2)}`);

            //device
            const serialNumber = deviceData.SerialNumber || '4.0.0';
            const firmwareAppVersion = deviceData.Device?.FirmwareAppVersion || '4.0.0';

            //units
            const units = Array.isArray(deviceData.Device?.Units) ? deviceData.Device?.Units : [];
            const unitsCount = units.length;

            const { indoor, outdoor } = units.reduce((acc, unit) => {
                const target = unit.IsIndoor ? 'indoor' : 'outdoor';
                acc[target] = {
                    id: unit.ID,
                    device: unit.Device,
                    serialNumber: unit.SerialNumber ?? 'Undefined',
                    modelNumber: unit.ModelNumber ?? 0,
                    model: unit.Model ?? false,
                    type: unit.UnitType ?? 0
                };
                return acc;
            }, { indoor: {}, outdoor: {} });

            //display info if units are not configured in MELCloud service
            if (unitsCount === 0 && this.logDebug) if (this.logDebug) this.emit('debug', `Units are not configured in MELCloud service`);

            //filter info
            const { Device: _ignored, ...info } = deviceData;

            //restFul
            if (this.restFulEnabled) {
                this.emit('restFul', 'info', info);
                this.emit('restFul', 'state', deviceData.Device);
            }

            //mqtt
            if (this.mqttEnabled) {
                this.emit('mqtt', 'Info', info);
                this.emit('mqtt', 'State', deviceData.Device);
            }

            //check state changes
            const deviceDataNotChanged = JSON.stringify(deviceData) === JSON.stringify(this.deviceData);
            if (deviceDataNotChanged) return;
            this.deviceData = deviceData;

            //emit info
            this.emit('deviceInfo', indoor.model, outdoor.model, serialNumber, firmwareAppVersion);

            //emit state
            this.emit('deviceState', deviceData);

            return true;
        } catch (error) {
            throw new Error(`Update state error: ${error.message}`);
        };
    };

    async checkState() {
        try {
            //read device info from file
            const devicesData = await this.functions.readData(this.devicesFile, true);
            if (!devicesData) return;

            this.headers = devicesData.Headers;
            const deviceData = devicesData.Devices.find(device => device.DeviceID === this.deviceId);
            if (!deviceData) return;
            deviceData.Scenes = devicesData.Scenes ?? [];

            //web cocket connection
            if (this.accountType === 'melcloudhome' && !this.connecting && !this.socketConnected) {
                this.connecting = true;

                try {
                    const url = `${ApiUrlsHome.WebSocketURL}${devicesData.WebSocketOptions.Hash}`;
                    const socket = new WebSocket(url, { headers: devicesData.WebSocketOptions.Headers })
                        .on('error', (error) => {
                            if (this.logError) this.emit('error', `Socket error: ${error}`);
                            socket.close();
                        })
                        .on('close', () => {
                            if (this.logDebug) this.emit('debug', `Socket closed`);
                            this.cleanupSocket();
                        })
                        .on('open', () => {
                            this.socket = socket;
                            this.socketConnected = true;
                            this.connecting = false;
                            if (this.logSuccess) this.emit('success', `Socket Connect Success`);

                            // heartbeat
                            this.heartbeat = setInterval(() => {
                                if (socket.readyState === socket.OPEN) {
                                    if (this.logDebug) this.emit('debug', `Socket send heartbeat`);
                                    socket.ping();
                                }
                            }, 30000);
                        })
                        .on('pong', () => {
                            if (this.logDebug) this.emit('debug', `Socket received heartbeat`);
                        })
                        .on('message', async (message) => {
                            const parsedMessage = JSON.parse(message);
                            const stringifyMessage = JSON.stringify(parsedMessage, null, 2);
                            if (parsedMessage.message === 'Forbidden') return;

                            const messageData = parsedMessage?.[0]?.Data;
                            if (!messageData) return;

                            let updateState = false;
                            const unitId = messageData?.id;
                            switch (unitId) {
                                case this.deviceId:
                                    if (this.logDebug) this.emit('debug', `Incoming message: ${stringifyMessage}`);
                                    const messageType = parsedMessage[0].messageType;
                                    const settings = this.functions.parseArrayNameValue(messageData.settings);
                                    switch (messageType) {
                                        case 'unitStateChanged':

                                            //update values
                                            for (const [key, value] of Object.entries(settings)) {
                                                if (!this.functions.isValidValue(value)) continue;

                                                //update holiday mode
                                                if (key === 'HolidayMode') {
                                                    deviceData.HolidayMode.Enabled = value;
                                                    continue;
                                                }

                                                //update device settings
                                                if (key in deviceData.Device) {
                                                    deviceData.Device[key] = value;
                                                }
                                            }
                                            updateState = true;
                                            break;
                                        case 'unitHolidayModeTriggered':
                                            deviceData.Device.Power = settings.Power;
                                            deviceData.HolidayMode.Enabled = settings.HolidayMode;
                                            deviceData.HolidayMode.Active = messageData.active;
                                            updateState = true;
                                            break;
                                        case 'unitWifiSignalChanged':
                                            deviceData.Rssi = messageData.rssi;
                                            updateState = true;
                                            break;
                                        default:
                                            if (this.logDebug) this.emit('debug', `Unit ${unitId}, received unknown message type: ${stringifyMessage}`);
                                            return;
                                    }
                                    break;
                                default:
                                    if (this.logDebug) this.emit('debug', `Incoming unknown unit id: ${stringifyMessage}`);
                                    return;
                            }

                            //update state
                            if (updateState) await this.updateState(deviceData);
                        });
                } catch (error) {
                    if (this.logError) this.emit('error', `Socket connection failed: ${error}`);
                    this.cleanupSocket();
                }
            }

            //update state
            await this.updateState(deviceData);

            return true;
        } catch (error) {
            throw new Error(`Check state error: ${error.message}`);
        };
    };

    async send(accountType, displayType, deviceData, flag, flagData) {
        try {
            let method = null
            let payload = {};
            let path = '';
            let headers = this.headers;
            let updateState = true;
            switch (accountType) {
                case "melcloud":
                    switch (flag) {
                        case 'account':
                            flagData.Account.LoginData.UseFahrenheit = flagData.UseFahrenheit;
                            payload = { data: flagData.LoginData };
                            path = ApiUrls.UpdateApplicationOptions;
                            await this.functions.saveData(this.accountFile, flagData);
                            break;
                        default:
                            if (displayType === 1 && deviceData.Device.OperationMode === 8) {
                                deviceData.Device.SetTemperature = (deviceData.Device.DefaultCoolingSetTemperature + deviceData.Device.DefaultHeatingSetTemperature) / 2;
                            }
                            deviceData.Device.EffectiveFlags = flag;
                            payload = {
                                DeviceID: deviceData.Device.DeviceID,
                                EffectiveFlags: deviceData.Device.EffectiveFlags,
                                Power: deviceData.Device.Power,
                                SetTemperature: deviceData.Device.SetTemperature,
                                SetFanSpeed: deviceData.Device.FanSpeed,
                                OperationMode: deviceData.Device.OperationMode,
                                VaneHorizontal: deviceData.Device.VaneHorizontalDirection,
                                VaneVertical: deviceData.Device.VaneVerticalDirection,
                                DefaultHeatingSetTemperature: deviceData.Device.DefaultHeatingSetTemperature,
                                DefaultCoolingSetTemperature: deviceData.Device.DefaultCoolingSetTemperature,
                                ProhibitSetTemperature: deviceData.Device.ProhibitSetTemperature,
                                ProhibitOperationMode: deviceData.Device.ProhibitOperationMode,
                                ProhibitPower: deviceData.Device.ProhibitPower,
                                HideVaneControls: deviceData.HideVaneControls,
                                HideDryModeControl: deviceData.HideDryModeControl,
                                HasPendingCommand: true
                            };
                            path = ApiUrls.SetAta;
                            break;
                    }

                    if (this.logDebug) this.emit('debug', `Send Data: ${JSON.stringify(payload, null, 2)}`);
                    await axios(path, {
                        method: 'POST',
                        baseURL: ApiUrls.BaseURL,
                        timeout: 30000,
                        headers: headers,
                        data: payload
                    });
                    this.updateData(deviceData, updateState);
                    return true;
                case "melcloudhome":
                    switch (flag) {
                        case 'frostprotection':
                            payload = {
                                enabled: deviceData.FrostProtection.Enabled,
                                min: deviceData.FrostProtection.Min,
                                max: deviceData.FrostProtection.Max,
                                units: { ATA: [deviceData.DeviceID] }
                            };
                            method = 'POST';
                            path = ApiUrlsHome.PostProtectionFrost;
                            headers.Referer = ApiUrlsHome.Referers.PostProtectionFrost.replace('deviceid', deviceData.DeviceID);
                            break;
                        case 'overheatprotection':
                            payload = {
                                enabled: deviceData.OverheatProtection.Enabled,
                                min: deviceData.OverheatProtection.Min,
                                max: deviceData.OverheatProtection.Max,
                                units: { ATA: [deviceData.DeviceID] }
                            };
                            method = 'POST';
                            path = ApiUrlsHome.PostProtectionOverheat;
                            headers.Referer = ApiUrlsHome.Referers.PostProtectionOverheat.replace('deviceid', deviceData.DeviceID);
                            break;
                        case 'holidaymode':
                            payload = {
                                enabled: deviceData.HolidayMode.Enabled,
                                startDate: deviceData.HolidayMode.StartDate,
                                endDate: deviceData.HolidayMode.EndDate,
                                units: { ATA: [deviceData.DeviceID] }
                            };
                            method = 'POST';
                            path = ApiUrlsHome.PostHolidayMode;
                            headers.Referer = ApiUrlsHome.Referers.PostHolidayMode.replace('deviceid', deviceData.DeviceID);
                            updateState = false;
                            break;
                        case 'schedule':
                            payload = { enabled: deviceData.ScheduleEnabled };
                            method = 'PUT';
                            path = ApiUrlsHome.PutScheduleEnabled.replace('deviceid', deviceData.DeviceID);
                            this.headers.Referer = ApiUrlsHome.Referers.PutScheduleEnabled.replace('deviceid', deviceData.DeviceID);
                            break;
                        case 'scene':
                            method = 'PUT';
                            path = ApiUrlsHome.PutScene[flagData.Enabled ? 'Enable' : 'Disable'].replace('sceneid', flagData.Id);
                            headers.Referer = ApiUrlsHome.Referers.GetPutScenes;
                            break;
                        default:
                            if (displayType === 1 && deviceData.Device.OperationMode === 8) {
                                deviceData.Device.SetTemperature = (deviceData.Device.DefaultCoolingSetTemperature + deviceData.Device.DefaultHeatingSetTemperature) / 2;

                                if (this.deviceData.Device.DefaultCoolingSetTemperature !== deviceData.Device.DefaultCoolingSetTemperature || this.deviceData.Device.DefaultHeatingSetTemperature !== deviceData.Device.DefaultHeatingSetTemperature) {
                                    const temps = {
                                        defaultCoolingSetTemperature: deviceData.Device.DefaultCoolingSetTemperature,
                                        defaultHeatingSetTemperature: deviceData.Device.DefaultHeatingSetTemperature
                                    };
                                    await this.functions.saveData(this.defaultTempsFile, temps);
                                }
                            }

                            payload = {
                                power: deviceData.Device.Power,
                                setTemperature: deviceData.Device.SetTemperature,
                                setFanSpeed: String(deviceData.Device.SetFanSpeed),
                                operationMode: AirConditioner.OperationModeMapEnumToString[deviceData.Device.OperationMode],
                                vaneHorizontalDirection: AirConditioner.VaneHorizontalDirectionMapEnumToString[deviceData.Device.VaneHorizontalDirection],
                                vaneVerticalDirection: AirConditioner.VaneVerticalDirectionMapEnumToString[deviceData.Device.VaneVerticalDirection],
                                temperatureIncrementOverride: null,
                                inStandbyMode: null
                            };
                            method = 'PUT';
                            path = ApiUrlsHome.PutAta.replace('deviceid', deviceData.DeviceID);
                            headers.Referer = ApiUrlsHome.Referers.PutDeviceSettings;
                            updateState = false;
                            break;
                    }

                    //sens payload
                    headers['Content-Type'] = 'application/json; charset=utf-8';
                    headers.Origin = ApiUrlsHome.Origin;
                    if (this.logDebug) this.emit('debug', `Send Data: ${JSON.stringify(payload, null, 2)}`);
                    await axios(path, {
                        method: method,
                        baseURL: ApiUrlsHome.BaseURL,
                        timeout: 30000,
                        headers: headers,
                        data: payload
                    });

                    this.updateData(deviceData, updateState);
                    return true;
                default:
                    return;
            }
        } catch (error) {
            if (error.response?.status === 500) return true; // Return 500 for schedule hovewer working correct
            throw new Error(`Send data error: ${error.message}`);
        }
    }

    updateData(deviceData, updateState = true) {
        this.locks = true;
        if (updateState) this.emit('deviceState', deviceData);

        setTimeout(() => {
            this.locks = false
        }, 5000);
    }
};
export default MelCloudAta;
