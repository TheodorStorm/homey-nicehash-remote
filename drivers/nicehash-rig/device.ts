import Homey, { App, BlePeripheral } from 'homey';
import NiceHashLib from '../../nicehash/lib';

class NiceHashRigDevice extends Homey.Device {
  niceHashLib: NiceHashLib | undefined;
  details: any;
  detailsSyncTimer: any;
  lastSync: number = 0;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('NiceHashRigDevice has been initialized');
    this.niceHashLib = new NiceHashLib();

    this.syncRigDetails();
    this.detailsSyncTimer = this.homey.setInterval(() => {
      this.syncRigDetails();
    }, 60000);

    this.registerCapabilityListener("onoff", async (value) => {
      await this.niceHashLib?.setRigStatus(this.getData().id, value);
      this.syncRigDetails();
      // this.setCapabilityValue('onoff', value);
    });
  }

  async syncRigDetails() {
    let powerUsage = 0.0;
    let algorithms = '';
    let hashrate = 0.0;
    let details = await this.niceHashLib?.getRigDetails(this.getData().id);

    this.setCapabilityValue('status', details.minerStatus).catch(this.error);
    // console.log(this.getName());
    for(let device of details.devices) {
      if (device.status.enumName != 'MINING') continue;
      // console.log(device.speeds);
      for(let speed of device.speeds) {
        if (!algorithms.includes(speed.title)) {
          algorithms += (algorithms ? ', ' : '') + speed.title;
        }
        let r = Number.parseFloat(speed.speed);
        switch (speed.displaySuffix) {
          case 'H':
            r /= 1000000; // A for effort
          case 'kH':
            r /= 1000; // You'll get there
            break;
          case 'MH':
            break; // Hi average miner
          case 'GH':
            r /= 0.001; // Wow, cool rig
            break;
          case 'TH':
            r /= 0.000001; // Hi Elon
            break;
          case 'PH':
            r /= 0.000000001; // Holy shit, well this will probably overflow but you can afford it
            break;
          case 'EH':
            r /= 0.000000000001; // Godspeed, sheik
        }
        hashrate += r;
      }
      this.setCapabilityValue('algorithm', algorithms);
      this.setCapabilityValue('hashrate', hashrate).catch(this.error);
      powerUsage += device.powerUsage;
    }

    this.setCapabilityValue('onoff', details.minerStatus == 'STOPPED' ? false : true).catch(this.error);
    this.setCapabilityValue('measure_profit', details.profitability * 1000.0).catch(this.error);
    this.setCapabilityValue('measure_power', powerUsage).catch(this.error);

    let power_tariff = this.homey.settings.get("tariff");
    let power_tariff_currency = this.homey.settings.get("tariff_currency");
    let costPerDay = 0;
    if (power_tariff && power_tariff_currency) {
      let bitcoinRate = this.niceHashLib?.getBitcoinRate(power_tariff_currency);
      if (bitcoinRate) {
        let mBTCRate = bitcoinRate['15m'] / 1000.0;
        let powerMBTCRate = 1/mBTCRate * power_tariff;
        costPerDay = powerMBTCRate * powerUsage/1000 * 24;
        this.setCapabilityValue('measure_cost', costPerDay);
        // console.log('1 mBTC = ' + mBTCRate + ' ' + power_tariff_currency);
        // console.log('Power tariff = ' + power_tariff + ' ' + power_tariff_currency + '/kWh = ' + powerMBTCRate + ' mBTC/kWh');
        // console.log('Cost = ' + costPerDay + ' mBTC/24h = ' + (costPerDay * mBTCRate) + ' ' + power_tariff_currency + '/24h');
      }
    }

    if (this.lastSync > 0) {
      let now = new Date().getTime(); // milliseconds
      let meter_power = this.getCapabilityValue('meter_power');
      let power_add = (powerUsage / 1000) * ((now - this.lastSync) / 3600000);
      this.setCapabilityValue('meter_power', meter_power + power_add).catch(this.error);

      let meter_profit = this.getCapabilityValue('meter_profit');
      let mbtc_profit_add = (details.profitability * 1000) * ((now - this.lastSync) / (86400000));
      this.setCapabilityValue('meter_profit', meter_profit + mbtc_profit_add).catch(this.error);

      let meter_cost = this.getCapabilityValue('meter_cost');
      let mbtc_cost_add = costPerDay * ((now - this.lastSync) / (86400000));
      this.setCapabilityValue('meter_cost', meter_cost + mbtc_cost_add).catch(this.error);
    }
    this.lastSync = new Date().getTime();

    if (!this.details ||
      this.details.minerStatus != details.minerStatus) {
      console.log(this.getName() + ' old status="' + (this.details ? this.details.minerStatus : 'unknown') + '", new status="' + details.minerStatus + '"');
      const statusChangedTrigger = this.homey.flow.getTriggerCard('status_changed');
      const tokens = {
        name: this.getName(),
        status: details.minerStatus
      };
      statusChangedTrigger.trigger(tokens).catch(this.error);
    }

    this.details = details;
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('NiceHashRigDevice has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings: {}, newSettings: {}, changedKeys: {} }): Promise<string|void> {
    this.log('NiceHashRigDevice settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log('NiceHashRigDevice was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('NiceHashRigDevice has been deleted');
    this.homey.clearInterval(this.detailsSyncTimer);
  }
}

module.exports = NiceHashRigDevice;
