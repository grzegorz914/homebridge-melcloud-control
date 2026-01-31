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

  async start(account) {
    const melCloudClass = account.type === 'melcloud' ? new MelCloud(account) : new MelCloudHome(account);

    try {
      const melCloudAccountData = await melCloudClass.connect();
      if (!melCloudAccountData.State) return melCloudAccountData;

      const melCloudDevicesData = await melCloudClass.checkDevicesList();
      return melCloudDevicesData;
    } catch (error) {
      throw new Error(error);
    }
  }
}

(() => {
  return new PluginUiServer();
})();
