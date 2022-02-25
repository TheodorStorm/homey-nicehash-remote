import Homey from 'homey';
import NiceHashLib from '../../nicehash/lib';

class NiceHashDashboard extends Homey.Device {
  niceHashLib: NiceHashLib | undefined;
  gatherDetailsTimer: any;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('NiceHashDashboard has been initialized');
    this.niceHashLib = new NiceHashLib();

    if (!this.hasCapability('hashrate')) await this.addCapability('hashrate');
    if (!this.hasCapability('rigs_mining')) await this.addCapability('rigs_mining');

    this.gatherDetails();
    this.gatherDetailsTimer = this.homey.setInterval(() => {
      this.gatherDetails();
    }, 7000);
  }

  getProperty<T, K extends keyof T>(o: T, propertyName: K): T[K] {
    return o[propertyName]; // o[propertyName] is of type T[K]
  }

  async gatherDetails() {
    const rigDriver = this.homey.drivers.getDriver("nicehash-rig");
    if (rigDriver) {
      const rigDevices = rigDriver.getDevices();

      let metrics = new Map<string, number>([
        ['measure_power', 0],
        ['meter_power', 0],
        ['measure_profit', 0],
        ['measure_profit_scarab', 0],
        ['meter_profit', 0],
        ['meter_profit_scarab', 0],
        ['measure_cost', 0],
        ['measure_cost_scarab', 0],
        ['meter_cost', 0],
        ['meter_cost_scarab', 0],    
        ['hashrate', 0]        
      ]);

      metrics.forEach((value: number, metric: string) => {
        for (const rig of rigDevices) {
          let add = rig.getStoreValue(metric);
          value += add;
          metrics.set(metric, value + add);
        }
        this.setCapabilityValue(metric, Math.round(value * 100)/100);
      });

      let rigs_total = 0;
      let rigs_mining = 0;
      for (const rig of rigDevices) {
        rigs_total++;
        rigs_mining += rig.getStoreValue('mining') || 0;
      }
      this.setCapabilityValue('rigs_mining', rigs_mining + '/' + rigs_total);
      // console.log(metrics);

      let revenue = metrics.get('measure_profit') || 0;
      let costPerDayMBTC = (metrics.get('measure_cost') || 0);
      let profit = (revenue - costPerDayMBTC);
      /*
      console.log('        Revenue: ' + revenue + ' mBTC/24h');
      console.log('           Cost: ' + costPerDayMBTC + ' mBTC/24h');
      console.log('         Profit: ' + profit + ' mBTC/24h')
      */
      let profitPct = Math.round((profit/costPerDayMBTC) * 100);
      // console.log('                 (' + profitPct + '%)');

      this.setCapabilityValue('measure_profit_percent', profitPct);
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('NiceHashDashboard has been added');
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
    this.log('NiceHashDashboard settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log('NiceHashDashboard was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('NiceHashDashboard has been deleted');
    this.homey.clearInterval(this.gatherDetailsTimer);
  }

}

module.exports = NiceHashDashboard;
