const express = require('express');
const { savePushToken, deletePushToken } = require('../services/pushTokenService');
const pushTokenRouter = express.Router();

pushTokenRouter.post('/', savePushToken);
pushTokenRouter.delete('/', deletePushToken);

module.exports = {
    pushTokenRouter
}