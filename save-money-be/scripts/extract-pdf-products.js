const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { extractBrochureProducts } = require('../src/utils/extractBrochureProducts');
const { GeminiError } = require('../src/utils/geminiClient');

const defaultPdf = path.join(
  __dirname,
  '..',
  'tmp',
  'Kaufland-31-08-2026-06-09-2026-00.pdf'
);

const args = process.argv.slice(2);
const pageArg = args.find((arg) => arg.startsWith('--page='));
const filePath = args.find((arg) => !arg.startsWith('--')) || defaultPdf;

extractBrochureProducts(filePath, {
  page: pageArg ? pageArg.split('=')[1] : 10,
  screenshotsDir: path.join(__dirname, '..', 'tmp', 'product-shots'),
})
  .then((result) => {
    console.log(JSON.stringify(result.products, null, 2));
    console.log(`\nПродукти: ${result.products.length}`);
    console.log(`Магазин: ${result.store_name}`);
    console.log(`Валидна до: ${result.valid_until}`);
  })
  .catch((err) => {
    const statusCode = err instanceof GeminiError ? err.statusCode : 500;
    console.error(JSON.stringify({ message: err.message, statusCode }));
    process.exit(1);
  });
