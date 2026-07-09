require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname, { extensions: ['html'] }));

app.get('/api/health', (req, res) => res.json({ ok: true, version: require('../package.json').version }));

app.listen(PORT, () => {
    console.log(`Demo running at http://localhost:${PORT}`);
});
