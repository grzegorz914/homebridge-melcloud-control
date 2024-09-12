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
| [Homebridge v2.0](https://github.com/homebridge/homebridge) | [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) | HomeKit Bridge | Required ab v3.0.0 |
| [Config UI X](https://github.com/homebridge/homebridge-config-ui-x) | [Config UI X Wiki](https://github.com/homebridge/homebridge-config-ui-x/wiki) | Homebridge Web User Interface | Required ab v3.0.0|
| [MELCloud](https://github.com/grzegorz914/homebridge-melcloud-control) | [Plug-In Wiki](https://github.com/grzegorz914/homebridge-melcloud-control/wiki) | Homebridge Plug-In | Required |

### About The Plugin

* All devices are detected automatically.
* Support multiple MELCloud accounts, buildings, floors, areas.
* Support temperature display units `Celsius/Fahrenheit`.
* Support assing inividual operating mode for `Heat/Cool/Auto`.
* Support direct `Presets` control using extra `Buttons`, switch it to `OFF` restore previous device state.
* Support direct `Functions` control using extra `Buttons`, switch it to `OFF` restore previous device state.
* Support detect all device states using extra `Sensors`.
* Support automations, shortcuts and Siri.
* Support external integrations, [RESTFul](https://github.com/grzegorz914/homebridge-melcloud-control?tab=readme-ov-file#restful-integration), [MQTT](https://github.com/grzegorz914/homebridge-melcloud-control?tab=readme-ov-file#mqtt-integration).

### Control Mode

* Air Conditioner:
  * Heater Cooler:
    * Power `ON/OFF`.
    * Operating mode `AUTO/HEAT/COOL/POWER OFF`.
    * Temperature `HEATING/COOLING/AUTO`.
    * Fan speed `OFF/1/2/3/4/5/AUTO`.
    * Swing mode `AUTO/SWING`.
    * Physical lock controls `LOCK/UNLOCK`.
    * Temperature display unit `°F/°C`.
  * Thermostat:
    * Power `ON/OFF`.
    * Operating mode `POWER OFF/HEAT/COOL/AUTO`.
    * Temperature `HEATING/COOLING/AUTO`.
    * Temperature display unit `°F/°C`.
    * Assign operating mode for `HEAT/AUTO`
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
      * Flow Temperature Zone 1, 2, Hot Water.
      * Return Temperature Zone 1, 2, Hot Water.
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

### Mode AUTO

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/auto.png" width="840"></a>
</p>

### Configuration

* Run this plugin as a [Child Bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) (Highly Recommended), this prevent crash Homebridge if plugin crashes.
* Install and use [Homebridge Config UI X](https://github.com/homebridge/homebridge-config-ui-x/wiki) to configure this plugin, required for version v3 and above.
* The `sample-config.json` can be edited and used as an alternative.

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/ustawienia.png" width="840"></a>
</p>

| Key | Description |
| --- | --- |
| `name` | Here set the own account name. |
| `user` | Here set the MELCloud username. |
| `passwd` | Here set the MELCloud password. |
| `language` | Here select the MELCloud language. |
| `ataDevices` | Array of ATA devices created automatically after login to MELCloud from plugin config UI. |
| `ataDevices.id` | Read only data, do not change it. |
| `ataDevices.type` | Read only data, do not change it. |
| `ataDevices.typeString` | Read only data, do not change it. |
| `ataDevices.name` | Here You can schange the `Accessory Name` which is exposed to the `Homebridge/HomeKit`. |
| `ataDevices.displayMode` | Here select device control mode `None/Disabled`, `Heater/Cooler`, `Thermostat`. |
| `ataDevices.heatDryFanMode` | Here select the operatiing mode for `Heat`, if this mode is not supported, it will be disabled. |
| `ataDevices.coolDryFanMode` | Here select the operatiing mode for `Cool`, if this mode is not supported, it will be disabled. |
| `ataDevices.autoDryFanMode` | Here select the operatiing mode for `Auto`, if this mode is not supported, it will be disabled.. |
| `ataDevices.temperatureSensor` | This enable extra `Room` temperature sensors to use with automations in HomeKit app. |
| `ataDevices.temperatureSensorOutdoor` | This enable extra `Outdoor` temperature sensors to use with automations in HomeKit app. |
| `ataDevices.presets` | Array of ATA device Presets created automatically after login to MELCloud from plugin config UI. |
| `ataDevices.presets.id` | Read only data, do not change it. |
| `ataDevices.presets.name` | Here You can schange the `Preset Name` which is exposed to the `Homebridge/HomeKit`. |
| `ataDevices.presets.displayType` | Here select display type in HomeKit, `0 - None/Disabled`, `1 - Outlet`, `2 - Switch`, `3 - Motion Sensor`, `4 - Occupancy Sensor`, `5 - Contact Sensor`. |
| `buttonsSensors` | Array of buttons sensors. |
| `buttonsSensors.name` | Here set `Button Name` which You want expose to the `Homebridge/HomeKit`. |
| `buttonsSensors.mode` | Here select button mode, VH - Vane Horizontal, VV - Vane Horizontal. |
| `buttonsSensors.displayType` | Here select display type in HomeKit, `0 - None/Disabled`, `1 - Outlet`, `2 - Switch`, `3 - Motion Sensor`, `4 - Occupancy Sensor`, `5 - Contact Sensor`. |
| `buttonsSensors.namePrefix` | Here enable/disable the accessory name as a prefix for button/sensor name. |
| `atwDevices` | Array of ATA devices created automatically after login to MELCloud from plugin config UI. |
| `atwDevices.id` | Read only data, do not change it. |
| `atwDevices.type` | Read only data, do not change it. |
| `atwDevices.typeString` | Read only data, do not change it. |
| `atwDevices.name` | Here You can schange the `Accessory Name` which is exposed to the `Homebridge/HomeKit`. |
| `atwDevices.displayMode` | Here select main control mode `None/Disabled`, `Heater/Cooler`, `Thermostat`. |
| `atwDevices.temperatureSensor` | This enable extra `Room` temperature sensors to use with automations in HomeKit app. |
| `atwDevices.temperatureSensorFlow` | This enable extra `Flow` temperature sensors to use with automations in HomeKit app. |
| `atwDevices.temperatureSensorReturn` | This enable extra `Return` temperature sensors to use with automations in HomeKit app. |
| `atwDevices.temperatureSensorFlowZone1` | This enable extra `Flow Zone 1` temperature sensors to use with automations in HomeKit app. |
| `atwDevices.temperatureSensorReturnZone1` | This enable extra `Return Zone 1` temperature sensors to use with automations in HomeKit app. |
| `atwDevices.temperatureSensorFlowWaterTank` | This enable extra `Flow Water Tank` temperature sensors to use with automations in HomeKit app. |
| `atwDevices.temperatureSensorReturnWaterTank` | This enable extra `Return Water Tank` temperature sensors to use with automations in HomeKit app. |
| `atwDevices.temperatureSensorFlowZone2` | This enable extra `Flow Zone 2` temperature sensors to use with automations in HomeKit app. |
| `atwDevices.temperatureSensorReturnZone2` | This enable extra `Return Zone 2` temperature sensors to use with automations in HomeKit app. |
| `atwDevices.presets` | Array of ATA device Presets created automatically after login to MELCloud from plugin config UI. |
| `atwDevices.presets.id` | Read only data, do not change it. |
| `atwDevices.presets.name` | Here You can schange the `Preset Name` which is exposed to the `Homebridge/HomeKit`. |
| `atwDevices.presets.displayType` | Here select display type in HomeKit, `0 - None/Disabled`, `1 - Outlet`, `2 - Switch`, `3 - Motion Sensor`, `4 - Occupancy Sensor`, `5 - Contact Sensor`. |
| `buttonsSensors` | Array of buttons sensors. |
| `buttonsSensors.name` | Here set `Button Name` which You want expose to the `Homebridge/HomeKit`. |
| `buttonsSensors.mode` | Here select button mode. |
| `buttonsSensors.displayType` | Here select display type in HomeKit, `0 - None/Disabled`, `1 - Outlet`, `2 - Switch`, `3 - Motion Sensor`, `4 - Occupancy Sensor`, `5 - Contact Sensor`. |
| `buttonsSensors.namePrefix` | Here enable/disable the accessory name as a prefix for button/sensor name. |
| `ervDevices` | Array of ATA devices created automatically after login to MELCloud from plugin config UI. |
| `ervDevices.id` | Read only data, do not change it. |
| `ervDevices.type` | Read only data, do not change it. |
| `ervDevices.typeString` | Read only data, do not change it. |
| `ervDevices.name` | Here You can schange the `Accessory Name` which is exposed to the `Homebridge/HomeKit`. |
| `ervDevices.displayMode` | Here select main control mode `None/Disabled`, `Heater/Cooler`, `Thermostat`. |
| `ervDevices.temperatureSensor` | This enable extra `Room` temperature sensors to use with automations in HomeKit app. |
| `ervDevices.temperatureSensorOutdoor` | This enable extra `Outdoor` temperature sensors to use with automations in HomeKit app. |
| `ervDevices.temperatureSensorSupply` | This enable extra `Supply` temperature sensors to use with automations in HomeKit app. |
| `ervDevices.presets` | Array of ATA device Presets created automatically after login to MELCloud from plugin config UI. |
| `ervDevices.presets.id` | Read only data, do not change it. |
| `ervDevices.presets.name` | Here You can schange the `Preset Name` which is exposed to the `Homebridge/HomeKit`. |
| `ervDevices.presets.displayType` | Here select display type in HomeKit, `0 - None/Disabled`, `1 - Outlet`, `2 - Switch`, `3 - Motion Sensor`, `4 - Occupancy Sensor`, `5 - Contact Sensor`. |
| `buttonsSensors` | Array of buttons sensors. |
| `buttonsSensors.name` | Here set `Button Name` which You want expose to the `Homebridge/HomeKit`. |
| `buttonsSensors.mode` | Here select button mode. |
| `buttonsSensors.displayType` | Here select display type in HomeKit, `0 - None/Disabled`, `1 - Outlet`, `2 - Switch`, `3 - Motion Sensor`, `4 - Occupancy Sensor`, `5 - Contact Sensor`. |
| `buttonsSensors.namePrefix` | Here enable/disable the accessory name as a prefix for button/sensor name. |
| `refreshInterval` | Here set the background account data refresh time in (sec), default `120s`. |
| `deviceRefreshInterval` | Here set the background devices state refresh time in (sec), default `5s`. |
| `enableDebugMode` | This enable deep log in homebridge console. |
| `disableLogInfo` | This disable display log values and states on every it change. |
| `disableLogDeviceInfo` | This disable display log device info on plugin start. |
| `restFul` | This is RSTful server. |
| `restFul.enable` | If enabled, RESTful server will start automatically and respond to any path request. |
| `restFul.port` | Here set the listening `Port` for RESTful server. |
| `restFul.debug` | If enabled, deep log will be present in homebridge console for RESTFul server. |
| `mqtt` | This is MQTT Broker. |
| `mqtt.enable` | If enabled, MQTT Broker will start automatically and publish all awailable PV data. |
| `mqtt.host` | Here set the `IP Address` or `Hostname` for MQTT Broker. |
| `mqtt.port` | Here set the `Port` for MQTT Broker, default 1883. |
| `mqtt.clientId` | Here optional set the `Client Id` of MQTT Broker. |
| `mqtt.prefix` | Here set the `Prefix` for `Topic` or leave empty. |
| `mqtt.auth` | If enabled, MQTT Broker will use authorization credentials. |
| `mqtt.user` | Here set the MQTT Broker user. |
| `mqtt.passwd` | Here set the MQTT Broker password. |
| `mqtt.debug` | If enabled, deep log will be present in homebridge console for MQTT. |

### RESTful Integration

* Port: last 4 numbers of `device Id`, displayed in HB log during start.
* POST data as a JSON Object `{OperationMode: 8}`

| Method | URL | Path | Response | Type |
| --- | --- | --- | --- | --- |
| GET | `http//ip:port` | `Info`, `State` | `{"Power": true, "SetTemperature": 21.5}` | JSON object. |

| Method | URL | Key | Value | Type | Description |
| --- | --- | --- | --- | --- | --- |
| Air Conditioner |     |     |     |      |      |
| POST | `http//ip:port` | `Power` | `true`, `false` | boolean | Power state. |
|     | `http//ip:port` | `HideVaneControls` | `true`, `false` | boolean | Hide vane controls. |
|     | `http//ip:port` | `HideDryModeControl` | `true`, `false` | boolean | Hide dry mode control. |
|     | `http//ip:port` | `ProhibitSetTemperature` | `true`, `false` | boolean | Lock set temperature. |
|     | `http//ip:port` | `ProhibitOperationMode` | `true`, `false` | boolean | Lock set operating mode. |
|     | `http//ip:port` | `ProhibitPower` | `true`, `false` | boolean | Lock set power. |
|     | `http//ip:port` | `OperationMode` | `1 - Heat`, `2 - Dry`, `3 - Cool`, `7 - Fan`, `8 - Auto` | integer | Operating mode. |
|     | `http//ip:port` | `FanSpeed` | `0 - Auto`, `1`, `2`, `3`, `4`, `5`, `6` | integer | Fan speed. |
|     | `http//ip:port` | `VaneHorizontalDirection` | `0`, `1`, `2`, `3`, `4`, `5`, `8 - Split`, `12 - Swing` | integer | Vane H mode. |
|     | `http//ip:port` | `VaneVerticalDirection` | `0`, `1`, `2`, `3`, `4`, `5`, `7 - Swing` | integer | Vane V mode. |
|     | `http//ip:port` | `SetTemperature` | `0.0` | float | Room temperature. |
|     | `http//ip:port` | `DefaultCoolingSetTemperature` | `0.0` | float | Default cooling temperature. |
|     | `http//ip:port` | `DefaultHeatingSetTemperature` | `0.0` | float | Default heating temperature. |
| Heat Pump |     |     |     |      |     |
| POST | `http//ip:port` | `Power` | `true`, `false` | boolean | Power state. |
|     | `http//ip:port` | `ForcedHotWaterMode` | `true`, `false` | boolean | Force hot water. |
|     | `http//ip:port` | `EcoHotWater` | `true`, `false` | boolean | Eco hot water. |
|     | `http//ip:port` | `HolidayMode` | `true`, `false` | boolean | Holiday mode. |
|     | `http//ip:port` | `ProhibitZone1` | `true`, `false` | boolean | Lock control zone 1. |
|     | `http//ip:port` | `ProhibitZone2` | `true`, `false` | boolean | Lock control zone 2. |
|     | `http//ip:port` | `ProhibitHotWater` | `true`, `false` | boolean | Lock control hot water. |
|     | `http//ip:port` | `OperationMode` | `0 - Auto`, `1 - Heat`, `2 - Cool` | integer | Operating mode heat pump. |
|     | `http//ip:port` | `OperationModeZone1` | `0 - Heat Thermostat`, `1 - Heat Flow`, `2 - Heat Curve`, `3 - Cool Thermostat`, `4 - Cool Flow`, `5 - Flor Dry Up` | integer | Operating mode zone 1. |
|     | `http//ip:port` | `OperationModeZone2` | `0 - Heat Thermostat`, `1 - Heat Flow`, `2 - Heat Curve`, `3 - Cool Thermostat`, `4 - Cool Flow`, `5 - Flor Dry Up` | integer | Operating mode zone 2. |
|     | `http//ip:port` | `SetTemperatureZone1` | `0.0` | float | Temperature zone 1. |
|     | `http//ip:port` | `SetTemperatureZone2` | `0.0` | float | Temperature zone 2. |
|     | `http//ip:port` | `SetHeatFlowTemperatureZone1` | `0.0` | float | Heat flow temperature zone 1. |
|     | `http//ip:port` | `SetHeatFlowTemperatureZone2` | `0.0` | float | Heat flow temperature zone 2. |
|     | `http//ip:port` | `SetCoolFlowTemperatureZone1` | `0.0` | float | Cool flow temperature zone 1. |
|     | `http//ip:port` | `SetCoolFlowTemperatureZone2` | `0.0` | float | Cool flow temperature zone 2. |
|     | `http//ip:port` | `SetTankWaterTemperature` | `0.0` | float | Hot water temperature. |
| Energy Recovery Ventilation |     |     |     |      |     |
| POST | `http//ip:port` | `Power` | `true`, `false` | boolean | Power state. |
|     | `http//ip:port` | `NightPurgeMode` | `true`, `false` | boolean | Night purge mode. |
|     | `http//ip:port` | `HideRoomTemperature` | `true`, `false` | boolean | Hide room temperature. |
|     | `http//ip:port` | `HideSupplyTemperature` | `true`, `false` | boolean | Hide supply temperature. |
|     | `http//ip:port` | `HideOutdoorTemperature` | `true`, `false` | boolean | Hide outdoor temperature. |
|     | `http//ip:port` | `OperationMode` | `1 - Heat`, `3 - Cool`, `7 - Fan`, `8 - Auto` | integer | Operating mode. |
|     | `http//ip:port` | `VentilationMode` | `0 - Lossnay`, `1 - Bypass`, `2 - Auto` | integer | Ventilation mode. |
|     | `http//ip:port` | `SetFanSpeed` | `0 - Auto`, `1`, `2`, `3`, `4` | integer | Fan speed. |
|     | `http//ip:port` | `SetTemperature` | `0.0` | float | Room temperature. |
|     | `http//ip:port` | `DefaultCoolingSetTemperature` | `0.0` | float | Default cooling temperature. |
|     | `http//ip:port` | `DefaultHeatingSetTemperature` | `0.0` | float | Default heating temperature. |

### MQTT Integration

* Subscribe data as a JSON Object `{"Power": true}`

| Direction | Topic | Message | Type |
| --- | --- | --- | --- |
|  Publish   | `Info`, `State` | `{"Power": true, "SetTemperature": 21.5}` | JSON object. |

| Method | Topic | Key | Value | Type | Description |
| --- | --- | --- | --- | --- | --- |
| Air Conditioner |     |     |     |      |      |
| Subscribe | `Set` | `Power` | `true`, `false` | boolean | Power state. |
|     | `Set` | `HideVaneControls` | `true`, `false` | boolean | Hide vane controls. |
|     | `Set` | `HideDryModeControl` | `true`, `false` | boolean | Hide dry mode control. |
|     | `Set` | `ProhibitSetTemperature` | `true`, `false` | boolean | Lock set temperature. |
|     | `Set` | `ProhibitOperationMode` | `true`, `false` | boolean | Lock set operating mode. |
|     | `Set` | `ProhibitPower` | `true`, `false` | boolean | Lock set power. |
|     | `Set` | `OperationMode` | `1 - Heat`, `2 - Dry`, `3 - Cool`, `7 - Fan`, `8 - Auto` | integer | Operating mode. |
|     | `Set` | `FanSpeed` | `0 - Auto`, `1`, `2`, `3`, `4`, `5`, `6` | integer | Fan speed. |
|     | `Set` | `VaneHorizontalDirection` | `0`, `1`, `2`, `3`, `4`, `5`, `8 - Split`, `12 - Swing` | integer | Vane H mode. |
|     | `Set` | `VaneVerticalDirection` | `0`, `1`, `2`, `3`, `4`, `5`, `7 - Swing` | integer | Vane V mode. |
|     | `Set` | `SetTemperature` | `0.0` | float | Room temperature. |
|     | `Set` | `DefaultCoolingSetTemperature` | `23.0` | float | Default cooling temperature. |
|     | `Set` | `DefaultHeatingSetTemperature` | `21.0` | float | Default heating temperature. |
| Heat Pump |     |     |     |      |     |
| Subscribe | `Set` | `Power` | `true`, `false` | boolean | Power state. |
|     | `Set` | `ForcedHotWaterMode` | `true`, `false` | boolean | Force hot water. |
|     | `Set` | `EcoHotWater` | `true`, `false` | boolean | Eco hot water. |
|     | `Set` | `HolidayMode` | `true`, `false` | boolean | Holiday mode. |
|     | `Set` | `ProhibitZone1` | `true`, `false` | boolean | Lock control zone 1. |
|     | `Set` | `ProhibitZone2` | `true`, `false` | boolean | Lock control zone 2. |
|     | `Set` | `ProhibitHotWater` | `true`, `false` | boolean | Lock control hot water. |
|     | `Set` | `OperationMode` | `0 - Auto`, `1 - Heat`, `2 - Cool` | integer | Operating mode heat pump. |
|     | `Set` | `OperationModeZone1` | `0 - Heat Thermostat`, `1 - Heat Flow`, `2 - Heat Curve`, `3 - Cool Thermostat`, `4 - Cool Flow`, `5 - Flor Dry Up` | integer | Operating mode zone 1. |
|     | `Set` | `OperationModeZone2` | `0 - Heat Thermostat`, `1 - Heat Flow`, `2 - Heat Curve`, `3 - Cool Thermostat`, `4 - Cool Flow`, `5 - Flor Dry Up` | integer | Operating mode zone 2. |
|     | `Set` | `SetTemperatureZone1` | `0.0` | float | Temperature zone 1. |
|     | `Set` | `SetTemperatureZone2` | `0.0` | float | Temperature zone 2. |
|     | `Set` | `SetHeatFlowTemperatureZone1` | `0.0` | float | Heat flow temperature zone 1. |
|     | `Set` | `SetHeatFlowTemperatureZone2` | `0.0` | float | Heat flow temperature zone 2. |
|     | `Set` | `SetCoolFlowTemperatureZone1` | `0.0` | float | Cool flow temperature zone 1. |
|     | `Set` | `SetCoolFlowTemperatureZone2` | `0.0` | float | Cool flow temperature zone 2. |
|     | `Set` | `SetTankWaterTemperature` | `0.0` | float | Hot water temperature. |
| Energy Recovery Ventilation |     |     |     |      |     |
| Subscribe | `Set` | `Power` | `true`, `false` | boolean | Power state. |
|     | `Set` | `NightPurgeMode` | `true`, `false` | boolean | Night purge mode. |
|     | `Set` | `HideRoomTemperature` | `true`, `false` | boolean | Hide room temperature. |
|     | `Set` | `HideSupplyTemperature` | `true`, `false` | boolean | Hide supply temperature. |
|     | `Set` | `HideOutdoorTemperature` | `true`, `false` | boolean | Hide outdoor temperature. |
|     | `Set` | `OperationMode` | `1 - Heat`, `3 - Cool`, `7 - Fan`, `8 - Auto` | integer | Operating mode. |
|     | `Set` | `VentilationMode` | `0 - Lossnay`, `1 - Bypass`, `2 - Auto` | integer | Ventilation mode. |
|     | `Set` | `SetFanSpeed` | `0 - Auto`, `1`, `2`, `3`, `4` | integer | Fan speed. |
|     | `Set` | `SetTemperature` | `0.0` | float | Room temperature. |
|     | `Set` | `DefaultCoolingSetTemperature` | `23.0` | float | Default cooling temperature. |
|     | `Set` | `DefaultHeatingSetTemperature` | `21.0` | float | Default heating temperature. |
