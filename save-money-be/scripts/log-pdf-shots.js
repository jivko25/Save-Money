const path = require('path');
const { logPdfProducts } = require('../src/utils/splitPdfProducts');

const defaultPdf = path.join(
  __dirname,
  '..',
  'tmp',
  'Kaufland-31-08-2026-06-09-2026-00.pdf'
);

const args = process.argv.slice(2);
const pageArg = args.find((arg) => arg.startsWith('--page='));
const filePath = args.find((arg) => !arg.startsWith('--')) || defaultPdf;
const shotsDir = path.join(__dirname, '..', 'tmp', 'product-shots');

logPdfProducts(filePath, {
  page: pageArg ? pageArg.split('=')[1] : 10,
  screenshotsDir: shotsDir,
}).then((result) => {
  const count = result.pages.reduce(
    (sum, page) => sum + page.products.filter((product) => product.screenshot).length,
    0
  );
  console.log(`\nЗаписани скрийншоти: ${count}`);
  console.log(`Папка: ${shotsDir}`);
}).catch((err) => {
  console.error('Неуспешни скрийншоти:', err.message);
  process.exit(1);
});
