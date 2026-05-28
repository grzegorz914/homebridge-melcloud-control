import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils';
import { promises as fsPromises } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import MelCloud from '../src/melcloud.js';
import MelCloudHome from '../src/melcloudhome.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    //connect
    this.onRequest('/connect', this.start.bind(this));

    //this MUST be called when you are ready to accept requests
    this.ready();
  };

  async writeResult(result) {
    try {
      await fsPromises.writeFile(
        join(__dirname, 'public', '_result.json'),
        JSON.stringify({ ...result, ts: Date.now() })
      );
    } catch (_) {}
  }

  withTimeout(promise, ms, label) {
    const timer = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    );
    return Promise.race([promise, timer]);
  }

  async start(account) {
    const melCloudClass = account.type === 'melcloud' ? new MelCloud(account) : new MelCloudHome(account);

    try {
      this.pushEvent('status', 'Connecting to account...');
      const melCloudAccountData = await this.withTimeout(melCloudClass.connect(), 90_000, 'connect');
      if (!melCloudAccountData.State) {
        await this.writeResult({ ok: true, data: melCloudAccountData });
        return melCloudAccountData;
      }

      this.pushEvent('status', 'Loading devices...');
      const melCloudDevicesData = await this.withTimeout(melCloudClass.checkDevicesList(), 60_000, 'checkDevicesList');
      await this.writeResult({ ok: true, data: melCloudDevicesData });
      return melCloudDevicesData;
    } catch (error) {
      const msg = error.message ?? String(error);
      await this.writeResult({ ok: false, error: msg });
      throw new Error(msg);
    }
  }
}

(() => {
  return new PluginUiServer();
})();
