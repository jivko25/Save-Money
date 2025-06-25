const express = require('express');
const { getAllReceipts, getSingleReceipt, postReceipt, getReceiptsByBudgetId } = require('../services/receptServices');
const { verifySession } = require('../services/authService');
const receiptsRouter = express.Router();

receiptsRouter.use(verifySession);

// Вземане на всички записи
receiptsRouter.get('/', getAllReceipts);

// Взимане на всички записи по budget id
receiptsRouter.get('/:budgetId', getReceiptsByBudgetId);

// Вземане на един запис по ID
receiptsRouter.get('/:id', getSingleReceipt);

// Добавяне на нов запис
receiptsRouter.post('/', postReceipt);

module.exports = receiptsRouter;