const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

const sessions = {};

function initSessionRecord(id, sock, saveCreds) {
  sessions[id] = {
    sock,
    saveCreds,
    qr: null,
    status: 'connecting'
  };
}

async function createSession(id) {
  if (sessions[id]) return sessions[id].sock;

  const { state, saveCreds } = await useMultiFileAuthState(`session-${id}`);
  const sock = makeWASocket({ auth: state });

  initSessionRecord(id, sock, saveCreds);

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      sessions[id].qr = qr;
      sessions[id].status = 'qr';
    }
    if (connection === 'open') {
      sessions[id].status = 'open';
      sessions[id].qr = null;
    }
    if (connection === 'close') {
      sessions[id].status = 'closed';
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
  return createSession(id);
}

module.exports = {
  createSession,
  getSession,
  getSessionStatus,
  getSessionQR,
  restartSession
};
