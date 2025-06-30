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

module.exports = { initDb };
