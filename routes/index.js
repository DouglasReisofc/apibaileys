const express = require('express');
const router = express.Router();
const {
  createSession,
  getSessionStatus,
  getSessionQR,
  restartSession
} = require('../sessions/sessionManager');
const { sendMessage } = require('../controllers/messageController');

router.post('/session', async (req, res) => {
  const { id } = req.body;
  try {
    await createSession(id);
    res.json({ status: 'Session created', id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

router.post('/message', sendMessage);

module.exports = router;
