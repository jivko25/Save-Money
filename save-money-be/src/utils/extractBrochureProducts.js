const path = require('path');
const { generateGeminiJson } = require('./geminiClient');
const { splitPdfProducts } = require('./splitPdfProducts');
const { sleep, isFatalAuthError, isQuotaError, isTransientGatewayError } = require('./retry');

const PRODUCT_SCHEMA = {
  type: 'object',
  properties: {
    products: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          name: { type: ['string', 'null'] },
          product_type: { type: ['string', 'null'] },
          brand: { type: ['string', 'null'] },
          quantity: { type: ['string', 'null'] },
          price: { type: ['number', 'null'] },
          note: { type: ['string', 'null'] },
        },
        required: ['index', 'name', 'product_type', 'brand', 'quantity', 'price', 'note'],
      },
    },
  },
  required: ['products'],
};

const SYSTEM_INSTRUCTION =
  'Извлечи данни от номерирани блокове от брошура. Върни само JSON. name е кратко display име: продукт + марка + грамаж, без цени (напр. „Филе от сьомга с лимонено орзо EAT GOOD 300 г“). product_type е категория на български. brand е марка. quantity е грамаж/обем. price е текущата промо цена като число (напр. 4.49), не старата задраскана. note е промо, 1+1 и т.н. Ако няма данни — null. Не измисляй.';

function parseBrochureMeta(fileName) {
  const base = path.basename(fileName).replace(/\.pdf$/i, '');
  const storeMatch = base.match(/^([A-Za-zА-Яа-я]+)/);
  const dates = [...base.matchAll(/(\d{2})-(\d{2})-(\d{4})/g)];
  const last = dates[1] || dates[0];
  return {
    store_name: storeMatch ? storeMatch[1] : null,
    valid_until: last ? `${last[3]}-${last[2]}-${last[1]}` : null,
  };
}

function buildPagePrompt(products) {
  const blocks = products
    .map((product, index) => `${index + 1})\n${product.text}`)
    .join('\n\n');
  return `Блокове:\n\n${blocks}`;
}

const GEMINI_GAP_MS = 5_000;
const GEMINI_BATCH_SIZE = 8;
const INVALID_JSON_RETRIES = 3;

function parsePrice(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = String(value).replace(',', '.').replace(/[^\d.]/g, '');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function tokenBudget(batchSize, attempt) {
  const base = Math.min(4096, 640 + batchSize * 160);
  return Math.min(4096, base * (attempt + 1));
}

function normalizeExtracted(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.products)) return parsed.products;
  return [];
}

async function extractBatchWithGemini(batch, attempt) {
  const parsed = await generateGeminiJson({
    contents: buildPagePrompt(batch),
    systemInstruction: SYSTEM_INSTRUCTION,
    responseJsonSchema: PRODUCT_SCHEMA,
    maxOutputTokens: tokenBudget(batch.length, attempt),
  });
  return normalizeExtracted(parsed);
}

async function extractPageWithGemini(products) {
  const extracted = [];

  for (let offset = 0; offset < products.length; offset += GEMINI_BATCH_SIZE) {
    const batch = products.slice(offset, offset + GEMINI_BATCH_SIZE);
    if (offset > 0) {
      console.log('Пауза 5 секунди преди следващата Gemini заявка...');
      await sleep(GEMINI_GAP_MS);
    }

    let lastErr = null;
    for (let attempt = 0; attempt < INVALID_JSON_RETRIES; ) {
      try {
        const items = await extractBatchWithGemini(batch, attempt);
        for (const item of items) {
          const localIndex = Number(item.index);
          if (!Number.isFinite(localIndex)) continue;
          extracted.push({ ...item, index: offset + localIndex });
        }
        lastErr = null;
        break;
      } catch (err) {
        if (isQuotaError(err) || isTransientGatewayError(err)) {
          const waitMs = isQuotaError(err) ? 60_000 : 15_000;
          const reason = isQuotaError(err)
            ? 'Gemini free-tier квотата е изчерпана'
            : `Временна мрежова грешка (${String(err.message || err).slice(0, 80)})`;
          console.log(`${reason}. Нов опит след ${waitMs / 1000} секунди...`);
          await sleep(waitMs);
          continue;
        }
        lastErr = err;
        attempt += 1;
        if (attempt >= INVALID_JSON_RETRIES) break;
        console.log(
          `Невалиден Gemini JSON. Нов опит след 10 секунди (${attempt}/${INVALID_JSON_RETRIES})...`
        );
        await sleep(10_000);
      }
    }

    if (lastErr) throw lastErr;
  }

  return extracted;
}

async function extractBrochureProducts(filePath, options = {}) {
  const shotsDir =
    options.screenshotsDir || path.join(path.dirname(filePath), '..', 'tmp', 'product-shots');
  const split = await splitPdfProducts(filePath, {
    page: options.page,
    fromPage: options.fromPage,
    screenshotsDir: shotsDir,
    scale: options.scale,
  });
  const parsed = parseBrochureMeta(split.fileName);
  const meta = {
    store_name: options.storeName || parsed.store_name,
    valid_until: options.validUntil || parsed.valid_until,
  };
  const rows = [];
  const skipped = [];
  let geminiCalls = 0;

  console.log(`${split.fileName}: ${split.pages.length} страници`);

  for (const page of split.pages) {
    if (options.shouldStop?.()) {
      console.log(`Времеви лимит — спиране преди страница ${page.page}. Следващият run продължава оттук.`);
      break;
    }
    if (!page.products.length) {
      if (options.onPage) await options.onPage([], page);
      continue;
    }

    if (geminiCalls > 0) {
      console.log('Пауза 5 секунди преди следващата Gemini заявка...');
      await sleep(GEMINI_GAP_MS);
    }

    let extracted;
    try {
      extracted = await extractPageWithGemini(page.products);
    } catch (err) {
      if (isFatalAuthError(err)) throw err;
      console.warn(`Страница ${page.page}: пропускане — ${err.message}`);
      skipped.push({ page: page.page, reason: err.message });
      geminiCalls += 1;
      continue;
    }

    geminiCalls += 1;
    const pageRows = [];

    for (const item of extracted) {
      const source = page.products[item.index - 1];
      if (!source) continue;
      pageRows.push({
        store_name: meta.store_name,
        page_number: page.page,
        valid_until: meta.valid_until,
        name: item.name || null,
        product_type: item.product_type || null,
        brand: item.brand || null,
        quantity: item.quantity || null,
        price: parsePrice(item.price),
        note: item.note || null,
        screenshot_path: source.screenshot || null,
        screenshot_content_type: source.screenshot ? 'image/png' : null,
        raw_text: source.text,
      });
    }

    rows.push(...pageRows);
    try {
      if (options.onPage) await options.onPage(pageRows, page);
    } catch (err) {
      if (isFatalAuthError(err)) throw err;
      console.warn(`Страница ${page.page}: качването се пропусна — ${err.message}`);
      skipped.push({ page: page.page, reason: err.message });
    }
  }

  return { fileName: split.fileName, ...meta, products: rows, skipped };
}

module.exports = {
  parseBrochureMeta,
  extractBrochureProducts,
};
