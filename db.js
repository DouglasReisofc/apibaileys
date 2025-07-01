const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI || 'mongodb://admin:Shinobi7766@150.230.85.70:27017/?authSource=admin';
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
