const { getInstance, getSession } = require('../sessions/sessionManager');
const { log } = require('../utils/logger');

function buildQuoted(jid, quotedId) {
  if (!quotedId) return undefined;
  return {
    key: { remoteJid: jid, id: quotedId },
    message: { conversation: '' }
  };
}

async function sendMessage(req, res) {
  const { instance, number, message, ghost = false, quotedId } = req.body;
  const session = getInstance(instance);
  if (!session) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  try {
    log(`[sendMessage] ${instance} -> ${number}`);
    const jid = `${number}@s.whatsapp.net`;
    await session.sendMessage(
      jid,
      { text: message, contextInfo: ghost ? { mentionedJid: [jid] } : {} },
      { quoted: buildQuoted(jid, quotedId) }
    );
    res.json({ status: 'Message sent' });
  } catch (e) {
    log(`[sendMessage] error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
}

async function sendMedia(req, res) {
  const { instance, number, caption = '', media, mimetype, ghost = false, quotedId } = req.body;
  const session = getInstance(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  if (!media || !mimetype) return res.status(400).json({ error: 'media and mimetype required' });
  try {
    log(`[sendMedia] ${instance} -> ${number} (${mimetype})`);
    const buffer = Buffer.from(media, 'base64');
    const jid = `${number}@s.whatsapp.net`;
    const type = mimetype.startsWith('image/')
      ? 'image'
      : mimetype.startsWith('video/')
      ? 'video'
      : mimetype.startsWith('audio/')
      ? 'audio'
      : 'document';
    const content = { [type]: buffer, mimetype, caption, contextInfo: ghost ? { mentionedJid: [jid] } : {} };
    await session.sendMessage(jid, content, { quoted: buildQuoted(jid, quotedId) });
    res.json({ status: 'Media sent' });
  } catch (e) {
    log(`[sendMedia] error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
}

async function deleteMessage(req, res) {
  const { instance, number, messageId } = req.body;
  const session = getInstance(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    log(`[deleteMessage] ${instance} -> ${number} ${messageId}`);
    const jid = `${number}@s.whatsapp.net`;
    await session.sendMessage(jid, {
      delete: { remoteJid: jid, fromMe: true, id: messageId }
    });
    res.json({ status: 'deleted' });
  } catch (e) {
    log(`[deleteMessage] error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
}

async function sendPoll(req, res) {
  const { instance, number, question, options = [], multiple = false } = req.body;
  const session = getSession(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    const jid = `${number}@s.whatsapp.net`;
    log(`[sendPoll] ${instance} -> ${number}`);
    const sent = await session.sock.sendMessage(jid, {
      poll: { name: question, values: options, selectableCount: multiple ? options.length : 1 }
    });
    let stored = sent;
    if (typeof session.sock.loadMessage === 'function') {
      try {
        const full = await session.sock.loadMessage(jid, sent.key.id);
        if (full) stored = full;
      } catch (err) {
        log(`[sendPoll] loadMessage failed: ${err.message}`);
      }
    }
    session.store.messages.insert(jid, [stored]);
    if (session.write) await session.write();
    res.json({ status: 'poll sent' });
  } catch (e) {
    log(`[sendPoll] error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
}

module.exports = { sendMessage, sendMedia, deleteMessage, sendPoll };
