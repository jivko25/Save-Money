const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const supabase = require('./supabase');
const receiptsRouter = require('./src/controllers/receptController');

const app = express();
const PORT = 3000;

app.use(cors()); // позволява заявки от различни домейни (например от телефона)
app.use(bodyParser.json()); // за да може да чете JSON от тялото на заявката

app.use('/api/scan', receiptsRouter);

app.listen(PORT, () => {
  console.log(`Сървърът работи на http://localhost:${PORT}`);
});

module.exports = app;