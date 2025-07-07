const express = require('express');
const cardsRouter = express.Router();
const multer = require('multer');
const { verifySession } = require('../services/authService');
const { createQrCardFromMultipart, getAllQrCardsForUser, getQrCardById, deleteQrCard, createBarcodeCard } = require('../services/cardsService');

const storage = multer.memoryStorage();  // <-- тук е промяната
const upload = multer({ storage });

cardsRouter.use(verifySession);

cardsRouter.post('/', upload.single('image'), createQrCardFromMultipart);
cardsRouter.post('/barcode', upload.single('image'), createBarcodeCard);
cardsRouter.get('/', getAllQrCardsForUser);
cardsRouter.get('/:id', getQrCardById);
cardsRouter.delete('/:id', deleteQrCard);

module.exports = { cardsRouter };
