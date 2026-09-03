const fs = require('fs/promises');
const path = require('path');
const supabase = require('../../supabase');
const {
  extractBrochureProducts,
  parseBrochureMeta,
} = require('../utils/extractBrochureProducts');
const { getPdfPageCount } = require('../utils/splitPdfProducts');
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

async function deleteLocalFiles(filePaths) {
  await Promise.all(
    (filePaths || []).map((filePath) => fs.unlink(filePath).catch(() => {}))
  );
}

async function cleanupScreenshotsDir(dir) {
  if (!dir) return;
  const entries = await fs.readdir(dir).catch(() => []);
  const pngs = entries.filter((name) => name.endsWith('.png'));
  await deleteLocalFiles(pngs.map((name) => path.join(dir, name)));
}

async function uploadPageProducts(products, brochureId) {
  const rows = [];
  const localShots = [];

  for (const product of products) {
    let screenshotPath = null;
    let screenshotUrl = null;

    if (product.screenshot_path) {
      localShots.push(product.screenshot_path);
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
  await deleteLocalFiles(localShots);
  return rows.length;
}

async function uploadBrochureFromPdf(filePath, options = {}) {
  const fileName = path.basename(filePath);
  const parsed = parseBrochureMeta(fileName);
  const meta = {
    store_name: options.storeName || parsed.store_name,
    valid_until: options.validUntil || parsed.valid_until,
  };
  const brochureId = options.brochureId || (await findBrochureId(meta.store_name));

  let uploaded = 0;

  const result = await extractBrochureProducts(filePath, {
    page: options.page,
    fromPage: options.fromPage,
    screenshotsDir: options.screenshotsDir,
    scale: options.scale,
    storeName: meta.store_name,
    validUntil: meta.valid_until,
    shouldStop: options.shouldStop,
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

  await cleanupScreenshotsDir(options.screenshotsDir);
  console.log('Локалните скрийншоти са изтрити.');

  return {
    ...result,
    uploaded,
    brochure_id: brochureId,
  };
}

const STORES = {
  lidl: 'Lidl',
  kaufland: 'Kaufland',
  billa: 'Billa',
};

const BROCHURES_BUCKET = 'brochures';

function normalizeStore(value) {
  if (!value) return null;
  return STORES[String(value).trim().toLowerCase()] || null;
}

function toDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function verifyCronSecret(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers?.['x-cron-secret'];
  const bearer = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  const query = req.query?.secret;
  return header === expected || bearer === expected || query === expected;
}

async function listActiveBrochures(storeName) {
  const { data, error } = await supabase
    .from('brochures')
    .select('id, store_name, file_name, pdf_url, expires_at, uploaded_at')
    .eq('store_name', storeName)
    .eq('archived', false)
    .gte('expires_at', new Date().toISOString())
    .order('uploaded_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function getLastExtractedPage(brochureId) {
  const { data, error } = await supabase
    .from('brochure_products')
    .select('page_number')
    .eq('brochure_id', brochureId)
    .order('page_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.page_number || 0;
}

async function downloadBrochurePdf(brochure, destDir) {
  await fs.mkdir(destDir, { recursive: true });
  const dest = path.join(destDir, brochure.file_name);
  const { data, error } = await supabase.storage.from(BROCHURES_BUCKET).download(brochure.file_name);
  if (error) throw error;
  await fs.writeFile(dest, Buffer.from(await data.arrayBuffer()));
  return dest;
}

async function dispatchExtractWorkflow(store) {
  const repo = process.env.GH_REPO || process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_PAT;
  const workflow = process.env.EXTRACT_WORKFLOW || 'extract-products.yml';
  if (!repo || !token) return false;

  const response = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'save-money-be',
      },
      body: JSON.stringify({
        ref: process.env.GH_REF || 'main',
        inputs: { store },
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub dispatch ${response.status}: ${text.slice(0, 200)}`);
  }
  return true;
}

async function extractActiveStoreBrochures(storeName, options = {}) {
  const store = normalizeStore(storeName);
  if (!store) {
    throw new Error('Невалиден магазин. Ползвай store=Lidl, store=Kaufland или store=Billa.');
  }

  const started = Date.now();
  const maxMs = Number(options.maxMs || process.env.EXTRACT_MAX_MS || 25 * 60 * 1000);
  const tmpDir = options.tmpDir || path.join(__dirname, '../../tmp');
  const shotsDir = options.screenshotsDir || path.join(tmpDir, 'product-shots');
  const brochures = await listActiveBrochures(store);
  const results = [];

  console.log(`${store}: ${brochures.length} активни брошури`);

  for (const brochure of brochures) {
    if (Date.now() - started > maxMs) {
      results.push({
        brochure_id: brochure.id,
        file_name: brochure.file_name,
        status: 'deferred',
      });
      continue;
    }

    const pdfPath = await downloadBrochurePdf(brochure, tmpDir);
    try {
      const pageCount = await getPdfPageCount(pdfPath);
      const lastPage = await getLastExtractedPage(brochure.id);
      if (lastPage >= pageCount) {
        console.log(`${brochure.file_name}: вече извлечена (${pageCount} стр.)`);
        results.push({
          brochure_id: brochure.id,
          file_name: brochure.file_name,
          status: 'already_done',
          page_count: pageCount,
        });
        continue;
      }

      const fromPage = lastPage + 1;
      console.log(`${brochure.file_name}: страници ${fromPage}-${pageCount}`);
      const extracted = await uploadBrochureFromPdf(pdfPath, {
        brochureId: brochure.id,
        storeName: brochure.store_name,
        validUntil: toDateOnly(brochure.expires_at),
        fromPage,
        screenshotsDir: shotsDir,
        shouldStop: () => Date.now() - started > maxMs,
      });

      results.push({
        brochure_id: brochure.id,
        file_name: brochure.file_name,
        status: extracted.skipped?.length ? 'partial' : 'done',
        uploaded: extracted.uploaded,
        from_page: fromPage,
        skipped: extracted.skipped || [],
      });
    } finally {
      await fs.unlink(pdfPath).catch(() => {});
    }
  }

  return {
    store,
    active: brochures.length,
    results,
  };
}

module.exports = {
  BUCKET,
  STORES,
  findBrochureId,
  uploadBrochureFromPdf,
  uploadPageProducts,
  normalizeStore,
  verifyCronSecret,
  listActiveBrochures,
  dispatchExtractWorkflow,
  extractActiveStoreBrochures,
};
