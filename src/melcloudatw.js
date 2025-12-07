import EventEmitter from 'events';
import Functions from './functions.js';
import { ApiUrls, ApiUrlsHome, HeatPump } from './constants.js';

class MelCloudAtw extends EventEmitter {
    constructor(account, device, defaultTempsFile, accountFile, melcloud) {
        super();
        this.accountType = account.type;
        this.logSuccess = account.log?.success;
        this.logWarn = account.log?.warn;
        this.logError = account.log?.error;
        this.logDebug = account.log?.debug;
        this.restFulEnabled = account.restFul?.enable;
        this.mqttEnabled = account.mqtt?.enable;
        this.deviceId = device.id;
        this.defaultTempsFile = defaultTempsFile;
        this.accountFile = accountFile;

        this.functions = new Functions(this.logWarn, this.logError, this.logDebug)
            .on('warn', warn => this.emit('warn', warn))
            .on('error', error => this.emit('error', error))
            .on('debug', debug => this.emit('debug', debug));

        //set default values
        this.deviceData = {};
        this.client = melcloud.client;

        //handle melcloud events
        let deviceData = null;
        melcloud.on('client', (client) => {
            this.client = client;
        }).on('devicesList', async (devicesData) => {
            try {
                deviceData = devicesData.Devices.find(device => device.DeviceID === this.deviceId);
                if (!deviceData) return;
                deviceData.Scenes = devicesData.Scenes ?? [];

                //update state
                if (this.logDebug) this.emit('debug', `Request update settings: ${JSON.stringify(deviceData.Device, null, 2)}`);
                await this.updateState('request', deviceData);
            } catch (error) {
                if (this.logError) this.emit('error', `Request process message error: ${error}`);
            }
        }).on('webSocket', async (parsedMessage) => {
            try {
                const messageData = parsedMessage?.[0]?.Data;
                if (!messageData || !deviceData) return;

                let updateState = false;
                const unitId = messageData?.id;
                switch (unitId) {
                    case this.deviceId:
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

                                if (this.logDebug) this.emit('debug', `WS update settings: ${JSON.stringify(deviceData.Device, null, 2)}`);
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
                                if (this.logDebug) this.emit('debug', `Unit ${unitId}, received unknown message type: ${parsedMessage}`);
                                return;
                        }
                        break;
                    default:
                        if (this.logDebug) this.emit('debug', `Incoming unknown unit id: ${parsedMessage}`);
                        return;
                }

                //update state
                if (updateState) await this.updateState('ws', deviceData);
            } catch (error) {
                if (this.logError) this.emit('error', `Web socket process message error: ${error}`);
            }
        });
    }

    async updateState(type, deviceData) {
        try {
            if (this.accountType === 'melcloudhome') {
                deviceData.Device.OperationMode = HeatPump.OperationModeMapStringToEnum[deviceData.Device.OperationMode] ?? deviceData.Device.OperationMode;
                deviceData.Device.OperationModeZone1 = HeatPump.OperationModeZoneMapStringToEnum[deviceData.Device.OperationModeZone1] ?? deviceData.Device.OperationModeZone1;
                deviceData.Device.OperationModeZone2 = HeatPump.OperationModeZoneMapStringToEnum[deviceData.Device.OperationModeZone2] ?? deviceData.Device.OperationModeZone2;
            }
            if (this.logDebug) this.emit('debug', `Device Data: ${JSON.stringify(deviceData, null, 2)}`);

            //device
            const serialNumber = deviceData.SerialNumber || '4.0.0';
            const firmwareAppVersion = deviceData.Device?.FirmwareAppVersion || '4.0.0';
            const hasHotWaterTank = deviceData.Device?.HasHotWaterTank;
            const hasZone2 = deviceData.Device?.HasZone2;

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
            const deviceDataHasNotChanged = JSON.stringify(deviceData) === JSON.stringify(this.deviceData);
            if (deviceDataHasNotChanged) return;
            this.deviceData = deviceData;

            //emit info
            this.emit('deviceInfo', indoor.model, outdoor.model, serialNumber, firmwareAppVersion, hasHotWaterTank, hasZone2);

            //emit state
            this.emit('deviceState', deviceData);

            return true;
        } catch (error) {
            throw new Error(`Check state error: ${error.message}`);
        };
    }

    async checkState(devicesData) {
        try {
            const deviceData = devicesData.Devices.find(device => device.DeviceID === this.deviceId);
            deviceData.Scenes = devicesData.Scenes ?? [];
            await this.updateState('request', deviceData);

            return true;
        } catch (error) {
            throw new Error(`Chaeck state error: ${error.message}`);
        };
    }

    async send(accountType, displayType, deviceData, flag, flagData) {
        try {

            //prevent to set out of range temp
            const minTempZones = 0;
            const maxTempZones = 60;
            const minTempWaterTank = 16;
            const maxTempWaterTank = deviceData.Device.MaxTankTemperature ?? 70;

            deviceData.Device.SetTemperatureZone1 = deviceData.Device.SetTemperatureZone1 < minTempZones ? minTempZones : deviceData.Device.SetTemperatureZone1;
            deviceData.Device.SetTemperatureZone1 = deviceData.Device.SetTemperatureZone1 > maxTempZones ? maxTempZones : deviceData.Device.SetTemperatureZone1;
            deviceData.Device.SetTemperatureZone1 = deviceData.Device.SetTemperatureZone2 < minTempZones ? minTempZones : deviceData.Device.SetTemperatureZone2;
            deviceData.Device.SetTemperatureZone1 = deviceData.Device.SetTemperatureZone2 > maxTempZones ? maxTempZones : deviceData.Device.SetTemperatureZone2;
            deviceData.Device.SetTankWaterTemperature = deviceData.Device.SetTankWaterTemperature < minTempWaterTank ? minTempWaterTank : deviceData.Device.SetTankWaterTemperature;
            deviceData.Device.SetTankWaterTemperature = deviceData.Device.SetTankWaterTemperature > maxTempWaterTank ? maxTempWaterTank : deviceData.Device.SetTankWaterTemperature;

            let method = null
            let payload = {};
            let path = '';
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
                            deviceData.Device.EffectiveFlags = flag;
                            payload = {
                                DeviceID: deviceData.Device.DeviceID,
                                EffectiveFlags: deviceData.Device.EffectiveFlags,
                                Power: deviceData.Device.Power,
                                SetTemperatureZone1: deviceData.Device.SetTemperatureZone1,
                                SetTemperatureZone2: deviceData.Device.SetTemperatureZone2,
                                OperationMode: deviceData.Device.OperationMode,
                                OperationModeZone1: deviceData.Device.OperationModeZone1,
                                OperationModeZone2: deviceData.Device.OperationModeZone2,
                                SetHeatFlowTemperatureZone1: deviceData.Device.SetHeatFlowTemperatureZone1,
                                SetHeatFlowTemperatureZone2: deviceData.Device.SetHeatFlowTemperatureZone2,
                                SetCoolFlowTemperatureZone1: deviceData.Device.SetCoolFlowTemperatureZone1,
                                SetCoolFlowTemperatureZone2: deviceData.Device.SetCoolFlowTemperatureZone2,
                                SetTankWaterTemperature: deviceData.Device.SetTankWaterTemperature,
                                ForcedHotWaterMode: deviceData.Device.ForcedHotWaterMode,
                                EcoHotWater: deviceData.Device.EcoHotWater,
                                HolidayMode: deviceData.Device.HolidayMode,
                                ProhibitZone1: deviceData.Device.ProhibitHeatingZone1,
                                ProhibitZone2: deviceData.Device.ProhibitHeatingZone2,
                                ProhibitHotWater: deviceData.Device.ProhibitHotWater,
                                HasPendingCommand: true
                            }
                            path = ApiUrls.SetAtw;
                            break;
                    }

                    if (this.logDebug) this.emit('debug', `Send data: ${JSON.stringify(payload, null, 2)}`);
                    await this.client(path, { method: 'POST', data: payload });

                    this.emit('deviceState', deviceData);
                    return true;
                case "melcloudhome":
                    switch (flag) {
                        case 'holidaymode':
                            payload = {
                                enabled: deviceData.HolidayMode.Enabled,
                                startDate: deviceData.HolidayMode.StartDate,
                                endDate: deviceData.HolidayMode.EndDate,
                                units: { ATW: [deviceData.DeviceID] }
                            };
                            method = 'POST';
                            path = ApiUrlsHome.PostHolidayMode;
                            break;
                        case 'schedule':
                            payload = { enabled: deviceData.ScheduleEnabled };
                            method = 'PUT';
                            path = ApiUrlsHome.PutScheduleEnabled.replace('deviceid', deviceData.DeviceID);
                            break;
                        case 'scene':
                            method = 'PUT';
                            path = ApiUrlsHome.PutScene[flagData.Enabled ? 'Enable' : 'Disable'].replace('sceneid', flagData.Id);
                            break;
                        default:
                            payload = {
                                power: deviceData.Device.Power,
                                setTemperatureZone1: deviceData.Device.SetTemperatureZone1,
                                setTemperatureZone2: deviceData.Device.SetTemperatureZone2,
                                operationMode: HeatPump.OperationModeMapEnumToString[deviceData.Device.OperationMode],
                                operationModeZone1: HeatPump.OperationModeMapEnumToString[deviceData.Device.OperationModeZone1],
                                operationModeZone2: HeatPump.OperationModeMapEnumToString[deviceData.Device.OperationModeZone2],
                                opetHeatFlowTemperatureZone1: deviceData.Device.SetHeatFlowTemperatureZone1,
                                setHeatFlowTemperatureZone2: deviceData.Device.SetHeatFlowTemperatureZone2,
                                setCoolFlowTemperatureZone1: deviceData.Device.SetCoolFlowTemperatureZone1,
                                setCoolFlowTemperatureZone2: deviceData.Device.SetCoolFlowTemperatureZone2,
                                setTankWaterTemperature: deviceData.Device.SetTankWaterTemperature,
                                forcedHotWaterMode: deviceData.Device.ForcedHotWaterMode,
                                ecoHotWater: deviceData.Device.EcoHotWater,
                            };
                            method = 'PUT';
                            path = ApiUrlsHome.PutAtw.replace('deviceid', deviceData.DeviceID);
                            break
                    }

                    if (this.logDebug) this.emit('debug', `Send data: ${JSON.stringify(payload, null, 2)}`);
                    await this.client(path, { method: method, data: payload });

                    return true;
                default:
                    return;
            }
        } catch (error) {
            throw new Error(`Send data error: ${error.message}`);
        }
    }
}

export default MelCloudAtw;
