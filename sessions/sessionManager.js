const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason } = require('@whiskeysockets/baileys');
const { getSessionCollection, getStoreCollection } = require('../db');
const { useMongoAuthState } = require('./mongoAuthState');
const { useMongoStore } = require('./mongoStore');

let collection;

async function getCollection() {
  if (!collection) {
    collection = await getSessionCollection();
  }
  return collection;
}

const sessions = {};

async function saveRecord(id) {
  const col = await getCollection();
  const { webhook, apiKey } = sessions[id];
  await col.updateOne({ id }, { $set: { id, webhook, apiKey } }, { upsert: true });
}

async function removeRecord(id) {
  const col = await getCollection();
  await col.deleteOne({ id });
}

// restore all saved instances from the database on startup
async function restoreInstances() {
  const col = await getCollection();
  const all = await col.find().toArray();
  for (const { id, webhook, apiKey } of all) {
    try { await createInstance(id, webhook, apiKey); } catch {}
  }
}

function sendWebhookEvent(id, type, data) {
  const url = sessions[id]?.webhook;
  if (!url) return;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instance: id, type, data })
  }).catch(() => {});
}

function initSessionRecord(id, sock, saveCreds, webhook, apiKey) {
  sessions[id] = {
    sock,
    saveCreds,
    qr: null,
    status: 'connecting',
    webhook: webhook || null,
    apiKey: apiKey || null,
    shouldReconnect: true
  };
}

async function createInstance(id, webhook, apiKey) {
  if (sessions[id]) {
    if (webhook) sessions[id].webhook = webhook;
    if (apiKey) sessions[id].apiKey = apiKey;
    return sessions[id].sock;
  }

  const { state, saveCreds, setWebhook } = await useMongoAuthState(id);
  if (webhook) await setWebhook(webhook);
  const sock = makeWASocket({ auth: state });
  await useMongoStore(id, sock);

  initSessionRecord(id, sock, saveCreds, webhook, apiKey);
  await saveRecord(id);

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (update) => {
    const session = sessions[id];
    if (!session) return;
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      session.qr = qr;
      session.status = 'qr';
      session.wasQr = true;
      sendWebhookEvent(id, 'qr', qr);
    }
    if (connection === 'open') {
      session.status = 'open';
      session.qr = null;
      sendWebhookEvent(id, 'open', {});
      if (session.needsRestart) {
        delete session.needsRestart;
      } else if (session.wasQr) {
        session.needsRestart = true;
        setTimeout(() => restartInstance(id), 1000);
      }
      session.wasQr = false;
    }
    if (connection === 'close') {
      session.status = 'closed';
      sendWebhookEvent(id, 'close', {});
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        delete sessions[id];
      } else if (session.shouldReconnect) {
        createInstance(id);
      } else {
        delete sessions[id];
      }
    }
  });
  sock.ev.process(async (events) => {
    for (const [event, data] of Object.entries(events)) {
      if (event === 'messages.update') {
        data.forEach(u => {
          if (u.update?.pollUpdates) {
            sendWebhookEvent(id, 'poll.update', u);
          }
        });
      }
      sendWebhookEvent(id, event, data);
    }
  });

  return sock;
}

function getInstance(id) {
  return sessions[id]?.sock;
}

function getInstanceStatus(id) {
  return sessions[id]?.status || 'closed';
}

function getInstanceQR(id) {
  return sessions[id]?.qr || null;
}

async function restartInstance(id) {
  const existing = sessions[id];
  if (existing) {
    if (existing.saveCreds) {
      try {
        await existing.saveCreds();
      } catch {}
    }
    existing.shouldReconnect = false;
    try { existing.sock.ws.close(); } catch {}
    delete sessions[id];
  }
  return createInstance(id, existing?.webhook, existing?.apiKey);
}

function updateInstance(id, details) {
  if (!sessions[id]) return null;
  if (details.webhook !== undefined) sessions[id].webhook = details.webhook;
  if (details.apiKey !== undefined) sessions[id].apiKey = details.apiKey;
  saveRecord(id).catch(() => {});
  return sessions[id];
}

async function deleteInstance(id) {
  const existing = sessions[id];
  if (existing) {
    existing.shouldReconnect = false;
    try { existing.sock.ws.close(); } catch {}
    delete sessions[id];
  }
  await removeRecord(id);
  const col = await getStoreCollection();
  await col.deleteOne({ id });
}

async function listInstances() {
  const col = await getCollection();
  const records = await col.find().toArray();
  return records.map((r) => ({
    id: r.id,
    status: sessions[r.id]?.status || 'closed'
  }));
}

async function getInstanceRecord(id) {
  const col = await getCollection();
  return col.findOne({ id });
}

module.exports = {
  createInstance,
  getInstance,
  getInstanceStatus,
  getInstanceQR,
  restartInstance,
  updateInstance,
  deleteInstance,
  listInstances,
  restoreInstances,
  getRecord: getInstanceRecord
};
