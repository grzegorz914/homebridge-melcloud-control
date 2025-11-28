export const PlatformName = "melcloudcontrol";
export const PluginName = "homebridge-melcloud-control";

export const ApiUrls = {
    BaseURL: "https://app.melcloud.com/Mitsubishi.Wifi.Client",
    ClientLogin: "/Login/ClientLogin",
    GetUserDetails: "/User/GetUserDetails",
    ListDevices: "/User/ListDevices",
    ListDeviceUnits: "/Device/ListDeviceUnits",
    DeviceState: "/Device/Get?id=DID&buildingID=BID",
    TileState: "/Tile/Get2?id=DID&buildingID=BID",
    SetAta: "/Device/SetAta",
    SetAtw: "/Device/SetAtw",
    SetErv: "/Device/SetErv",
    GetRefreshUnit: "/Device/RequestRefresh?id=deviceid",
    UpdateApplicationOptions: "/User/UpdateApplicationOptions",
    HolidayModeUpdate: "/HolidayMode/Update",
    EnergyCostReport: "/EnergyCost/Report",
};

export const ApiUrlsHome = {
    BaseURL: "https://melcloudhome.com",
    GetConfiguration: "https://melcloudhome.com/api/configuration",
    GetUserContext: "/api/user/context",
    GetUserScenes: "/api/user/scenes",
    PostSchedule: " /api/cloudschedule/deviceid", // POST {"days":[2],"time":"17:59:00","enabled":true,"id":"53c5e804-0663-47d0-85c2-2d8ccd2573de","power":false,"operationMode":null,"setPoint":null,"vaneVerticalDirection":null,"vaneHorizontalDirection":null,"setFanSpeed":null}
    PostProtectionFrost: "/api/protection/frost", // POST {"enabled":true,"min":13,"max":16,"units":{"ATA":["ef333525-2699-4290-af5a-2922566676da"]}}
    PostProtectionOverheat: "/api/protection/overheat", // POST {"enabled":true,"min":32,"max":35,"units":{"ATA":["ef333525-2699-4290-af5a-2922566676da"]}}
    PostHolidayMode: " /api/holidaymode", // POST {"enabled":true,"startDate":"2025-11-11T17:42:24.913","endDate":"2026-06-01T09:18:00","units":{"ATA":["ef333525-2699-4290-af5a-2922566676da"]}}
    PutAta: "/api/ataunit/deviceid",
    PutAtw: "/api/atwunit/deviceid",
    PutErv: "/api/ervunit/deviceid",
    PutScheduleEnabled: "/api/cloudschedule/deviceid/enabled", // PUT {"enabled":true}
    PutScene: {
        Enable: "/api/scene/sceneid/enable",
        Disable: "/api/scene/sceneid/disable",
    },
    Referers: {
        GetPutScenes: "https://melcloudhome.com/scenes",
        PostHolidayMode: "https://melcloudhome.com/ata/deviceid/holidaymode",
        PostProtectionFrost: "https://melcloudhome.com/ata/deviceid/frostprotection",
        PostProtectionOverheat: "https://melcloudhome.com/ata/deviceid/overheatprotection",
        PutDeviceSettings: "https://melcloudhome.com/dashboard",
        PutScheduleEnabled: "https://melcloudhome.com/ata/deviceid/schedule",
    },
    Origin: "https://melcloudhome.com",
    WebSocketURL: "wss://ws.melcloudhome.com/?hash="
};

export const DeviceType = [
    "Air Conditioner",
    "Heat Pump",
    "Unknown",
    "Energy Recovery Ventilation"
];

export const TemperatureDisplayUnits = ["°C", "°F"];

export const AirConditioner = {
    SystemMapEnumToString: { 0: "Air Conditioner Off", 1: "Air Conditioner On", 2: "Air Conditioner Offline" },
    OperationModeMapStringToEnum: { "0": 0, "Heat": 1, "Dry": 2, "Cool": 3, "4": 7, "5": 8, "6": 6, "Fan": 7, "Automatic": 8, "Isee Heat": 9, "Isee Dry": 10, "Isee Cool": 11 },
    OperationModeMapEnumToString: { 0: "0", 1: "Heat", 2: "Dry", 3: "Cool", 4: "4", 5: "5", 6: "6", 7: "Fan", 8: "Automatic", 9: "Isee Heat", 10: "Isee Dry", 11: "Isee Cool" },
    FanSpeedMapStringToEnum: { "Auto": 0, "One": 1, "Two": 2, "Three": 3, "Four": 4, "Five": 5 },
    FanSpeedMapEnumToString: { 0: "Auto", 1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five" },
    AktualFanSpeedMapEnumToString: { 0: "Quiet", 1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five" },
    VaneVerticalDirectionMapStringToEnum: { "Auto": 0, "One": 1, "Two": 2, "Three": 3, "Four": 4, "Five": 5, "Six": 6, "Swing": 7 },
    VaneVerticalDirectionMapEnumToString: { 0: "Auto", 1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Swing" },
    VaneHorizontalDirectionMapStringToEnum: { "Auto": 0, "Left": 1, "LeftCentre": 2, "Centre": 3, "RightCentre": 4, "Right": 5, "Six": 6, "Seven": 7, "Split": 8, "Nine": 9, "Ten": 10, "Eleven": 11, "Swing": 12 },
    VaneHorizontalDirectionMapEnumToString: { 0: "Auto", 1: "Left", 2: "LeftCentre", 3: "Centre", 4: "RightCentre", 5: "Right", 6: "Six", 7: "Seven", 8: "Split", 9: "Nine", 10: "Ten", 11: "Eleven", 12: "Swing" },
    AirDirectionMapEnumToString: { 0: "Auto", 1: "Swing" },
    CurrentOperationModeMapEnumToStringHeatherCooler: { 0: "Inactive", 1: "Idle", 2: "Heating", 3: "Cooling" },
    CurrentOperationModeMapEnumToStringThermostat: { 0: "Inactive", 1: "Heating", 2: "Cooling" },
    EffectiveFlags: {
        Power: 1,
        OperationMode: 2,
        PowerOperationMode: 3,
        SetTemperature: 4,
        PowerSetTemperature: 5,
        OperationModeSetTemperature: 6,
        PowerOperationModeSetTemperature: 7,
        SetFanSpeed: 8,
        PowerSetFanSpeed: 9,
        VaneVertical: 16,
        PowerVaneVertical: 17,
        Prohibit: 64,
        VaneHorizontal: 256,
        PowerVaneHorizontal: 257,
        VaneVerticalVaneHorizontal: 272,
        Presets: 287,
        HolidayMode: 131072,
        All: 281483566710825
    },
};

export const HeatPump = {
    SystemMapEnumToString: { 0: "SystemOff", 1: "SystemOn", 2: "Emergency Run", 3: "Test Run" },
    ZoneNameMapEnumToString: { 0: "Heat Pump", 1: "Zone 1", 2: "Hot Water", 3: "Zone 2" },
    ControlTypeMapStringToEnum: { "Heat": 0, "Cool": 1 },
    ControlTypeMapEnumToString: { 0: "Heat", 1: "Cool" },
    DefrostMapStringToEnum: { "Normal": 0, "Standby": 1, "Defrost": 2, "Waiting Restart": 3 },
    DefrostMapEnumToString: { 0: "Normal", 1: "Standby", 2: "Defrost", 3: "Waiting Restart" },
    OperationModeMapStringToEnum: { "Idle": 0, "Hot Water": 1, "Heat Zones": 2, "Cool": 3, "Hot Water Storage": 4, "FreezeStat": 5, "Legionella": 6, "Heat Eco": 7, "Mode 1": 8, "Mode 2": 9, "Mode 3": 10, "Heat Up": 11 },
    OperationModeMapEnumToString: { 0: "Idle", 1: "Hot Water", 2: "Heat Zones", 3: "Cool", 4: "Hot Water Storage", 5: "FreezeStat", 6: "Legionella", 7: "Heat Eco", 8: "Mode 1", 9: "Mode 2", 10: "Mode 3", 11: "Heat Up" },
    OperationModeDhwMapStringToEnum: { "Normal": 0, "Eco": 1 },
    OperationModeDhwMapEnumToString: { 0: "Normal", 1: "Eco" },
    ForceDhwMapStringToEnum: { "Normal": 0, "Heat Now": 1 },
    ForceDhwMapEnumToString: { 0: "Normal", 1: "Heat Now" },
    HolidayMapStringToEnum: { "Normal": 0, "Holiday": 1 },
    HolidayMapEnumToString: { 0: "Normal", 1: "Holiday" },
    OperationModeZoneMapStringToEnum: { "Heat Thermostat": 0, "Heat Flow": 1, "Heat Curve": 2, "Cool Thermostat": 3, "Cool Flow": 4, "Flor Dry Up": 5, "Idle": 6 },
    OperationModeZoneMapEnumToString: { 0: "Heat Thermostat", 1: "Heat Flow", 2: "Heat Curve", 3: "Cool Thermostat", 4: "Cool Flow", 5: "Flor Dry Up", 6: "Idle" },
    EffectiveFlags: {
        Power: 1,
        OperationMode: 2,
        EcoHotWater: 4,
        OperationModeZone1: 8,
        OperationModeZone2: 16,
        SetTankWaterTemperature: 32,
        Prohibit: 64,
        TargetHCTemperatureZone1: 128,
        TargetHCTemperatureZone2: 512,
        ForcedHotWaterMode: 65536,
        HolidayMode: 131072,
        ProhibitHotWater: 262144,
        ProhibitHeatingZone1: 524288,
        ProhibitCoolingZone1: 1048576,
        ProhibitHeatingZone2: 2097152,
        ProhibitCoolingZone2: 4194304,
        Demand: 67108864,
        SetTemperatureZone1: 8589934720,
        SetTemperatureZone2: 34359738880,
        ThermostatTemperatureZone1: 8589934592,
        ThermostatTemperatureZone2: 34359738368,
        SetHeatFlowTemperatureZone1: 281474976710656,
        SetHeatFlowTemperatureZone2: 281474976710656,
        SetCoolFlowTemperatureZone1: 281474976710656,
        SetCoolFlowTemperatureZone2: 281474976710656,
        All: 281483566710825
    }
};

export const Ventilation = {
    SystemMapEnymToString: { 0: "Ventilation Off", 1: "Ventilation On", 2: "Ventilation Offline" },
    OperationModeMapStringToEnum: { "0": 0, "HEAT": 1, "2": 2, "COOL": 3, "4": 4, "5": 5, "6": 6, "Fan": 7, "Auto": 8 },
    OperationModeMapEnumToString: { 0: "0", 1: "Heat", 2: "2", 3: "Cool", 4: "4", 5: "5", 6: "6", 7: "Fan", 8: "Auto" },
    ActualOperationModeMapStringToEnum: { "Not Auto": 0, "Deterermining": 1, "Heating": 2, "Cooling": 3 },
    ActualOperationModeMapEnumToString: { 0: "Not Auto", 1: "Deterermining", 2: "Heating", 3: "Cooling" },
    AutoFanSpeedControlMapStringToEnum: { "Not Available": 0, "Available": 1 },
    AutoFanSpeedControlMapEnumToString: { 0: "Not Available", 1: "Available" },
    NightPurgeMapStringToEnum: { "Normal": 0, "Night Purge": 1 },
    NightPurgeMapEnumToString: { 0: "Normal", 1: "Night Purge" },
    VentilationModeMapStringToEnum: { "Lossnay": 0, "Bypass": 1, "Auto": 2 },
    VentilationModeMapEnumToString: { 0: "Lossnay", 1: "Bypass", 2: "Auto" },
    FanSpeedMapStringToEnum: { "Auto": 0, "1": 1, "2": 2, "3": 3, "4": 4, "Off": 5 },
    FanSpeedMapEnumToString: { 0: "Auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "Off" },
    ActualVentilationModeMapStringToEnum: { "Lossnay": 0, "Bypass": 1 },
    ActualVentilationModeMapEnumToString: { 0: "Lossnay", 1: "Bypass" },
    ActualSupplyFanSpeed: ["STOP", "1", "2", "3", "4"],
    ActualExtractFanSpeed: ["STOP", "1", "2", "3", "4"],
    Co2DetectedMapStringToEnum: { "NO": 0, "YES": 1 },
    Co2DetectedMapEnumToString: { 0: "NO", 1: "YES" },
    PM25AirQualityMapStringToEnum: { "Unknown": 0, "Excellent": 1, "Good": 2, "Fair": 3, "Inferior": 4, "Poor": 5 },
    PM25AirQualityMapEnumToString: { 0: "Unknown", 1: "Excellent", 2: "Good", 3: "Fair", 4: "Inferior", 5: "Poor" },
    CoreMaintenanceMapStringToEnum: { "All Ok": 0, "Required": 1 },
    CoreMaintenanceMapEnumToString: { 0: "All Ok", 1: "Required" },
    FilterMaintenanceMapStringToEnum: { "All Ok": 0, "Required": 1 },
    FilterMaintenanceMapEnumToString: { 0: "All Ok", 1: "Required" },
    EffectiveFlags: {
        Power: 1,
        OperationMode: 2,
        VentilationMode: 4,
        SetFanSpeed: 8,
        Prohibit: 64,
        HolidayMode: 131072,
        All: 281483566710825
    }
};

export const AccessLevel = {
    Quest: 3,
    Owner: 4
};

export const LanguageLocaleMap = {
    "0": "en-US,en;q=0.9",
    "1": "bg-BG,bg;q=0.9",
    "2": "cs-CZ,cs;q=0.9",
    "3": "da-DK,da;q=0.9",
    "4": "de-DE,de;q=0.9",
    "5": "et-EE,et;q=0.9",
    "6": "es-ES,es;q=0.9",
    "7": "fr-FR,fr;q=0.9",
    "8": "hy-AM,hy;q=0.9",
    "9": "lv-LV,lv;q=0.9",
    "10": "lt-LT,lt;q=0.9",
    "11": "hu-HU,hu;q=0.9",
    "12": "nl-NL,nl;q=0.9",
    "13": "no-NO,no;q=0.9",
    "14": "pl-PL,pl;q=0.9",
    "15": "pt-PT,pt;q=0.9",
    "16": "ru-RU,ru;q=0.9",
    "17": "fi-FI,fi;q=0.9",
    "18": "sv-SE,sv;q=0.9",
    "19": "it-IT,it;q=0.9",
    "20": "uk-UA,uk;q=0.9",
    "21": "tr-TR,tr;q=0.9",
    "22": "el-GR,el;q=0.9",
    "23": "hr-HR,hr;q=0.9",
    "24": "ro-RO,ro;q=0.9",
    "25": "sl-SI,sl;q=0.9"
};
