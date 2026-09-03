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

logPdfProducts(filePath, {
  page: pageArg ? pageArg.split('=')[1] : undefined,
}).catch((err) => {
  console.error('Неуспешно разделяне на продукти:', err.message);
  process.exit(1);
});
