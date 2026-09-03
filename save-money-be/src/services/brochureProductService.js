const fs = require('fs/promises');
const path = require('path');
const supabase = require('../../supabase');
const {
  extractBrochureProducts,
  parseBrochureMeta,
} = require('../utils/extractBrochureProducts');
const { retryForever } = require('../utils/retry');

const BUCKET = 'brochure-products';

function publicUrl(storagePath) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

function toStoragePath(row) {
  const file = path.basename(
    row.screenshot_path || `page-${String(row.page_number).padStart(2, '0')}-00.png`
  );
  const store = String(row.store_name || 'unknown').toLowerCase();
  const until = row.valid_until || 'unknown';
  return `${store}/${until}/${file}`;
}

async function findBrochureId(storeName) {
  if (!storeName) return null;

  const { data, error } = await supabase
    .from('brochures')
    .select('id')
    .eq('store_name', storeName)
    .eq('archived', false)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

async function deleteExistingProducts({ storeName, validUntil, pageNumber }) {
  if (!storeName) return;

  let query = supabase.from('brochure_products').delete().eq('store_name', storeName);
  if (validUntil) query = query.eq('valid_until', validUntil);
  if (pageNumber) query = query.eq('page_number', Number(pageNumber));

  const { error } = await query;
  if (error) throw error;
}

async function uploadPageProducts(products, brochureId) {
  const rows = [];

  for (const product of products) {
    let screenshotPath = null;
    let screenshotUrl = null;

    if (product.screenshot_path) {
      screenshotPath = toStoragePath(product);
      const buffer = await fs.readFile(product.screenshot_path);
      const { error } = await supabase.storage.from(BUCKET).upload(screenshotPath, buffer, {
        contentType: product.screenshot_content_type || 'image/png',
        upsert: true,
      });
      if (error) throw error;
      screenshotUrl = publicUrl(screenshotPath);
    }

    rows.push({
      store_name: product.store_name,
      page_number: product.page_number,
      valid_until: product.valid_until,
      name: product.name,
      product_type: product.product_type,
      brand: product.brand,
      quantity: product.quantity,
      price: product.price,
      note: product.note,
      screenshot_path: screenshotPath,
      screenshot_url: screenshotUrl,
      raw_text: product.raw_text,
      brochure_id: brochureId || null,
    });
  }

  if (!rows.length) return 0;

  const { error } = await supabase.from('brochure_products').insert(rows);
  if (error) throw error;
  return rows.length;
}

async function uploadBrochureFromPdf(filePath, options = {}) {
  const fileName = path.basename(filePath);
  const meta = parseBrochureMeta(fileName);
  const brochureId = options.brochureId || (await findBrochureId(meta.store_name));

  let uploaded = 0;

  const result = await extractBrochureProducts(filePath, {
    page: options.page,
    fromPage: options.fromPage,
    screenshotsDir: options.screenshotsDir,
    scale: options.scale,
    onPage: async (pageRows, page) => {
      const count = await retryForever(
        async () => {
          await deleteExistingProducts({
            storeName: meta.store_name,
            validUntil: meta.valid_until,
            pageNumber: page.page,
          });
          return uploadPageProducts(pageRows, brochureId);
        },
        {
          onWait: (err, waitMs, kind) => {
            const label = kind === 'quota' ? 'квота' : 'мрежа/gateway';
            console.log(
              `Качването на страница ${page.page} спря (${label}: ${String(err.message).slice(0, 80)}). Нов опит след ${waitMs / 1000} секунди...`
            );
          },
        }
      );
      uploaded += count;
      console.log(`Страница ${page.page}: качени ${count} продукта`);
    },
  });

  return {
    ...result,
    uploaded,
    brochure_id: brochureId,
  };
}

module.exports = {
  BUCKET,
  findBrochureId,
  uploadBrochureFromPdf,
  uploadPageProducts,
};
