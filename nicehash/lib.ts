'use strict';

import NiceHash from './api';

const fetch = require('node-fetch');

class Lib {

    static niceHashApi : NiceHash;
    static bitcoinTicker: any;
    static bitcoinTickerReq = (async function getBitcoinTicker() {
      setTimeout(getBitcoinTicker, 15 * 60 * 1000);
      fetch('https://blockchain.info/ticker')
        .then((res: { text: () => any; }) => res.text())
        .then((text: any) => {
          Lib.bitcoinTicker = JSON.parse(text);
        })
        .catch((err: any) => {});
    }());

    async init(options: { locale: string; apiKey: string; apiSecret: string; orgId: string; }) {
      try {
        // console.log('Init with options:')
        // console.log(options);
        Lib.niceHashApi = new NiceHash({
          apiHost: 'https://api2.nicehash.com',
          locale: options.locale,
          apiKey: options.apiKey,
          apiSecret: options.apiSecret,
          orgId: options.orgId,
        });

        await Lib.niceHashApi.getTime().catch((err: any) => {});
        console.log(`NiceHash server time is ${Lib.niceHashApi.time}`);
        const rigs = await this.getRigs();
        console.log(`${rigs.miningRigs.length} rigs found`);
        return true;
      } catch (ex) {
        console.log(ex);
      }
      return false;
    }

    async getRigs() {
      return await Lib.niceHashApi.get('/main/api/v2/mining/rigs2').catch((err: any) => { console.log(err.message) });
    }

    async getRigDetails(rigId: String) {
      return await Lib.niceHashApi.get(`/main/api/v2/mining/rig2/${rigId}`).catch((err: any) => { console.log(err.message) });
    }

    async setRigStatus(rigId: String, on: boolean) {
      const body = {
        rigId,
        action: (on ? 'START' : 'STOP'),
      };
      return await Lib.niceHashApi.post('/main/api/v2/mining/rigs/status2', { body }).catch((err: any) => { console.log(err.message) });
    }

    async setRigPowerMode(rigId: String, mode: String) {
      const body = {
        rigId,
        action: 'POWER_MODE',
        options: [mode],
      };
      return await Lib.niceHashApi.post('/main/api/v2/mining/rigs/status2', { body }).catch((err: any) => { console.log(err.message) });
    }

    getBitcoinRate(currency: any) {
      if (Lib.bitcoinTicker && Lib.bitcoinTicker[currency]) {
        return Lib.bitcoinTicker[currency];
      }
      return null;
    }

}

export default Lib;
