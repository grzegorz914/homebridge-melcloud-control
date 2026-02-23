<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/homebridge-melcloud-control.png" width="540"></a>
</p>

<span align="center">

# MELCloud Control

[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://shields.io/npm/dt/homebridge-melcloud-control?color=purple)](https://www.npmjs.com/package/homebridge-melcloud-control)
[![npm](https://shields.io/npm/v/homebridge-melcloud-control?color=purple)](https://www.npmjs.com/package/homebridge-melcloud-control)
[![npm](https://img.shields.io/npm/v/homebridge-melcloud-control/beta.svg?style=flat-square)](https://www.npmjs.com/package/homebridge-melcloud-control)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-melcloud-control.svg)](https://github.com/grzegorz914/homebridge-melcloud-control/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-melcloud-control.svg)](https://github.com/grzegorz914/homebridge-melcloud-control/issues)

<a href="https://buycoffee.to/grzegorz914" target="_blank"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/buycoffee-button.png" style="width: 234px; height: 61px" alt="Supports My Work"></a> <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/QR_buycoffee.png" width="61"></a>

</span>

## Package Requirements

| Package | Installation | Role | Required |
| --- | --- | --- | --- |
| [Homebridge v2.0.0](https://github.com/homebridge/homebridge) | [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) | HomeKit Bridge | Required |
| [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x) | [Homebridge UI Wiki](https://github.com/homebridge/homebridge-config-ui-x/wiki) | Homebridge User Interface | Required plugin |
| [MELCloud](https://github.com/grzegorz914/homebridge-melcloud-control) | [Plug-In Wiki](https://github.com/grzegorz914/homebridge-melcloud-control/wiki) | Plug-In | Required |

## Warning

* For plugin < v4.6.0 use Homebridge UI <= v5.5.0.
* For plugin >= v4.6.0 use Homebridge UI >= v5.13.0.

### About The Plugin

* Support:
  * Devices connected to MELCloud or MELCloud Home.
  * Multiple accounts, buildings, floors, areas.
  * Temperature display units `Celsius/Fahrenheit`.
  * Assing individual operating mode for `Heat/Cool/Auto`.
  * Presets, only MELCloud.
  * Scenes, only MELCloud Home.
  * Frost protection, only MELCloud Home.
  * Overheat Protection, only MELCloud Home.
  * Holiday Mode, only MELCloud Home.
  * Physical lock controls `LOCK/UNLOCK`, only MELCloud.
  * Functions, using extra `Buttons`, switch to `OFF` restore previous state.
  * Automations, shortcuts and Siri.
  * External integrations, [RESTFul](https://github.com/grzegorz914/homebridge-melcloud-control?tab=readme-ov-file#restful-integration), [MQTT](https://github.com/grzegorz914/homebridge-melcloud-control?tab=readme-ov-file#mqtt-integration).
* Control devices over local network You need use ESP module and [Tasmota Control](https://github.com/grzegorz914/homebridge-tasmota-control) plugin.

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
  * Buttons:
    * For direct device control.
      * Power `ON/OFF`.
      * Operating mode `HEAT/DRY/COOL/FAN/AUTO`.
      * Physical lock controls `LOCK/UNLOCK`
      * Vane H mode `AUTO/1/2/3/4/5/SPLIT/SWING`.
      * Vane V mode `AUTO/1/2/3/4/5/SWING`.
      * Fan speed mode `AUTO/1/2/3/4/5`.
      * Preset `SET/UNSET`
      * Frost protection `ON/OFF/MINTEMP/MAXTEMP`.
      * Overheat protection `ON/OFF/MINTEMP/MAXTEMP`.
      * Holiday mode `ON/OFF`.
      * Schedules `ON/OFF`.
      * Scene `ON/OFF`.
  * Sensors:
    * For automation and notifications.
      * Power `ON/OFF`.
      * Operating mode `HEAT/DRY/COOL/FAN/AUTO`.
      * Physical lock controls `LOCK/UNLOCK`.
      * Vane H mode `AUTO/1/2/3/4/5/SPLIT/SWING`.
      * Vane V mode `AUTO/1/2/3/4/5/SWING`.
      * Fan speed mode `AUTO/1/2/3/4/5/`.
      * Preset `ACTIV/UNACTIV`.
      * Room temperature.
      * Outdoor temperature.
      * Frost protection.
      * Overheat protection.
      * Holiday mode.
      * Shedules control.
      * Shedule active.
      * Scene control.
      * In standby.
      * Is connected.
      * Error.
* Heat Pump:
  * Heater Cooler:
    * Heat Pump:
      * Power `ON/OFF`.
      * Operating mode `AUTO/HEAT/COOL` - `POWER OFF/ON/ON`.
      * Outdoor temperature `GET`.
      * Physical lock controls all Zones and Hot Water Tank `LOCK/UNLOCK`.
      * Temperature display unit `°F/°C`.
    * Zone 1 and 2:
      * Operating mode heat `AUTO/HEAT/COOL` - `CURVE/HEAT ROOM/HEAT FLOW`.
      * Operating mode cool `HEAT/COOL` - `FLOOR DRY UP/COOL ROOM/COOL FLOW`.
      * Temperature `HEATING/COOLING`.
      * Physical lock controls `LOCK/UNLOCK`.
    * Hot Water Tank:
      * Operating mode `AUTO/HEAT` - `AUTO/HEAT NOW`.
      * Temperature `SET/GET`.
      * Physical lock controls `LOCK/UNLOCK`.
  * Thermostat:
    * Heat Pump:
      * Power `ON/OFF`.
      * Operating mode `AUTO/HEAT/COOL` - `POWER OFF/ON/ON`.
      * Outdoor temperature `GET`.
      * Temperature display unit `°F/°C`.
    * Zone 1 and 2:
      * Operating mode heat `HEAT/COOL/AUTO` - `HEAT ROOM/HEAT FLOW/CURVE`.
      * Operating mode cool `HEAT/COOL/AUTO` - `COOL ROOM/COOL FLOW/FLOOR DRY UP`.
      * Temperature `HEATING/COOLING`.
    * Hot Water Tank:
      * Operating mode `HEAT/AUTO` - `HEAT NOW, AUTO`.
      * Temperature `SET/GET`.
  * Buttons:
    * For direct device control.
      * Power `ON/OFF`.
      * Operating mode `HEAT/COOL/CURVE/HOLIDAY/AUTO HOT WATER/ECO HOT WATER/FORCE HOT WATER`.
      * Physical lock controls `LOCK/UNLOCK`.
      * Preset `SET/UNSET`.
      * Frost protection `ON/OFF/MINTEMP/MAXTEMP`.
      * Holiday mode `ON/OFF`.
      * Schedules `ON/OFF`.
      * Scene `ON/OFF`.
  * Sensors:
    * For automation and notifications.
      * Power `ON/OFF`.
      * Operating mode `HEAT/COOL/CURVE/HOLIDAY/AUTO HOT WATER/ECO HOT WATER/FORCE HOT WATER`.
      * Physical lock controls `LOCK/UNLOCK`.
      * Preset `ACTIV/UNACTIV`.
      * Outdoor temperature.
      * Zone 1 temperature.
      * Zone 2 temperature.
      * Water tank temperature.
      * Flow Temperature Zone 1, 2, Hot Water.
      * Return Temperature Zone 1, 2, Hot Water.
      * Frost protection.
      * Holiday mode.
      * Shedules control.
      * Shedule active.
      * Scene control.
      * In standby.
      * Is connected.
      * Error.
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
      * Preset `SET/UNSET`.
      * Holiday mode `ON/OFF`.
      * Schedules `ON/OFF`.
      * Scene `ON/OFF`.
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
      * Holiday mode.
      * Shedules control.
      * Shedule active.
      * Scene control.
      * In standby.
      * Is connected.
      * Error.

### HOME app current device mode display

* In AUTO mode, the tile display current state based on current mode:
  * HEATING mode, th tile display current state as HEATING - orange
  * COOLING mode, the tile display current state as COOLING - blue
  * DRY mode, the tile display current state as IDLE - black
  * FAN mode, the tile display current state as IDLE - black
  * IDLE mode, the tile display current state as IDLE - black
  * INACTIVE mode, the tile display current state as INACTIVE - transparent

### AUTO Mode

* Heather/Cooler
  * In this mode we can set heathing threshold and cooling threshold temperature:
  * Target temperature is calculated as a middle value between `LO` and `HI` and the rest is calculated internally.
* Thermostat
  * In this mode we can set only target temperature:
  * Target temperature is send to device and calculated internally:
* Calculation method in device internally:  
  * If the room temperature `<` Heating Setpoint, the unit will be set to HEAT with a setpoint of 23°C.
  * In HEAT, if the room temperature `>` Heating Setpoint `+` 1°C, the unit will be set to FAN.
  * In FAN, if the room temperature `>` Cooling Setpoint, the unit will be set to COOL with a setpoint of 19°C.
  * In COOL, if the room temperature `<` Cooling Setpoint `-` 1°C, the unit will be set to FAN.
  * In FAN, if the room temperature `<` Heating Setpoint, the unit will be set to HEAT with a setpoint of 23°C.
* The image shows Heating Setpoint of 19°C and a Cooling Setpoint of 23°C.

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/auto.png" width="840"></a>
</p>

### Configuration

* Run this plugin as a [Child Bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) (Highly Recommended), this prevent crash Homebridge if plugin crashes.
* Install and use [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x/wiki) to configure this plugin.
* The `sample-config.json` can be edited and used as an alternative.

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/ustawienia.png" width="840"></a>
</p>

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/homekit.png" width="375"></a>
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/settings.png" width="132"></a>
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/settings1.png" width="132"></a>
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/settings2.png" width="132"></a>
</p>

| Key | Description |
| --- | --- |
| `name` | Here set the own account name. |
| `user` | Here set the account credential (username). |
| `passwd` | Here set the account credential (password). |
| `language` | Here select the account language. |
| `type` | Here select the account type `0 - None / Disabled`, `1 - MELCloud`, `2 - MELCloud Home`. |
| `ataDevices[]` | Array of ATA devices created automatically after login to MELCloud from plugin config UI. |
| `ataDevices[].id` | Read only data, do not change it. |
| `ataDevices[].type` | Read only data, do not change it. |
| `ataDevices[].name` | Here set Your own name `Accessory Name` which is exposed to the `Homebridge / HomeKit`. |
| `ataDevices[].displayType` | Here select device control mode `0 - None / Disabled`, `1 - Heater / Cooler`, `2 - Thermostat`. |
| `ataDevices[].heatDryFanMode` | Here select the operatiing mode for `Heat`, if this mode is not supported, it will be disabled. |
| `ataDevices[].coolDryFanMode` | Here select the operatiing mode for `Cool`, if this mode is not supported, it will be disabled. |
| `ataDevices[].autoDryFanMode` | Here select the operatiing mode for `Auto`, if this mode is not supported, it will be disabled.. |
| `ataDevices[].temperatureSensor` | This enable extra `Room` temperature sensor to use with HomeKit automations. |
| `ataDevices[].temperatureOutdoorSensor` | This enable extra `Outdoor` temperature sensor to use with HomeKit automations. |
| `ataDevices[].inStandbySensor` | This enable `In Standby Mode` sensor to use with HomeKit automations. |
| `ataDevices[].connectSensor` | This enable `Connect State` sensor to use with HomeKit automations. |
| `ataDevices[].errorSensor` | This enable `Error` sensor to use with HomeKit automations. |
| `ataDevices[].remoteRoomTemperatureSupport` | This enable support to update `Room Temperature` with `MQTT` or `RESTFul`. |
| `ataDevices[].frostProtectionSupport` | This enable extra `Frost Protection` control and sensors to use with HomeKit automations. |
| `ataDevices[].overheatProtectionSupport` | This enable extra `Overheat Protection` control and sensors to use with HomeKit automations. |
| `ataDevices[].holidayModeSupport` | This enable extra `Holiday Mode` control and sensors to use with HomeKit automations. |
| `ataDevices[].presets[]` | Array of ATA device `Presets` created automatically after login to MELCloud from plugin config UI. |
| `ataDevices[].presets[].id` | Read only data, do not change it. |
| `ataDevices[].presets[].name` | Here set Your own name `Preset Name` which is exposed to the `Homebridge / HomeKit`. |
| `ataDevices[].presets[].displayType` | Here select display type in HomeKit, `0 - None / Disabled`, `1 - Motion Sensor`, `2 - Occupancy Sensor`, `3 - Contact Sensor`, `4 - Switch + Motion Sensor`, `5 - Switch + Occupancy Sensor`, `6 - Switch + Contact Sensor`, `7 - Switch`. |
| `ataDevices[].schedules[]` | Array of ATA device `Schedules` created automatically after login to MELCloud Home from plugin config UI. |
| `ataDevices[].schedules[].id` | Read only data, do not change it. |
| `ataDevices[].schedules[].name` | Here set Your own name `Schedule Name` which is exposed to the `Homebridge / HomeKit`. |
| `ataDevices[].schedules[].displayType` | Here select display type in HomeKit, `0 - None / Disabled`, `1 - Motion Sensor`, `2 - Occupancy Sensor`, `3 - Contact Sensor`, `4 - Switch + Motion Sensor`, `5 - Switch + Occupancy Sensor`, `6 - Switch + Contact Sensor`, `7 - Switch`. |
| `ataDevices[].scenes[].id` | Read only data, do not change it. |
| `ataDevices[].scenes[].name` | Here set Your own name `Scene Name` which is exposed to the `Homebridge / HomeKit`. |
| `ataDevices[].scenes[].displayType` | Here select display type in HomeKit, `0 - None / Disabled`, `1 - Motion Sensor`, `2 - Occupancy Sensor`, `3 - Contact Sensor`, `4 - Switch + Motion Sensor`, `5 - Switch + Occupancy Sensor`, `6 - Switch + Contact Sensor`, `7 - Switch`. |
| `ataDevices[].buttonsSensors[]` | Array of buttons sensors. |
| `ataDevices[].buttonsSensors[].name` | Here set `Button Name` which You want expose to the `Homebridge / HomeKit`. |
| `ataDevices[].buttonsSensors[].mode` | Here select button mode, VH - Vane Horizontal, VV - Vane Horizontal. |
| `ataDevices[].buttonsSensors[].displayType` | Here select display type in HomeKit, `0 - None / Disabled`, `1 - Motion Sensor`, `2 - Occupancy Sensor`, `3 - Contact Sensor`, `4 - Switch + Motion Sensor`, `5 - Switch + Occupancy Sensor`, `6 - Switch + Contact Sensor`, `7 - Switch`. |
| `ataDevices[].buttonsSensors[].namePrefix` | Here enable the accessory name as a prefix for button / sensor name. |
| `atwDevices[]` | Array of ATA devices created automatically after login to MELCloud from plugin config UI. |
| `atwDevices[].id` | Read only data, do not change it. |
| `atwDevices[].type` | Read only data, do not change it. |
| `atwDevices[].name` | Here set Your own name `Accessory Name` which is exposed to the `Homebridge / HomeKit`. |
| `atwDevices[].displayType` | Here select main control mode `None / Disabled`, `Heater / Cooler`, `Thermostat`. |
| `atwDevices[].hideZone` | Here select which zone need to be hidden `None / Disabled`, `Heat Pump`, `Heat Pump / Zone 1`, `Heat Pump / Zone 1 / Hot Water`, `Heat Pump / Zone 1 / Zone 2`, `Heat Pump / Hot Water`,`Heat Pump / Hot Water / Zone 2`, `Heat Pump / Zone 2`, `Zone 1`, `Zone 1 / Hot Water`, `Zone 1 / Hot Water / Zone 2`, `Zone 1 / Zone 2`, `Hot Water`, `Hot Water / Zone 2`, `Zone 2`, `All`. |
| `atwDevices[].temperatureSensor` | This enable extra `Room` temperature sensor to use with HomeKit automations. |
| `atwDevices[].temperatureFlowSensor` | This enable extra `Flow` temperature sensor to use with HomeKit automations. |
| `atwDevices[].temperatureReturnSensor` | This enable extra `Return` temperature sensor to use with HomeKit automations. |
| `atwDevices[].temperatureFlowZone1Sensor` | This enable extra `Flow Zone 1` temperature sensor to use with HomeKit automations. |
| `atwDevices[].temperatureReturnZone1Sensor` | This enable extra `Return Zone 1` temperature sensor to use with HomeKit automations. |
| `atwDevices[].temperatureFlowWaterTankSensor` | This enable extra `Flow Water Tank` temperature sensor to use with HomeKit automations. |
| `atwDevices[].temperatureReturnWaterTankSensor` | This enable extra `Return Water Tank` temperature sensor to use with HomeKit automations. |
| `atwDevices[].temperatureFlowZone2Sensor` | This enable extra `Flow Zone 2` temperature sensor to use with HomeKit automations. |
| `atwDevices[].temperatureReturnZone2Sensor` | This enable extra `Return Zone 2` temperature sensor to use with HomeKit automations. |
| `atwDevices[].inStandbySensor` | This enable `In Standby Mode` sensor to use with HomeKit automations. |
| `atwDevices[].connectSensor` | This enable `Connect State` sensor to use with HomeKit automations. |
| `atwDevices[].errorSensor` | This enable `Error` sensors to use with HomeKit automations. |
| `atwDevices[].holidayModeSupport` | This enable extra `Holiday Mode` control and sensors to use with HomeKit automations. |
| `atwDevices[].presets[]` | Array of ATW device `Presets` created automatically after login to MELCloud from plugin config UI. |
| `atwDevices[].presets[].id` | Read only data, do not change it. |
| `atwDevices[].presets[].name` | Here set Your own name `Preset Name` which is exposed to the `Homebridge/HomeKit`. |
| `atwDevices[].presets[].displayType` | Here select display type in HomeKit, `0 - None/Disabled`, `1 - Motion Sensor`, `2 - Occupancy Sensor`, `3 - Contact Sensor`, `4 - Switch + Motion Sensor`, `5 - Switch + Occupancy Sensor`, `6 - Switch + Contact Sensor`, `7 - Switch`. |
| `atwDevices[].schedules[]` | Array of ATW device `Schedules` created automatically after login to MELCloud Home from plugin config UI. |
| `atwDevices[].schedules[].id` | Read only data, do not change it. |
| `atwDevices[].schedules[].name` | Here set Your own name `Schedule Name` which is exposed to the `Homebridge/HomeKit`. |
| `atwDevices[].schedules[].displayType` | Here select display type in HomeKit, `0 - None/Disabled`, `1 - Motion Sensor`, `2 - Occupancy Sensor`, `3 - Contact Sensor`, `4 - Switch + Motion Sensor`, `5 - Switch + Occupancy Sensor`, `6 - Switch + Contact Sensor`, `7 - Switch`. |
| `atwDevices[].scenes[].id` | Read only data, do not change it. |
| `atwDevices[].scenes[].name` | Here set Your own name `Scene Name` which is exposed to the `Homebridge/HomeKit`. |
| `atwDevices[].scenes[].displayType` | Here select display type in HomeKit, `0 - None/Disabled`, `1 - Motion Sensor`, `2 - Occupancy Sensor`, `3 - Contact Sensor`, `4 - Switch + Motion Sensor`, `5 - Switch + Occupancy Sensor`, `6 - Switch + Contact Sensor`, `7 - Switch`. |
| `atwDevices[].buttonsSensors[]` | Array of buttons sensors. |
| `atwDevices[].buttonsSensors[].name` | Here set `Button Name` which You want expose to the `Homebridge / HomeKit`. |
| `atwDevices[].buttonsSensors[].mode` | Here select button mode. |
| `atwDevices[].buttonsSensors[].displayType` | Here select display type in HomeKit, `0 - None / Disabled`, `1 - Motion Sensor`, `2 - Occupancy Sensor`, `3 - Contact Sensor`, `4 - Switch + Motion Sensor`, `5 - Switch + Occupancy Sensor`, `6 - Switch + Contact Sensor`, `7 - Switch`. |
| `atwDevices[].buttonsSensors[].namePrefix` | Here enable the accessory name as a prefix for button / sensor name. |
| `ervDevices[]` | Array of ATA devices created automatically after login to MELCloud from plugin config UI. |
| `ervDevices[].id` | Read only data, do not change it. |
| `ervDevices[].type` | Read only data, do not change it. |
| `ervDevices[].name` | Here set Your own name `Accessory Name` which is exposed to the `Homebridge / HomeKit`. |
| `ervDevices[].displayType` | Here select main control mode `None / Disabled`, `Heater / Cooler`, `Thermostat`. |
| `ervDevices[].temperatureSensor` | This enable extra `Room` temperature sensor to use with HomeKit automations. |
| `ervDevices[].temperatureOutdoorSensor` | This enable extra `Outdoor` temperature sensor to use with HomeKit automations. |
| `ervDevices[].temperatureSupplySensor` | This enable extra `Supply` temperature sensor to use with HomeKit automations. |
| `atwDevices[].inStandbySensor` | This enable `In Standby Mode` sensor to use with HomeKit automations. |
| `ervDevices[].connectSensor` | This enable `Connect State` sensor to use with HomeKit automations. |
| `ervDevices[].errorSensor` | This enable `Error` sensors to use with HomeKit automations. |
| `ervDevices[].holidayModeSupport` | This enable extra `Holiday Mode` control and sensors to use with HomeKit automations. |
| `ervDevices[].presets[]` | Array of ERV device `Presets` created automatically after login to MELCloud from plugin config UI. |
| `ervDevices[].presets[].id` | Read only data, do not change it. |
| `ervDevices[].presets[].name` | Here set Your own name `Preset Name` which is exposed to the `Homebridge / HomeKit`. |
| `ervDevices[].presets[].displayType` | Here select display type in HomeKit, `0 - None / Disabled`, `1 - Motion Sensor`, `2 - Occupancy Sensor`, `3 - Contact Sensor`, `4 - Switch + Motion Sensor`, `5 - Switch + Occupancy Sensor`, `6 - Switch + Contact Sensor`, `7 - Switch`. |
| `ervDevices[].schedules[]` | Array of ERV device `Schedules` created automatically after login to MELCloud Home from plugin config UI. |
| `ervDevices[].schedules[].id` | Read only data, do not change it. |
| `ervDevices[].schedules[].name` | Here set Your own name `Schedule Name` which is exposed to the `Homebridge / HomeKit`. |
| `ervDevices[].schedules[].displayType` | Here select display type in HomeKit, `0 - None / Disabled`, `1 - Motion Sensor`, `2 - Occupancy Sensor`, `3 - Contact Sensor`, `4 - Switch + Motion Sensor`, `5 - Switch + Occupancy Sensor`, `6 - Switch + Contact Sensor`, `7 - Switch`. |
| `ervDevices[].scenes[].id` | Read only data, do not change it. |
| `ervDevices[].scenes[].name` | Here set Your own name `Scene Name` which is exposed to the `Homebridge / HomeKit`. |
| `ervDevices[].scenes[].displayType` | Here select display type in HomeKit, `0 - None / Disabled`, `1 - Motion Sensor`, `2 - Occupancy Sensor`, `3 - Contact Sensor`, `4 - Switch + Motion Sensor`, `5 - Switch + Occupancy Sensor`, `6 - Switch + Contact Sensor`, `7 - Switch`. |
| `ervDevices[].buttonsSensors[]` | Array of buttons sensors. |
| `ervDevices[].buttonsSensors[].name` | Here set `Button Name` which You want expose to the `Homebridge / HomeKit`. |
| `ervDevices[].buttonsSensors[].mode` | Here select button mode. |
| `ervDevices[].buttonsSensors[].displayType` | Here select display type in HomeKit, `0 - None / Disabled`, `1 - Motion Sensor`, `2 - Occupancy Sensor`, `3 - Contact Sensor`, `4 - Switch + Motion Sensor`, `5 - Switch + Occupancy Sensor`, `6 - Switch + Contact Sensor`, `7 - Switch`. |
| `ervDevices[].buttonsSensors[].namePrefix` | Here enable the accessory name as a prefix for button / sensor name. |
| `refreshInterval` | Here set the background account data refresh time in (sec) , only for old MELCLoud, default `120s`. |
| `log{}` | Log object. |
| `log.deviceInfo` | This enable log device info will be displayed by every connections device to the network. |
| `log.success` | This enable success log will be displayed in console. |
| `log.info` | This enable info log will be displayed in console. |
| `log.warn` | This enable warn log will be displayed in console. |
| `log.error` | This enable error log will be displayed in console. |
| `log.debug` | This enable debug log will be displayed in console. |
| `restFul{}` | RSTful object. |
| `restFul.enable` | This enable RESTful server will start automatically and respond to any path request. |
| `mqtt{}` | MQTT object. |
| `mqtt.enable` | This enable MQTT Broker will start automatically and publish all awailable PV data. |
| `mqtt.host` | Here set the `IP Address` or `Hostname` for MQTT Broker. |
| `mqtt.port` | Here set the `Port` for MQTT Broker, default 1883. |
| `mqtt.clientId` | Here optional set the `Client Id` of MQTT Broker. |
| `mqtt.prefix` | Here set the `Prefix` for `Topic` or leave empty. |
| `mqtt.auth{}` | MQTT authorization object. |
| `mqtt.auth.enable` | Here enable authorization for MQTT Broker. |
| `mqtt.auth.user` | Here set the MQTT Broker user. |
| `mqtt.auth.passwd` | Here set the MQTT Broker password. |

### RESTful Integration

* Port:
  * MELCLoud, last 4 numbers of `device Id`, correct port is displayed in HB log during start.
  * MELCLoud Home, start at `30000`, correct port is displayed in HB log during start.
* POST data as a JSON Object `{OperationMode: 8}`.
* Header content type must be `application/json`.
* Path `status` response all available paths.

| Method | URL | Path | Response | Type |
| --- | --- | --- | --- | --- |
| GET | `http//ip:port` | `info`, `state` | `{"Power": true, "SetTemperature": 21.5}` | JSON object. |

| Method | URL | Key | Value | Type | Description |
| --- | --- | --- | --- | --- | --- |
| Air Conditioner |     |     |     |      |      |
| POST | `http//ip:port` | `Power` | `true`, `false` | boolean | Power state. |
|     | `http//ip:port` | `ProhibitSetTemperature` | `true`, `false` | boolean | Lock set temperature (Only MELCloud). |
|     | `http//ip:port` | `ProhibitOperationMode` | `true`, `false` | boolean | Lock set operating mode (Only MELCloud). |
|     | `http//ip:port` | `ProhibitPower` | `true`, `false` | boolean | Lock set power (Only MELCloud). |
|     | `http//ip:port` | `OperationMode` | `1 - Heat`, `2 - Dry`, `3 - Cool`, `7 - Fan`, `8 - Auto` | integer | Operating mode. |
|     | `http//ip:port` | `FanSpeed` | `0 - Auto`, `1`, `2`, `3`, `4`, `5`, `6` | integer | Fan speed. |
|     | `http//ip:port` | `VaneHorizontalDirection` | `0`, `1`, `2`, `3`, `4`, `5`, `8 - Split`, `12 - Swing` | integer | Vane H mode. |
|     | `http//ip:port` | `VaneVerticalDirection` | `0`, `1`, `2`, `3`, `4`, `5`, `7 - Swing` | integer | Vane V mode. |
|     | `http//ip:port` | `SetTemperature` | `0.0` | float | Room temperature. |
|     | `http//ip:port` | `DefaultCoolingSetTemperature` | `0.0` | float | Default cooling temperature. |
|     | `http//ip:port` | `DefaultHeatingSetTemperature` | `0.0` | float | Default heating temperature. |
|     | `http//ip:port` | `FrostProtection` | `true`, `false` | boolean | Frost protectin (Only MELCloud Home). |
|     | `http//ip:port` | `OverheatProtection` | `true`, `false` | boolean | Overheat protection (Only MELCloud Home). |
|     | `http//ip:port` | `Schedules` | `true`, `false` | boolean | Schedules (Only MELCloud Home). |
|     | `http//ip:port` | `HolidayMode` | `true`, `false` | boolean | Holiday mode. |
|     | `http//ip:port` | `RemoteRoomTemperature` | `23.0` | float | Remote room temperature. |
| Heat Pump |     |     |     |      |     |
| POST | `http//ip:port` | `Power` | `true`, `false` | boolean | Power state. |
|     | `http//ip:port` | `OperationModeZone1` | `0 - Heat Room`, `1 - Heat Flow`, `2 - Heat Curve`, `3 - Cool Room`, `4 - Cool Flow`, `5 - Flor Dry Up` | integer | Operating mode zone 1. |
|     | `http//ip:port` | `SetTemperatureZone1` | `0.0` | float | Temperature zone 1. |
|     | `http//ip:port` | `SetHeatFlowTemperatureZone1` | `0.0` | float | Heat flow temperature zone 1. |
|     | `http//ip:port` | `SetCoolFlowTemperatureZone1` | `0.0` | float | Cool flow temperature zone 1. |
|     | `http//ip:port` | `ProhibitZone1` | `true`, `false` | boolean | Lock control zone 1 (Only MELCloud). |
|     | `http//ip:port` | `ForcedHotWaterMode` | `true`, `false` | boolean | Force hot water. |
|     | `http//ip:port` | `EcoHotWater` | `true`, `false` | boolean | Eco hot water (Only MELCloud). |
|     | `http//ip:port` | `SetTankWaterTemperature` | `0.0` | float | Hot water temperature. |
|     | `http//ip:port` | `ProhibitHotWater` | `true`, `false` | boolean | Lock control hot water. |
|     | `http//ip:port` | `OperationModeZone2` | `0 - Heat Room`, `1 - Heat Flow`, `2 - Heat Curve`, `3 - Cool Room`, `4 - Cool Flow`, `5 - Flor Dry Up` | integer | Operating mode zone 2. |
|     | `http//ip:port` | `SetTemperatureZone2` | `0.0` | float | Temperature zone 2. |
|     | `http//ip:port` | `SetHeatFlowTemperatureZone2` | `0.0` | float | Heat flow temperature zone 2. |
|     | `http//ip:port` | `SetCoolFlowTemperatureZone2` | `0.0` | float | Cool flow temperature zone 2. |
|     | `http//ip:port` | `ProhibitZone2` | `true`, `false` | boolean | Lock control zone 2 (Only MELCloud). |
|     | `http//ip:port` | `FrostProtection` | `true`, `false` | boolean | Frost protectin (Only MELCloud Home). |
|     | `http//ip:port` | `Schedules` | `true`, `false` | boolean | Schedules (Only MELCloud Home). |
|     | `http//ip:port` | `HolidayMode` | `true`, `false` | boolean | Holiday mode. |
| Energy Recovery Ventilation |     |     |     |      |     |
| POST | `http//ip:port` | `Power` | `true`, `false` | boolean | Power state. |
|     | `http//ip:port` | `NightPurgeMode` | `true`, `false` | boolean | Night purge mode. |
|     | `http//ip:port` | `OperationMode` | `1 - Heat`, `3 - Cool`, `7 - Fan`, `8 - Auto` | integer | Operating mode. |
|     | `http//ip:port` | `VentilationMode` | `0 - Lossnay`, `1 - Bypass`, `2 - Auto` | integer | Ventilation mode. |
|     | `http//ip:port` | `SetFanSpeed` | `0 - Auto`, `1`, `2`, `3`, `4` | integer | Fan speed. |
|     | `http//ip:port` | `SetTemperature` | `0.0` | float | Room temperature. |
|     | `http//ip:port` | `DefaultCoolingSetTemperature` | `0.0` | float | Default cooling temperature. |
|     | `http//ip:port` | `DefaultHeatingSetTemperature` | `0.0` | float | Default heating temperature. |
|     | `http//ip:port` | `Schedules` | `true`, `false` | boolean | Schedules (Only MELCloud Home). |
|     | `http//ip:port` | `HolidayMode` | `true`, `false` | boolean | Holiday mode. |

### MQTT Integration

* Subscribe data as a JSON Object `{"Power": true}`

| Direction | Topic | Message | Type |
| --- | --- | --- | --- |
|  Publish   | `Info`, `State` | `{"Power": true, "SetTemperature": 21.5}` | JSON object. |

| Method | Topic | Key | Value | Type | Description |
| --- | --- | --- | --- | --- | --- |
| Air Conditioner |     |     |     |      |      |
| Subscribe | `Set` | `Power` | `true`, `false` | boolean | Power state. |
|     | `Set` | `ProhibitSetTemperature` | `true`, `false` | boolean | Lock set temperature (Only MELCloud). |
|     | `Set` | `ProhibitOperationMode` | `true`, `false` | boolean | Lock set operating mode (Only MELCloud). |
|     | `Set` | `ProhibitPower` | `true`, `false` | boolean | Lock set power (Only MELCloud). |
|     | `Set` | `OperationMode` | `1 - Heat`, `2 - Dry`, `3 - Cool`, `7 - Fan`, `8 - Auto` | integer | Operating mode. |
|     | `Set` | `FanSpeed` | `0 - Auto`, `1`, `2`, `3`, `4`, `5`, `6` | integer | Fan speed. |
|     | `Set` | `VaneHorizontalDirection` | `0`, `1`, `2`, `3`, `4`, `5`, `8 - Split`, `12 - Swing` | integer | Vane H mode. |
|     | `Set` | `VaneVerticalDirection` | `0`, `1`, `2`, `3`, `4`, `5`, `7 - Swing` | integer | Vane V mode. |
|     | `Set` | `SetTemperature` | `0.0` | float | Room temperature. |
|     | `Set` | `DefaultCoolingSetTemperature` | `23.0` | float | Default cooling temperature. |
|     | `Set` | `DefaultHeatingSetTemperature` | `21.0` | float | Default heating temperature. |
|     | `Set` | `FrostProtection` | `true`, `false` | boolean | Frost protectin (Only MELCloud Home). |
|     | `Set` | `OverheatProtection` | `true`, `false` | boolean | Overheat protection (Only MELCloud Home). |
|     | `Set` | `Schedules` | `true`, `false` | boolean | Schedules (Only MELCloud Home). |
|     | `Set` | `HolidayMode` | `true`, `false` | boolean | Holiday mode. |
|     | `Set` | `RemoteRoomTemperature` | `23.0` | float | Remote room temperature. |
| Heat Pump |     |     |     |      |     |
| Subscribe | `Set` | `Power` | `true`, `false` | boolean | Power state. |
|     | `Set` | `OperationModeZone1` | `0 - Heat Room`, `1 - Heat Flow`, `2 - Heat Curve`, `3 - Cool Room`, `4 - Cool Flow`, `5 - Flor Dry Up` | integer | Operating mode zone 1. |
|     | `Set` | `SetTemperatureZone1` | `0.0` | float | Temperature zone 1. |
|     | `Set` | `SetHeatFlowTemperatureZone1` | `0.0` | float | Heat flow temperature zone 1. |
|     | `Set` | `SetCoolFlowTemperatureZone1` | `0.0` | float | Cool flow temperature zone 1. |
|     | `Set` | `ProhibitZone1` | `true`, `false` | boolean | Lock control zone 1 (Only MELCloud). |
|     | `Set` | `ForcedHotWaterMode` | `true`, `false` | boolean | Force hot water. |
|     | `Set` | `EcoHotWater` | `true`, `false` | boolean | Eco hot water (Only MELCloud). |
|     | `Set` | `SetTankWaterTemperature` | `0.0` | float | Hot water temperature. |
|     | `Set` | `ProhibitHotWater` | `true`, `false` | boolean | Lock control hot water. |
|     | `Set` | `OperationModeZone2` | `0 - Heat Room`, `1 - Heat Flow`, `2 - Heat Curve`, `3 - Cool Room`, `4 - Cool Flow`, `5 - Flor Dry Up` | integer | Operating mode zone 2. |
|     | `Set` | `SetTemperatureZone2` | `0.0` | float | Temperature zone 2. |
|     | `Set` | `SetHeatFlowTemperatureZone2` | `0.0` | float | Heat flow temperature zone 2. |
|     | `Set` | `SetCoolFlowTemperatureZone2` | `0.0` | float | Cool flow temperature zone 2. |
|     | `Set` | `ProhibitZone2` | `true`, `false` | boolean | Lock control zone 2 (Only MELCloud). |
|     | `Set` | `FrostProtection` | `true`, `false` | boolean | Frost protectin (Only MELCloud Home). |
|     | `Set` | `Schedules` | `true`, `false` | boolean | Schedules (Only MELCloud Home). |
|     | `Set` | `HolidayMode` | `true`, `false` | boolean | Holiday mode. |
| Energy Recovery Ventilation |     |     |     |      |     |
| Subscribe | `Set` | `Power` | `true`, `false` | boolean | Power state. |
|     | `Set` | `NightPurgeMode` | `true`, `false` | boolean | Night purge mode. |
|     | `Set` | `OperationMode` | `1 - Heat`, `3 - Cool`, `7 - Fan`, `8 - Auto` | integer | Operating mode. |
|     | `Set` | `VentilationMode` | `0 - Lossnay`, `1 - Bypass`, `2 - Auto` | integer | Ventilation mode. |
|     | `Set` | `SetFanSpeed` | `0 - Auto`, `1`, `2`, `3`, `4` | integer | Fan speed. |
|     | `Set` | `SetTemperature` | `0.0` | float | Room temperature. |
|     | `Set` | `DefaultCoolingSetTemperature` | `23.0` | float | Default cooling temperature. |
|     | `Set` | `DefaultHeatingSetTemperature` | `21.0` | float | Default heating temperature. |
|     | `Set` | `Schedules` | `true`, `false` | boolean | Schedules (Only MELCloud Home). |
|     | `Set` | `HolidayMode` | `true`, `false` | boolean | Holiday mode. |
