const { getInstance } = require('../sessions/sessionManager');

function jid(id) {
  return id.includes('@') ? id : `${id}@s.whatsapp.net`;
}

function toJids(ids = []) {
  return ids.map(jid);
}

async function createGroup(req, res) {
  const { instance, subject, participants = [] } = req.body;
  const session = getInstance(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    const result = await session.groupCreate(subject, toJids(participants));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function updateSubject(req, res) {
  const { id } = req.params;
  const { instance, subject } = req.body;
  const session = getInstance(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    await session.groupUpdateSubject(jid(id), subject);
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function participantsAction(req, res, action) {
  const { id } = req.params;
  const { instance, participants = [] } = req.body;
  const session = getInstance(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    await session.groupParticipantsUpdate(jid(id), toJids(participants), action);
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function addParticipants(req, res) {
  return participantsAction(req, res, 'add');
}

async function removeParticipants(req, res) {
  return participantsAction(req, res, 'remove');
}

async function promoteParticipants(req, res) {
  return participantsAction(req, res, 'promote');
}

async function demoteParticipants(req, res) {
  return participantsAction(req, res, 'demote');
}

async function leaveGroup(req, res) {
  const { id } = req.params;
  const { instance } = req.body;
  const session = getInstance(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    await session.groupLeave(jid(id));
    res.json({ status: 'left' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function fetchMetadata(req, res) {
  const { id } = req.params;
  const { instance } = req.query;
  const session = getInstance(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    const data = await session.groupMetadata(jid(id));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function getInviteCode(req, res) {
  const { id } = req.params;
  const { instance } = req.query;
  const session = getInstance(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    const code = await session.groupInviteCode(jid(id));
    res.json({ code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function revokeInvite(req, res) {
  const { id } = req.params;
  const { instance } = req.body;
  const session = getInstance(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    const code = await session.groupRevokeInvite(jid(id));
    res.json({ code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function joinByCode(req, res) {
  const { instance, code, link } = req.body;
  const session = getInstance(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    const invite = code || (link ? link.split('/').pop() : '');
    if (!invite) return res.status(400).json({ error: 'Code or link required' });
    const result = await session.groupAcceptInvite(invite);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function inviteInfo(req, res) {
  const { code } = req.params;
  const { instance } = req.query;
  const session = getInstance(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    const info = await session.groupGetInviteInfo(code);
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function updateDescription(req, res) {
  const { id } = req.params;
  const { instance, description } = req.body;
  const session = getInstance(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    await session.groupUpdateDescription(jid(id), description);
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function updateSetting(req, res) {
  const { id } = req.params;
  const { instance, setting } = req.body; // announcement | not_announcement | locked | unlocked
  const session = getInstance(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    await session.groupSettingUpdate(jid(id), setting);
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function toggleEphemeral(req, res) {
  const { id } = req.params;
  const { instance, expiration } = req.body; // expiration in seconds, 0 to disable
  const session = getInstance(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    await session.groupToggleEphemeral(jid(id), Number(expiration));
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function listGroups(req, res) {
  const { instance } = req.query;
  const session = getInstance(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    const groups = await session.groupFetchAllParticipating();
    res.json(groups);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = {
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
};
