const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/baileys';
const client = new MongoClient(mongoUri);
let db;

async function initDb() {
  if (!db) {
    await client.connect();
    db = client.db();
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
