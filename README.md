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
| [Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) | [Config UI X Wiki](https://github.com/oznu/homebridge-config-ui-x/wiki) | Homebridge Web User Interface | Recommended |
| [MELCloud](https://www.npmjs.com/package/homebridge-melcloud-control) | [Plug-In Wiki](https://github.com/grzegorz914/homebridge-melcloud-control/wiki) | Homebridge Plug-In | Required |

### About The Plugin
* All devices are detected automatically.
* Support multiple MELCloud accounts, buildings, flors, areas.
* Support temperature display units `Celsius/Fahrenheit`.
* Support control device `Presets`.
* Support automations, shortcuts and siri.
* Support direct device controll creating extra `Buttons`, appiled for all devices of same type in account.
* Support identify all states of device creating `Sensors`, appiled for all devices of same type in account.
* MQTT:
  * Publisch topic `Info`, `State` as payload JSON data.

### Control Mode
* Air Conditioner:
  * Heater Cooler:
    * Power `ON/OFF`.
    * Operating mode `AUTO/HEAT/COOL/POWER OFF`.
    * Heating/Cooling temperature. 
    * Fan speed `OFF/1/2/3/4/5/AUTO`.
    * Swing mode `AUTO/SWING`.
    * Physical lock controls `LOCK/UNLOCK`.
    * Change temperature unit `°F/°C`.
    * If `AUTO/HEAT` or both modes are not supported by device will use `DRY/FAN` or `FAN/DRY` modes instead.
  * Thermostat:
    * Power `ON/OFF`.
    * Operating mode `POWER OFF/HEAT/COOL/AUTO`.
    * Heating/Cooling temperature.
    * Change temperature unit `°F/°C`.
    * If `AUTO/HEAT` or both modes are not supported by device will use `DRY/FAN` or `FAN/DRY` modes instead.
  * Buttons:
    * Use to direct device control.
      * Power `ON/OFF`.
      * Operating mode `HEAT/DRY/COOL/FAN/AUTO`.
      * Physical lock controls `LOCK/UNLOCK`.
      * Vane H mode `AUTO/1/2/3/4/5/SWING`.
      * Vane V mode `AUTO/1/2/3/4/5/SWING`.
      * Fan speed mode `AUTO/1/2/3/4/5`.
      * Presets `SET/UNSET`.
  * Sensors:
    * Use with automations in HomeKit app.
      * Identify power `ON/OFF`.
      * Identify operating mode `HEAT/DRY/COOL/FAN/AUTO`.
      * Identify physical lock controls `LOCK/UNLOCK`.
      * Identify vane H mode `AUTO/1/2/3/4/5/SWING`.
      * Identify vane V mode `AUTO/1/2/3/4/5/SWING`.
      * Identify fan speed mode `AUTO/1/2/3/4/5/`.
      * Identify temperature change for `Heater/Cooler`.
      * Identify device presets. 
* Heat Pump:
  * Heater Cooler:
    * Heat Pump:
      * Power `ON/OFF`.
      * Operating mode `HEAT/COOL`.
      * Outdoor temperature `GET`.
      * Physical lock controls all Zones and Hot Water Tank `LOCK/UNLOCK`.
      * Change temperature unit `°F/°C`.
    * Zone 1 and 2:
      * Operating mode heat `AUTO/HEAT/COOL` - `CURVE/HEAT THERMOSTAT/HEAT FLOW`.
      * Operating mode cool `HEAT/COOL` - `COOL THERMOSTAT/COOL FLOW`.
      * Heating/Cooling temperature.
      * Physical lock controls `LOCK/UNLOCK`.
    * Hot Water Tank:
      * Operating mode `AUTO/HEAT` - `AUTO/HEAT NOW`.
      * Current/Target temperature.
      * Physical lock controls `LOCK/UNLOCK`.
  * Thermostat:
    * Heat Pump:
      * Power `ON/OFF`.
      * Operating mode `HEAT/COOL`.
      * Outdoor temperature `GET`.
    * Zone 1 and 2:
      * Operating mode heat `HEAT/COOL/AUTO` - `HEAT THERMOSTAT/HEAT FLOW/CURVE`.
      * Operating mode cool `HEAT/COOL` - `COOL THERMOSTAT/COOL FLOW`.
      * Heating/Cooling temperature.
    * Hot Water Tank:
      * Operating mode `HEAT/AUTO` - `HEAT NOW, AUTO`.
      * Current/Target temperature.
  * Buttons:
    * Use to direct device control.  
      * Power `ON/OFF`.
      * Operating mode `HEAT/COOL/CURVE/HOLIDAY/AUTO HOT WATER/ECO HOT WATER/FORCE HOT WATER`.
      * Physical lock controls `LOCK/UNLOCK`.
      * Presets `SET/UNSET`. 
  * Sensors:
    * Use with automations in HomeKit app. 
      * Identify power `ON/OFF`.
      * Identify operating mode `HEAT/COOL/CURVE/HOLIDAY/AUTO HOT WATER/ECO HOT WATER/FORCE HOT WATER`.
      * Identify physical lock controls `LOCK/UNLOCK`.
      * Identify temperature change for `Heater/Cooler`.
      * Identify device presets. 
* Energy Recovery Ventilation Lossnay:
  * Heater Cooler:
    * Power `ON/OFF`.
    * Operating mode `AUTO/HEAT/COOL/POWER OFF` - `AUTO, LOSSNAY, BYPAS, POWER OFF`.
    * Fan speed `OFF/1/2/3/4/AUTO`.
    * Physical lock controls `LOCK/UNLOCK`.
    * Change temperature unit `°F/°C`.
  * Thermostat:
    * Power `ON/OFF`.
    * Operating mode `POWER OFF/HEAT/COOL/AUTO` - `POWER OFF, LOSSNAY, BYPAS, AUTO`.
    * Change temperature unit `°F/°C`.
  * Buttons:
    * Use to direct device control.
      * Power `ON/OFF`.
      * Operating mode `LOSSNAY/BYPAS/AUTO/NIGHT PURGE`.
      * Physical lock controls `LOCK/UNLOCK`.
      * Fan speed mode `AUTO/1/2/3/4`.
      * Presets `SET/UNSET`.
  * Sensors:
    * Use with automations in HomeKit app.
      * Identify power `ON/OFF`.
      * Identify operating mode `LOSSNAY/BYPAS/AUTO/NIGHT PURGE`.
      * Identify physical lock controls `LOCK/UNLOCK`.
      * Identify fan speed mode `AUTO/1/2/3/4`.
      * Identify temperature change for `Heater/Cooler`.
      * Identify device presets. 
      * Core maintenance indication.
      * Filter maintenance indication.
      * CO2 detected and level.
      * PM2.5 air quality and level.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/homekit.png" width="382"></a> 
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/settings.png" width="135"></a> <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/settings1.png" width="135"></a>
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/settings2.png" width="135"></a>
</p>

### Configuration
* Run this plugin as a [Child Bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) (Highly Recommended), this prevent crash Homebridge if plugin crashes.
* Install and use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) to configure this plugin (Highly Recommended). 
* The `sample-config.json` can be edited and used manually as an alternative. 
* Be sure to always make a backup copy of your config.json file before making any changes to it.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/ustawienia.png" width="840"></a>
</p>

| Key | Description | 
| --- | --- |
| `name` | Here set the own account name. |
| `user` | Here set the MELCloud username. |
| `passwd` | Here set the MELCloud password. |
| `language` | Here select the MELCloud language. |
| `ataDisplayMode` | Here select main control mode `Heater/Cooler`, `Thermostat`. |
| `ataTemperatureSensore` | This enable extra temperature sensor for Heater/Cooler control mode to use with automations in HomeKit app. |
| `ataDisableAutoMode` | This will disable `Auto` mode even this mode is supported by device. |
| `ataDisableHeatMode` | This will disable `Heat` mode even this mode is supported by device. |
| `ataAutoHeatMode` | Here select operation mode for `Auto/Heat`, if `Auto`, `Heat` or both modes are not supported by device will be used selected modes instead. |
| `ataPresets` | This enable display Air Conditioner presets in HomeKit app. |
| `ataButtons.name` | Here set `Button Name` which You want expose to the `Homebridge/HomeKit`. | 
| `ataButtons.mode` | Here select button mode, VH - Vane Horizontal, VV - Vane Horizontal. |
| `ataButtons.displayType` | Here select display type in HomeKit app, possible `None/Disabled`, `Outlet`, `Switch`, `Motion Sensor`, `Occupancy Sensor`, `Contact Sensor`.|
| `atwDisplayMode` | Here select main control mode `Heater/Cooler`, `Thermostat`. |
| `atwTemperatureSensore` | This enable extra temperature sensor for Heater/Cooler control mode to use with automations in HomeKit app. |
| `atwPresets` | This enable display Heat Pump presets in HomeKit app. |
| `atwButtons.name` | Here set `Button Name` which You want expose to the `Homebridge/HomeKit`. | 
| `atwButtons.mode` | Here select button mode. |
| `atwButtons.displayType` | Here select display type in HomeKit app, possible `None/Disabled`, `Outlet`, `Switch`, `Motion Sensor`, `Occupancy Sensor`, `Contact Sensor`.|
| `ervDisplayMode` | Here select main control mode `Heater/Cooler`, `Thermostat`. |
| `ervTemperatureSensore` | This enable extra temperature sensor for Heater/Cooler control mode to use with automations in HomeKit app. |
| `ervPresets` | This enable display EnergyRecovery Ventilation presets in HomeKit app. |
| `ervButtons.name` | Here set `Button Name` which You want expose to the `Homebridge/HomeKit`. | 
| `ervButtons.mode` | Here select button mode. |
| `ervButtons.displayType` | Here select display type in HomeKit app, possible `None/Disabled`, `Outlet`, `Switch`, `Motion Sensor`, `Occupancy Sensor`, `Contact Sensor`.|
| `enableDebugMode` | This enable deep log in homebridge console. |
| `disableLogInfo` | This disable display log values and states on every it change. |
| `disableLogDeviceInfo` | This disable display log device info on plugin start. |
| `enableMqtt` | This enabled MQTT Broker and publish to it all awailable data. |
| `mqttDebug` | This enabled deep log in homebridge console for MQTT. |
| `mqttHost` | Here set the `IP Address` or `Hostname` for MQTT Broker. |
| `mqttPort` | Here set the `Port` for MQTT Broker, default 1883. |
| `mqttCientId` | Here optinal set the `clientId` for MQTT broker or leave empty. |
| `mqttPrefix` | Here set the `Prefix` for `Topic` or leave empty. |
| `mqttAuth` | This enabled MQTT Broker authorization credentials. |
| `mqttUser` | Here set the MQTT Broker user. |
| `mqttPasswd` | Here set the MQTT Broker password. |
| `Display Type Buttons` | -1 - `None/Disabled`, 0 - `Outlet`, 1 - `Switch`, 2 - `Motion Sensor`, 3 - `Occupancy Sensor`, 4 - `Contact Sensor`.|
