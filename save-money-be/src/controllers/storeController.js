const express = require('express');
const { verifySession } = require('../services/authService');
const { getAllStores } = require('../services/storeService');
const storeController = express.Router();

storeController.use(verifySession);

storeController.get('/', getAllStores);

module.exports = {
    storeController
}