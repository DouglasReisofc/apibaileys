const express = require('express');
const router = express.Router();
const {
  createSession,
  getSessionStatus,
  getSessionQR,
  restartSession,
  updateSession,
  deleteSession,
  listSessions
} = require('../sessions/sessionManager');
const { sendMessage } = require('../controllers/messageController');

router.get('/sessions', (req, res) => {
  res.json({ sessions: listSessions() });
});

router.post('/session', async (req, res) => {
  const { id, webhook } = req.body;
  try {
    await createSession(id, webhook);
    res.json({ status: 'Session created', id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/session/:id', (req, res) => {
  const { id } = req.params;
  const session = updateSession(id, req.body);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ status: 'updated', id });
});

router.get('/session/:id/status', (req, res) => {
  const { id } = req.params;
  res.json({ status: getSessionStatus(id) });
});

router.get('/session/:id/qr', (req, res) => {
  const { id } = req.params;
  const qr = getSessionQR(id);
  if (!qr) {
    return res.status(404).json({ error: 'QR not available' });
  }
  res.json({ qr });
});

router.post('/session/:id/restart', async (req, res) => {
  const { id } = req.params;
  try {
    await restartSession(id);
    res.json({ status: 'restarted', id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/session/:id/reconnect', async (req, res) => {
  const { id } = req.params;
  try {
    await restartSession(id);
    res.json({ status: 'reconnected', id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/session/:id', (req, res) => {
  const { id } = req.params;
  deleteSession(id);
  res.json({ status: 'deleted', id });
});

router.post('/message', sendMessage);

module.exports = router;
