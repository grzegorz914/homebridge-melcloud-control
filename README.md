<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/master/graphics/homebridge-melcloud-control.png" width="540"></a>
</p>

<span align="center">

# Homebridge MELCloud Control
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-melcloud-control?color=purple)](https://www.npmjs.com/package/homebridge-melcloud-control) 
[![npm](https://badgen.net/npm/v/homebridge-melcloud-control?color=purple)](https://www.npmjs.com/package/homebridge-melcloud-control)
[![npm](https://img.shields.io/npm/v/homebridge-melcloud-control/beta.svg?style=flat-square)](https://www.npmjs.com/package/homebridge-melcloud-control)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-melcloud-control.svg)](https://github.com/grzegorz914/homebridge-melcloud-control/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-melcloud-control.svg)](https://github.com/grzegorz914/homebridge-melcloud-control/issues)

Homebridge plugin for Air Conditioner, Heat Pump and Energy Recovery Ventilation devices manufactured by Mistsubishi and connected to MELCloud service.                                           

</span>

## Package Requirements
| Package | Installation | Role | Required |
| --- | --- | --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) | HomeKit Bridge | Required |
| [Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) | [Config UI X Wiki](https://github.com/oznu/homebridge-config-ui-x/wiki) | Web User Interface | Recommended |
| [MELCloud](https://www.npmjs.com/package/homebridge-melcloud-control) | `npm install -g homebridge-melcloud-control` | Plug-In | Required |

### Important changes v0.1.x and above!!!
* The old plugin and config need to be first removed from Homebridge and HomeKit and added again.
* The platform name and password properties was changed due collision with same already exist plugins from other developers.
### Note
* The plugin is in test phase and some function may be not working correct.
* The Heat Pump and Energy Recovery Ventilation is not supported at this time.
* Change plugin settings will applied to all devices same type in account.

### Know issues
* If used with Hoobs, there is a possible configuration incompatibilty.

### Troubleshooting
* If for some reason the device is not displayed in HomeKit app try this procedure:
   * Go to `./homebridge/persist`.
   * Remove `AccessoryInfo.xxx` file which contain Your device data: `{"displayName":"DeviceName"}`.
   * Next remove `IdentifierCashe.xxx` file with same name as `AccessoryInfo.xxx`.
   * Restart Homebridge and try add it to the Home app again.

### About the plugin
* All devices are detected automatically.
* Support multiple MELCloud accounts, buildings, flors, areas.
* Support temperature *CELSIUS/FAHRENHEIT*.
* Main control, *Heater/Cooler*, *Thermostat*, configurable in plugin settings.
* Additional control, *Buttons*, configurable in plugin settings.
* Control of Air Conditioner:
  * Power *ON/OFF*.
  * Operating modes:
    * Using *Heater/Cooler* or *Thermostat*, *ON/OFF/HEAT/COOL/AUTO*.
    * Using buttons *ON/OFF/HEAT/DRY/COOL/FAN/AUTO/PURIFY*.
  * Heating/Cooling temperature.
  * Heating/Cooling threshold temperature.
  * Fan speed *AUTO/SWING*.
  * Swing mode *OFF/1/2/3/4/5/AUTO*.
  * Vanes Vertical/Horizonta tilt angle.
* Control of Heat Pump:
  * Comming soon...
* Control of Energy Recovery Ventilation:
  * Comming soon...
* Home automations and shortcuts can be used to control the devices.
* MQTT Client publisch all available data from all detected devices.

### Configuration
Install and use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) to configure this plugin (Highly Recommended). The sample configuration can be edited and used manually as an alternative. See the `sample-config.json` file in this repository for an example or copy the example below into your config.json file, making the apporpriate changes before saving it. Be sure to always make a backup copy of your config.json file before making any changes to it.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-melcloud-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-melcloud-control/master/graphics/ustawienia.png" width="840"></a>
</p>

| Key | Description | 
| --- | --- |
| `name` | Here set the own account name. |
| `user` | Here set the MELCloud username. |
| `passwd` | Here set the MELCloud password. |
| `language` | Here set the MELCloud language. |
| `displayMode` | Here select control mode `Heater/Cooler`, `Thermostat`. |
| `buttons.name` | Here set *Button Name* which You want expose to the *Homebridge/HomeKit*. | 
| `buttons.mode` | Here select button mode, `On/Off`, `Heat`, `Dry`, `Cool`, `Fan`, `Auto`, `Purify`. |
| `buttons.displayType` | Here select HomeKit display type, `Switch`, `Button` - selectable in HomeKit app as Light, Fan, Outlet. |
| `enableDebugMode` | This enable deep log in homebridge console. |
| `disableLogInfo` | This disable display log values and states on every it change. |
| `disableLogDeviceInfo` | This disable display log device info on plugin restart. |
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
                    "displayMode": 0, //possible 0,1
                    "buttons": [{
                        "name": "ON/OFF",
                        "mode": 0, //possible 0,1,2,3,7,8,9
                        "displayType": 0 //possible 0,1
                    }],
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
Each accessory needs to be manually paired. 
1. Open the Home <img src='https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png' width='16.42px'> app on your device. 
2. Tap the Home tab, then tap <img src='https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png' width='16.42px'>. 
3. Tap *Add Accessory*, and select *I Don't Have a Code, Cannot Scan* or *More options*. 
4. Select Your accessory and press add anyway. 
5. Enter the PIN or scan the QR code, this can be found in Homebridge UI or Homebridge logs.

### [What's New](https://github.com/grzegorz914/homebridge-melcloud-control/blob/master/CHANGELOG.md)

### Development
Please feel free to create a Pull request and help in development. It will be highly appreciated.
