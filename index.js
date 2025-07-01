require('./loadEnv')();
const express = require('express');
const cors = require('cors');
const path = require('path');
const routes = require('./routes');
const { restoreInstances } = require('./sessions/sessionManager');
const { initDb } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', routes);
app.use('/', express.static(path.join(__dirname, 'public')));
app.get('/README.md', (req, res) => {
  res.sendFile(path.join(__dirname, 'README.md'));
});

const PORT = process.env.PORT || 3000;
initDb()
  .then(() => {
    console.log('MongoDB connected');
    return restoreInstances();
  })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to start server', err);
    process.exit(1);
  });
