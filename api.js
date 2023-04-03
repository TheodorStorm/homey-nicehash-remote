'use strict';

module.exports = {
  async init({ homey, query }) {
    // you can access query parameters like "/?foo=bar" through `query.foo`

    // you can access the App instance through homey.app
    const result = await homey.app.niceHashInit();

    // perform other logic like mapping result data

    console.log(`init result: ${result}`);
    return result;
  },
};
