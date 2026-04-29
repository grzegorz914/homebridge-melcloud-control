# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Homebridge plugin that controls Mitsubishi Air Conditioning (ATA), Heat Pump (ATW), and Energy Recovery Ventilation (ERV) devices via two distinct MELCloud APIs: the legacy MELCloud REST API and the modern MELCloud Home API (WebSocket-based).

## Commands

There is no build step — code runs directly as ES Modules. No test suite or linter is configured.

```bash
# Install dependencies
npm install

# Run locally with Homebridge (for manual testing)
homebridge -D
```

## Architecture

### Entry Point

[index.js](index.js) contains `MelCloudPlatform`, the Homebridge platform class. It:
1. Reads config, sets up a per-account storage directory under Homebridge's `storagePath`
2. Initializes each account independently using `Promise.allSettled` (one account failure doesn't block others)
3. Discovers devices via MELCloud or MELCloud Home, then registers them as external Homebridge accessories
4. Starts an `ImpulseGenerator` for periodic polling

### Two API Paths

| | MELCloud (legacy) | MELCloud Home (modern) |
|--|--|--|
| Class | [src/melcloud.js](src/melcloud.js) | [src/melcloudhome.js](src/melcloudhome.js) |
| Transport | REST (Axios + cookie jar) | WebSocket (`ws`) + REST |
| Poll interval | 120s | 10s |
| Extra features | Presets, physical locks | Scenes, schedules, frost/overheat protection, holiday mode |

`MelCloudHome` manages OAuth token refresh, WebSocket reconnection with exponential backoff (5s → 300s), and real-time device state pushes.

### Device Handlers

Each device type has a dedicated handler file:

- [src/deviceata.js](src/deviceata.js) — Air Conditioner (~2 K lines)
- [src/deviceatw.js](src/deviceatw.js) — Heat Pump/Air-to-Water (~2.6 K lines)
- [src/deviceerv.js](src/deviceerv.js) — Energy Recovery Ventilation (~1.6 K lines)

All three follow the same pattern:
- Extend `EventEmitter`; bubble `success`, `info`, `warn`, `debug`, `error` events to the platform logger
- Create Homebridge services (HeaterCooler, Thermostat, Switch) and characteristics based on user config
- Poll state via `ImpulseGenerator` and push commands through the matching MELCloud API class
- Optionally expose an Express REST server ([src/restful.js](src/restful.js)) and MQTT client ([src/mqtt.js](src/mqtt.js)) for external control

MELCloud API wrappers per device type live in [src/melcloudata.js](src/melcloudata.js), [src/melcloudatw.js](src/melcloudatw.js), and [src/melclouderv.js](src/melclouderv.js).

### Key Utilities

- [src/impulsegenerator.js](src/impulsegenerator.js) — Timer-based polling with lock flags to prevent overlapping calls
- [src/requestpacer.js](src/requestpacer.js) — Throttles concurrent API requests (default: 200 ms interval, 1 in-flight at a time)
- [src/constants.js](src/constants.js) — All API base URLs, device type IDs (`0`=ATA, `1`=ATW, `3`=ERV), enums, and feature flags
- [src/functions.js](src/functions.js) — File I/O helpers and small data utilities

### Configuration

[config.schema.json](config.schema.json) is the Homebridge UI schema (~125 KB). It drives all user-visible options: account credentials, refresh intervals, display type per device, preset/scene/schedule filtering, RESTFul port, MQTT broker settings, and granular logging flags. Changes to supported features usually require parallel edits in both the schema and the relevant device handler.

Temperature preference state is persisted as per-device JSON files in Homebridge's storage directory, not in memory.

### External Integrations

Both `RestFul` and `Mqtt` classes self-manage their servers/connections and emit `set` events that the device handler listens to in order to trigger control commands. Each device can independently enable or disable these integrations.
