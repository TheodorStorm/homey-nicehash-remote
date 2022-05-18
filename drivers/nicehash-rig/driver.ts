import Homey from 'homey';
import NiceHashLib from '../../nicehash/lib';

class NiceHashRigDriver extends Homey.Driver {
  niceHashLib: NiceHashLib | undefined;
  rigs: any;

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('NiceHashRigDriver has been initialized');

    this.niceHashLib = new NiceHashLib();

    const setPowerModeAction = this.homey.flow.getActionCard('set_power_mode');
    setPowerModeAction.registerRunListener(async (args, state) => {
      await this.niceHashLib?.setRigPowerMode(args.device.details.rigId, args.power_mode);
      await args.device.syncRigDetails();
      return true;
    });
  }

  /**
   * onPairListDevices is called when a user is adding a device and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    this.rigs = await this.niceHashLib?.getRigs();
    let deviceArray = [];

    for(let rig of this.rigs.miningRigs) {
      deviceArray.push({
        name: rig.name,
        data: {
          id: rig.rigId
        }
      });
    }
    return deviceArray;
  }

}

module.exports = NiceHashRigDriver;
