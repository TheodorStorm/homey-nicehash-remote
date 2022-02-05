import Homey from 'homey';
import NiceHashLib from './nicehash/lib';

class NiceHashRemote extends Homey.App {
  niceHashLib: NiceHashLib | undefined;
  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    await this.niceHashInit();

    const setTariffPowerAction = this.homey.flow.getActionCard('set_tariff_power');
    setTariffPowerAction.registerRunListener(async (args, state) => {
      console.log(args);
      this.homey.settings.set('tariff', args.tariff)
    });

    const setTariffPowerCurrencyAction = this.homey.flow.getActionCard('set_tariff_power_currency');
    setTariffPowerCurrencyAction.registerRunListener(async (args, state) => {
      console.log(args);
      this.homey.settings.set('tariff_currency', args.tariff_currency)
    });    
  }

  async niceHashInit() {
    this.niceHashLib = new NiceHashLib();
    let options = {
      locale: this.homey.settings.get('nicehash_locale') || 'en',
      apiKey: this.homey.settings.get('nicehash_apiKey'),
      apiSecret: this.homey.settings.get('nicehash_apiSecret'),
      orgId: this.homey.settings.get('nicehash_orgId')
    }
    return await this.niceHashLib.init(options);
  }
}

module.exports = NiceHashRemote;
