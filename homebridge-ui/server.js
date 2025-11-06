import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils';
import MelCloud from '../src/melcloud.js';

class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    //connect
    this.onRequest('/connect', this.start.bind(this));

    //this MUST be called when you are ready to accept requests
    this.ready();
  };

  async start(account) {
    const accountName = account.name;
    const accountFile = `${this.homebridgeStoragePath}/melcloud/${accountName}_Account`;
    const buildingsFile = `${this.homebridgeStoragePath}/melcloud/${accountName}_Buildings`;
    const devicesFile = `${this.homebridgeStoragePath}/melcloud/${accountName}_Devices`;
    const melCloud = new MelCloud(account, accountFile, buildingsFile, devicesFile);

    try {
      const accountInfo = await melCloud.connect();
      if (!accountInfo.State) return accountInfo;

      const devicesList = await melCloud.checkDevicesList();
      return devicesList;
    } catch (error) {
      throw new Error(error);
    };
  };
};

(() => {
  return new PluginUiServer();
})();
