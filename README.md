<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/homebridge-melcloud-control.png" width="540"></a>
</p>

<span align="center">

# Homebridge MELCloud Control

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-melcloud-control?color=purple)](https://www.npmjs.com/package/homebridge-melcloud-control)
[![npm](https://badgen.net/npm/v/homebridge-melcloud-control?color=purple)](https://www.npmjs.com/package/homebridge-melcloud-control)
[![npm](https://img.shields.io/npm/v/homebridge-melcloud-control/beta.svg?style=flat-square)](https://www.npmjs.com/package/homebridge-melcloud-control)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-melcloud-control.svg)](https://github.com/grzegorz914/homebridge-melcloud-control/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-melcloud-control.svg)](https://github.com/grzegorz914/homebridge-melcloud-control/issues)

Homebridge plugin for Air Conditioner, Heat Pump and Energy Recovery Ventilation Lossnay, manufactured by Mistsubishi and connected to MELCloud.

</span>

## Package Requirements

| Package | Installation | Role | Required |
| --- | --- | --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) | HomeKit Bridge | Required |
| [Config UI X](https://github.com/homebridge/homebridge-config-ui-x) | [Config UI X Wiki](https://github.com/homebridge/homebridge-config-ui-x/wiki) | Homebridge Web User Interface | Recommended |
| [MELCloud](https://github.com/grzegorz914/homebridge-melcloud-control) | [Plug-In Wiki](https://github.com/grzegorz914/homebridge-melcloud-control/wiki) | Homebridge Plug-In | Required |

### About The Plugin

* All devices are detected automatically.
* Support multiple MELCloud accounts, buildings, floors, areas.
* Support temperature display units `Celsius/Fahrenheit`.
* Support control device `Presets`.
* Support direct device control creating extra `Buttons`, applied for all devices of same type in account.
* Support identify all states of device creating `Sensors`, applied for all devices of same type in account.
* Support automations, shortcuts and Siri.
* RESTful server:
  * Request: `http//homebridge_ip_address:port/path`.
  * Port: last 4 numbers of `device Id`, displayed in HB log during start.
  * Path: `info`, `state`.
  * Response as JSON data.
* MQTT:
  * Publish:
    * Topic: `Info`, `State`.
    * Publish as JSON data.
  * Subscribe:
    * Topic: `Set`.
     * Payload JSON data.
      * Air Conditioner:
         * Key/Value:
           * `Power: boolean`, `OperationMode: integer`, `SetTemperature: float`, `DefaultCoolingSetTemperature: float`, `DefaultHeatingSetTemperature: float`, `SetFanSpeed: integer`, `VaneHorizontal: integer`, `VaneHVertical: integer`, `HideVaneControls: boolean`, `HideDryModeControl: boolean`, `ProhibitSetTemperature: boolean`, `ProhibitOperationMode: boolean`, `ProhibitPower: boolean`.
      * Heat Pump:
        * Key/Value:
           * `Power: boolean`, `OperationMode: integer`, `OperationModeZone1: integer`, `OperationModeZone2: integer`, `SetTemperature: float`, `SetTemperatureZone1: float`, `SetTemperatureZone2: float`, `SetHeatFlowTemperatureZone1: float`, `SetHeatFlowTemperatureZone2: float`, `SetCoolFlowTemperatureZone1: float`, `SetCoolFlowTemperatureZone2: float`, `SetTankWaterTemperature: float`, `ForcedHotWaterMode: boolean`, `EcoHotWater: boolean`, `HolidayMode: boolean`, `ProhibitZone1: boolean`, `ProhibitZone2: boolean`, `ProhibitHotWater: boolean`.
      * Energy Recovery Ventilation Lossnay:
        * Key/Value:
           * `Power: boolean`, `OperationMode: integer`, `VentilationMode: integer`, `SetTemperature: float`, `DefaultCoolingSetTemperature: float`, `DefaultHeatingSetTemperature: float`, `NightPurgeMode: boolean`, `SetFanSpeed`, `HideRoomTemperature: boolean`, `HideSupplyTemperature: boolean`, `HideOutdoorTemperature: boolean`.

| Key | Value | Value Type | Description |
| --- | --- | --- | --- |
| `Power` | true/false | boolean | Set power ON/OFF |

### Control Mode

* Air Conditioner:
  * Heater Cooler:
    * Power `ON/OFF`.
    * Operating mode `AUTO/HEAT/COOL/POWER OFF`.
    * Temperature `HEATING/COOLING`.
    * Fan speed `OFF/1/2/3/4/5/AUTO`.
    * Swing mode `AUTO/SWING`.
    * Physical lock controls `LOCK/UNLOCK`.
    * Temperature display unit `°F/°C`.
    * If `AUTO/HEAT` or both modes are not supported by device will use `DRY/FAN` or `FAN/DRY` modes instead.
  * Thermostat:
    * Power `ON/OFF`.
    * Operating mode `POWER OFF/HEAT/COOL/AUTO`.
    * Temperature `HEATING/COOLING`.
    * Temperature display unit `°F/°C`.
    * If `AUTO/HEAT` or both modes are not supported by device will use `DRY/FAN` or `FAN/DRY` modes instead.
  * Buttons:
    * For direct device control.
      * Power `ON/OFF`.
      * Operating mode `HEAT/DRY/COOL/FAN/AUTO`.
      * Physical lock controls `LOCK/UNLOCK`.
      * Vane H mode `AUTO/1/2/3/4/5/SPLIT/SWING`.
      * Vane V mode `AUTO/1/2/3/4/5/SWING`.
      * Fan speed mode `AUTO/1/2/3/4/5`.
      * Presets `SET/UNSET`.
  * Sensors:
    * For automation and notifications.
      * Power `ON/OFF`.
      * Operating mode `HEAT/DRY/COOL/FAN/AUTO`.
      * Physical lock controls `LOCK/UNLOCK`.
      * Vane H mode `AUTO/1/2/3/4/5/SPLIT/SWING`.
      * Vane V mode `AUTO/1/2/3/4/5/SWING`.
      * Fan speed mode `AUTO/1/2/3/4/5/`.
      * Presets `ACTIV/UNACTIV`.
      * Room temperature.
      * Outdoor temperature.
* Heat Pump:
  * Heater Cooler:
    * Heat Pump:
      * Power `ON/OFF`.
      * Operating mode `HEAT/COOL`.
      * Outdoor temperature `GET`.
      * Physical lock controls all Zones and Hot Water Tank `LOCK/UNLOCK`.
      * Temperature display unit `°F/°C`.
    * Zone 1 and 2:
      * Operating mode heat `AUTO/HEAT/COOL` - `CURVE/HEAT THERMOSTAT/HEAT FLOW`.
      * Operating mode cool `HEAT/COOL` - `COOL THERMOSTAT/COOL FLOW`.
      * Temperature `HEATING/COOLING`.
      * Physical lock controls `LOCK/UNLOCK`.
    * Hot Water Tank:
      * Operating mode `AUTO/HEAT` - `AUTO/HEAT NOW`.
      * Temperature `SET/GET`.
      * Physical lock controls `LOCK/UNLOCK`.
  * Thermostat:
    * Heat Pump:
      * Power `ON/OFF`.
      * Operating mode `HEAT/COOL`.
      * Outdoor temperature `GET`.
      * Temperature display unit `°F/°C`.
    * Zone 1 and 2:
      * Operating mode heat `HEAT/COOL/AUTO` - `HEAT THERMOSTAT/HEAT FLOW/CURVE`.
      * Operating mode cool `HEAT/COOL` - `COOL THERMOSTAT/COOL FLOW`.
      * Temperature `HEATING/COOLING`.
    * Hot Water Tank:
      * Operating mode `HEAT/AUTO` - `HEAT NOW, AUTO`.
      * Temperature `SET/GET`.
  * Buttons:
    * For direct device control.
      * Power `ON/OFF`.
      * Operating mode `HEAT/COOL/CURVE/HOLIDAY/AUTO HOT WATER/ECO HOT WATER/FORCE HOT WATER`.
      * Physical lock controls `LOCK/UNLOCK`.
      * Presets `SET/UNSET`.
  * Sensors:
    * For automation and notifications.
      * Power `ON/OFF`.
      * Operating mode `HEAT/COOL/CURVE/HOLIDAY/AUTO HOT WATER/ECO HOT WATER/FORCE HOT WATER`.
      * Physical lock controls `LOCK/UNLOCK`.
      * Presets `ACTIV/UNACTIV`.
      * Outdoor temperature.
      * Zone 1 temperature.
      * Zone 2 temperature.
      * Water tank temperature.
      * Flow Temperature Zone 1, 2, Hot Water
      * Return Temperature Zone 1, 2, Hot Water
* Energy Recovery Ventilation Lossnay:
  * Heater Cooler:
    * Power `ON/OFF`.
    * Operating mode `AUTO/HEAT/COOL/POWER OFF` - `AUTO, LOSSNAY, BYPASS, POWER OFF`.
    * Fan speed `OFF/1/2/3/4/AUTO`.
    * Temperature display unit `°F/°C`.
  * Thermostat:
    * Power `ON/OFF`.
    * Operating mode `POWER OFF/HEAT/COOL/AUTO` - `POWER OFF, LOSSNAY, BYPASS, AUTO`.
    * Temperature display unit `°F/°C`.
  * Buttons:
    * For direct device control.
      * Power `ON/OFF`.
      * Operating mode `LOSSNAY/BYPASS/AUTO/NIGHT PURGE`.
      * Fan speed mode `AUTO/1/2/3/4`.
      * Presets `SET/UNSET`.
  * Sensors:
    * For automation and notifications.
      * Power `ON/OFF`.
      * Operating mode `LOSSNAY/BYPASS/AUTO/NIGHT PURGE`.
      * Fan speed mode `AUTO/1/2/3/4`.
      * Presets `ACTIV/UNACTIV`.
      * Room temperature.
      * Outdoor temperature.
      * Supply temperature.
      * Core maintenance.
      * Filter maintenance.
      * CO2 detected and level.
      * PM2.5 air quality and level.

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/homekit.png" width="382"></a>
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/settings.png" width="135"></a> <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/settings1.png" width="135"></a>
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/settings2.png" width="135"></a>
</p>

### Configuration

* Run this plugin as a [Child Bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) (Highly Recommended), this prevent crash Homebridge if plugin crashes.
* Install and use [Homebridge Config UI X](https://github.com/homebridge/homebridge-config-ui-x/wiki) to configure this plugin (Highly Recommended).
* The `sample-config.json` can be edited and used as an alternative.
* Be sure to always make a backup copy of your config.json file before making any changes to it.

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/ustawienia.png" width="840"></a>
</p>

| Key | Description |
| --- | --- |
| `name` | Here set the own account name. |
| `user` | Here set the MELCloud username. |
| `passwd` | Here set the MELCloud password. |
| `language` | Here select the MELCloud language. |
| `ataDisplayMode` | Here select main control mode `Heater/Cooler`, `Thermostat`. |
| `ataTemperatureSensor` | This enable extra temperature sensors to use with automations in HomeKit app. |
| `ataDisableAutoMode` | This will disable `Auto` mode even this mode is supported by device. |
| `ataDisableHeatMode` | This will disable `Heat` mode even this mode is supported by device. |
| `ataAutoHeatMode` | Here select operation mode for `Auto/Heat`, if `Auto`, `Heat` or both modes are not supported by device will be used selected modes instead. |
| `ataPresets` | This enable display Air Conditioner presets in HomeKit app. |
| `ataButtons.name` | Here set `Button Name` which You want expose to the `Homebridge/HomeKit`. |
| `ataButtons.mode` | Here select button mode, VH - Vane Horizontal, VV - Vane Horizontal. |
| `ataButtons.displayType` | Here select display type in HomeKit app, possible `None/Disabled`, `Outlet`, `Switch`, `Motion Sensor`, `Occupancy Sensor`, `Contact Sensor`.|
| `ataButtons.namePrefix` | Here enable/disable the accessory name as a prefix for button/sensor name.|
| `atwDisplayMode` | Here select main control mode `Heater/Cooler`, `Thermostat`. |
| `atwTemperatureSensor` | This enable extra temperature sensors to use with automations in HomeKit app. |
| `atwPresets` | This enable display Heat Pump presets in HomeKit app. |
| `atwButtons.name` | Here set `Button Name` which You want expose to the `Homebridge/HomeKit`. |
| `atwButtons.mode` | Here select button mode. |
| `atwButtons.displayType` | Here select display type in HomeKit app, possible `None/Disabled`, `Outlet`, `Switch`, `Motion Sensor`, `Occupancy Sensor`, `Contact Sensor`.|
| `atwButtons.namePrefix` | Here enable/disable the accessory name as a prefix for button/sensor name.|
| `ervDisplayMode` | Here select main control mode `Heater/Cooler`, `Thermostat`. |
| `ervTemperatureSensor` | This enable extra temperature sensors to use with automations in HomeKit app. |
| `ervPresets` | This enable display EnergyRecovery Ventilation presets in HomeKit app. |
| `ervButtons.name` | Here set `Button Name` which You want expose to the `Homebridge/HomeKit`. |
| `ervButtons.mode` | Here select button mode. |
| `ervButtons.displayType` | Here select display type in HomeKit app, possible `None/Disabled`, `Outlet`, `Switch`, `Motion Sensor`, `Occupancy Sensor`, `Contact Sensor`.|
| `ervButtons.namePrefix` | Here enable/disable the accessory name as a prefix for button/sensor name.|
| `refreshInterval` | Here set the background devices state refresh time in (sec), default `120s`. |
| `enableDebugMode` | This enable deep log in homebridge console. |
| `disableLogInfo` | This disable display log values and states on every it change. |
| `disableLogDeviceInfo` | This disable display log device info on plugin start. |
| `enableRestFul` | If enabled, RESTful server will start automatically and respond to any path request. |
| `restFulDebug` | If enabled, deep log will be present in homebridge console for RESTFul server. |
| `enableMqtt` | This enabled MQTT Broker and publish to it all available data. |
| `mqttDebug` | This enabled deep log in homebridge console for MQTT. |
| `mqttHost` | Here set the `IP Address` or `Hostname` for MQTT Broker. |
| `mqttPort` | Here set the `Port` for MQTT Broker, default 1883. |
| `mqttClientId` | Here optional set the `Client Id` for MQTT broker or leave empty. |
| `mqttPrefix` | Here set the `Prefix` for `Topic` or leave empty. |
| `mqttAuth` | This enabled MQTT Broker authorization credentials. |
| `mqttUser` | Here set the MQTT Broker user. |
| `mqttPasswd` | Here set the MQTT Broker password. |
| `Display Type Buttons` | 0 - `None/Disabled`, 1 - `Outlet`, 2 - `Switch`, 3 - `Motion Sensor`, 4 - `Occupancy Sensor`, 5 - `Contact Sensor`.|
