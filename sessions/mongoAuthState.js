const { initAuthCreds } = require('@whiskeysockets/baileys');
const { getSessionCollection } = require('../db');

async function useMongoAuthState(id) {
  const col = await getSessionCollection();
  let record = await col.findOne({ id }) || {};
  let creds = record.creds || initAuthCreds();
  let keys = record.keys || {};

  const write = async () => {
    await col.updateOne(
      { id },
      { $set: { id, creds, keys, webhook: record.webhook } },
      { upsert: true }
    );
  };

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          for (const id of ids) {
            data[id] = keys[type]?.[id];
          }
          return data;
        },
        set: async (data) => {
          for (const category in data) {
            keys[category] = keys[category] || {};
            Object.assign(keys[category], data[category]);
          }
          await write();
        }
      }
    },
    saveCreds: async () => {
      await write();
    },
    setWebhook: async (webhook) => {
      record.webhook = webhook;
      await write();
    }
  };
}

module.exports = { useMongoAuthState };
