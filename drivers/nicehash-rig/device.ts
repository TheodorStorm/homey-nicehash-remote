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

    if (!this.hasCapability('measure_cost_scarab')) await this.addCapability('measure_cost_scarab');
    if (!this.hasCapability('measure_profit_scarab')) await this.addCapability('measure_profit_scarab');
    if (!this.hasCapability('meter_cost_scarab')) await this.addCapability('meter_cost_scarab');
    if (!this.hasCapability('meter_profit_scarab')) await this.addCapability('meter_profit_scarab');
    if (!this.hasCapability('measure_profit_percent')) await this.addCapability('measure_profit_percent');

    this.syncRigDetails();
    this.detailsSyncTimer = this.homey.setInterval(() => {
      this.syncRigDetails();
    }, 60000);

    this.registerCapabilityListener("onoff", async (value) => {
      await this.niceHashLib?.setRigStatus(this.getData().id, value);
      this.syncRigDetails();
    });
  }

  async syncRigDetails() {
    let powerUsage = 0.0;
    let algorithms = '';
    let hashrate = 0.0;
    let details = await this.niceHashLib?.getRigDetails(this.getData().id);

    if (!details) return;

    this.setCapabilityValue('status', details.minerStatus).catch(this.error);
    console.log(this.getName());
    for(let device of details.devices) {
      if (device.status.enumName != 'MINING') continue;
      console.log(device.speeds);
      for(let speed of device.speeds) {
        if (!algorithms.includes(speed.title)) {
          algorithms += (algorithms ? ', ' : '') + speed.title;
        }
        let r = Number.parseFloat(speed.speed);
        switch (speed.displaySuffix) {
          case 'H':
            r /= 1000000; // A for effort
            break;
          case 'kH':
            r /= 1000; // You'll get there
            break;
          case 'MH':
            break; // Hi average miner
          case 'GH':
            r /= 0.001; // Wow, cool rig
            break;
          case 'Sol':
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
      this.setCapabilityValue('hashrate', Math.round(hashrate * 100)/100).catch(this.error);
      powerUsage += device.powerUsage;
    }

    this.setCapabilityValue('onoff', details.minerStatus == 'STOPPED' ? false : true).catch(this.error);
    this.setCapabilityValue('measure_profit', Math.round((details.profitability * 1000.0) * 100)/100).catch(this.error);
    this.setCapabilityValue('measure_power', Math.round(powerUsage * 100)/100).catch(this.error);

    let power_tariff = this.homey.settings.get('tariff');
    let power_tariff_currency = this.homey.settings.get("tariff_currency") || 'USD';
    let costPerDay = 0;
    let costPerDayMBTC = 0;
    let bitcoinRate = null;
    let mBTCRate = 0;
    if (power_tariff && power_tariff_currency) {
      bitcoinRate = this.niceHashLib?.getBitcoinRate(power_tariff_currency);
      if (bitcoinRate) {
        let profitabilityScarab = details.profitability * bitcoinRate['15m'];
        this.setCapabilityValue('measure_profit_scarab', Math.round(profitabilityScarab * 100)/100);
        this.setStoreValue('measure_profit_scarab', profitabilityScarab)

        costPerDay = power_tariff * powerUsage/1000 * 24;
        this.setCapabilityValue('measure_cost_scarab', Math.round(costPerDay * 100)/100);
        this.setStoreValue('measure_cost_scarab', costPerDay);

        mBTCRate = bitcoinRate['15m'] / 1000.0;
        let powerMBTCRate = 1/mBTCRate * power_tariff;
        
        let costPerDayMBTC = costPerDay/mBTCRate;

        this.setCapabilityValue('measure_cost', Math.round(costPerDayMBTC * 100)/100);
        this.setStoreValue('measure_cost', costPerDayMBTC);

        console.log('      1 mBTC = ' + mBTCRate + ' ' + power_tariff_currency);
        console.log('Power tariff = ' + power_tariff + ' ' + power_tariff_currency + '/kWh = ' + powerMBTCRate + ' mBTC/kWh');
        console.log('        Cost = ' + costPerDayMBTC + ' mBTC/24h = ' + (costPerDayMBTC * mBTCRate) + ' ' + power_tariff_currency + '/24h');

        if (costPerDayMBTC > 0) {
          let revenue = (details.profitability * 1000.0);
          let profit = (revenue - costPerDayMBTC);
          console.log('Revenue: ' + revenue + ' mBTC/24h');
          console.log('   Cost: ' + costPerDayMBTC + ' mBTC/24h');
          console.log(' Profit: ' + profit + ' mBTC/24h')
          let profitPct = Math.round(profit/costPerDayMBTC * 100);
          console.log('         ' + profitPct + '%');

          this.setStoreValue('measure_profit_percent', profitPct);
          this.setCapabilityValue('measure_profit_percent', profitPct);
        }
      }
    }

    if (this.lastSync > 0) {
      let now = new Date().getTime(); // milliseconds
      let meter_power = this.getCapabilityValue('meter_power');
      let power_add = (powerUsage / 1000) * ((now - this.lastSync) / 3600000);
      this.setCapabilityValue('meter_power', Math.round((meter_power + power_add) * 100)/100).catch(this.error);
      this.setStoreValue('meter_power', meter_power + power_add);

      let meter_profit = this.getStoreValue('meter_profit');
      let mbtc_profit_add = (details.profitability * 1000) * ((now - this.lastSync) / (86400000));
      this.setCapabilityValue('meter_profit', Math.round((meter_profit + mbtc_profit_add) * 100)/100).catch(this.error);
      this.setStoreValue('meter_profit', meter_profit + mbtc_profit_add);
      if (mBTCRate) {
        let profitScarab = (meter_profit + mbtc_profit_add) * mBTCRate;
        this.setCapabilityValue('meter_profit_scarab', Math.round(profitScarab * 100)/100).catch(this.error);
        this.setStoreValue('meter_profit_scarab', profitScarab);
      }

      let meter_cost = this.getStoreValue('meter_cost');
      let mbtc_cost_add = costPerDayMBTC * ((now - this.lastSync) / (86400000));
      let new_meter_cost = meter_cost + mbtc_cost_add;
      this.setCapabilityValue('meter_cost', Math.round(new_meter_cost * 100)/100).catch(this.error);
      this.setStoreValue('meter_cost', new_meter_cost);
      if (mBTCRate) {
        this.setCapabilityValue('meter_cost_scarab', Math.round((new_meter_cost * mBTCRate) * 100)/100).catch(this.error);
        this.setStoreValue('meter_cost_scarab', new_meter_cost * mBTCRate);
      }
    }
    this.lastSync = new Date().getTime();

    if (this.details &&
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
