const { getInstance } = require('../sessions/sessionManager');

function jid(id) {
  return id.includes('@') ? id : `${id}@s.whatsapp.net`;
}

async function fetchStatus(req, res) {
  const { id } = req.params;
  const { instance } = req.query;
  const session = getInstance(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    const data = await session.fetchStatus(jid(id));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function block(req, res) {
  const { id } = req.params;
  const { instance } = req.body;
  const session = getInstance(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    await session.updateBlockStatus(jid(id), 'block');
    res.json({ status: 'blocked' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function unblock(req, res) {
  const { id } = req.params;
  const { instance } = req.body;
  const session = getInstance(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    await session.updateBlockStatus(jid(id), 'unblock');
    res.json({ status: 'unblocked' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = { fetchStatus, block, unblock };
