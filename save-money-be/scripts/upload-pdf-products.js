const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { uploadBrochureFromPdf } = require('../src/services/brochureProductService');
const { GeminiError } = require('../src/utils/geminiClient');

const defaultPdf = path.join(
  __dirname,
  '..',
  'tmp',
  'Kaufland-31-08-2026-06-09-2026-00.pdf'
);

const args = process.argv.slice(2);
const pageArg = args.find((arg) => arg.startsWith('--page='));
const fromArg = args.find((arg) => arg.startsWith('--from='));
const filePath = args.find((arg) => !arg.startsWith('--')) || defaultPdf;

console.log(`PDF: ${filePath}`);
if (pageArg) console.log(`Страница: ${pageArg.split('=')[1]}`);
else if (fromArg) console.log(`От страница: ${fromArg.split('=')[1]}`);
else console.log('Страници: всички');
console.log('Разделяне на продукти и скрийншоти...');

uploadBrochureFromPdf(filePath, {
  page: pageArg ? pageArg.split('=')[1] : undefined,
  fromPage: fromArg ? fromArg.split('=')[1] : undefined,
  screenshotsDir: path.join(__dirname, '..', 'tmp', 'product-shots'),
})
  .then((result) => {
    console.log(`\nКачени продукти: ${result.uploaded}`);
    console.log(`Магазин: ${result.store_name}`);
    console.log(`Валидна до: ${result.valid_until}`);
    if (result.brochure_id) console.log(`brochure_id: ${result.brochure_id}`);
    if (result.skipped?.length) {
      console.log(`Пропуснати страници: ${result.skipped.map((item) => item.page).join(', ')}`);
    }
  })
  .catch((err) => {
    const statusCode = err instanceof GeminiError ? err.statusCode : 500;
    console.error(JSON.stringify({ message: err.message, statusCode }));
    process.exit(1);
  });
