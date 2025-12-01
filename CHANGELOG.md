# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Important changes

- v0.1.x The old plugin and config need to be first removed from Homebridge and HomeKit and added again.
- v0.4.0 Main control mode, buttons and presets need to be configured again!!!
- v1 After update to v1 and above from v0 the devices need to be added to the Home app again and the old unresponsive remove!!! This devices will be removed from all automations and scenes!!!
- v2 After update to v2 from v1 only RESTFull and MQTT config settings need to be updated in config.
  - v2.4 and above require upcomming homebridge v2
- v3 After update to v3 the plugin need to be configured using Homebridge UI.
  - do not configure it manually, always using Homebridge UI
  - required Homebridge v2.0.0 and above
- v4 Added support for MELCloud Home.
  - v4.1 Changed accessory category for ATA devices, required add accessory to KomeKit again

## Warning

- Do not use Homebridge UI > v5.5.0 because of break config.json

# [4.3.9] - (01.12.2025)

## Changes

- stability and performance improvements
- fix vane H/V display wrong state
- cleanup

# [4.3.8] - (29.11.2025)

## Changes

- display warning if device is disabled in config
- display warning if device not exist in MELCLoud and is configured in config
- cleanup

# [4.3.7] - (28.11.2025)

## Changes

- fix operation mode FAN and AUTO for MELCloud Home ATA
- stability and performance improvements
- config schema updated
- cleanup

# [4.3.5] - (24.11.2025)

## Changes

- removed device refresh time settings
- stability and performance improvements
- redme updated
- cleanup

# [4.3.4] - (23.11.2025)

## Changes

- fix account monitoring start
- stability improvements
- cleanup

# [4.3.3] - (22.11.2025)

## Changes

- fix [#224](https://github.com/grzegorz914/homebridge-melcloud-control/issues/224)
- fix presets report wrong state
- fix schedules assign to the config
- stability improvements
- bump dependencies
- cleanup

# [4.3.2] - (21.11.2025)

## Changes

- stability improvements
- cleanup

# [4.3.0] - (20.11.2025)

## Changes

- use web socket for Real Time communication with MELCloud Home
- cleanup

# [4.2.8] - (18.11.2025)

## Changes

- added option to set only switch for presets, scenes, schedules or buttons
- readme updated
- cleanup

# [4.2.7] - (18.11.2025)

## Changes

- fix [#220](https://github.com/grzegorz914/homebridge-melcloud-control/issues/220)

# [4.2.6] - (18.11.2025)

## Changes

- stability improvements of RESTFul and MQTT start
- cleanup

# [4.2.5] - (17.11.2025)

## Changes

- fix device control stop working after some time
- fix device state not refresh
- updated presets, schedules and scenes characteristics
- stability and performance improvements
- config schema updated
- readme updated
- cleanup

## [4.2.3] - (15.11.2025)

## Changes

- added scenes support for MELCloud Home
- fix some issues
- stability and performance improvements
- config schema updated
- readme updated
- cleanup

## [4.2.2] - (14.11.2025)

## Changes

- added in standby mode sensor
- fix device control after some time
- added connect sensor
- config schema updated
- readme updated
- cleanup

## [4.2.1] - (13.11.2025)

## Changes

- RESTFul and MQTT update for MELCloud Home
- bump dependencies
- config schema updated
- readme updated
- cleanup

## [4.2.0] - (13.11.2025)

## Changes

- initial support for MELCloud Home ATW device
- added frost protection control for MELCloud Home ATA device
- added overheat protection control for MELCloud Home ATA device
- added holiday mode control MELCloud Home ATA, ERV, ATW devices
- config schema updated
- readme updated
- cleanup

## [4.1.2] - (11.11.2025)

## Changes

- fix [#218](https://github.com/grzegorz914/homebridge-melcloud-control/issues/218)
- added schedules support for MELCLoud Home ATA devices
- config schema updated
- readme updated
- cleanup

## [4.1.1] - (10.11.2025)

## Changes

- added shedule sensor for MELCLoud Home ATA devices
- config schema updated
- readme updated
- cleanup

## [4.1.0] - (10.11.2025)

## Changes

- changed accessory category for ATA devices, required add accessory to KomeKit again
- added frost protection sensor for MELCLoud Home ATA devices
- added overheat protection sensor for MELCLoud Home ATA devices
- added holiday mode sensor for MELCLoud Home ATA devices
- config schema updated
- readme updated
- cleanup

## [4.0.3] - (08.11.2025)

## Changes

- fix ATW and ERV for old MELCloud
- bump dependencies
- readme updated
- cleanup

## [4.0.2] - (06.11.2025)

## Changes

- fix RESTFul extrnal integration for MELCloud Home devices
- readme updated
- cleanup

## [4.0.1] - (06.11.2025)

## Changes

- fix start error for old MELCLoud after update
- bump dependencies
- redme updated
- cleanup

## [4.0.0] - (05.11.2025)

## Changes

- added support for MELCloud Home ATA devices [#215](https://github.com/grzegorz914/homebridge-melcloud-control/issues/215)
- added error sensor
- config schema updated
- redme updated
- cleanup

## [3.9.5] - (02.09.2025)

## Changes

- fix ERV start error

## [3.9.4] - (02.09.2025)

## Changes

- fix [#213](https://github.com/grzegorz914/homebridge-melcloud-control/issues/213)

## [3.9.0] - (18.08.2025)

## Changes

- Config UI CONECT TO MELCLOUD updated
  - automayically remove devices not existed in melcloud
  - show/hide password

- cleanup

## [3.8.14] - (26.06.2025)

## Changes

- fix [#199](https://github.com/grzegorz914/homebridge-melcloud-control/issues/199)
- fix [#205](https://github.com/grzegorz914/homebridge-melcloud-control/issues/205)
- RESTFul code refactor

## [3.8.13] - (26.06.2025)

## Changes

- fix [#206](https://github.com/grzegorz914/homebridge-melcloud-control/issues/206)

## [3.8.6] - (24.05.2025)

## Changes

- fix [#200](https://github.com/grzegorz914/homebridge-melcloud-control/issues/200)
- cleanup

## [3.8.5] - (24.05.2025)

## Changes

- fix [#199](https://github.com/grzegorz914/homebridge-melcloud-control/issues/199)
- cleanup

## [3.8.3] - (20.05.2025)

## Changes

- fix [#198](https://github.com/grzegorz914/homebridge-melcloud-control/issues/198)
- cleanup

## [3.8.1] - (10.05.2025)

## Changes

- fix temperature sensors
- cleanup

## [3.8.0] - (05.05.2025)

## Changes

- add possibility to hide individual zone accessory in Home app for ATW device, solved[#194](https://github.com/grzegorz914/homebridge-melcloud-control/issues/194)
- publish sensors independent from hiden zones for ATW devices
- stability and performance improvements
- bump dependencies
- config schema updated
- redme updated
- cleanup

## [3.7.5] - (25.03.2025)

## Changes

- fix[#192](https://github.com/grzegorz914/homebridge-melcloud-control/issues/192), thanks @helloabunai

## [3.7.3] - (15.03.2025)

## Changes

- updated Homebridge UI interface

## [3.7.1] - (14.03.2025)

## Changes

- removed possibility to disable indyvidual accessory due to duplicated function with displayMode

## [3.7.0] - (13.03.2025)

## Changes

- added possibility to disable indyvidual accessory
- bump dependencies
- config schema updated
- redme updated
- cleanup

## [3.6.9] - (28.02.2025)

## Changes

- fix[#191](https://github.com/grzegorz914/homebridge-melcloud-control/issues/191)
- cleanup

## [3.6.7] - (26.02.2025)

## Changes

- bump dependencies
- cleanup
- redme update

## [3.6.6] - (25.02.2025)

## Changes

- fix [#190](https://github.com/grzegorz914/homebridge-melcloud-control/issues/190)

## [3.6.4] - (09.02.2025)

## Changes

- fix plugin crash if config dosnt contain devices

## [3.6.3] - (07.02.2025)

## Changes

- stability and improvements

## [3.6.2] - (04.03.2025)

## Changes

- fix [#188](https://github.com/grzegorz914/homebridge-melcloud-control/issues/188)

## [3.6.1] - (29.01.2025)

## Changes

- refactor cnnect and reconnect code
- refactor external integrations MQTT and RESTFul
- update logging
- cleanup

## [3.6.0] - (29.01.2025)

## Changes

- added possibility to disable/enable log success, info, warn, error
- refactor cnnect code
- bump dependencies
- config schema updated
- redme updated
- cleanup

## [3.5.0] - (06.12.2024)

## Changes

- added possibility to set device refresh state indyvidually for every device
- bump deependemcies
- config.schema updated
- redme updated
- cleanup

## [3.4.4] - (05.12.2024)

## Changes

- fix [#184](https://github.com/grzegorz914/homebridge-melcloud-control/issues/184)
- bump deependemcies

## [3.4.3] - (02.12.2024)

## Changes

- fix [#182](https://github.com/grzegorz914/homebridge-melcloud-control/issues/182)
- cleanup

## [3.4.0] - (30.11.2024)

## Changes

- move from commonJS to esm module, fixing [#180](https://github.com/grzegorz914/homebridge-melcloud-control/issues/180)
- moved constants.json to constants.js
- cleanup

## [3.3.20] - (25.09.2024)

## Changes

- fix ATA characteristics warning after plugin restart if device in DRY or FAN mode
- cleanup  

## [3.3.19] - (25.09.2024)

## Changes

- fix apply presets for ATA
- cleanup  

## [3.3.18] - (25.09.2024)

## Changes

- fix get/set temperature during operation mode change for ATA
- fix [#168](https://github.com/grzegorz914/homebridge-melcloud-control/issues/168)
- cleanup

## [3.3.17] - (24.09.2024)

## Changes

- fix operation mode for ATA - Thermostat if device go to OFF
- move some error to warn
- cleanup

## [3.3.16] - (23.09.2024)

## Changes

- fix report wrong target mode if device is OFF and the plugin or bridge reboots
- fix [#167](https://github.com/grzegorz914/homebridge-melcloud-control/issues/167)
- cleanup  

## [3.3.15] - (21.09.2024)

## Changes

- fix report wrong target temperature in Heat/Cool mode for ATA and ERV
- cleanup

## [3.3.14] - (21.09.2024)

## Changes

- code improvements
- cleanup

## [3.3.13] - (20.09.2024)

## Changes

- fix [#166](https://github.com/grzegorz914/homebridge-melcloud-control/issues/166)
- readme update with explanation of AUTO mode in Heather/Cooler and Thermostat mode
- cleanup

## [3.3.5] - (15.09.2024)

## Changes

- fix[#162](https://github.com/grzegorz914/homebridge-melcloud-control/issues/162)
- cleanup

## [3.3.3] - (13.09.2024)

## Changes

- fix[#159](https://github.com/grzegorz914/homebridge-melcloud-control/issues/159)
- fix [#158](https://github.com/grzegorz914/homebridge-melcloud-control/issues/158)
- cleanup

## [3.3.2] - (13.09.2024)

## Changes

- corrct setProps for heating/cooling threshold
- update ERV code to support heating/cooling threshold in auto mode
- cleanup

## [3.3.1] - (13.09.2024)

## Changes

- fix update default Heating/Cooling characteristic temp
- fix display current state of operation mode:
  - in AUTO mode, tile in Home app display current state as HEATING - orange/COOLING - blue, based on current device mode
  - in HEAT mode, the tile in Home app display current state as HEATING - orange
  - in COOL mode, the tile in Home app display current state as COOLING - blue
  - in DRY mode, the tile in Home app display current state as IDLE - black
  - in FAN mode, the tile in Home app display current state as IDLE - black
  - in IDLE mode, the tile display current state as IDLE - black
  - in INACTIVE mode, the tile display current state as INACTIVE - transparent
- readme update  
- cleanup

## [3.3.0] - (12.09.2024)

## Changes

- added full support for AUTO mode with dead band, low and high temperature
- fix some log info message
- bump dependencies
- cleanup

## [3.2.0] - (11.09.2024)

## Changes

- added possibility to set previous value for buttons [#154](https://github.com/grzegorz914/homebridge-melcloud-control/issues/154)
- move some message to warning
- presets previous settings apply improvement
- cleanup

## [3.1.11] - (09.09.2024)

## Changes

- cleanup

## [3.1.9] - (05.08.2024)

## Changes

- prevent load device if display mode set to 0 or unknown [#150](https://github.com/grzegorz914/homebridge-melcloud-control/issues/150)
- cleanup

## [3.1.8] - (03.08.2024)

## Changes

- fix [#149](https://github.com/grzegorz914/homebridge-melcloud-control/issues/149)
- cleanup

## [3.1.4] - (02.08.2024)

## Changes

- fix [#145](https://github.com/grzegorz914/homebridge-melcloud-control/issues/145)
- cleanup

## [3.1.2] - (31.08.2024)

## Changes

- fix presets configured array

## [3.1.0] - (31.08.2024)

## Changes

- improvements in plugin config UI
- added presets config indyvidually
- config schema update
- bump dependencies
- cleanup  

## [3.0.7] - (30.08.2024)

## Changes

- improvements in plugin config UI
- config schema update
- cleanup

## [3.0.0] - (29.08.2024)

## Changes

- added homebridge UI server
- whole new concept get all devices from melcloud usin config UI X
- added device config indyvidually
- config schema updated
- cleanup

## [2.4.0] - (28.08.2024)

## Changes

- required upcomming homebridge 2.x.x required
- bump dependencies
- config schema updated

## [2.3.3] - (28.08.2024)

## Changes

- cleanup and refactor accessory code
- bump dependencies

## [2.3.0] - (25.08.2024)

## Changes

- removed from config.json `ataDisableAutoMode`, `ataDisableHeatMode`, `ataAutoHeatMode`
- added to config.json `ataHeatDryFanMode`, `ataCoolDryFanMode`, `ataAutoDryFanMode`
- added individual operating mode assingn for `Heat/Cool/Auto`, [#132](https://github.com/grzegorz914/homebridge-melcloud-control/issues/132)
- unfortunatelly disabled operating mode cannot be hiden in HomeKit app due to HomeKit app limitations
- cleanup
- config schema updated

## [2.2.0] - (18.08.2024)

## Changes

- fix MQTT and RESTFul start
- add control over RESTFul POST JSON Object
- bump dependencies

## [2.1.1] - (18.08.2024)

## Changes

- fix correct catch error
- log improvements

## [2.1.0] - (16.08.2024)

## Changes

- added possibility to set device state refresh inteval
- rebuilt connect to melcloud code
- performance and stability improvements
- fix some found issues
- config schema updated
- cleanup

## [2.0.0] - (14.08.2024)

## Changes

- RestFul and MQTT refactor
- bump dependencies
- cleanup

## [1.1.4] - (14.08.2024)

## Changes

- hide passwords, tokens, serial numbers, by typing and display in Config UI
- remove return duplicate promises from whole code

## [1.1.3] - (06.08.2024)

## Changes  

- fix [#131](https://github.com/grzegorz914/homebridge-melcloud-control/issues/131)
- bump dependencies

## [1.1.0] - (23.07.2024)

## Changes  

- allow enable/disable every extra temperature sensor indyvidually [#126](https://github.com/grzegorz914/homebridge-melcloud-control/issues/126)
- cleanup
- config.schema updated

## [1.0.7] - (06.07.2024)

## Changes  

- refactor buttons code
- cleanup
- config.schema updated

## [1.0.1] - (22.06.2024)

## Changes

- check duplicate account name if run only one Homebridge instance
- cleanup  

## [1.0.0] - (21.06.2024)

## Changes

- added [#120](https://github.com/grzegorz914/homebridge-melcloud-control/issues/120) possibility run same device many times in other account or in other homebridge instance
- cleanup

## [1.0.0] - (21.06.2024)

## Changes

- added [#109](https://github.com/grzegorz914/homebridge-melcloud-control/issues/109), possibility filter out specific device and not exposed to the Homebridge/homekit by deviceId
- cleanup  

## [0.21.0] - (25.03.2024)

## Changes

- added [#109](https://github.com/grzegorz914/homebridge-melcloud-control/issues/109), possibility filter out specific device and not exposed to the Homebridge/homekit by deviceId
- cleanup

## [0.20.1] - (10.03.2024)

## Changes

- prevent set out of range temperature for Heat Pump
- prevent set out of range temperature for Energy Recovery Ventilation
- cleanup

## [0.20.0] - (10.03.2024)

## Changes

- dynamically update temp unit
- prevent set out of range temperature for Air Conditioner
- cleanup

## [0.19.0] - (02.03.2024)

## Changes

- added support to control devices over MQTT protocol
- cleanup

## [0.18.0] - (02.03.2024)

## Changes

- added temperature sensors for heat pump, flow, return, zone 1, zone 2, water tank
- fix [#91](https://github.com/grzegorz914/homebridge-melcloud-control/issues/91), thanks @alesf
- fix [#92](https://github.com/grzegorz914/homebridge-melcloud-control/issues/92), thanks @alesf
- fix [#96](https://github.com/grzegorz914/homebridge-melcloud-control/issues/96)
- fix some grammar mistakes in config schema, readme and in source code, thanks @alesf
- config.schema updated
- cleanup

## [0.17.0] - (01.03.2024)

## Changes

- added outdoor/room temperature sensors for Air Conditioner if supported
- added outdoor/room/supply temperature sensors for Losnay if supported
- added outdoor/room/zone1/zone2/water tank temperature sensors for Heta pump if supported
- config.schema updated
- cleanup

## [0.16.0] - (10.02.2024)

## Changes

- removed possibility to set indyvidual refresh time for ATA, ATW, ERV state
- full code refactor for ATA, ATW, ERV
- fixed accesorry publish if units are not configured in MELCloud
- remove sensitive information from debug
- drastically reduce call trace
- config.schema updated
- cleanup

## [0.15.0] - (05.02.2024)

## Changes

- added possibility to set indyvidual refresh time for Account Settings and ATA, ATW, ERV state, [#68](https://github.com/grzegorz914/homebridge-melcloud-control/issues/68)
- config.schema updated
- cleanup

## [0.14.1] - (06.01.2024)

## Changes

- added possibility to enable/disable the accessory name as a prefix for button/sensor name
- config.schema updated

## [0.14.0] - (06.01.2024)

## Changes

- added mode SPLIT to Vane V [#62](https://github.com/grzegorz914/homebridge-melcloud-control/issues/62)
- fix Vane V mode assignment for buttons/sensors
- performance and stability improvements
- config.schema updated

## [0.13.0] - (30.07.2023)

## Changes

- added RESTFul server
- code refactor and cleanup
- config.schema updated

## [0.12.0] - (21.07.2023)

## Changes

- added extra temperature sensor for Heater/Cooler control mode to use with automations
- config.schema updeted
- cleanup

## [0.11.0] - (25.03.2023)

## Changes

- full support of ERV Lossnay, fix [#37](https://github.com/grzegorz914/homebridge-melcloud-control/issues/37)
- added core maintenance indicator for ERV LOSSNAY
- added CO2 sensor for ERV LOSSNAY
- added PM2.5 sensor for ERV LOSSNAY
- config.schema updated
- cleanup

## [0.10.0] - (15.03.2023)

## Changes

- added filter maintenance indicator for ERV LOSSNAY
- config.schema updated
- cleanup

## [0.9.0] - (14.03.2023)

## Changes

- changed properties in config.json from `ataHeatMode` to `ataAutoHeatMode`
- updated selectable options for `ataAutoHeatMode` to `DRY/FAN`, `FAN/DRY`
- fix [#19](https://github.com/grzegorz914/homebridge-melcloud-control/issues/19)
- fix [#23](https://github.com/grzegorz914/homebridge-melcloud-control/issues/23)
- config.schema updated
- cleanup

## [0.8.0] - (13.03.2023)

## Changes

- added possibility selec mode DRY/FAN for Heat if Heat not supported by device
- config.schema updated
- other small fixes

## [0.7.1] - (13.03.2023)

## Changes

- cleanup

## [0.7.0] - (12.03.2023)

## Changes

- added for Air Conditioner DRY operating mode if HEAT not supported or FAN if DRY not supported too
- cleanup

## [0.6.0] - (08.03.2023)

## Changes

- added full support for Heat Pump control, thanks @Reliktdragons for testing
- fixed MQTT client
- performance and stability improvements
- config.schema updated
- cleanup

## [0.5.0] - (02.02.2023)

## Changes

- added None/Contact/Motion/Occupancy Sensor for displayType in the buttons/sensors section
- code refactor and fixes
- stability and performance improvements
- reduce HB load usage
- bump dependencies

## [0.4.5] - (02.01.2023)

## Changes

- code refactor
- small fixes in fan speeds

## [0.4.4] - (31.12.2022)

## Changes

- bump dependencies

## [0.4.3] - (06.12.2022)

## Changes Homebridge >= 1.6

- fix characteristic was supplied illegal value: number 0 exceeded minimum of 10
- bump dependencies

## [0.4.2] - (15.10.2022)

## Changes

- code cleanup
- fixed display wrong current state for Heat Pump in log
- fixed display presets as accessory button
- bump dependencies
- added new functions for buttons control:
  - Air Conditioner:
    - hide DRY mode control
    - hide VANE H/V conttrols
  - Energy Recovery Ventilation:
    - hide ROOM temperature
    - hide SUPPLY temperature
    - hide OUTDOOR temperature  

## [0.4.1] - (21.09.2022)

## Changes

- removed mode AUTO for Energy Recovery Ventilation if device not support it
- removed mode AUTO for Air Conditioner if device not support it
- fix [#19](https://github.com/grzegorz914/homebridge-melcloud-control/issues/19)
- fix characteristic warning for Zone 2 of Heat Pump
- update config.schema

## [0.4.0] - (21.09.2022)

## Changes

- added possibility individually configure (control mode, presets and buttons) for devices of same type
- update config.schema json

## [0.3.2] - (20.09.2022)

## Changes

- fixed many bugs in Heat Pump, thanks user @choooli for patience and tests
- fixed some bugs in Enrgy Recovery Ventilation (Test phase)
- code cleanup and refactor
- bump dependencies

## [0.3.1] - (29.08.2022)

## Changes

- code cleanup
- mqtt topics standarization

## [0.3.0] - (27.08.2022)

## Changes

- code cleanup and rebuild
- stability improvements
- added account reconect process if for some reason login fail
- added devices list and state recheck if for some reason fail
- revert to get serial mumber from wifi adapter not the device itself
- added expose device presets as a buttons in home app
- added support for Heat Pump (Test phase)
- added support for Enrgy Recovery Ventilation (Test phase)

## [0.2.16] - (24.07.2022)

## Changes

- fix node.js warning
- bump minimum version of hombridge to v1.4

## [0.2.15] - (24.07.2022)

## Changes

- code cleanup
- code rebuild

## [0.2.14] - (23.07.2022)

## Changes

- update accessory display name and type

## [0.2.12] - (23.07.2022)

## Changes

- code rebuild and cleanup
- reduced MELCloud backroground refresh data to 30sec
- refresch MELCloud data after user value change

## [0.2.11] - (22.07.2022)

## Changes

- fixed [#7](https://github.com/grzegorz914/homebridge-melcloud-control/issues/7)
- fixed [#8](https://github.com/grzegorz914/homebridge-melcloud-control/issues/8)
- fixed [#9](https://github.com/grzegorz914/homebridge-melcloud-control/issues/9)
- fixed [#10](https://github.com/grzegorz914/homebridge-melcloud-control/issues/10)
- fixed display undefined outdoor unit in log

## [0.2.10] - (05.07.2022)

## Changes

- added auto detection of device support standby mode
- some logs cosmetics changes
- config schema updated

## [0.2.9] - (04.07.2022)

## Changes

- fix [#6](https://github.com/grzegorz914/homebridge-melcloud-control/issues/6)
- added auto detection of device support automatic fan speed mode and detect numbers of fan speeds

## [0.2.8] - (03.07.2022)

## Changes

- fix Rotation Speed warning

## [0.2.7] - (03.07.2022)

## Changes

- fix sometimes device switch off if set new temp

## [0.2.6] - (03.07.2022)

## Changes

- fix [#4](https://github.com/grzegorz914/homebridge-melcloud-control/issues/4)
- fix [#5](https://github.com/grzegorz914/homebridge-melcloud-control/issues/5)

## [0.2.5] - (02.07.2022)

## Changes

- fix setProp step for celsius

## [0.2.4] - (02.07.2022)

## Changes

- fix heating cooling threshold warning

## [0.2.3] - (27.06.2022)

## Changes

- removed vane H and V tilt angle characteristics from accessory, the data is not available on MELCloud api
- stability improvements
- code cleanup

## [0.2.2] - (27.06.2022)

## Changes

- fix select button mone abowe as 9

## [0.2.1] - (27.06.2022)

## Changes

- config schema updated
- readme updated
- code cleanup

## [0.2.0] - (27.06.2022)

## Added

- control vane H all modes with buttons
- control vane V all modes with buttons
- control fan speed all modes with buttons

## Changes

- code cleanup

## [0.1.2] - (26.06.2022)

## Changes

- rebuilded refresch device state

## [0.1.1] - (26.06.2022)

## Changes

- added lock physical controls for Heater/Cooler accessory
- fix display undefined value for fan speed mode in log
- fix display wrong swing mode in log

## [0.1.0] - (26.06.2022)

## Changes

- full code rebuild
- fix display buttons state
- performance and stability improvement
- fix [#3](https://github.com/grzegorz914/homebridge-melcloud-control/issues/3)

## [0.0.11] - (20.06.2022)

## Changes

- fix update state of buttons

## [0.0.10] - (20.06.2022)

## Changes

- fix add all operating mode for buttons

## [0.0.9] - (20.06.2022)

## Changes

- added possibility to set all modes using extra buttons fix [#2](https://github.com/grzegorz914/homebridge-melcloud-control/issues/2)

## [0.0.8] - (19.06.2022)

## Changes

- code cleanup

## [0.0.7] - (19.06.2022)

## Changes

- fix warning for DefaultHeatingSetTemperature
- code cleanup

## [0.0.6] - (19.06.2022)

## Changes

- fix set Target Temperature in Auto Mode
- prepare for Heat Pump and Energy Recovery Ventilation
- code cleanup

## [0.0.5] - (19.06.2022)

## Changes

- fix parse building structure and read devices [#1](https://github.com/grzegorz914/homebridge-melcloud-control/issues/1)
- fix set Temperature treshold
- fix set Target Temperature
- code cleanup

## [0.0.4] - (18.06.2022)

## Changes

- first working version

## [0.0.3] - (18.06.2022)

## Changes

- test release 3

## [0.0.2] - (17.06.2022)

## Changes

- test release 2

## [0.0.1] - (16.06.2022)

## Changes

- test release
