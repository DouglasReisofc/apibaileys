const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

const sessions = {};

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
    webhook: webhook || null
  };
}

async function createSession(id, webhook) {
  if (sessions[id]) {
    if (webhook) sessions[id].webhook = webhook;
    return sessions[id].sock;
  }

  const { state, saveCreds } = await useMultiFileAuthState(`session-${id}`);
  const sock = makeWASocket({ auth: state });

  initSessionRecord(id, sock, saveCreds, webhook);

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      sessions[id].qr = qr;
      sessions[id].status = 'qr';
      sessions[id].wasQr = true;
      sendWebhookEvent(id, 'qr', qr);
    }
    if (connection === 'open') {
      sessions[id].status = 'open';
      sessions[id].qr = null;
      sendWebhookEvent(id, 'open', {});
      if (sessions[id].needsRestart) {
        delete sessions[id].needsRestart;
      } else if (sessions[id].wasQr) {
        sessions[id].needsRestart = true;
        setTimeout(() => restartSession(id), 500);
      }
      sessions[id].wasQr = false;
    }
    if (connection === 'close') {
      sessions[id].status = 'closed';
      sendWebhookEvent(id, 'close', {});
      if (
        lastDisconnect &&
        lastDisconnect.error &&
        lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
      ) {
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
    try { existing.sock.ws.close(); } catch {}
    delete sessions[id];
  }
  return createSession(id, existing?.webhook);
}

function updateSession(id, details) {
  if (!sessions[id]) return null;
  if (details.webhook !== undefined) sessions[id].webhook = details.webhook;
  return sessions[id];
}

function deleteSession(id) {
  const existing = sessions[id];
  if (!existing) return;
  try { existing.sock.ws.close(); } catch {}
  delete sessions[id];
}

function listSessions() {
  return Object.keys(sessions).map((id) => ({
    id,
    status: sessions[id].status
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
  listSessions
};
