const { makeInMemoryStore } = require('@whiskeysockets/baileys');
const { getStoreCollection } = require('../db');

async function useMongoStore(id, sock) {
  const col = await getStoreCollection();
  const record = await col.findOne({ id }) || {};
  const store = makeInMemoryStore({});

  // load chats & messages
  if (record.chats) {
    store.chats.insertAll(record.chats);
  }
  if (record.messages) {
    for (const jid in record.messages) {
      const messages = record.messages[jid].map(m => ({ key: m.key, message: m.message, messageTimestamp: m.messageTimestamp }));
      store.messages.insert(jid, messages);
    }
  }

  if (sock) store.bind(sock.ev);

  async function write() {
    await col.updateOne({ id }, {
      $set: {
        id,
        chats: store.chats.all(),
        messages: Object.fromEntries(Object.entries(store.messages.messages).map(([k, v]) => [k, v.array]))
      }
    }, { upsert: true });
  }

  sock?.ev.on('messages.upsert', write);
  sock?.ev.on('messages.update', write);
  sock?.ev.on('chats.upsert', write);

  return { store, write };
}

module.exports = { useMongoStore };
