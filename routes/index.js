const express = require('express');
const router = express.Router();
const { log } = require('../utils/logger');
const GLOBAL_KEY = process.env.GLOBAL_API_KEY || 'change-me';

router.use((req, res, next) => {
  const key = req.headers['x-api-key'] || req.query.apiKey;
  if (key !== GLOBAL_KEY) return res.status(401).json({ error: 'Invalid api key' });
  log(`[route] ${req.method} ${req.originalUrl}`);
  next();
});

async function checkInstance(req, res, next) {
  const name = req.params.id || req.body.instance || req.query.instance;
  if (!name) return res.status(400).json({ error: 'Instance required' });
  const record = await getRecord(name);
  if (!record) return res.status(404).json({ error: 'Instance not found' });
  const key = req.headers['x-instance-key'] || req.body.instanceKey || req.query.instanceKey;
  if (record.apiKey && record.apiKey !== key) return res.status(401).json({ error: 'Invalid instance key' });
  req.instanceName = name;
  next();
}
const {
  createInstance,
  getInstanceStatus,
  getInstanceQR,
  restartInstance,
  updateInstance,
  deleteInstance,
  listInstances,
  getRecord
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
  fetchMetadata,
  getInviteCode,
  revokeInvite,
  joinByCode,
  inviteInfo,
  updateDescription,
  updateSetting,
  toggleEphemeral,
  listGroups
} = require('../controllers/groupController');
const { fetchStatus, block, unblock } = require('../controllers/contactController');

router.get('/instances', async (req, res) => {
  res.json({ instances: await listInstances() });
});

router.post('/instance', async (req, res) => {
  const { name, webhook, apiKey } = req.body;
  try {
    await createInstance(name, webhook, apiKey);
    res.json({ status: 'instance created', name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/instance/:id', checkInstance, (req, res) => {
  const { id } = req.params;
  const session = updateInstance(id, req.body);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  res.json({ status: 'updated', id });
});

router.get('/instance/:id/status', checkInstance, (req, res) => {
  const { id } = req.params;
  res.json({ status: getInstanceStatus(id) });
});

router.get('/instance/:id/qr', checkInstance, (req, res) => {
  const { id } = req.params;
  const qr = getInstanceQR(id);
  if (!qr) {
    return res.status(404).json({ error: 'QR not available' });
  }
  res.json({ qr });
});

router.post('/instance/:id/restart', checkInstance, async (req, res) => {
  const { id } = req.params;
  try {
    await restartInstance(id);
    res.json({ status: 'restarted', id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/instance/:id/reconnect', checkInstance, async (req, res) => {
  const { id } = req.params;
  try {
    await restartInstance(id);
    res.json({ status: 'reconnected', id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/instance/:id', checkInstance, async (req, res) => {
  const { id } = req.params;
  try {
    await deleteInstance(id);
    res.json({ status: 'deleted', id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/message', checkInstance, sendMessage);
router.post('/message/media', checkInstance, sendMedia);
router.post('/message/poll', checkInstance, sendPoll);
router.post('/message/delete', checkInstance, deleteMessage);

// Group endpoints
router.post('/group', checkInstance, createGroup);
router.get('/group/:id', checkInstance, fetchMetadata);
router.post('/group/:id/subject', checkInstance, updateSubject);
router.post('/group/:id/add', checkInstance, addParticipants);
router.post('/group/:id/remove', checkInstance, removeParticipants);
router.post('/group/:id/promote', checkInstance, promoteParticipants);
router.post('/group/:id/demote', checkInstance, demoteParticipants);
router.post('/group/:id/leave', checkInstance, leaveGroup);
router.get('/group/:id/invite', checkInstance, getInviteCode);
router.post('/group/:id/invite/revoke', checkInstance, revokeInvite);
router.post('/group/join', checkInstance, joinByCode);
router.get('/group/invite/:code', checkInstance, inviteInfo);
router.post('/group/:id/description', checkInstance, updateDescription);
router.post('/group/:id/setting', checkInstance, updateSetting);
router.post('/group/:id/ephemeral', checkInstance, toggleEphemeral);
router.get('/groups', checkInstance, listGroups);

// Contact actions (PV)
router.get('/contact/:id/status', checkInstance, fetchStatus);
router.post('/contact/:id/block', checkInstance, block);
router.post('/contact/:id/unblock', checkInstance, unblock);

module.exports = router;
