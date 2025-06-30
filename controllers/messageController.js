const { getSession } = require('../sessions/sessionManager');

async function sendMessage(req, res) {
  const { sessionId, number, message } = req.body;
  const session = getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  try {
    await session.sendMessage(`${number}@s.whatsapp.net`, { text: message });
    res.json({ status: 'Message sent' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = { sendMessage };
