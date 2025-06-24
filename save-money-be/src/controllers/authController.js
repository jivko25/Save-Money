const express = require('express');
const authRouter = express.Router();
const authService = require('../services/authService');

authRouter.post('/register', authService.register);
authRouter.post('/login', authService.login);

module.exports = authRouter;