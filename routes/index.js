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
const { sendMessage, sendMedia, deleteMessage, sendPoll } = require('../controllers/messageController');
const {
  createGroup,
  updateSubject,
  addParticipants,
  removeParticipants,
  promoteParticipants,
  demoteParticipants,
  leaveGroup,
  fetchMetadata
} = require('../controllers/groupController');
const { fetchStatus, block, unblock } = require('../controllers/contactController');

router.get('/sessions', async (req, res) => {
  res.json({ sessions: await listSessions() });
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

router.delete('/session/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await deleteSession(id);
    res.json({ status: 'deleted', id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/message', sendMessage);
router.post('/message/media', sendMedia);
router.post('/message/poll', sendPoll);
router.post('/message/delete', deleteMessage);

// Group endpoints
router.post('/group', createGroup);
router.get('/group/:id', fetchMetadata);
router.post('/group/:id/subject', updateSubject);
router.post('/group/:id/add', addParticipants);
router.post('/group/:id/remove', removeParticipants);
router.post('/group/:id/promote', promoteParticipants);
router.post('/group/:id/demote', demoteParticipants);
router.post('/group/:id/leave', leaveGroup);

// Contact actions (PV)
router.get('/contact/:id/status', fetchStatus);
router.post('/contact/:id/block', block);
router.post('/contact/:id/unblock', unblock);

module.exports = router;
