const express = require('express');
const { scrapeBrouchuresLidl, scrapeBrouchuresKaufland } = require('../services/brochureService');
const brouchuresRouter = express.Router();

brouchuresRouter.post('/scrape/lidl', scrapeBrouchuresLidl);
brouchuresRouter.post('/scrape/kaufland', scrapeBrouchuresKaufland);


module.exports = brouchuresRouter;