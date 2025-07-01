const { MongoClient } = require('mongodb');
const { log } = require('./utils/logger');

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/baileys';
const client = new MongoClient(mongoUri);
let db;

async function initDb() {
  if (!db) {
    log(`[db] connecting to ${mongoUri}`);
    await client.connect();
    db = client.db();
    log('[db] connected');
  }
  return db;
}

async function getSessionCollection() {
  const database = await initDb();
  return database.collection('sessions');
}

async function getStoreCollection() {
  const database = await initDb();
  return database.collection('stores');
}

module.exports = { initDb, getSessionCollection, getStoreCollection };
