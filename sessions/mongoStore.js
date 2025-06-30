const { getStoreCollection } = require('../db');

function makeSimpleStore() {
  const store = {
    chats: {
      data: new Map(),
      insertAll(chats = []) { chats.forEach(c => this.data.set(c.id, c)); },
      all() { return Array.from(this.data.values()); }
    },
    messages: {
      messages: {},
      insert(jid, msgs = []) {
        const entry = this.messages[jid] = this.messages[jid] || { array: [] };
        entry.array.push(...msgs);
      }
    },
    bind(ev) {
      ev.on('chats.upsert', chats => this.chats.insertAll(chats));
      ev.on('messages.upsert', ({ messages }) => {
        for (const m of messages) {
          const jid = m.key.remoteJid;
          this.messages[jid] = this.messages[jid] || { array: [] };
          this.messages[jid].array.push(m);
        }
      });
      ev.on('messages.update', updates => {
        for (const { key, update } of updates) {
          const arr = this.messages[key.remoteJid]?.array;
          if (!arr) continue;
          const idx = arr.findIndex(m => m.key.id === key.id);
          if (idx >= 0) arr[idx] = { ...arr[idx], ...update };
        }
      });
    }
  };
  return store;
}

async function useMongoStore(id, sock) {
  const col = await getStoreCollection();
  const record = await col.findOne({ id }) || {};
  const store = makeSimpleStore();

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
