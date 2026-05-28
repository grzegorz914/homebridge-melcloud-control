import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils';
import MelCloud from '../src/melcloud.js';
import MelCloudHome from '../src/melcloudhome.js';

class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    //connect
    this.onRequest('/connect', this.start.bind(this));

    //this MUST be called when you are ready to accept requests
    this.ready();
  };

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
      if (!melCloudAccountData.State) return melCloudAccountData;

      this.pushEvent('status', 'Loading devices...');
      const melCloudDevicesData = await this.withTimeout(melCloudClass.checkDevicesList(), 60_000, 'checkDevicesList');
      return melCloudDevicesData;
    } catch (error) {
      throw new Error(error.message ?? String(error));
    }
  }
}

(() => {
  return new PluginUiServer();
})();
