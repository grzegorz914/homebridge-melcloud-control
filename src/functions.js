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

            // --- Detect Docker environment ---
            let isDocker = false;
            try {
                await access('/.dockerenv', fs.constants.F_OK);
                isDocker = true;
            } catch {
                try {
                    const { stdout } = await execPromise('cat /proc/1/cgroup || true');
                    if (stdout.includes('docker') || stdout.includes('containerd'))
                        isDocker = true;
                } catch { }
            }

            if (isDocker && this.logDebug) this.emit('debug', 'Running inside Docker container.');

            // === macOS ===
            if (osName === 'Darwin') {
                chromiumPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
                try {
                    await access(chromiumPath, fs.constants.X_OK);
                    if (this.logDebug) this.emit('debug', `Using system Chrome at ${chromiumPath}`);
                    return chromiumPath;
                } catch {
                    return null;
                }
            }

            // === ARM (e.g. Raspberry Pi) ===
            if (arch.startsWith('arm')) {
                try {
                    await access('/usr/bin/chromium-browser', fs.constants.X_OK);
                    if (this.logDebug) this.emit('debug', 'Using system Chromium on ARM platform.');
                    return '/usr/bin/chromium-browser';
                } catch {
                    if (this.logWarn) this.emit('warn', 'System Chromium not found on ARM. Attempting installation...');
                    try {
                        await execPromise('sudo apt-get update -y && sudo apt-get install -y chromium-browser chromium-codecs-ffmpeg');
                        if (this.logDebug) this.emit('debug', 'Chromium installed successfully on ARM.');
                        return '/usr/bin/chromium-browser';
                    } catch {
                        return null;
                    }
                }
            }

            // === Linux (x64, Docker, etc.) ===
            if (osName === 'Linux') {
                try {
                    // --- Try detect common Chromium binaries ---
                    const { stdout: checkOut } = await execPromise('which chromium || which chromium-browser || true');
                    chromiumPath = checkOut.trim();
                    if (chromiumPath) {
                        if (this.logDebug) this.emit('debug', `Found system Chromium: ${chromiumPath}`);
                        return chromiumPath;
                    }
                } catch { }

                if (this.logWarn) this.emit('warn', 'Chromium not found. Attempting installation...');

                // --- Try install (Docker-optimized first) ---
                const installCommands = [
                    'apt-get update -y && apt-get install -y chromium chromium-browser chromium-codecs-ffmpeg',
                    'apk add --no-cache chromium ffmpeg',
                    'yum install -y chromium chromium-codecs-ffmpeg'
                ];

                for (const cmd of installCommands) {
                    try {
                        if (this.logDebug) this.emit('debug', `Trying installation: ${cmd}`);
                        await execPromise(`sudo ${cmd}`);
                        // Check for binary after install
                        const { stdout: checkOut } = await execPromise('which chromium || which chromium-browser || true');
                        chromiumPath = checkOut.trim() || '/usr/bin/chromium';
                        if (chromiumPath) {
                            if (this.logDebug) this.emit('debug', `Chromium installed successfully at ${chromiumPath}`);
                            return chromiumPath;
                        }
                    } catch (error) {
                        if (this.logDebug) this.emit('debug', `Install attempt failed: ${cmd} → ${error.message}`);
                    }
                }

                if (isDocker) {
                    // Docker fallback specific
                    try {
                        await execPromise('sudo apt-get update -y && sudo apt-get install -y chromium');
                        await access('/usr/bin/chromium', fs.constants.X_OK);
                        if (this.logDebug) this.emit('debug', 'Chromium installed successfully inside Docker at /usr/bin/chromium');
                        return '/usr/bin/chromium';
                    } catch {
                        return null;
                    }
                }
                return null;
            }

            // Unknown OS
            if (this.logDebug) this.emit('debug', `Unsupported OS: ${osName}.`);
            return null;
        } catch (error) {
            if (this.logError) this.emit('error', `Chromium detection/install error: ${error.message}`);
            return null;
        }
    }
}
export default Functions