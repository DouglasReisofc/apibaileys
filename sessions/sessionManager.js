const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason } = require('@whiskeysockets/baileys');
const { getSessionCollection } = require('../db');
const { useMongoAuthState } = require('./mongoAuthState');

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
  const { webhook } = sessions[id];
  await col.updateOne({ id }, { $set: { id, webhook } }, { upsert: true });
}

async function removeRecord(id) {
  const col = await getCollection();
  await col.deleteOne({ id });
}

async function restoreSessions() {
  const col = await getCollection();
  const all = await col.find().toArray();
  for (const { id, webhook } of all) {
    try { await createSession(id, webhook); } catch {}
  }
}

function sendWebhookEvent(id, type, data) {
  const url = sessions[id]?.webhook;
  if (!url) return;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: id, type, data })
  }).catch(() => {});
}

function initSessionRecord(id, sock, saveCreds, webhook) {
  sessions[id] = {
    sock,
    saveCreds,
    qr: null,
    status: 'connecting',
    webhook: webhook || null,
    shouldReconnect: true
  };
}

async function createSession(id, webhook) {
  if (sessions[id]) {
    if (webhook) sessions[id].webhook = webhook;
    return sessions[id].sock;
  }

  const { state, saveCreds, setWebhook } = await useMongoAuthState(id);
  if (webhook) await setWebhook(webhook);
  const sock = makeWASocket({ auth: state });

  initSessionRecord(id, sock, saveCreds, webhook);
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
        setTimeout(() => restartSession(id), 500);
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
        createSession(id);
      } else {
        delete sessions[id];
      }
    }
  });
  sock.ev.on('messages.upsert', (m) => sendWebhookEvent(id, 'messages', m));

  return sock;
}

function getSession(id) {
  return sessions[id]?.sock;
}

function getSessionStatus(id) {
  return sessions[id]?.status || 'closed';
}

function getSessionQR(id) {
  return sessions[id]?.qr || null;
}

async function restartSession(id) {
  const existing = sessions[id];
  if (existing) {
    existing.shouldReconnect = false;
    try { existing.sock.ws.close(); } catch {}
    delete sessions[id];
  }
  return createSession(id, existing?.webhook);
}

function updateSession(id, details) {
  if (!sessions[id]) return null;
  if (details.webhook !== undefined) sessions[id].webhook = details.webhook;
  saveRecord(id).catch(() => {});
  return sessions[id];
}

async function deleteSession(id) {
  const existing = sessions[id];
  if (existing) {
    existing.shouldReconnect = false;
    try { existing.sock.ws.close(); } catch {}
    delete sessions[id];
  }
  await removeRecord(id);
}

async function listSessions() {
  const col = await getCollection();
  const records = await col.find().toArray();
  return records.map((r) => ({
    id: r.id,
    status: sessions[r.id]?.status || 'closed'
  }));
}

module.exports = {
  createSession,
  getSession,
  getSessionStatus,
  getSessionQR,
  restartSession,
  updateSession,
  deleteSession,
  listSessions,
  restoreSessions
};
