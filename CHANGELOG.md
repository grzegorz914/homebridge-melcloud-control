# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Important changes v0.1.x and above!!!
### The old plugin and config need to be first removed from Homebridge and HomeKit and added again.
### The platform name and password properties was changed due collision with same already exist plugins from other developers.

## [0.3.0] - (xx.07.2022)
## Changes
- code cleanup
- code rebuild
- stability improvements
- added account reconect process if for some reason login fail
- added devices list and state recheck if for some reason fail
- added detect model name based on model code
- revert to get serial mumber from wifi adapter not the device itself
- added support for Heat Pump
- added support for Enrgy Recovery Ventilation

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

