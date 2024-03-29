'use strict';

import Homey from 'homey';
import NiceHashLib from '../../nicehash/lib';

class NiceHashRigDevice extends Homey.Device {

  niceHashLib: NiceHashLib | undefined; // NiceHash library
  details: any; // Rig details
  detailsSyncTimer: any; // Timer for syncing rig details
  lastSync: number = 0; // When was the last time we synced rig status with NiceHash
  lastMined: number = 0; // When was the last time we mined
  benchmarkStart: number = 0; // benchmark start time
  smartMagicNumber: number = 7; // 7 is the magic number
  rollingProfit: number = 0; // smartMagicNumber minutes rolling profit
  algorithms: any; // Algorithms
  getAlgorithmsTimer: any; // Timer for getting algorithms

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('NiceHashRigDevice has been initialized');
    this.niceHashLib = new NiceHashLib();

    this.algorithms = [];
    this.getAlgorithmsTimer = this.homey.setInterval(() => {
      this.getAlgorithms();
    }, 60 * 60 * 1000);

    if (!this.hasCapability('smart_mode')) await this.addCapability('smart_mode');
    if (!this.hasCapability('measure_cost_scarab')) await this.addCapability('measure_cost_scarab');
    if (!this.hasCapability('measure_profit_scarab')) await this.addCapability('measure_profit_scarab');
    if (!this.hasCapability('meter_cost_scarab')) await this.addCapability('meter_cost_scarab');
    if (!this.hasCapability('meter_profit_scarab')) await this.addCapability('meter_profit_scarab');
    if (!this.hasCapability('measure_profit_percent')) await this.addCapability('measure_profit_percent');
    if (!this.hasCapability('measure_temperature')) await this.addCapability('measure_temperature');
    if (!this.hasCapability('measure_load')) await this.addCapability('measure_load');
    if (!this.hasCapability('power_mode')) await this.addCapability('power_mode');
    if (!this.hasCapability('measure_tariff_limit')) await this.addCapability('measure_tariff_limit');
    if (!this.hasCapability('smart_mode_min_profitability')) await this.addCapability('smart_mode_min_profitability');

    this.syncRigDetails().catch(this.error);
    this.detailsSyncTimer = this.homey.setInterval(() => {
      this.syncRigDetails().catch(this.error);
    }, 60000);

    // Register capability listeners
    this.registerCapabilityListener('onoff', async value => {
      console.log('Device onoff =', value);
      await this.niceHashLib?.setRigStatus(this.getData().id, value);
    });

    this.registerCapabilityListener('smart_mode', async value => {
      console.log('Autopilot =', value);
      await this.niceHashLib?.setRigStatus(this.getData().id, value);
    });

    this.registerCapabilityListener('smart_mode_min_profitability', async value => {
      console.log('Autopilot Min Net Profitability', value);
      await this.setCapabilityValue('smart_mode_min_profitability', value);
    });
  }

  private async getAlgorithms() {
    if (this.niceHashLib) {
      const algos = await this.niceHashLib.getAlgorithms().catch(this.error);
      if (algos && algos.miningAlgorithms) {
        this.algorithms = [];
        for (const algo of algos.miningAlgorithms) {
          this.algorithms[algo.order] = algo;
        }
      }
    }
  }

  /*
    syncRigDetails() is called to sync device status with NiceHash.
    If Autopilot is enabled, it will also start/stop mining based on profitability.
  */
  async syncRigDetails() {
    const settings = this.getSettings();
    let powerUsage = 0.0;
    let algorithms = '';
    let hashrate = 0.0;
    let mining = 0;
    let temperature = 0;
    let load = 0;
    const details = await this.niceHashLib?.getRigDetails(this.getData().id);
    const power_tariff = this.homey.settings.get('tariff');
    const power_tariff_currency = this.homey.settings.get('tariff_currency') || 'USD';
    const smart_mode = await this.getCapabilityValue('smart_mode');
    const smart_mode_min_profitability = settings.smart_mode_min_profitability || 0;
    await this.setCapabilityValue('smart_mode_min_profitability', smart_mode_min_profitability).catch(this.error);

    // If we don't have rig details, we can't do anything
    if (!details || !details.type || details.type === 'UNMANAGED') return;

    const tariff_limit = this.getStoreValue('tariff_limit') || -1;
    if (tariff_limit !== -1) this.setCapabilityValue('measure_tariff_limit', tariff_limit).catch(this.error);

    if (details.minerStatus) this.setCapabilityValue('status', details.minerStatus).catch(this.error);
    if (details.rigPowerMode) this.setCapabilityValue('power_mode', details.rigPowerMode).catch(this.error);

    // console.log(details);

    console.log(`───────────────────────────────────────────────────────\n[${this.getName()}]`);
    console.log('   Power tariff: ', power_tariff);
    console.log('   Tariff limit: ', tariff_limit);

    if (details.devices || details.hasV4Rigs) {
      if (details.devices) {
        for (const device of details.devices) {
          if (device.status.enumName === 'DISABLED' || device.status.enumName === 'OFFLINE') continue;

          temperature = Math.max(temperature, device.temperature);
          powerUsage += device.powerUsage;
          load += device.load;

          if (device.status.enumName !== 'MINING') continue;

          mining++;

          for (const speed of device.speeds) {
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
                break;
              default:
                break; // Hi average miner (or I have no idea what you are mining)
            }
            hashrate += r;
          }
        }
      }

      if (details.hasV4Rigs && details.v4 && details.v4.devices) {
        for (const device of details.v4.devices) {
          // console.log(device);
          if (device.mdv && device.mdv.algorithmsSpeed) {
            for (const algo of device.mdv.algorithmsSpeed) {
              // console.log(algo);
              // console.log(this.algorithms[algo.algorithm]);
              if (!this.algorithms || !this.algorithms[algo.algorithm]) await this.getAlgorithms();
              if (this.algorithms[algo.algorithm]) algorithms += (algorithms ? ', ' : '') + this.algorithms[algo.algorithm].title;
              const r = Number.parseFloat(algo.speed) / 1_000_000;

              if (r > 0) mining++;

              hashrate += r;
            }
          }

          for (const keypair of device.odv) {
            if (keypair.key === 'Power usage') powerUsage += Number.parseFloat(keypair.value);
            if (keypair.key === 'Temperature') temperature = Math.max(temperature, Number.parseFloat(keypair.value));
            if (keypair.key === 'Load') load += Number.parseFloat(keypair.value);
          }
        }
      }

      console.log(`      Algorithm: ${algorithms || '-'}`);
      console.log(`      Hash Rate: ${hashrate}`);
      console.log(`         Status: ${details.minerStatus}`);

      this.setCapabilityValue('algorithm', algorithms || '-').catch(this.error);
      this.setCapabilityValue('measure_temperature', temperature).catch(this.error);
      this.setCapabilityValue('measure_load', load).catch(this.error);
      this.setCapabilityValue('hashrate', Math.round(hashrate * 100) / 100).catch(this.error);
      this.setStoreValue('hashrate', hashrate);
      this.setCapabilityValue('onoff', !(details.minerStatus === 'STOPPED' || details.minerStatus === 'OFFLINE')).catch(this.error);
      this.setStoreValue('measure_power', powerUsage);
      this.setCapabilityValue('measure_power', Math.round(powerUsage * 100) / 100).catch(this.error);

      if (this.details
        && this.details.minerStatus !== details.minerStatus) {
        // console.log(this.getName() + ' old status="' + (this.details ? this.details.minerStatus : 'unknown') + '", new status="' + details.minerStatus + '"');
        const statusChangedTrigger = this.homey.flow.getTriggerCard('rig_status_changed');
        const tokens = {
          name: this.getName(),
          status: details.minerStatus,
        };
        statusChangedTrigger.trigger(tokens).catch(this.error);
      }
      this.details = details;

      if (mining === 0) {
        this.setStoreValue('mining', 0);
        this.setStoreValue('measure_profit', 0);
        this.setCapabilityValue('measure_profit', 0);
        this.setStoreValue('measure_profit_scarab', 0);
        this.setCapabilityValue('measure_profit_scarab', 0);
        this.setStoreValue('measure_profit_percent', 0);
        this.setCapabilityValue('measure_profit_percent', 0);

        this.setStoreValue('measure_cost', 0);
        this.setCapabilityValue('measure_cost', 0);
        this.setStoreValue('measure_cost_scarab', 0);
        this.setCapabilityValue('measure_cost_scarab', 0);

        this.lastSync = 0;
        this.benchmarkStart = 0;
        this.rollingProfit = 0;

        if (smart_mode
          && (tariff_limit === -1 || tariff_limit > power_tariff
            || this.lastMined === 0 || (this.lastMined && Date.now() - this.lastMined > 1000 * 60 * 60 * this.smartMagicNumber))) {
          // We're in autopilot, and we're not mining, and we're either not limited by tariff,
          // or we are but current power tariff is lower than tariff limit,
          // or we haven't been mining for smartMagicNumber hours (force new benchmark every so often, will stop rig if it's not profitable)
          console.log('Autopilot starting rig (tariff limit = ', tariff_limit, 'power_tariff = ', `${power_tariff})`);
          await this.niceHashLib?.setRigStatus(this.getData().id, true);
        }

        return;
      }

      if (!hashrate) {
        // We're mining but we don't have a hashrate, so we're probably waiting for a job
        console.log('Waiting for job, setting profitability to 0...');
        details.profitability = 0;
      }

      this.setStoreValue('measure_profit', details.profitability * 1000.0);
      this.setCapabilityValue('measure_profit', Math.round((details.profitability * 1000.0) * 100) / 100).catch(this.error);
      this.setStoreValue('mining', 1);

      this.lastMined = Date.now();

      let costPerDay = 0;
      let costPerDayMBTC = 0;
      let bitcoinRate = null;
      let mBTCRate = 0;
      let profitPct = 0;
      if (power_tariff && power_tariff_currency) {
        bitcoinRate = this.niceHashLib?.getBitcoinRate(power_tariff_currency);
        if (bitcoinRate) {
          if (mining > 0) {
            // Calculate profitability
            const profitabilityScarab = details.profitability * bitcoinRate['15m'];
            this.setCapabilityValue('measure_profit_scarab', Math.round(profitabilityScarab * 100) / 100);
            this.setStoreValue('measure_profit_scarab', profitabilityScarab);
          }

          // Calculate cost per day
          costPerDay = power_tariff * powerUsage / 1000 * 24;
          this.setCapabilityValue('measure_cost_scarab', Math.round(costPerDay * 100) / 100);
          this.setStoreValue('measure_cost_scarab', costPerDay);

          mBTCRate = bitcoinRate['15m'] / 1000.0;
          const powerMBTCRate = (1 / mBTCRate) * power_tariff;

          costPerDayMBTC = costPerDay / mBTCRate;

          this.setCapabilityValue('measure_cost', Math.round(costPerDayMBTC * 100) / 100);
          this.setStoreValue('measure_cost', costPerDayMBTC);

          console.log(`        1 mBTC = ${mBTCRate} ${power_tariff_currency}`);
          console.log(`  Power tariff = ${power_tariff} ${power_tariff_currency}/kWh = ${powerMBTCRate} mBTC/kWh`);
          console.log(`          Cost = ${costPerDayMBTC} mBTC/24h = ${costPerDayMBTC * mBTCRate} ${power_tariff_currency}/24h`);

          if (mining > 0 && costPerDayMBTC > 0) {
            // Calculate profit
            const revenue = (details.profitability * 1000.0);
            const profit = (revenue - costPerDayMBTC);
            console.log(`        Revenue: ${revenue} mBTC/24h`);
            console.log(`           Cost: ${costPerDayMBTC} mBTC/24h`);
            console.log(`         Profit: ${profit} mBTC/24h`);
            profitPct = Math.round((profit / costPerDayMBTC) * 100);
            console.log(`                 (${profitPct}%)`);

            this.setStoreValue('measure_profit_percent', profitPct);
            this.setCapabilityValue('measure_profit_percent', profitPct);
          }
        }
      }

      if (this.lastSync > 0) {
        const now = new Date().getTime(); // milliseconds
        const meter_power = this.getStoreValue('meter_power') || 0;
        const power_add = (powerUsage / 1000) * ((now - this.lastSync) / (1000 * 60 * 60));
        console.log(`      power_add: ${power_add} kWh`);
        this.setStoreValue('meter_power', meter_power + power_add);
        console.log(`   meter_power = ${meter_power} kWh`);
        this.setCapabilityValue('meter_power', Math.round((meter_power) * 100) / 100).catch(this.error);

        const meter_profit = this.getStoreValue('meter_profit') || 0;
        console.log(`   meter_profit: ${meter_profit}`);
        const mbtc_profit_add = (details.profitability * 1000) * ((now - this.lastSync) / (86400000));
        console.log(`mbtc_profit_add: ${mbtc_profit_add}`);
        this.setStoreValue('meter_profit', meter_profit + mbtc_profit_add);
        this.setCapabilityValue('meter_profit', Math.round((meter_profit + mbtc_profit_add) * 100) / 100).catch(this.error);
        if (mBTCRate) {
          const profitScarab = (meter_profit + mbtc_profit_add) * mBTCRate;
          this.setStoreValue('meter_profit_scarab', profitScarab);
          this.setCapabilityValue('meter_profit_scarab', Math.round(profitScarab * 100) / 100).catch(this.error);
        }

        const meter_cost = this.getStoreValue('meter_cost') || 0;
        console.log(`     meter_cost: ${meter_cost}`);
        const mbtc_cost_add = costPerDayMBTC * ((now - this.lastSync) / (86400000));
        console.log(`  mbtc_cost_add: ${mbtc_cost_add}`);
        const new_meter_cost = meter_cost + mbtc_cost_add;
        this.setStoreValue('meter_cost', new_meter_cost);
        this.setCapabilityValue('meter_cost', Math.round(new_meter_cost * 100) / 100).catch(this.error);
        if (mBTCRate) {
          this.setStoreValue('meter_cost_scarab', new_meter_cost * mBTCRate);
          this.setCapabilityValue('meter_cost_scarab', Math.round((new_meter_cost * mBTCRate) * 100) / 100).catch(this.error);
        }

        if (hashrate) { // Skip if we are waiting for a job
          // Calculate rolling profit percentage
          if (this.benchmarkStart === 0) {
            this.benchmarkStart = new Date().getTime();
            this.rollingProfit = profitPct;
          } else {
            this.rollingProfit = this.rollingProfit * ((this.smartMagicNumber - 1) / this.smartMagicNumber) + profitPct * (1 / this.smartMagicNumber);
          }

          console.log(' Rolling Profit:', this.rollingProfit, '%');

          if (this.benchmarkStart > 0 && (new Date().getTime() - this.benchmarkStart) > this.smartMagicNumber * 60000) {
            // Autopilot
            if (this.rollingProfit < smart_mode_min_profitability && profitPct < smart_mode_min_profitability) {
              // Rig is not profitable
              console.log('Rig is not profitable (profit = ', profitPct, ' rolling profit = ', this.rollingProfit, '%', 'minimum profitability = ', smart_mode_min_profitability, '%)');

              // Set tariff limit to current tariff
              console.log('Setting tariff limit to ', power_tariff, ' (was ', tariff_limit, ')');
              this.setStoreValue('tariff_limit', power_tariff);

              if (smart_mode) {
                // Stop rig
                console.log('Autopilot stopping rig (tariff limit = ', tariff_limit, 'power_tariff = ', `${power_tariff})`);
                await this.niceHashLib?.setRigStatus(this.getData().id, false);
              }
            } else {
              // Rig is profitable
              if (power_tariff > tariff_limit) {
                // Raise tariff limit to current tariff
                console.log('Raising tariff limit to ', power_tariff, ' (was ', tariff_limit, ')');
                this.setStoreValue('tariff_limit', power_tariff);
              }
            }
          }
        }
      }
    }
    this.lastSync = new Date().getTime();
  }

  async setSmartModeMinProfitability(minProfitability: number) {
    await this.setSettings({
      smart_mode_min_profitability: minProfitability,
    });
    // Benchmark if we are not already mining
    await this.niceHashLib?.setRigStatus(this.getData().id, true);
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
    // Benchmark if we are not already mining
    await this.niceHashLib?.setRigStatus(this.getData().id, true);
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
    this.homey.clearInterval(this.getAlgorithmsTimer);
  }

}

module.exports = NiceHashRigDevice;
