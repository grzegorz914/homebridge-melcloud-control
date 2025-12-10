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
        try {
            // Detect OS
            const { stdout: osOut } = await execPromise("uname -s");
            const osName = osOut.trim();
            const { stdout: archOut } = await execPromise("uname -m");
            const arch = archOut.trim();

            const isARM = arch.startsWith("arm") || arch.startsWith("aarch64") || arch.startsWith("aarch");
            const isMac = osName === "Darwin";
            const isLinux = osName === "Linux";

            // Detect Docker
            let isDocker = false;
            try {
                await access("/.dockerenv");
                isDocker = true;
            } catch { }
            try {
                const { stdout } = await execPromise("cat /proc/1/cgroup || true");
                if (stdout.includes("docker") || stdout.includes("containerd")) isDocker = true;
            } catch { }

            // macOS
            if (isMac) {
                const macCandidates = [
                    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                    "/Applications/Chromium.app/Contents/MacOS/Chromium"
                ];
                for (const p of macCandidates) {
                    try {
                        await access(p, fs.constants.X_OK);
                        return p;
                    } catch { }
                }
                return null;
            }

            // ARM / Raspberry Pi
            if (isARM && isLinux) {
                const armCandidates = [
                    "/usr/bin/chromium-browser",
                    "/usr/bin/chromium",
                    "/snap/bin/chromium"
                ];

                // Try existing
                for (const p of armCandidates) {
                    try {
                        await access(p, fs.constants.X_OK);
                        return p;
                    } catch { }
                }

                // If not in Docker, try apt installation
                if (!isDocker) {
                    try {
                        await execPromise("sudo apt-get update -y");
                    } catch { }
                    try {
                        await execPromise("sudo apt-get install -y chromium-browser chromium-codecs-ffmpeg || true");
                    } catch { }
                    try {
                        await execPromise("sudo apt-get install -y chromium || true");
                    } catch { }
                }

                // Retry after installation
                for (const p of armCandidates) {
                    try {
                        await access(p, fs.constants.X_OK);
                        return p;
                    } catch { }
                }

                return null;
            }

            // QNAP / Entware
            let entwareExists = false;
            try {
                await access("/opt/bin/opkg", fs.constants.X_OK);
                entwareExists = true;
            } catch { }

            if (entwareExists) {
                try {
                    await execPromise("/opt/bin/opkg update");
                    await execPromise("/opt/bin/opkg install nspr nss libx11 libxcomposite libxdamage libxrandr atk libcups libdrm libgbm alsa-lib");
                    process.env.LD_LIBRARY_PATH = `/opt/lib:${process.env.LD_LIBRARY_PATH || ""}`;
                } catch { }
            }

            // Synology DSM 7
            const synoCandidates = [
                "/var/packages/Chromium/target/usr/bin/chromium",
                "/usr/local/chromium/bin/chromium"
            ];
            for (const p of synoCandidates) {
                try {
                    await access(p, fs.constants.X_OK);
                    return p;
                } catch { }
            }

            // Linux x64
            if (isLinux) {
                const linuxCandidates = [
                    "/usr/bin/chromium",
                    "/usr/bin/chromium-browser",
                    "/usr/bin/google-chrome",
                    "/snap/bin/chromium",
                    "/usr/local/bin/chromium"
                ];

                try {
                    const { stdout } = await execPromise("which chromium || which chromium-browser || which google-chrome || true");
                    const found = stdout.trim();
                    if (found) return found;
                } catch { }

                for (const p of linuxCandidates) {
                    try {
                        await access(p, fs.constants.X_OK);
                        return p;
                    } catch { }
                }

                // Docker: try installing chromium inside container (if allowed)
                if (isDocker) {
                    try {
                        await execPromise("apt-get update -y && apt-get install -y chromium || true");
                    } catch { }
                    try {
                        await access("/usr/bin/chromium", fs.constants.X_OK);
                        return "/usr/bin/chromium";
                    } catch { }
                }

                // Install missing libraries
                const depCommands = [
                    "apt-get update -y && apt-get install -y libnspr4 libnss3 libx11-6 libxcomposite1 libxdamage1 libxrandr2 libatk1.0-0 libcups2 libdrm2 libgbm1 libasound2 || true",
                    "yum install -y nspr nss libX11 libXcomposite libXdamage libXrandr atk cups libdrm libgbm alsa-lib || true",
                    "apk add --no-cache nspr nss libx11 libxcomposite libxdamage libxrandr atk cups libdrm libgbm alsa-lib || true"
                ];
                for (const cmd of depCommands) {
                    try {
                        await execPromise(`sudo ${cmd}`);
                    } catch { }
                }

                return null;
            }

            return null;
        } catch (err) {
            if (this.logError) this.emit("error", `Chromium detection error: ${err.message}`);
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

    async adjustTempProtection(oldMin, oldMax, newValue, type, minRangeMin, maxRangeMin, minRangeMax, maxRangeMax) {
        let min = oldMin;
        let max = oldMax;

        if (type === "min") {
            min = Math.min(Math.max(newValue, minRangeMin), maxRangeMin);

            if (min > oldMin && max - min < 2) {
                max = Math.min(min + 2, maxRangeMax);

                // jeśli max uderza w górną granicę → obniż min o 2
                if (max === maxRangeMax && max - min < 2) {
                    min = Math.max(min - 2, minRangeMin);
                }

                return { min, max };
            }

            // min maleje → zwracamy tylko min
            return { min, max };
        }

        if (type === "max") {
            max = Math.min(Math.max(newValue, minRangeMax), maxRangeMax);

            if (max < oldMax && max - min < 2) {
                min = Math.max(max - 2, minRangeMin);

                // jeśli min uderza w dolną granicę → podbij max o 2
                if (min === minRangeMin && max - min < 2) {
                    max = Math.min(max + 2, maxRangeMax);
                }

                return { min, max };
            }

            // max rośnie → zwracamy tylko max
            return { min, max };
        }

        return { min, max };
    }

}

export default Functions