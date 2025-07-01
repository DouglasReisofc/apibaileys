const { getStoreCollection } = require('../db');
const { log } = require('../utils/logger');

function toBuffer(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (obj._bsontype === 'Binary') return obj.buffer;
  if (Array.isArray(obj)) return obj.map(toBuffer);
  for (const k in obj) obj[k] = toBuffer(obj[k]);
  return obj;
}

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
    loadMessage(jid, id) {
      const arr = this.messages[jid]?.array;
      if (arr) {
        const msg = arr.find(m => m.key.id === id);
        if (msg) return msg;
      }
      for (const entry of Object.values(this.messages)) {
        const found = entry.array.find(m => m.key.id === id);
        if (found) return found;
      }
      return undefined;
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
  const record = toBuffer(await col.findOne({ id }) || {});
  const store = makeSimpleStore();

  // load chats & messages
  if (record.chats) {
    store.chats.insertAll(record.chats);
  }
  if (record.messages) {
    for (const jid in record.messages) {
      store.messages.insert(jid, record.messages[jid]);
    }
  }

  function bind(ev) {
    store.bind(ev);
    ev.on('messages.upsert', write);
    ev.on('messages.update', write);
    ev.on('chats.upsert', write);
  }

  if (sock) bind(sock.ev);

  async function write() {
    try {
      await col.updateOne({ id }, {
        $set: {
          id,
          chats: store.chats.all(),
          messages: Object.fromEntries(
            Object.entries(store.messages.messages).map(([k, v]) => [k, v.array])
          )
        }
      }, { upsert: true });
      const total = Object.values(store.messages.messages)
        .reduce((s, v) => s + v.array.length, 0);
      log(`[store] saved ${id} (chats ${store.chats.data.size}, messages ${total})`);
    } catch (err) {
      log(`[store] failed to save ${id}: ${err.message}`);
    }
  }

  return { store, bind, write };
}

module.exports = { useMongoStore };
