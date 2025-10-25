import fs from 'fs';
import { promises as fsPromises } from 'fs';

class Functions {
    constructor() {
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
            return parseJson ? JSON.parse(data) : data;
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File does not exist
                return null;
            }
            throw new Error(`Read data error: ${error}`);
        }
    }

    async isRunningInDocker() {
        try {
            if (fs.existsSync('/.dockerenv')) return true;
            const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
            return cgroup.includes('docker') || cgroup.includes('kubepods');
        } catch {
            return false;
        }
    }
}
export default Functions