import Homey from 'homey';

class NiceHashDashboardDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('NiceHashDashboardDriver has been initialized');
  }

  /**
   * onPairListDevices is called when a user is adding a device and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    return [
      {
        name: 'Dashboard',
        data: {
          id: 'nicehashremote-dashboard',
        }
      }
    ];
  }

}

module.exports = NiceHashDashboardDriver;
