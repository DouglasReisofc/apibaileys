/*****************************************************************
 * WhatsApp Multi-Instance API – v5
 * • Autoclean          • Webhook com instanceKey & endpoints
 * • Pair-Code Query    • Auth dual (global API_KEY e instanceKey)
 *****************************************************************/
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const crypto = require('crypto');
const readline = require('readline');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  Browsers,
  delay
} = require('@whiskeysockets/baileys');
const pino = require('pino');

/*──────────── .ENV CONFIG ───────────────────────────────────*/
const {
  SESSION_DIR = './auth',
  INSTANCES_FILE = './instances.json',
  API_KEY = '',
  API_URL = `http://localhost:${process.env.PORT || 3000}`,
  OWNER_NUMBER = '',
  PORT = 3000,
  QR_MODE = 'false',
  LOG_LEVEL = 'info',
  PAIR_TIMEOUT_MS = 60_000,
  MAX_RETRY = 5
} = process.env;

/*──────────── LOGGER ───────────────────────────────────────*/
const logger = pino({
  level: LOG_LEVEL,
  transport:
    process.env.NODE_ENV === 'development'
      ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' }
      }
      : undefined
});

/*──────────── MAPA RUNTIME ─────────────────────────────────*/
const instances = new Map(); // id → { sock, watchdog, cfg, pairingCode }

/*──────────── FS HELPERS ───────────────────────────────────*/
async function loadCfg() {
  try {
    const raw = await fs.readFile(INSTANCES_FILE, 'utf-8');
    return JSON.parse(raw).instances || [];
  } catch {
    await saveCfg([]); return [];
  }
}
async function saveCfg(arr) {
  await fs.writeFile(INSTANCES_FILE,
    JSON.stringify({ instances: arr }, null, 2), 'utf-8');
}
async function patchCfg(id, patch) {
  const list = await loadCfg();
  const idx = list.findIndex(c => c.id === id);
  if (idx !== -1) { list[idx] = { ...list[idx], ...patch }; await saveCfg(list); }
}
function dirOf(id) { return path.join(SESSION_DIR, id); }

/*──────────── HELPERS MISC ─────────────────────────────────*/
const ask = q => new Promise(r => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, a => { rl.close(); r(a.trim()); });
});
const randHex = bytes => crypto.randomBytes(bytes).toString('hex');

/*──────────── CLOSE INSTANCE ───────────────────────────────*/
async function closeInstance(id, rmCreds = false) {
  const rec = instances.get(id);
  if (rec?.watchdog) clearTimeout(rec.watchdog);
  if (rec?.sock) {
    rec.sock.ev.removeAllListeners();
    await rec.sock.logout().catch(() => { });
  }
  instances.delete(id);
  if (rmCreds) await fs.rm(dirOf(id), { recursive: true, force: true });
}

/*──────────── WEBHOOK POST ─────────────────────────────────*/
async function postHook(id, type, data) {
  const rec = instances.get(id);
  const url = rec?.cfg?.webhook;
  if (!url) return;
  const payload = {
    instanceId: id,
    event: type,
    data,
    apiKey: API_KEY,
    instanceKey: rec.cfg.instanceKey,
    apiUrl: API_URL,
    endpoints: {
      sendMessage: `${API_URL}/instance/${id}/send-message`,
      pairingCode: `${API_URL}/instance/${id}/pairing-code`,
      instanceInfo: `${API_URL}/instance/${id}`,
      editInstance: `${API_URL}/instance/${id}`,
      restart: `${API_URL}/instance/${id}/restart`
    }
  };
  try { await axios.post(url, payload); }
  catch (e) { logger.error({ e: e.message }, `webhook ${id}`); }
}

/*──────────── INIT / REBOOT ────────────────────────────────*/
async function init(id, phone, webhook, retry = 0) {
  await fs.mkdir(dirOf(id), { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(dirOf(id));

  const sock = makeWASocket({
    logger,
    printQRInTerminal: QR_MODE === 'true',
    browser: Browsers.macOS('Safari'),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) }
  });
  sock.ev.on('creds.update', saveCreds);

  const rec = {
    sock, watchdog: undefined,
    cfg: { phone, webhook, instanceKey: '', ...instances.get(id)?.cfg },
    pairingCode: null
  };
  instances.set(id, rec);

  /*──────── Pairing ───────────────────────────────────────*/
  let watchdog;
  if (!state.creds.registered) {
    const ph = phone || await ask(`📱 Número p/ ${id}: `);
    try {
      await delay(1500);
      const code = await sock.requestPairingCode(ph.replace(/\D/g, ''));
      console.log(`🆔 Pairing code [${id}] ➜ ${code}`);

      rec.pairingCode = code; rec.cfg.phone = ph;
      await patchCfg(id, { pairingCode: code, phone: ph });

      watchdog = setTimeout(async () => {
        logger.warn(`${id} pairing expirou – recriando…`);
        await closeInstance(id, true);
        init(id, ph, webhook, retry + 1);
      }, +PAIR_TIMEOUT_MS);
      rec.watchdog = watchdog;
    } catch (err) {
      logger.warn({ err }, 'pair error – retry');
      await closeInstance(id, true);
      return init(id, ph, webhook, retry + 1);
    }
  }

  /*──────── Eventos → webhook ─────────────────────────────*/
  sock.ev.on('messages.upsert', m => postHook(id, 'messages.upsert', m));
  sock.ev.on('connection.update', c => postHook(id, 'connection.update', c));

  /*──────── Conexão ───────────────────────────────────────*/
  let notified = false;
  sock.ev.on('connection.update', upd => {
    const { connection, lastDisconnect } = upd;

    if (connection === 'open') {
      if (watchdog) clearTimeout(watchdog);
      rec.pairingCode = null; patchCfg(id, { pairingCode: null });
      if (!notified && OWNER_NUMBER) {
        notified = true;
        sock.sendMessage(`${OWNER_NUMBER}@s.whatsapp.net`,
          { text: `🤖 Instância ${id} online!` }).catch(() => { });
      }
    }
    if (connection === 'close') {
      if (watchdog) clearTimeout(watchdog);
      const code = lastDisconnect?.error?.output?.statusCode;
      closeInstance(id, code === DisconnectReason.loggedOut)
        .then(() => init(id, phone, webhook, retry + 1));
    }
  });
}

/*──────────── BOOT GLOBAL ─────────────────────────────────*/
(async () => {
  console.log('🚀 Multi-Instance API v5 – booting…');
  await fs.mkdir(SESSION_DIR, { recursive: true });
  const cfgArr = await loadCfg();

  /* remove pastas órfãs */
  for (const d of await fs.readdir(SESSION_DIR))
    if (!cfgArr.find(c => c.id === d))
      await fs.rm(dirOf(d), { recursive: true, force: true });

  /* revive instâncias */
  for (const c of cfgArr)
    init(c.id, c.phone, c.webhook).catch(e => logger.error({ e }, c.id));

  startServer();
})();

/*──────────── AUTH HELPERS ────────────────────────────────*/
const hasGlobalKey = k => API_KEY && k === API_KEY;
async function hasInstanceKey(id, k) {
  if (!k) return false;
  if (hasGlobalKey(k)) return true;
  const cfg = (await loadCfg()).find(c => c.id === id);
  return cfg?.instanceKey === k;
}

/*──────────── EXPRESS API ─────────────────────────────────*/
function startServer() {
  const app = express();
  app.use(express.json());
  app.use('/painel',
    express.static(path.join(__dirname, 'public'), { index: 'painel.html' }));

  /*──────── CREATE (global key) ───────────────────────────*/
  app.post('/instance/create', async (req, res) => {
    const key = req.headers.apikey || req.query.apikey;
    if (!hasGlobalKey(key)) return res.status(401).json({ error: 'Unauthorized' });

    const { id, phone, webhook } = req.body;
    if (!id) return res.status(400).json({ error: 'id obrigatório' });

    const list = await loadCfg();
    if (list.find(c => c.id === id))
      return res.status(400).json({ error: 'já existe' });

    const instanceKey = randHex(16);
    list.push({
      id, phone: phone || '', webhook: webhook || '',
      pairingCode: null, instanceKey
    });
    await saveCfg(list);

    init(id, phone, webhook)
      .then(() => res.json({ created: id, instanceKey }))
      .catch(e => { logger.error({ e }, 'create'); res.status(500).json({ error: e.message }); });
  });

  /*──────── LIST (global key) ─────────────────────────────*/
  app.get('/instance', async (req, res) => {
    const key = req.headers.apikey || req.query.apikey;
    if (!hasGlobalKey(key)) return res.status(401).json({ error: 'Unauthorized' });
    res.json({ instances: await loadCfg() });
  });

  /*──────── INFO / PAIR CODE / EDIT / CONTROL ─────────────*/
  app.use('/instance/:id', async (req, res, next) => {
    const { id } = req.params;
    const key = req.headers.apikey || req.query.apikey;
    if (await hasInstanceKey(id, key)) return next();
    res.status(401).json({ error: 'Unauthorized' });
  });

  /* pairing-code */
  app.get('/instance/:id/pairing-code', async (req, res) => {
    const cfg = (await loadCfg()).find(c => c.id === req.params.id);
    if (!cfg) return res.status(404).json({ error: 'não definida' });
    res.json({ pairingCode: cfg.pairingCode });
  });

  /* instance info */
  app.get('/instance/:id', async (req, res) => {
    const cfg = (await loadCfg()).find(c => c.id === req.params.id);
    if (!cfg) return res.status(404).json({ error: 'não definida' });
    res.json(cfg);
  });

  /* edit */
  app.patch('/instance/:id', async (req, res) => {
    const { phone, webhook } = req.body;
    await patchCfg(req.params.id, { ...(phone && { phone }), ...(webhook && { webhook }) });
    if (instances.get(req.params.id))
      instances.get(req.params.id).cfg = { ...instances.get(req.params.id).cfg, ...(phone && { phone }), ...(webhook && { webhook }) };
    res.json({ updated: req.params.id });
  });

  /* stop */
  app.post('/instance/:id/stop', async (req, res) => {
    if (!instances.has(req.params.id))
      return res.status(404).json({ error: 'não ativa' });
    await closeInstance(req.params.id, false);
    res.json({ stopped: req.params.id });
  });

  /* start */
  app.post('/instance/:id/start', async (req, res) => {
    const cfg = (await loadCfg()).find(c => c.id === req.params.id);
    if (!cfg) return res.status(404).json({ error: 'não definida' });
    if (instances.has(req.params.id))
      return res.status(400).json({ error: 'já ativa' });
    init(cfg.id, cfg.phone, cfg.webhook)
      .then(() => res.json({ started: cfg.id }))
      .catch(e => { logger.error({ e }, 'start'); res.status(500).json({ error: e.message }); });
  });

  /* restart */
  app.post('/instance/:id/restart', async (req, res) => {
    const cfg = (await loadCfg()).find(c => c.id === req.params.id);
    if (!cfg) return res.status(404).json({ error: 'não definida' });
    await closeInstance(cfg.id, true);
    init(cfg.id, cfg.phone, cfg.webhook)
      .then(() => res.json({ restarted: cfg.id }))
      .catch(e => { logger.error({ e }, 'restart'); res.status(500).json({ error: e.message }); });
  });

  /* delete */
  app.delete('/instance/:id', async (req, res) => {
    const list = await loadCfg();
    const idx = list.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'não definida' });
    list.splice(idx, 1); await saveCfg(list);
    await closeInstance(req.params.id, true);
    res.json({ deleted: req.params.id });
  });

  /* send-message */
  app.post('/instance/:id/send-message', async (req, res) => {
    const { to, message } = req.body;
    if (!to || !message)
      return res.status(400).json({ error: 'campos faltam' });

    const rec = instances.get(req.params.id);
    if (!rec?.sock) return res.status(404).json({ error: 'instância não ativa' });

    rec.sock.sendMessage(`${to}@s.whatsapp.net`, { text: message })
      .then(() => res.json({ ok: true }))
      .catch(e => { logger.error({ e }, 'send'); res.status(500).json({ error: e.message }); });
  });

  /* send-media */
  app.post('/instance/:id/send-media', async (req, res) => {
    const { to, url, type, caption } = req.body;
    if (!to || !url || !type)
      return res.status(400).json({ error: 'campos faltam' });

    const rec = instances.get(req.params.id);
    if (!rec?.sock) return res.status(404).json({ error: 'instância não ativa' });

    const msg = { [type]: { url } };
    if (caption) msg.caption = caption;
    rec.sock.sendMessage(`${to}@s.whatsapp.net`, msg)
      .then(() => res.json({ ok: true }))
      .catch(e => { logger.error({ e }, 'media'); res.status(500).json({ error: e.message }); });
  });

  /* send-sticker */
  app.post('/instance/:id/send-sticker', async (req, res) => {
    const { to, url } = req.body;
    if (!to || !url)
      return res.status(400).json({ error: 'campos faltam' });

    const rec = instances.get(req.params.id);
    if (!rec?.sock) return res.status(404).json({ error: 'instância não ativa' });

    rec.sock.sendMessage(`${to}@s.whatsapp.net`, { sticker: { url } })
      .then(() => res.json({ ok: true }))
      .catch(e => { logger.error({ e }, 'sticker'); res.status(500).json({ error: e.message }); });
  });

  /* react */
  app.post('/instance/:id/react', async (req, res) => {
    const { to, id, emoji } = req.body;
    if (!to || !id || !emoji)
      return res.status(400).json({ error: 'campos faltam' });

    const rec = instances.get(req.params.id);
    if (!rec?.sock) return res.status(404).json({ error: 'instância não ativa' });

    const key = { remoteJid: `${to}@s.whatsapp.net`, id, fromMe: false };
    rec.sock.sendMessage(key.remoteJid, { react: { text: emoji, key } })
      .then(() => res.json({ ok: true }))
      .catch(e => { logger.error({ e }, 'react'); res.status(500).json({ error: e.message }); });
  });

  /* mark-read */
  app.post('/instance/:id/mark-read', async (req, res) => {
    const { to, id } = req.body;
    if (!to || !id)
      return res.status(400).json({ error: 'campos faltam' });

    const rec = instances.get(req.params.id);
    if (!rec?.sock) return res.status(404).json({ error: 'instância não ativa' });

    await rec.sock.readMessages([{ remoteJid: `${to}@s.whatsapp.net`, id }]);
    res.json({ ok: true });
  });

  /* edit-message */
  app.post('/instance/:id/edit-message', async (req, res) => {
    const { to, id, text } = req.body;
    if (!to || !id || !text)
      return res.status(400).json({ error: 'campos faltam' });

    const rec = instances.get(req.params.id);
    if (!rec?.sock) return res.status(404).json({ error: 'instância não ativa' });

    const key = { remoteJid: `${to}@s.whatsapp.net`, id, fromMe: true };
    rec.sock.sendMessage(key.remoteJid, { text, edit: key })
      .then(() => res.json({ ok: true }))
      .catch(e => { logger.error({ e }, 'edit'); res.status(500).json({ error: e.message }); });
  });

  /* delete-message */
  app.post('/instance/:id/delete-message', async (req, res) => {
    const { to, id, everyone } = req.body;
    if (!to || !id)
      return res.status(400).json({ error: 'campos faltam' });

    const rec = instances.get(req.params.id);
    if (!rec?.sock) return res.status(404).json({ error: 'instância não ativa' });

    const key = { remoteJid: `${to}@s.whatsapp.net`, id, fromMe: true };
    rec.sock.sendMessage(key.remoteJid, { delete: key, ...(everyone && { fromMe: false }) })
      .then(() => res.json({ ok: true }))
      .catch(e => { logger.error({ e }, 'delete'); res.status(500).json({ error: e.message }); });
  });

  /* group-manage */
  app.post('/instance/:id/group-manage', async (req, res) => {
    const { gid, action, participants, subject, description, url } = req.body;
    if (!gid || !action)
      return res.status(400).json({ error: 'campos faltam' });

    const rec = instances.get(req.params.id);
    if (!rec?.sock) return res.status(404).json({ error: 'instância não ativa' });

    try {
      switch (action) {
        case 'add':
        case 'remove':
        case 'promote':
        case 'demote':
          if (!participants) return res.status(400).json({ error: 'participants faltam' });
          await rec.sock.groupParticipantsUpdate(`${gid}@g.us`, participants.map(j => `${j}@s.whatsapp.net`), action);
          break;
        case 'subject':
          await rec.sock.groupUpdateSubject(`${gid}@g.us`, subject);
          break;
        case 'description':
          await rec.sock.groupUpdateDescription(`${gid}@g.us`, description || '');
          break;
        case 'picture':
          await rec.sock.updateProfilePicture(`${gid}@g.us`, { url });
          break;
        default:
          return res.status(400).json({ error: 'ação inválida' });
      }
      res.json({ ok: true });
    } catch (e) {
      logger.error({ e }, 'group');
      res.status(500).json({ error: e.message });
    }
  });

  /*──────── LISTEN ────────────────────────────────────────*/
  app.listen(PORT, () =>
    console.log(`🌐 API on ${API_URL} (global apikey ${API_KEY ? 'ativada' : 'off'})`));
}
