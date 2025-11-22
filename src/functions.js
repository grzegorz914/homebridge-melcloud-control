import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import EventEmitter from 'events';
const execPromise = promisify(exec);
const access = fs.promises.access;

class Functions extends EventEmitter {
    constructor(logWarn, logError, logDebug) {
        super();
        this.logWarn = logWarn;
        this.logError = logError;
        this.logDebug = logDebug;
    }

    async saveData(path, data, stringify = true) {
        try {
            data = stringify ? JSON.stringify(data, null, 2) : data;
            await fsPromises.writeFile(path, data);
            return true;
        } catch (error) {
            throw new Error(`Save data error: ${error}`);
        }
    }

    async readData(path, parseJson = false) {
        try {
            const data = await fsPromises.readFile(path, 'utf8');

            if (parseJson) {
                if (!data.trim()) {
                    // Empty file when expecting JSON
                    return null;
                }
                try {
                    return JSON.parse(data);
                } catch (jsonError) {
                    throw new Error(`JSON parse error in file "${path}": ${jsonError.message}`);
                }
            }

            // For non-JSON, just return file content (can be empty string)
            return data;
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File does not exist
                return null;
            }
            // Preserve original error details
            const wrappedError = new Error(`Read data error for "${path}": ${error.message}`);
            wrappedError.original = error;
            throw wrappedError;
        }
    }

    async ensureChromiumInstalled() {
        let chromiumPath = '/usr/bin/chromium-browser';

        try {
            // --- Detect OS ---
            const { stdout: osOut } = await execPromise('uname -s');
            const osName = osOut.trim();
            if (this.logDebug) this.emit('debug', `Detected OS: ${osName}`);

            // --- Detect Architecture ---
            const { stdout: archOut } = await execPromise('uname -m');
            const arch = archOut.trim();
            if (this.logDebug) this.emit('debug', `Detected architecture: ${arch}`);

            // --- Detect Docker ---
            let isDocker = false;
            try {
                await access('/.dockerenv', fs.constants.F_OK); isDocker = true;
            } catch { }

            try {
                const { stdout } = await execPromise('cat /proc/1/cgroup || true');
                if (stdout.includes('docker') || stdout.includes('containerd')) isDocker = true;
            } catch { }

            if (isDocker && this.logDebug) this.emit('debug', 'Running inside Docker container.');

            // === macOS ===
            if (osName === 'Darwin') {
                chromiumPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
                try {
                    await access(chromiumPath, fs.constants.X_OK);
                    return chromiumPath;
                } catch {
                    return null;
                }
            }

            // === ARM ===
            if (arch.startsWith('arm')) {
                try {
                    chromiumPath = '/usr/bin/chromium-browser';
                    await access(chromiumPath, fs.constants.X_OK);
                    return chromiumPath;
                } catch {
                    try {
                        await execPromise('sudo apt-get update -y && sudo apt-get install -y chromium-browser chromium-codecs-ffmpeg');
                        return chromiumPath;
                    } catch {
                        return null;
                    }
                }
            }

            // === Linux x64 ===
            if (osName === 'Linux') {
                let systemChromium = null;
                try {
                    const { stdout: checkOut } = await execPromise('which chromium || which chromium-browser || true');
                    systemChromium = checkOut.trim() || null;
                } catch { }

                // --- Detect Entware (QNAP) ---
                let entwareExists = false;
                try {
                    await access('/opt/bin/opkg', fs.constants.X_OK);
                    entwareExists = true;
                } catch { }

                if (entwareExists) {
                    try {
                        await execPromise('/opt/bin/opkg update');
                        await execPromise('/opt/bin/opkg install nspr nss libx11 libxcomposite libxdamage libxrandr libatk libatk-bridge libcups libdrm libgbm libasound');
                        process.env.LD_LIBRARY_PATH = `/opt/lib:${process.env.LD_LIBRARY_PATH || ''}`;
                    } catch { }
                }

                // --- Generic Linux installs missing libs for Puppeteer ---
                const depInstall = [
                    'apt-get update -y && apt-get install -y libnspr4 libnss3 libx11-6 libxcomposite1 libxdamage1 libxrandr2 libatk1.0-0 libcups2 libdrm2 libgbm1 libasound2',
                    'apk add --no-cache nspr nss libx11 libxcomposite libxdamage libxrandr atk cups libdrm libgbm alsa-lib',
                    'yum install -y nspr nss libX11 libXcomposite libXdamage libXrandr atk cups libdrm libgbm alsa-lib'
                ];
                for (const cmd of depInstall) {
                    try {
                        await execPromise(`sudo ${cmd}`);
                    } catch { }
                }

                // Set LD_LIBRARY_PATH so Puppeteer's Chromium can find libs
                process.env.LD_LIBRARY_PATH = `/usr/lib:/usr/lib64:${process.env.LD_LIBRARY_PATH || ''}`;
                return systemChromium;
            }

            if (this.logDebug) this.emit('debug', `Unsupported OS: ${osName}.`);
            return null;
        } catch (error) {
            if (this.logError) this.emit('error', `Chromium detection/install error: ${error.message}`);
            return null;
        }
    }

    isValidValue(v) {
        return v !== undefined && v !== null && !(typeof v === 'number' && Number.isNaN(v));
    }

    convertValue(v) {
        let parsedValue = v;
        if (v === "True") parsedValue = true;
        else if (v === "False") parsedValue = false;
        else if (!isNaN(v) && v !== "") parsedValue = Number(v);
        return parsedValue;
    }

    parseArrayNameValue(data) {
        if (!Array.isArray(data)) return {};

        return Object.fromEntries(
            data.map(({ name, value }) => {
                const parsedValue = this.convertValue(value);
                return [name, parsedValue];
            })
        );
    }
}
export default Functions