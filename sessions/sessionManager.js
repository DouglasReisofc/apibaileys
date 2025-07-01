const makeWASocket = require('@whiskeysockets/baileys').default;
const {
  DisconnectReason,
  getAggregateVotesInPollMessage,
  decryptPollVote,
  updateMessageWithPollUpdate,
  getKeyAuthor,
  sha256
} = require('@whiskeysockets/baileys');
const P = require('pino');
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

function isPollCreation(msg) {
  return (
    msg.message?.pollCreationMessage ||
    msg.message?.pollCreationMessageV2 ||
    msg.message?.pollCreationMessageV3
  );
}

function handlePollCreation(id, msg) {
  const results = getAggregateVotesInPollMessage({
    message: msg.message,
    pollUpdates: []
  }, sessions[id].sock.user.id);
  sendWebhookEvent(id, 'poll.create', {
    key: msg.key,
    poll: msg.message,
    results
  });
}

function optionHashMap(pollMsg) {
  const opts = pollMsg.message.pollCreationMessage?.options ||
    pollMsg.message.pollCreationMessageV2?.options ||
    pollMsg.message.pollCreationMessageV3?.options || [];
  const map = {};
  for (const opt of opts) {
    const hash = sha256(Buffer.from(opt.optionName || '')).toString();
    map[hash] = opt.optionName || '';
  }
  return map;
}

function handlePollVote(id, msg) {
  const pollUpdate = msg.message?.pollUpdateMessage;
  if (!pollUpdate) return;
  const session = sessions[id];
  const store = session.store;
  const creationKey = pollUpdate.pollCreationMessageKey;
  const pollMsg = store.loadMessage(creationKey.remoteJid || msg.key.remoteJid, creationKey.id);
  if (!pollMsg) return;
  const pollEncKey = pollMsg.messageContextInfo?.messageSecret;
  if (!pollEncKey) return;
  const vote = decryptPollVote(pollUpdate.vote, {
    pollCreatorJid: getKeyAuthor(creationKey, session.sock.user.id),
    pollMsgId: creationKey.id,
    pollEncKey,
    voterJid: getKeyAuthor(msg.key, session.sock.user.id)
  });
  updateMessageWithPollUpdate(pollMsg.message, {
    pollUpdateMessageKey: msg.key,
    vote,
    senderTimestampMs: Number(pollUpdate.senderTimestampMs)
  });
  session.write && session.write().catch(() => {});
  const results = getAggregateVotesInPollMessage({
    message: pollMsg.message,
    pollUpdates: pollMsg.message.pollUpdates
  }, session.sock.user.id);
  const map = optionHashMap(pollMsg);
  const selectedOptions = vote.selectedOptions?.map(o => map[o.toString()] || 'Unknown') || [];
  sendWebhookEvent(id, 'poll.update', {
    pollCreationMessageKey: creationKey,
    pollUpdateMessageKey: msg.key,
    voter: getKeyAuthor(msg.key, session.sock.user.id),
    selectedOptions,
    results
  });
}

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
  const replacer = (_k, v) => {
    if (Buffer.isBuffer(v)) return v.toString('base64');
    if (v && v.type === 'Buffer' && Array.isArray(v.data)) {
      return Buffer.from(v.data).toString('base64');
    }
    if (v instanceof Map) return Array.from(v.entries());
    return v;
  };
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instance: id, type, data }, replacer)
  }).catch(() => {});
}

function initSessionRecord(id, sock, saveCreds, store, write, webhook, apiKey) {
  sessions[id] = {
    sock,
    saveCreds,
    store,
    write,
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
  const { store, bind, write } = await useMongoStore(id);
  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    getMessage: async key => {
      const msg = store.loadMessage(key.remoteJid, key.id);
      return msg?.message;
    }
  });
  bind(sock.ev);

  initSessionRecord(id, sock, saveCreds, store, write, webhook, apiKey);
  await saveRecord(id);

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (update) => {
    const session = sessions[id];
    if (!session) return;
    const { connection, lastDisconnect, qr, isNewLogin } = update;
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
    if (isNewLogin && !session.needsRestart) {
      session.needsRestart = true;
      setTimeout(() => restartInstance(id), 1000);
    }
    if (connection === 'close') {
      session.status = 'closed';
      sendWebhookEvent(id, 'close', {});
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        delete sessions[id];
      } else if (statusCode === DisconnectReason.restartRequired && session.wasQr) {
        session.wasQr = false;
        setTimeout(() => createInstance(id), 1000);
      } else if (session.shouldReconnect) {
        createInstance(id);
      } else {
        delete sessions[id];
      }
    }
  });
  sock.ev.process(async (events) => {
    for (const [event, data] of Object.entries(events)) {
      if (event === 'messages.upsert') {
        for (const m of data.messages || []) {
          if (isPollCreation(m)) {
            handlePollCreation(id, m);
          } else {
            handlePollVote(id, m);
          }
        }
      } else if (event === 'messages.update') {
        for (const u of data) {
          if (u.update?.pollUpdates) {
            const creationKey = u.update.pollUpdates[0].pollCreationMessageKey;
            const pollCreation = sessions[id].store.loadMessage(
              creationKey.remoteJid || u.key.remoteJid,
              creationKey.id
            );
            if (pollCreation) {
              u.update.results = getAggregateVotesInPollMessage({
                message: pollCreation.message,
                pollUpdates: u.update.pollUpdates
              }, sock.user.id);
            }
            sendWebhookEvent(id, 'poll.update', u.update);
          }
        }
      }
      if (
        event !== 'messages.upsert' ||
        !data?.messages?.some(m => m.message?.pollUpdateMessage)
      ) {
        sendWebhookEvent(id, event, data);
      }
    }
  });

  return sock;
}

function getInstance(id) {
  return sessions[id]?.sock;
}

function getSession(id) {
  return sessions[id];
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
  getRecord: getInstanceRecord,
  getSession
};
