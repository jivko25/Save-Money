const path = require('path');
const { logPdfText } = require('../src/utils/logPdfText');

const defaultPdf = path.join(
  __dirname,
  '..',
  'tmp',
  'Kaufland-31-08-2026-06-09-2026-00.pdf'
);

const filePath = process.argv[2] || defaultPdf;

logPdfText(filePath).catch((err) => {
  console.error('Неуспешно четене на PDF:', err.message);
  process.exit(1);
});
