const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');

const sessions = {};

async function createSession(id) {
  const { state, saveCreds } = await useMultiFileAuthState(`session-${id}`);
  const sock = makeWASocket({ auth: state });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (update) => {
    if (update.connection === 'close') {
      if (update.lastDisconnect && update.lastDisconnect.error &&
          update.lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut) {
        createSession(id);
      } else {
        delete sessions[id];
      }
    }
  });

  sessions[id] = sock;
  return sock;
}

function getSession(id) {
  return sessions[id];
}

module.exports = { createSession, getSession };
