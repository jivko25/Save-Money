const express = require('express');
const { scrapeBrouchuresLidl, scrapeBrouchuresKaufland, getAllBrochures, getBrochureById, scrapeBrouchuresBilla } = require('../services/brochureService');
const {
  extractActiveStoreBrochures,
  normalizeStore,
  verifyCronSecret,
  dispatchExtractWorkflow,
} = require('../services/brochureProductService');
const { GeminiError } = require('../utils/geminiClient');
const { verifySession } = require('../services/authService');
const multer = require('multer');
const brouchuresRouter = express.Router();
// const path = require('path');
// const client = new (require('@google-cloud/vision')).ImageAnnotatorClient({
//     keyFilename: path.resolve(__dirname, '../../quack-scanner-85b31c63cee6.json'),
// });

const storage = multer.memoryStorage();
// const upload = multer({ storage });


brouchuresRouter.post('/scrape/lidl', scrapeBrouchuresLidl);
brouchuresRouter.post('/scrape/kaufland', scrapeBrouchuresKaufland);
brouchuresRouter.post('/scrape/billa', scrapeBrouchuresBilla);

brouchuresRouter.get('/scrape/daily-scrape', async (req, res) => {
    console.log('🚀 Ръчно извикан скрейп:', new Date().toLocaleString('bg-BG', { timeZone: 'Europe/Sofia' }));

    try {
        console.log('🔍 Скрейп Billa...');
        await scrapeBrouchuresBilla();

        console.log('🔍 Скрейп Lidl...');
        await scrapeBrouchuresLidl();

        console.log('🔍 Скрейп Kaufland...');
        await scrapeBrouchuresKaufland();

        console.log('✅ Скрейп завършен успешно.');

        res.status(200).json({ message: 'Скрейп завършен успешно' });
    } catch (err) {
        console.error('❌ Грешка при скрейп:', err.message);
        res.status(500).json({ error: 'Грешка при скрейп' });
    }
});

async function extractStoreProductsHandler(req, res) {
    if (!verifyCronSecret(req)) {
        return res.status(401).json({ message: 'Липсва или е грешен CRON_SECRET.' });
    }

    const store = normalizeStore(req.query.store);
    if (!store) {
        return res.status(400).json({
            message: 'Подай store като query param: Lidl, Kaufland или Billa.',
        });
    }

    try {
        if (process.env.VERCEL && process.env.GH_PAT && (process.env.GH_REPO || process.env.GITHUB_REPOSITORY)) {
            await dispatchExtractWorkflow(store);
            return res.status(202).json({
                message: 'Извличането е пуснато в GitHub Action.',
                store,
                dispatched: true,
            });
        }

        const result = await extractActiveStoreBrochures(store);
        return res.status(200).json(result);
    } catch (err) {
        const statusCode = err instanceof GeminiError ? err.statusCode : 500;
        console.error('extract-products:', err.message);
        return res.status(statusCode).json({ message: err.message, statusCode });
    }
}

brouchuresRouter.get('/extract-products', extractStoreProductsHandler);
brouchuresRouter.post('/extract-products', extractStoreProductsHandler);

brouchuresRouter.use(verifySession);

brouchuresRouter.get('/', getAllBrochures);
brouchuresRouter.get('/:id', getBrochureById);

// brouchuresRouter.post('/test', upload.single('image'), async (req, res) => {
//     try {
//         if (!req.file) {
//             return res.status(400).json({ error: 'No image uploaded' });
//         }

//         // OCR чрез Google Vision API от буфер
//         const [result] = await client.textDetection({
//             image: { content: req.file.buffer },
//         });

//         const detections = result.textAnnotations;
//         const text = detections.length > 0 ? detections[0].description.trim() : '';

//         if (!text) {
//             return res.status(500).json({ error: 'No text recognized' });
//         }

//         res.json({ text });
//     } catch (error) {
//         console.error('Google OCR error:', error.message);
//         res.status(500).json({ error: 'OCR failed with Google Vision API' });
//     }
// });


module.exports = brouchuresRouter;