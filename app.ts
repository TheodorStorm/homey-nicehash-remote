import Homey from 'homey';
import NiceHashLib from './nicehash/lib';

class NiceHashRemote extends Homey.App {
  niceHashLib: NiceHashLib | undefined;
  lastBitcoinRate: any;
  bitcoinRateToken: any;
  bitcoinCurrencyToken: any;

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
    
    setInterval(() => { this.youSuffer() }, 13000);
  }

  async niceHashInit() {
    this.lastBitcoinRate = null;
    this.niceHashLib = new NiceHashLib();
    let options = {
      locale: this.homey.settings.get('nicehash_locale') || 'en',
      apiKey: this.homey.settings.get('nicehash_apiKey'),
      apiSecret: this.homey.settings.get('nicehash_apiSecret'),
      orgId: this.homey.settings.get('nicehash_orgId')
    }
    return await this.niceHashLib.init(options);
  }

  async youSuffer() {
    let power_tariff_currency = this.homey.settings.get("tariff_currency") || 'USD';
    let bitcoinRate = this.niceHashLib?.getBitcoinRate(power_tariff_currency);
    let gilfoyle_threshold = this.homey.settings.get('gilfoyle_threshold') || 5;

    // console.log(bitcoinRate);

    if (bitcoinRate) {
      if (!this.bitcoinRateToken) {
        this.bitcoinRateToken = await this.homey.flow.createToken("nicehash_bitcoin_rate", {
          type: "number",
          title: "BTC Price",
        });
      }
      if (!this.bitcoinCurrencyToken) {
        this.bitcoinCurrencyToken = await this.homey.flow.createToken("nicehash_bitcoin_currency", {
          type: "string",
          title: "BTC Price Currency",
        });
      }
  
      await this.bitcoinRateToken.setValue(bitcoinRate['15m']);
      await this.bitcoinCurrencyToken.setValue(power_tariff_currency);
    }

    if (this.lastBitcoinRate && bitcoinRate) {
      let change = ((bitcoinRate.last - this.lastBitcoinRate['15m']) / this.lastBitcoinRate['15m'])*100.0;
      if (Math.abs(change) >= gilfoyle_threshold) {
        console.log('!!! BTC price changed by ' + change + '% *HGEFBLURGH*');
        const statusChangedTrigger = this.homey.flow.getTriggerCard('you_suffer');
        const tokens = {
          btc_rate_old: this.lastBitcoinRate['15m'],
          btc_rate: bitcoinRate['15m'],
          pct_change: change,
          currency: power_tariff_currency,
        };
        statusChangedTrigger.trigger(tokens).catch(this.error);
        this.lastBitcoinRate = bitcoinRate;
      }
    } else this.lastBitcoinRate = bitcoinRate;
    
  }
}

module.exports = NiceHashRemote;
