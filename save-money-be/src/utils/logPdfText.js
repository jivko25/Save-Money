const fs = require('fs/promises');
const path = require('path');
const { PDFParse } = require('pdf-parse');

async function logPdfText(filePath) {
  const absolutePath = path.resolve(filePath);
  const buffer = await fs.readFile(absolutePath);
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    const text = result?.text ?? '';

    console.log(`\n===== PDF: ${path.basename(absolutePath)} =====`);
    console.log(`pages: ${result.total}`);

    for (const page of result.pages) {
      console.log(`\n----- page ${page.num} -----`);
      console.log(page.text);
    }

    console.log('\n----- /pdf -----\n');

    return text;
  } finally {
    await parser.destroy();
  }
}

module.exports = { logPdfText };
