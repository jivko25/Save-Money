const express = require('express');
const {
    notifyAppUpdate,
    sendAppUpdateNotification
} = require('../services/notificationService');

const notificationRouter = express.Router();


notificationRouter.post('/app-update', sendAppUpdateNotification);

module.exports = {
    notificationRouter
}; 