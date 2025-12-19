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
            const { stdout: osOut } = await execPromise('uname -s');
            const osName = osOut.trim();

            const { stdout: archOut } = await execPromise('uname -m');
            let arch = archOut.trim() || 'unknown';

            // Normalizacja architektury
            if (arch.startsWith('arm') || arch.startsWith('aarch')) arch = 'arm';
            else if (arch.includes('64')) arch = 'x64';
            else arch = 'x86';

            const isARM = arch === 'arm';
            const isMac = osName === 'Darwin';
            const isLinux = osName === 'Linux';
            const isQnap = fs.existsSync('/etc/config/uLinux.conf') || fs.existsSync('/etc/config/qpkg.conf');

            // Detect Docker
            let isDocker = false;
            try {
                await access('/.dockerenv');
                isDocker = true;
            } catch { }

            try {
                const { stdout } = await execPromise('cat /proc/1/cgroup');
                if (stdout.includes('docker') || stdout.includes('containerd')) isDocker = true;
            } catch { }

            const result = { path: null, arch, system: 'unknown' };

            /* ===================== macOS ===================== */
            if (isMac) {
                const macCandidates = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'];
                for (const path of macCandidates) {
                    try {
                        await access(path, fs.constants.X_OK);
                        result.path = path;
                        result.system = 'macOS';
                        return result;
                    } catch { }
                }
                return result;
            }

            /* ===================== QNAP ===================== */
            if (isQnap) {
                const qnapCandidates = ['/opt/bin/chromium', '/opt/bin/chromium-browser'];
                for (const path of qnapCandidates) {
                    try {
                        await access(path, fs.constants.X_OK);
                        result.path = path;
                        result.system = 'Qnap';
                        return result;
                    } catch { }
                }

                try {
                    await access('/opt/bin/opkg', fs.constants.X_OK);
                    await execPromise('/opt/bin/opkg update');
                    await execPromise('opkg install chromium nspr nss libx11 libxcomposite libxdamage libxrandr atk libcups libdrm libgbm alsa-lib');
                    process.env.LD_LIBRARY_PATH = `/opt/lib:${process.env.LD_LIBRARY_PATH || ''}`;
                } catch (error) {
                    if (this.logError) this.emit('error', `Install package for Qnap error: ${error}`);
                }

                for (const path of qnapCandidates) {
                    try {
                        await access(path, fs.constants.X_OK);
                        result.path = path;
                        result.system = 'Qnap';
                        return result;
                    } catch { }
                }
                return result;
            }

            /* ===================== Linux ARM ===================== */
            if (isLinux && isARM) {
                const armCandidates = ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/snap/bin/chromium'];
                for (const path of armCandidates) {
                    try {
                        await access(path, fs.constants.X_OK);
                        result.path = path;
                        result.system = 'Linux';
                        return result;
                    } catch { }
                }

                if (!isDocker) {
                    try {
                        await execPromise('sudo apt update -y');
                        await execPromise('sudo apt install -y libnspr4 libnss3 libx11-6 libxcomposite1 libxdamage1 libxrandr2 libatk1.0-0 libcups2 libdrm2 libgbm1 libasound2');
                        await execPromise('sudo apt install -y chromium chromium-browser chromium-codecs-ffmpeg');
                    } catch (error) {
                        if (this.logError) this.emit('error', `Install package for Linux ARM error: ${error}`);
                    }
                }

                for (const path of armCandidates) {
                    try {
                        await access(path, fs.constants.X_OK);
                        result.path = path;
                        result.system = 'Linux';
                        return result;
                    } catch { }
                }
                return result;
            }

            /* ===================== Linux x64 ===================== */
            if (isLinux) {
                const linuxCandidates = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/snap/bin/chromium', '/usr/local/bin/chromium'];
                try {
                    const { stdout } = await execPromise('which chromium || which chromium-browser || which google-chrome');
                    if (stdout.trim()) {
                        result.path = stdout.trim();
                        return result;
                    }
                } catch { }

                for (const path of linuxCandidates) {
                    try {
                        await access(path, fs.constants.X_OK);
                        result.path = path;
                        result.system = 'Linux';
                        return result;
                    } catch { }
                }

                if (isDocker) {
                    try {
                        await execPromise('apt update -y && apt install -y chromium');
                    } catch (error) {
                        if (this.logError) this.emit('error', `Install package for Linux Docker error: ${error}`);
                    }

                    for (const path of linuxCandidates) {
                        try {
                            await access(path, fs.constants.X_OK);
                            result.path = path;
                            result.system = 'Linux Docker';
                            return result;
                        } catch { }
                    }
                }
            }

            return result;
        } catch (error) {
            if (this.logError) this.emit('error', `Chromium detection error: ${error.message}`);
            return { path: null, arch: 'unknown', system: 'unknown' };
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

    async adjustTempProtection(currentMin, currentMax, value, type, minRangeMin, maxRangeMin, minRangeMax, maxRangeMax) {
        let min = currentMin;
        let max = currentMax;

        if (type === "min") {
            min = Math.min(Math.max(value, minRangeMin), maxRangeMin);

            if (min > currentMin && max - min < 2) {
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
            max = Math.min(Math.max(value, minRangeMax), maxRangeMax);

            if (max < currentMax && max - min < 2) {
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