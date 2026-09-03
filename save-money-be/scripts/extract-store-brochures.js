const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  extractActiveStoreBrochures,
  normalizeStore,
} = require('../src/services/brochureProductService');
const { GeminiError } = require('../src/utils/geminiClient');

const storeArg = process.argv.slice(2).find((arg) => arg.startsWith('--store='));
const store = normalizeStore(storeArg ? storeArg.split('=')[1] : process.env.EXTRACT_STORE);

if (!store) {
  console.error('Подай магазин: npm run pdf:extract-store -- --store=Lidl');
  process.exit(1);
}

console.log(`Извличане на продукти за ${store}...`);

extractActiveStoreBrochures(store)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    const statusCode = err instanceof GeminiError ? err.statusCode : 500;
    console.error(JSON.stringify({ message: err.message, statusCode }));
    process.exit(1);
  });
