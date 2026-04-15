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

    toPascalCaseKeys(object) {
        if (object !== null && typeof object === 'object') {
            return Object.fromEntries(
                Object.entries(object)
                    .filter(([, value]) => value !== undefined)
                    .map(([key, value]) => [
                        key.charAt(0).toUpperCase() + key.slice(1),
                        this.toPascalCaseKeys(value)
                    ])
            );
        }

        return object;
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