// Home Assistant MQTT discovery, native climate / water_heater / fan entities.
// Commands go back to the existing <prefix>/Set topic as the JSON keys the plugin already handles.

// MELCloud operation mode values
const AtaModeToHa = { 1: 'heat', 2: 'dry', 3: 'cool', 7: 'fan_only', 8: 'auto', 9: 'heat', 10: 'dry', 11: 'cool' };
const AtwZonePreset = { 0: 'Room', 1: 'Flow', 2: 'Curve', 3: 'Room', 4: 'Flow', 5: 'Room' };
const VaneVerticalToHa = { 0: 'auto', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 7: 'swing' };
const VaneHorizontalToHa = { 0: 'auto', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 8: 'split', 12: 'swing' };
const VentilationModes = ['Lossnay', 'Bypass', 'Auto'];

class HaDiscovery {
    constructor(mqtt, config) {
        // + and # are MQTT wildcards, Home Assistant would subscribe to a pattern instead of the device topic
        if (/[+#]/.test(mqtt.config.prefix)) {
            throw new Error(`MQTT prefix ${mqtt.config.prefix} must not contain + or #, rename the device or set a prefix`);
        }

        this.mqtt = mqtt;
        this.baseId = `melcloud_${String(config.deviceId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        this.stateTopic = `${mqtt.config.prefix}/HA State`;
        this.commandTopic = `${mqtt.config.prefix}/Set`;
        this.device = {
            identifiers: [this.baseId],
            name: config.name,
            manufacturer: 'Mitsubishi Electric',
            ...(config.model ? { model: String(config.model) } : {}),
            ...(config.swVersion ? { sw_version: String(config.swVersion) } : {})
        };
        this.origin = { name: 'homebridge-melcloud-control', url: 'https://github.com/grzegorz914/homebridge-melcloud-control' };

        this.lastConfig = {};
        this.lastState = '';
    }

    // Publish (or republish when changed) one retained discovery message
    async publishEntity(component, suffix, entity) {
        const objectId = suffix ? `${this.baseId}_${suffix}` : this.baseId;
        const topic = `${this.mqtt.haPrefix}/${component}/${objectId}/config`;
        const config = {
            unique_id: objectId,
            device: this.device,
            origin: this.origin,
            availability_topic: this.mqtt.availabilityTopic,
            ...entity
        };

        const payload = JSON.stringify(config);
        if (this.lastConfig[topic] === payload) return false;
        this.lastConfig[topic] = payload;
        await this.mqtt.publishRetained(topic, payload);
        return true;
    }

    async updateState(state) {
        const payload = JSON.stringify(state);
        if (payload === this.lastState) return false;
        this.lastState = payload;
        await this.mqtt.publishRetained(this.stateTopic, payload);
        return true;
    }

    // ---------------------------------------------------------------- ATA
    ataClimate(c) {
        const modes = ['off'];
        if (c.supportsHeat) modes.push('heat');
        if (c.supportsCool) modes.push('cool');
        if (c.supportsDry) modes.push('dry');
        modes.push('fan_only');
        if (c.supportsAuto) modes.push('auto');

        const entity = {
            name: null,
            modes,
            mode_state_topic: this.stateTopic,
            mode_state_template: '{{ value_json.mode }}',
            mode_command_topic: this.commandTopic,
            mode_command_template: '{% set m = {"heat": 1, "dry": 2, "cool": 3, "fan_only": 7, "auto": 8} %}{% if value == "off" %}{"Power": false}{% else %}{"Power": true, "OperationMode": {{ m[value] }}}{% endif %}',
            power_command_topic: this.commandTopic,
            power_command_template: '{"Power": {{ "true" if value == "ON" else "false" }}}',
            temperature_state_topic: this.stateTopic,
            temperature_state_template: '{{ value_json.target_temperature }}',
            temperature_command_topic: this.commandTopic,
            temperature_command_template: '{"SetTemperature": {{ value }}}',
            current_temperature_topic: this.stateTopic,
            current_temperature_template: '{{ value_json.current_temperature }}',
            action_topic: this.stateTopic,
            action_template: '{{ value_json.action }}',
            min_temp: c.minTemp,
            max_temp: c.maxTemp,
            temp_step: c.tempStep,
            precision: 0.1,
            temperature_unit: 'C'
        };

        if (c.supportsFanSpeed && c.numberOfFanSpeeds > 0) {
            const fanModes = c.supportsAutomaticFanSpeed ? ['auto'] : [];
            for (let i = 1; i <= c.numberOfFanSpeeds; i++) fanModes.push(String(i));
            Object.assign(entity, {
                fan_modes: fanModes,
                fan_mode_state_topic: this.stateTopic,
                fan_mode_state_template: '{{ value_json.fan_mode }}',
                fan_mode_command_topic: this.commandTopic,
                fan_mode_command_template: '{"FanSpeed": {{ 0 if value == "auto" else value | int }}}'
            });
        }

        if (c.supportsVaneVertical) {
            const swingModes = ['auto', '1', '2', '3', '4', '5', ...(c.supportsSwingFunction ? ['swing'] : [])];
            Object.assign(entity, {
                swing_modes: swingModes,
                swing_mode_state_topic: this.stateTopic,
                swing_mode_state_template: '{{ value_json.swing_mode }}',
                swing_mode_command_topic: this.commandTopic,
                swing_mode_command_template: '{% set m = {"auto": 0, "swing": 7} %}{"VaneVerticalDirection": {{ m[value] if value in m else value | int }}}'
            });
        }

        if (c.supportsWideVane) {
            const swingModes = ['auto', '1', '2', '3', '4', '5', 'split', ...(c.supportsSwingFunction ? ['swing'] : [])];
            Object.assign(entity, {
                swing_horizontal_modes: swingModes,
                swing_horizontal_mode_state_topic: this.stateTopic,
                swing_horizontal_mode_state_template: '{{ value_json.swing_horizontal_mode }}',
                swing_horizontal_mode_command_topic: this.commandTopic,
                swing_horizontal_mode_command_template: '{% set m = {"auto": 0, "split": 8, "swing": 12} %}{"VaneHorizontalDirection": {{ m[value] if value in m else value | int }}}'
            });
        }

        return entity;
    }

    static ataState(d) {
        const power = !!d.power;
        const mode = power ? (AtaModeToHa[d.operationMode] ?? 'auto') : 'off';
        const room = d.roomTemperature;
        const target = d.setTemperature;
        let action = 'off';
        if (power) {
            if (d.inStandbyMode) action = 'idle';
            else if (mode === 'dry') action = 'drying';
            else if (mode === 'fan_only') action = 'fan';
            else if (mode === 'heat') action = room < target ? 'heating' : 'idle';
            else if (mode === 'cool') action = room > target ? 'cooling' : 'idle';
            else action = room < target ? 'heating' : room > target ? 'cooling' : 'idle';
        }

        return {
            power,
            mode,
            action,
            target_temperature: target,
            current_temperature: room,
            fan_mode: d.setFanSpeed === 0 ? 'auto' : String(d.setFanSpeed ?? ''),
            swing_mode: VaneVerticalToHa[d.vaneVerticalDirection] ?? 'auto',
            swing_horizontal_mode: VaneHorizontalToHa[d.vaneHorizontalDirection] ?? 'auto'
        };
    }

    // ---------------------------------------------------------------- prohibit
    // One select with every combination of the device locks, parts: [{ name, key }].
    // order 'binary' - first part is the highest bit: Off, Power, Mode, Mode Power, Temp, Temp Power, Temp Mode, All
    // order 'lexical' - combinations in part order: Off, Zone 1, Zone 1 Zone 2, Zone 1 Water, Zone 2, Zone 2 Water, Water, All
    prohibitSelect(parts, order = 'binary') {
        const combos = HaDiscovery.prohibitCombos(parts, order);
        const options = combos.map(values => HaDiscovery.prohibitName(parts, values));
        const masks = JSON.stringify(Object.fromEntries(combos.map((values, i) => [options[i], values.reduce((mask, v, bit) => mask | (v ? 1 << bit : 0), 0)])));
        const values = parts.map((p, bit) => `"${p.key}": {{ "true" if (m[value] // ${1 << bit}) % 2 == 1 else "false" }}`).join(', ');
        return {
            name: 'Prohibit',
            icon: 'mdi:lock',
            entity_category: 'config',
            options,
            state_topic: this.stateTopic,
            value_template: '{{ value_json.prohibit }}',
            command_topic: this.commandTopic,
            command_template: `{% set m = ${masks} %}{${values}}`
        };
    }

    // Every lock combination as an array of booleans in part order
    static prohibitCombos(parts, order = 'binary') {
        const n = parts.length;
        if (order === 'binary') {
            return [...Array(1 << n).keys()].map(mask => parts.map((p, i) => ((mask >> (n - 1 - i)) & 1) === 1));
        }

        const combos = [];
        const walk = (start, picked) => {
            for (let i = start; i < n; i++) {
                const next = [...picked, i];
                combos.push(next);
                walk(i + 1, next);
            }
        };
        walk(0, []);
        const toValues = (picked) => parts.map((p, i) => picked.includes(i));
        const partial = combos.filter(picked => n === 1 || picked.length < n).map(toValues);
        return [parts.map(() => false), ...partial, ...(n > 1 ? [parts.map(() => true)] : [])];
    }

    static prohibitOptions(parts, order = 'binary') {
        return HaDiscovery.prohibitCombos(parts, order).map(values => HaDiscovery.prohibitName(parts, values));
    }

    // Name of a lock combination, values in the same order as parts
    static prohibitName(parts, values) {
        const locked = parts.filter((p, i) => values[i]);
        if (locked.length === 0) return 'Off';
        if (parts.length > 1 && locked.length === parts.length) return 'All';
        return locked.map(p => p.name).join(' ');
    }

    // ---------------------------------------------------------------- ATW
    atwZoneClimate(zone, c) {
        const z = `zone${zone}`;
        const key = `Zone${zone}`;
        const modes = ['off', 'heat', ...(c.supportsCool ? ['cool'] : [])];
        const presets = ['Room', 'Flow', 'Curve'];

        return {
            name: c.name,
            modes,
            mode_state_topic: this.stateTopic,
            mode_state_template: `{{ value_json.${z}.mode }}`,
            mode_command_topic: this.commandTopic,
            // Keep the current preset (room / flow / curve) when switching between heat and cool
            mode_command_template: `{% set p = state_attr(entity_id, "preset_mode") %}{% if value == "off" %}{"Power": false}{% elif value == "cool" %}{"Power": true, "OperationMode${key}": {{ 4 if p == "Flow" else 3 }}}{% else %}{"Power": true, "OperationMode${key}": {{ 1 if p == "Flow" else 2 if p == "Curve" else 0 }}}{% endif %}`,
            preset_modes: presets,
            preset_mode_state_topic: this.stateTopic,
            preset_mode_value_template: `{{ value_json.${z}.preset }}`,
            preset_mode_command_topic: this.commandTopic,
            preset_mode_command_template: `{% set cool = states(entity_id) == "cool" %}{% set m = {"Room": 3 if cool else 0, "Flow": 4 if cool else 1, "Curve": 3 if cool else 2} %}{"OperationMode${key}": {{ m.get(value, m["Room"]) }}}`,
            temperature_state_topic: this.stateTopic,
            temperature_state_template: `{{ value_json.${z}.target_temperature }}`,
            temperature_command_topic: this.commandTopic,
            // Flow presets set the flow temperature, the others the room temperature
            temperature_command_template: `{% set p = state_attr(entity_id, "preset_mode") %}{% set cool = states(entity_id) == "cool" %}{% if p == "Flow" %}{"{{ "SetCoolFlowTemperature${key}" if cool else "SetHeatFlowTemperature${key}" }}": {{ value }}}{% else %}{"SetTemperature${key}": {{ value }}}{% endif %}`,
            current_temperature_topic: this.stateTopic,
            current_temperature_template: `{{ value_json.${z}.current_temperature }}`,
            action_topic: this.stateTopic,
            action_template: `{{ value_json.${z}.action }}`,
            power_command_topic: this.commandTopic,
            power_command_template: '{"Power": {{ "true" if value == "ON" else "false" }}}',
            min_temp: c.minTemp,
            max_temp: c.maxTemp,
            temp_step: c.tempStep,
            precision: 0.1,
            temperature_unit: 'C'
        };
    }

    static atwZoneState(power, d) {
        const preset = AtwZonePreset[d.operationMode] ?? 'Room';
        const cool = d.operationMode === 3 || d.operationMode === 4;
        const mode = !power ? 'off' : cool ? 'cool' : 'heat';
        const target = preset === 'Flow' ? (cool ? d.setCoolFlowTemperature : d.setHeatFlowTemperature) : d.setTemperature;
        const action = !power ? 'off' : d.idle ? 'idle' : cool ? 'cooling' : 'heating';
        return { mode, preset, action, target_temperature: target, current_temperature: d.roomTemperature };
    }

    // Temperature range shown in Home Assistant for the current zone mode
    static atwZoneRange(operationMode) {
        switch (operationMode) {
            case 1: return { minTemp: 25, maxTemp: 60 }; // heat flow
            case 3: return { minTemp: 16, maxTemp: 30 }; // cool room
            case 4: return { minTemp: 16, maxTemp: 30 }; // cool flow
            default: return { minTemp: 10, maxTemp: 30 }; // heat room / curve
        }
    }

    atwWaterHeater(c) {
        const modes = ['heat_pump', ...(c.supportsEco ? ['eco'] : []), 'high_demand'];
        const resetEco = c.supportsEco ? ', "EcoHotWater": false' : '';
        return {
            name: c.name,
            modes,
            mode_state_topic: this.stateTopic,
            mode_state_template: '{{ value_json.tank.mode }}',
            mode_command_topic: this.commandTopic,
            mode_command_template: `{% if value == "high_demand" %}{"ForcedHotWaterMode": true}{% elif value == "eco" %}{"ForcedHotWaterMode": false, "EcoHotWater": true}{% else %}{"ForcedHotWaterMode": false${resetEco}}{% endif %}`,
            temperature_state_topic: this.stateTopic,
            temperature_state_template: '{{ value_json.tank.target_temperature }}',
            temperature_command_topic: this.commandTopic,
            temperature_command_template: '{"SetTankWaterTemperature": {{ value }}}',
            current_temperature_topic: this.stateTopic,
            current_temperature_template: '{{ value_json.tank.current_temperature }}',
            min_temp: c.minTemp,
            max_temp: c.maxTemp,
            precision: c.tempStep === 0.5 ? 0.5 : 1,
            temperature_unit: 'C'
        };
    }

    static atwTankState(d) {
        const mode = d.forcedHotWaterMode ? 'high_demand' : d.ecoHotWater ? 'eco' : 'heat_pump';
        return { mode, target_temperature: d.setTankWaterTemperature, current_temperature: d.tankWaterTemperature };
    }

    // ---------------------------------------------------------------- ERV
    ervFan(c) {
        const presets = VentilationModes.filter((mode, i) => i === 0 || (i === 1 && c.supportsBypass) || (i === 2 && c.supportsAuto));
        const entity = {
            name: null,
            state_topic: this.stateTopic,
            state_value_template: '{{ "ON" if value_json.power else "OFF" }}',
            command_topic: this.commandTopic,
            command_template: '{"Power": {{ "true" if value == "ON" else "false" }}}',
            preset_modes: presets,
            preset_mode_state_topic: this.stateTopic,
            preset_mode_value_template: '{{ value_json.ventilation_mode }}',
            preset_mode_command_topic: this.commandTopic,
            preset_mode_command_template: '{% set m = {"Lossnay": 0, "Bypass": 1, "Auto": 2} %}{"VentilationMode": {{ m[value] }}}'
        };

        if (c.numberOfFanSpeeds > 0) {
            Object.assign(entity, {
                speed_range_min: 1,
                speed_range_max: c.numberOfFanSpeeds,
                percentage_state_topic: this.stateTopic,
                // 0 is automatic fan speed, reported as no percentage
                percentage_value_template: '{{ value_json.fan_speed if value_json.fan_speed > 0 else "None" }}',
                percentage_command_topic: this.commandTopic,
                percentage_command_template: '{"SetFanSpeed": {{ value }}}'
            });
        }

        return entity;
    }

    static ervState(d) {
        return {
            power: !!d.power,
            fan_speed: d.setFanSpeed ?? 0,
            ventilation_mode: VentilationModes[d.ventilationMode] ?? 'Lossnay'
        };
    }
}

export default HaDiscovery;
