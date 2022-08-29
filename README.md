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

Homebridge plugin for Air Conditioner, Heat Pump and Energy Recovery Ventilation manufactured by Mistsubishi and connected to MELCloud.                                           

</span>

## Package Requirements
| Package | Installation | Role | Required |
| --- | --- | --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) | HomeKit Bridge | Required |
| [Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) | [Config UI X Wiki](https://github.com/oznu/homebridge-config-ui-x/wiki) | Web User Interface | Recommended |
| [MELCloud](https://www.npmjs.com/package/homebridge-melcloud-control) | `npm install -g homebridge-melcloud-control` | Plug-In | Required |

### Plugin Wiki
  * [Note!](https://github.com/grzegorz914/homebridge-melcloud-control/wiki#note)
  * [Important changes v0.1.x and above!!!](https://github.com/grzegorz914/homebridge-melcloud-control/wiki#important-changes-v01x-and-above)
  * [Troubleshooting](https://github.com/grzegorz914/homebridge-melcloud-control/wiki#troubleshooting)

### About the plugin
* All devices are detected automatically.
* All configured settings are appiled to all devices in account.
* Support multiple MELCloud accounts, buildings, flors, areas.
* Support temperature display units *Celsius/Fahrenheit*.
* Main control mode, *Heater/Cooler*, *Thermostat*.
* Additional control mode, *Buttons*.
* Controls of Air Conditioner:
  * Heater Cooler:
    * Power *ON/OFF*.
    * Operating mode *AUTO/HEAT/COOL/OFF*.
    * Heating/Cooling temperature.
    * Heating/Cooling threshold temperature.
    * Fan speed *OFF/1/2/3/4/5/AUTO*.
    * Swing mode *AUTO/SWING*.
    * Lock physical controls *LOCK/UNLOCK*.
  * Thermostat:
    * Power *ON/OFF*.
    * Operating mode *OFF/HEAT/COOL/AUTO*.
    * Heating/Cooling temperature.
    * Heating/Cooling threshold temperature.
  * Buttons:
    * Power *ON/OFF*.
    * Operating mode *HEAT/DRY/COOL/FAN/AUTO*.
    * Physical lock controls *LOCK/UNLOCK*.
    * Vane H mode *AUTO/1/2/3/4/5/SWING*.
    * Vane V mode *AUTO/1/2/3/4/5/SWING*.
    * Fan speed mode *AUTO/1/2/3/4/5*.
    * Set device presets.
* Control of Heat Pump:
  * Test phase...
* Control of Energy Recovery Ventilation:
  * Test phase...
* Home automations and shortcuts can be used to control the devices.
* Siri can be used to control the devices.
* MQTT publisch topic *Info*, *State* as payload JSON data.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/homekit.png" width="382"></a> 
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/settings.png" width="135"></a> <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/settings1.png" width="135"></a>
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/main/graphics/settings2.png" width="135"></a>
</p>

### Configuration
* Run this plugin as a child bridge (Highly Recommended).
* Install and use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) to configure this plugin (Highly Recommended). 
* The sample configuration can be edited and used manually as an alternative. 
* See the `sample-config.json` file for an example or copy the example below into your config.json file, making the apporpriate changes before saving it. 
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
| `displayMode` | Here select main control mode `Heater/Cooler`, `Thermostat`. |
| `buttons.name` | Here set `Button Name` which You want expose to the *Homebridge/HomeKit*. | 
| `buttons.mode` | Here select button mode, AC - Air Conditioner, HP - Heat Pump, ERV - Energy Recovery Ventilation, VH - Vane Horizontal, VV - Vane Horizontal. |
| `buttons.displayType` | Here select HomeKit display type, `Switch`, `Button` - selectable in HomeKit app as `Light`, `Fan`, `Outlet`. |
| `enableDevicePresets` | This enable display device presets in HomeKit app. |
| `enableDebugMode` | This enable deep log in homebridge console. |
| `disableLogInfo` | This disable display log values and states on every it change. |
| `disableLogDeviceInfo` | This disable display log device info on plugin start. |
| `enableMqtt` | This enabled MQTT Broker and publish to it all awailable data. |
| `mqttHost` | Here set the *IP Address* or *Hostname* for MQTT Broker. |
| `mqttPort` | Here set the *Port* for MQTT Broker, default 1883. |
| `mqttPrefix` | Here set the *Prefix* for *Topic* or leave empty. |
| `mqttAuth` | This enabled MQTT Broker authorization credentials. |
| `mqttUser` | Here set the MQTT Broker user. |
| `mqttPasswd` | Here set the MQTT Broker password. |
| `mqttDebug` | This enabled deep log in homebridge console for MQTT. |

```json
        {
            "platform": "melcloudcontrol",
            "accounts": [
                {
                    "name": "My House",
                    "user": "user",
                    "passwd": "password",
                    "language": 0,
                    "displayMode": 0,
                    "buttons": [{
                        "name": "ON/OFF",
                        "mode": 0,
                        "displayType": 0
                    }],
                    "enableDevicePresets": false,
                    "disableLogInfo": false,
                    "disableLogDeviceInfo": false,
                    "enableDebugMode": false,
                    "enableMqtt": false,
                    "mqttHost": "192.168.1.33",
                    "mqttPort": 1883,
                    "mqttPrefix": "home/My House",
                    "mqttAuth": false,
                    "mqttUser": "user",
                    "mqttPass": "password",
                    "mqttDebug": false,
                }
            ]
        }
```

### Adding to HomeKit
* Each accessory needs to be manually paired. 
  *Open the Home <img src='https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png' width='16.42px'> app on your device. 
  * Tap the Home tab, then tap <img src='https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png' width='16.42px'>. 
  * Tap *Add Accessory*, and select *I Don't Have a Code, Cannot Scan* or *More options*. 
  * Select Your accessory and press add anyway. 
  * Enter the PIN or scan the QR code, this can be found in Homebridge UI or Homebridge logs.
  * Complete the accessory setup.

### [What's New](https://github.com/grzegorz914/homebridge-melcloud-control/blob/main/CHANGELOG.md)

### Development
Please feel free to create a Pull request and help in development. It will be highly appreciated.
