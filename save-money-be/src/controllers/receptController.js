const express = require('express');
const { getAllReceipts, getSingleReceipt, postReceipt } = require('../services/receptServices');
const receiptsRouter = express.Router();

// Вземане на всички записи
receiptsRouter.get('/', getAllReceipts);

// Вземане на един запис по ID
receiptsRouter.get('/:id', getSingleReceipt);

// Добавяне на нов запис
receiptsRouter.post('/', postReceipt);

module.exports = receiptsRouter;