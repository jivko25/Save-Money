const {
  extractActiveStoreBrochures,
  normalizeStore,
  verifyCronSecret,
  dispatchExtractWorkflow,
} = require('../../src/services/brochureProductService');
const { GeminiError } = require('../../src/utils/geminiClient');

function send(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  if (!verifyCronSecret(req)) {
    send(res, 401, { message: 'Липсва или е грешен CRON_SECRET.' });
    return;
  }

  const storeParam = req.query?.store || new URL(req.url, 'http://localhost').searchParams.get('store');
  const store = normalizeStore(storeParam);
  if (!store) {
    send(res, 400, { message: 'Подай store като query param: Lidl, Kaufland или Billa.' });
    return;
  }

  try {
    if (process.env.VERCEL && process.env.GH_PAT && (process.env.GH_REPO || process.env.GITHUB_REPOSITORY)) {
      await dispatchExtractWorkflow(store);
      send(res, 202, {
        message: 'Извличането е пуснато в GitHub Action.',
        store,
        dispatched: true,
      });
      return;
    }

    const result = await extractActiveStoreBrochures(store);
    send(res, 200, result);
  } catch (err) {
    const statusCode = err instanceof GeminiError ? err.statusCode : 500;
    console.error('extract-products:', err.message);
    send(res, statusCode, { message: err.message, statusCode });
  }
};
