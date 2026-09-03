const fs = require('fs');
const { PDFParse } = require('pdf-parse');

async function main() {
  const pdfPath = process.argv[2];
  const pageNum = Number(process.argv[3]);
  const outPath = process.argv[4];
  const scale = Number(process.argv[5] || 2);

  const parser = new PDFParse({ data: fs.readFileSync(pdfPath) });
  try {
    const shot = await parser.getScreenshot({
      partial: [pageNum],
      scale,
      imageBuffer: true,
      imageDataUrl: false,
    });
    const png = shot.pages[0]?.data;
    if (!png) {
      throw new Error(`Няма screenshot за страница ${pageNum}`);
    }
    fs.writeFileSync(outPath, png);
  } finally {
    await parser.destroy();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
