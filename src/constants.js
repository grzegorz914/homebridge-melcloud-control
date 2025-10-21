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
    UpdateApplicationOptions: "/User/UpdateApplicationOptions",
    HolidayModeUpdate: "/HolidayMode/Update",
    EnergyCostReport: "/EnergyCost/Report",
};

export const ApiUrlsHome = {
    LoginUrl:"https://live-melcloudhome.auth.eu-west-1.amazoncognito.com/login?client_id=3g4d5l5kivuqi7oia68gib7uso&redirect_uri=https%3A%2F%2Fauth.melcloudhome.com%2Fsignin-oidc-meu&response_type=code&scope=openid%20profile&response_mode=form_post",
    BaseURL: 'https://melcloudhome.com',
    GetUserContext: "/api/user/context",
    SetAta: "/api/ataunit/deviceid",
    SetAtw: "/api/atwunit/deviceid",
    SetErv: "/api/ervunit/deviceid",
};

export const DeviceType = [
    "Air Conditioner",
    "Heat Pump",
    "Unknown",
    "Energy Recovery Ventilation"
];

export const TemperatureDisplayUnits = ["°C", "°F"];

export const AirConditioner = {
    System: ["AIR CONDITIONER OFF", "AIR CONDITIONER ON", "AIR CONDITIONER OFFLINE"],
    DriveMode: [
        "0", "HEAT", "DRY", "COOL", "4", "5", "6", "FAN", "AUTO",
        "ISEE HEAT", "ISEE DRY", "ISEE COOL"
    ],
    VerticalVane: ["AUTO", "1", "2", "3", "4", "5", "6", "SWING"],
    HorizontalVane: [
        "AUTO", "LL", "L", "C", "R", "RR", "6", "7",
        "SPLIT", "9", "10", "11", "SWING"
    ],
    AirDirection: ["AUTO", "SWING"],
    FanSpeed: [
        "AUTO", "1", "QUIET", "WEAK", "4",
        "STRONG", "VERY STRONG", "OFF"
    ],
    CurrentOperationModeHeatherCooler: [
        "INACTIVE", "IDLE", "HEATING", "COOLING"
    ],
    CurrentOperationModeThermostat: ["INACTIVE", "HEATING", "COOLING"],
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
    }
};

export const HeatPump = {
    System: ["SYSTEM OFF", "SYSTEM ON", "EMERGENCY RUN", "TEST RUN"],
    ZoneName: ["Heat Pump", "Zone 1", "Hot Water", "Zone 2"],
    ControlType: ["HEAT", "COOL"],
    Defrost: ["NORMAL", "STANDBY", "DEFROST", "WAITING RESTART"],
    OperationMode: [
        "IDLE", "HOT WATER", "HEAT ZONES", "COOL",
        "HOT WATER STORAGE", "FREEZE STAT", "LEGIONELLA", "HEAT ECO",
        "MODE 1", "MODE 2", "MODE 3", "HEAT UP"
    ],
    OperationModeDhw: ["NORMAL", "ECO"],
    ForceDhw: ["NORMAL", "HEAT NOW"],
    Holiday: ["NORMAL", "HOLIDAY"],
    ZoneOperation: [
        "HEAT THERMOSTAT", "HEAT FLOW", "HEAT CURVE",
        "COOL THERMOSTAT", "COOL FLOW", "FLOOR DRY UP", "IDLE"
    ],
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
    System: ["VENTILATION OFF", "VENTILATION ON", "VENTILATION OFFLINE"],
    OperationMode: ["0", "HEAT", "2", "COOL", "4", "5", "6", "FAN", "AUTO"],
    ActualOperationMode: ["NOT AUTO", "DETERMINING", "HEATING", "COOLING"],
    AutoFanSpeedControl: ["NOT AVAILABLE", "AVAILABLE"],
    NightPurge: ["NORMAL", "NIGHT PURGE"],
    VentilationMode: ["LOSSNAY", "BYPASS", "AUTO"],
    FanSpeed: ["AUTO", "1", "2", "3", "4", "OFF"],
    ActualVentilationMode: ["LOSSNAY", "BYPASS"],
    ActualSupplyFanSpeed: ["STOP", "1", "2", "3", "4"],
    ActualExtractFanSpeed: ["STOP", "1", "2", "3", "4"],
    Co2Detected: ["NO", "YES"],
    PM25AirQuality: ["UNKNOWN", "EXCELLENT", "GOOD", "FAIR", "INFERIOR", "POOR"],
    CoreMaintenance: ["ALL OK", "REQUIRED"],
    FilterMaintenance: ["ALL OK", "REQUIRED"],
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
