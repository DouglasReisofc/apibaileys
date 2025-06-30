const express = require('express');
const router = express.Router();
const { createSession } = require('../sessions/sessionManager');
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

router.post('/message', sendMessage);

module.exports = router;
