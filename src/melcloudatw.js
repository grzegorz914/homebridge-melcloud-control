import { Agent } from 'https';
import axios from 'axios';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import Functions from './functions.js';
import { ApiUrls } from './constants.js';

class MelCloudAtw extends EventEmitter {
    constructor(device, contextKey, devicesFile) {
        super();
        this.deviceId = device.id;
        this.logWarn = device.log?.warn;
        this.logDebug = device.log?.debug;
        this.devicesFile = devicesFile;
        this.functions = new Functions();

        //set default values
        this.deviceState = {};

        this.axiosInstancePost = axios.create({
            method: 'POST',
            baseURL: ApiUrls.BaseURL,
            timeout: 25000,
            headers: {
                'X-MitsContextKey': contextKey,
                'content-type': 'application/json'
            },
            withCredentials: true,
            httpsAgent: new Agent({
                keepAlive: false,
                rejectUnauthorized: false
            })
        });

        //lock flags
        this.locks = {
            checkState: false,
        };
        this.impulseGenerator = new ImpulseGenerator()
            .on('checkState', () => this.handleWithLock('checkState', async () => {
                await this.checkState();
            }))
            .on('state', (state) => {
                this.emit('success', `Impulse generator ${state ? 'started' : 'stopped'}.`);
            });
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

    async checkState() {
        try {
            //read device info from file
            const data = await this.functions.readData(this.devicesFile);
            const devicesData = JSON.parse(data);

            if (!Array.isArray(devicesData)) {
                if (this.logWarn) this.emit('warn', `Device data not found`);
                return null;
            }
            const deviceData = devicesData.find(device => device.DeviceID === this.deviceId);
            if (this.logDebug) this.emit('debug', `Device Data: ${JSON.stringify(deviceData, null, 2)}`);

            //device info
            const serialNumber = deviceData.SerialNumber ?? 'Undefined';

            //device
            const device = deviceData.Device ?? {};
            const hasHotWaterTank = device.HasHotWaterTank ?? false;
            const temperatureIncrement = device.TemperatureIncrement;
            const roomTemperatureZone1 = device.RoomTemperatureZone1;
            const roomTemperatureZone2 = device.RoomTemperatureZone2;
            const outdoorTemperature = device.OutdoorTemperature;
            const tankWaterTemperature = device.TankWaterTemperature;
            const unitStatus = device.UnitStatus;
            const power = device.Power;
            const ecoHotWater = device.EcoHotWater;
            const operationMode = device.OperationMode;
            const operationModeZone1 = device.OperationModeZone1;
            const operationModeZone2 = device.OperationModeZone2;
            const setTemperatureZone1 = device.SetTemperatureZone1;
            const setTemperatureZone2 = device.SetTemperatureZone2;
            const setTankWaterTemperature = device.SetTankWaterTemperature;
            const forcedHotWaterMode = device.ForcedHotWaterMode;
            const holidayMode = device.HolidayMode;
            const prohibitHotWater = device.ProhibitHotWater;
            const prohibitHeatingZone1 = device.ProhibitHeatingZone1;
            const prohibitHeatingZone2 = device.ProhibitHeatingZone2;
            const setHeatFlowTemperatureZone1 = device.SetHeatFlowTemperatureZone1;
            const setHeatFlowTemperatureZone2 = device.SetHeatFlowTemperatureZone2;
            const setCoolFlowTemperatureZone1 = device.SetCoolFlowTemperatureZone1;
            const setCoolFlowTemperatureZone2 = device.SetCoolFlowTemperatureZone2;
            const idleZone1 = device.IdleZone1 ?? false;
            const idleZone2 = device.IdleZone2 ?? false;
            const firmwareAppVersion = device.FirmwareAppVersion?.toString() ?? 'Undefined';
            const hasZone2 = device.HasZone2 ?? false;

            //units
            const units = Array.isArray(device.Units) ? device.Units : [];
            const unitsCount = units.length;
            const manufacturer = 'Mitsubishi';

            //indoor
            let idIndoor = 0;
            let deviceIndoor = 0;
            let serialNumberIndoor = 'Undefined';
            let modelNumberIndoor = 0;
            let modelIndoor = false;
            let typeIndoor = 0;

            //outdoor
            let idOutdoor = 0;
            let deviceOutdoor = 0;
            let serialNumberOutdoor = 'Undefined';
            let modelNumberOutdoor = 0;
            let modelOutdoor = false;
            let typeOutdoor = 0;

            //units array
            for (const unit of units) {
                const unitId = unit.ID;
                const unitDevice = unit.Device;
                const unitSerialNumber = unit.SerialNumber ?? 'Undefined';
                const unitModelNumber = unit.ModelNumber;
                const unitModel = unit.Model ?? false;
                const unitType = unit.UnitType;
                const unitIsIndoor = unit.IsIndoor ?? false;

                switch (unitIsIndoor) {
                    case true:
                        idIndoor = unitId;
                        deviceIndoor = unitDevice;
                        serialNumberIndoor = unitSerialNumber;
                        modelNumberIndoor = unitModelNumber;
                        modelIndoor = unitModel;
                        typeIndoor = unitType;
                        break;
                    case false:
                        idOutdoor = unitId;
                        deviceOutdoor = unitDevice;
                        serialNumberOutdoor = unitSerialNumber;
                        modelNumberOutdoor = unitModelNumber;
                        modelOutdoor = unitModel;
                        typeOutdoor = unitType;
                        break;
                }
            }

            //display info if units are not configured in MELCloud service
            if (unitsCount === 0) {
                this.emit('message', `Units are not configured in MELCloud service`);
            };

            const deviceState = {
                Power: power,
                IdleZone1: idleZone1,
                IdleZone2: idleZone2,
                UnitStatus: unitStatus,
                SetTemperatureZone1: setTemperatureZone1,
                SetTemperatureZone2: setTemperatureZone2,
                RoomTemperatureZone1: roomTemperatureZone1,
                RoomTemperatureZone2: roomTemperatureZone2,
                OperationMode: operationMode,
                OperationModeZone1: operationModeZone1,
                OperationModeZone2: operationModeZone2,
                SetHeatFlowTemperatureZone1: setHeatFlowTemperatureZone1,
                SetHeatFlowTemperatureZone2: setHeatFlowTemperatureZone2,
                SetCoolFlowTemperatureZone1: setCoolFlowTemperatureZone1,
                SetCoolFlowTemperatureZone2: setCoolFlowTemperatureZone2,
                TankWaterTemperature: tankWaterTemperature,
                SetTankWaterTemperature: setTankWaterTemperature,
                ForcedHotWaterMode: forcedHotWaterMode,
                OutdoorTemperature: outdoorTemperature,
                TemperatureIncrement: temperatureIncrement,
                EcoHotWater: ecoHotWater,
                HolidayMode: holidayMode,
                ProhibitZone1: prohibitHeatingZone1,
                ProhibitZone2: prohibitHeatingZone2,
                ProhibitHotWater: prohibitHotWater
            }

            //restFul
            this.emit('restFul', 'info', deviceData);
            this.emit('restFul', 'state', deviceData.Device);

            //mqtt
            this.emit('mqtt', 'Info', deviceData);
            this.emit('mqtt', 'State', deviceData.Device);

            //check state changes
            const deviceDataHasNotChanged = JSON.stringify(deviceState) === JSON.stringify(this.deviceState);
            if (deviceDataHasNotChanged) {
                if (this.logDebug) this.emit('debug', `Device state not changed`);
                return;
            }
            this.deviceState = deviceState;

            //emit info
            this.emit('deviceInfo', manufacturer, modelIndoor, modelOutdoor, serialNumber, firmwareAppVersion, hasHotWaterTank, hasZone2);

            //emit state
            this.emit('deviceState', deviceData);

            return true;
        } catch (error) {
            throw new Error(`Check state error: ${error}`);
        };
    };

    async send(deviceData) {
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

            const payload = {
                data: {
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
            }

            await this.axiosInstancePost(ApiUrls.SetAtw, payload);
            this.updateData(deviceData);
            return true;
        } catch (error) {
            throw new Error(`Send data error: ${error}`);
        };
    };

    updateData(deviceData) {
        setTimeout(() => {
            this.emit('deviceState', deviceData);
        }, 500);
    }
};
export default MelCloudAtw;
