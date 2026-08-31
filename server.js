const express = require('express');
const path = require('path');
const apiApp = require('./api/index');

const app = express();
const PORT = 3000;

// Mount API routes
app.use(apiApp);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
