require('./src/utils/cron.js');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const receiptsRouter = require('./src/controllers/receptController');
const authRouter = require('./src/controllers/authController');
const budgetRouter = require('./src/controllers/budgetController');
const { storeController } = require('./src/controllers/storeController');
const { pushTokenRouter } = require('./src/controllers/PushTokenController');
const { cardsRouter } = require('./src/controllers/cardsController');
const brouchuresRouter = require('./src/controllers/brochureController');
const { notificationRouter } = require('./src/controllers/notificationController');
const shoppingListRouter = require('./src/controllers/shoppingListController.js');

const app = express();
const PORT = 3000;

app.use(cors()); // позволява заявки от различни домейни (например от телефона)
app.use(bodyParser.json()); // за да може да чете JSON от тялото на заявката

app.use('/api/receipt', receiptsRouter);
app.use('/api/auth', authRouter);
app.use('/api/budget', budgetRouter);
app.use('/api/store', storeController);
app.use('/api/push-token', pushTokenRouter);
app.use('/api/qr-card', cardsRouter);
app.use('/api/brouchures', brouchuresRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/shopping-list', shoppingListRouter);

app.listen(PORT, () => {
  console.log(`Сървърът работи на http://localhost:${PORT}`);
});

module.exports = app;