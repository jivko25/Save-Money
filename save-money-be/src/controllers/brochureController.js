const express = require('express');
const { scrapeBrouchuresLidl, scrapeBrouchuresKaufland, getAllBrochures, getBrochureById, scrapeBrouchuresBilla } = require('../services/brochureService');
const { verifySession } = require('../services/authService');
const brouchuresRouter = express.Router();

brouchuresRouter.post('/scrape/lidl', scrapeBrouchuresLidl);
brouchuresRouter.post('/scrape/kaufland', scrapeBrouchuresKaufland);
brouchuresRouter.post('/scrape/billa', scrapeBrouchuresBilla);

brouchuresRouter.use(verifySession);

brouchuresRouter.get('/', getAllBrochures);
brouchuresRouter.get('/:id', getBrochureById);


module.exports = brouchuresRouter;