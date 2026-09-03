const fs = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');

let pdfjsLoader;

function loadPdfjs() {
  if (!pdfjsLoader) {
    pdfjsLoader = import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
        require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
      ).href;
      return pdfjs;
    });
  }
  return pdfjsLoader;
}

function isNoise(str, y, pageHeight) {
  if (!str) return true;
  if (/^S\d+-BG-KW/i.test(str)) return true;
  if (/kaufland\.bg/i.test(str)) return true;
  if (y < pageHeight * 0.045 && /^\d{1,3}$/.test(str)) return true;
  return false;
}

function looksLikePrice(str) {
  const compact = str.replace(/\s+/g, '');
  if (/^ТОПЦЕНА$/i.test(compact)) return true;
  if (/^[-–]?\d+([.,]\d+)?%?$/.test(compact)) return true;
  if (/^[-–]\d+%$/.test(compact)) return true;
  if (/^\d+за\d+([.,]\d+)?$/.test(compact)) return true;
  return false;
}

function fragmentBox(items) {
  const x = Math.min(...items.map((item) => item.x));
  const y = Math.min(...items.map((item) => item.y));
  const right = Math.max(...items.map((item) => item.x + item.w));
  const top = Math.max(...items.map((item) => item.y + item.h));
  const text = items
    .slice()
    .sort((a, b) => a.x - b.x)
    .map((item) => item.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    items,
    x,
    y,
    w: right - x,
    h: top - y,
    text,
    isPrice: looksLikePrice(text),
  };
}

function groupIntoLines(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];

  for (const item of sorted) {
    const last = lines[lines.length - 1];
    const threshold = Math.max(last ? last.h : 8, item.h, 6) * 0.8;
    if (last && Math.abs(last.y - item.y) < threshold) {
      last.items.push(item);
      last.h = Math.max(last.h, item.h);
      last.y = (last.y * (last.items.length - 1) + item.y) / last.items.length;
    } else {
      lines.push({ y: item.y, h: item.h, items: [item] });
    }
  }

  return lines;
}

function splitLineFragments(line, gapThreshold) {
  const sorted = [...line.items].sort((a, b) => a.x - b.x);
  const groups = [];
  let current = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = current[current.length - 1];
    const gap = sorted[i].x - (prev.x + prev.w);
    if (gap > gapThreshold) {
      groups.push(current);
      current = [sorted[i]];
    } else {
      current.push(sorted[i]);
    }
  }
  groups.push(current);

  return groups.map(fragmentBox);
}

function overlapRatio(a, b) {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const overlap = Math.max(0, right - left);
  const minW = Math.max(Math.min(a.w, b.w), 1);
  return overlap / minW;
}

function shouldLinkFragments(a, b) {
  const dy = Math.abs(a.y - b.y);
  if (dy > 42) return false;

  if (overlapRatio(a, b) >= 0.28) return true;

  const left = a.x <= b.x ? a : b;
  const right = a.x <= b.x ? b : a;
  const gap = right.x - (left.x + left.w);
  const priceOnTheRight = !left.isPrice && right.isPrice;

  return priceOnTheRight && gap >= -8 && gap <= 88 && dy <= 30;
}

function clusterFragments(fragments) {
  const parent = fragments.map((_, i) => i);

  function find(i) {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }

  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }

  for (let i = 0; i < fragments.length; i++) {
    for (let j = i + 1; j < fragments.length; j++) {
      if (shouldLinkFragments(fragments[i], fragments[j])) {
        union(i, j);
      }
    }
  }

  const groups = new Map();
  fragments.forEach((fragment, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(fragment);
  });

  return [...groups.values()];
}

function textFromCluster(fragments) {
  return fragments
    .slice()
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map((fragment) => fragment.text)
    .filter(Boolean)
    .join('\n');
}

function hasQuantity(text) {
  return (
    /\d+(?:[.,]\d+)?\s*(?:г|кг|мл|л|бр|pet)(?=$|[\s/,])/i.test(text) ||
    /\d+\s*[xх]\s*\d+/i.test(text) ||
    /(^|\n)\s*кг\s*($|\n)/i.test(text)
  );
}

function hasProductPrice(text) {
  return /(?:^|\s)\d+[.,]\d{2}(?:\s|$)/.test(text) || /\d+\s*за\s*\d+[.,]\d{2}/i.test(text);
}

function hasProductName(text) {
  return text.split('\n').some((line) => {
    const cleaned = line.replace(/топ\s*цена/gi, '').trim();
    if (!cleaned || looksLikePrice(cleaned)) return false;
    const words = cleaned.match(/[a-zа-я]{3,}/gi) || [];
    return words.join('').length >= 5;
  });
}

function isProductBlock(text) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length < 8) return false;

  const dateHeader =
    /^(от|до)\s+(понеделник|вторник|сряда|четвъртък|петък|събота|неделя)/i.test(normalized);
  if (dateHeader && !hasQuantity(text)) return false;

  if (
    /симона|фитнес инструктор|избра от витрината|сканирай|активирай xtra|предимства/i.test(text) &&
    !hasQuantity(text)
  ) {
    return false;
  }

  if (/^["“„✓]/.test(text.trim()) && !hasQuantity(text)) return false;

  if (hasQuantity(text) && hasProductName(text)) return true;
  if (hasProductPrice(text) && hasProductName(text) && !looksLikePrice(normalized)) return true;

  return false;
}

function clusterBBox(fragments, pageWidth, pageHeight) {
  const x = Math.min(...fragments.map((fragment) => fragment.x));
  const y = Math.min(...fragments.map((fragment) => fragment.y));
  const right = Math.max(...fragments.map((fragment) => fragment.x + fragment.w));
  const top = Math.max(...fragments.map((fragment) => fragment.y + fragment.h));
  const textH = Math.max(top - y, 8);
  const padX = 22;
  const padBottom = 16;
  const padTop = Math.max(textH * 2.4, 140);

  const boxedX = Math.max(0, x - padX);
  const boxedY = Math.max(0, y - padBottom);
  const boxedRight = Math.min(pageWidth, right + padX);
  const boxedTop = Math.min(pageHeight, top + padTop);

  return {
    x: boxedX,
    y: boxedY,
    w: boxedRight - boxedX,
    h: boxedTop - boxedY,
  };
}

function clusterAnchor(fragments) {
  return {
    minX: Math.min(...fragments.map((fragment) => fragment.x)),
    maxY: Math.max(...fragments.map((fragment) => fragment.y)),
  };
}

async function savePageProductShots(pagePng, products, options) {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const image = await loadImage(pagePng);
  const scaleX = image.width / options.pageWidth;
  const scaleY = image.height / options.pageHeight;
  const saved = [];

  await fs.mkdir(options.outDir, { recursive: true });

  for (let i = 0; i < products.length; i++) {
    const bbox = products[i].bbox;
    if (!bbox || bbox.w < 36 || bbox.h < 20) continue;

    const sx = Math.max(0, Math.floor(bbox.x * scaleX));
    const sy = Math.max(0, Math.floor((options.pageHeight - bbox.y - bbox.h) * scaleY));
    const sw = Math.min(image.width - sx, Math.ceil(bbox.w * scaleX));
    const sh = Math.min(image.height - sy, Math.ceil(bbox.h * scaleY));
    if (sw < 8 || sh < 8) continue;

    const shot = createCanvas(sw, sh);
    shot.getContext('2d').drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

    const fileName = `page-${String(options.pageNum).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}.png`;
    const filePath = path.join(options.outDir, fileName);
    await fs.writeFile(filePath, shot.toBuffer('image/png'));
    products[i].screenshot = filePath;
    saved.push(filePath);
  }

  return saved;
}

function quantityXs(fragments) {
  return fragments
    .filter((fragment) => /\d+(?:[.,]\d+)?\s*(?:г|кг|мл|л|бр)(?=$|[\s/,])/i.test(fragment.text))
    .map((fragment) => fragment.x);
}

function kMeansAssign(values, k) {
  const sorted = [...values].sort((a, b) => a - b);
  let centers = Array.from({ length: k }, (_, i) =>
    sorted[Math.min(sorted.length - 1, Math.floor(((i + 0.5) * sorted.length) / k))]
  );
  let assign = values.map(() => 0);

  for (let n = 0; n < 12; n++) {
    assign = values.map((value) => {
      let best = 0;
      let bestDist = Infinity;
      centers.forEach((center, index) => {
        const dist = Math.abs(value - center);
        if (dist < bestDist) {
          bestDist = dist;
          best = index;
        }
      });
      return best;
    });

    for (let i = 0; i < k; i++) {
      const pts = values.filter((_, index) => assign[index] === i);
      if (pts.length) {
        centers[i] = pts.reduce((sum, value) => sum + value, 0) / pts.length;
      }
    }
  }

  return assign;
}

function splitClusterByColumns(fragments) {
  const xs = quantityXs(fragments);
  if (xs.length < 2) return [fragments];

  const spread = Math.max(...xs) - Math.min(...xs);
  if (spread < 55) return [fragments];

  const k = Math.min(xs.length, 4);
  const fragmentXs = fragments.map((fragment) => fragment.x + fragment.w / 2);
  const assign = kMeansAssign(fragmentXs, k);
  const buckets = Array.from({ length: k }, () => []);
  fragments.forEach((fragment, index) => buckets[assign[index]].push(fragment));
  return buckets.filter((bucket) => bucket.length);
}

function isPriceOnlyCluster(fragments) {
  const text = textFromCluster(fragments);
  const lines = text.split('\n').filter(Boolean);
  return lines.length > 0 && lines.every(looksLikePrice);
}

function absorbPriceOrphans(clusters) {
  const prices = [];
  const products = [];

  for (const cluster of clusters) {
    if (isPriceOnlyCluster(cluster)) prices.push(cluster);
    else products.push(cluster);
  }

  for (const price of prices) {
    const priceAnchor = clusterAnchor(price);
    let best = null;
    let bestDist = Infinity;

    for (const product of products) {
      const productAnchor = clusterAnchor(product);
      if (Math.abs(priceAnchor.maxY - productAnchor.maxY) > 80) continue;
      const dist = Math.hypot(
        priceAnchor.minX - productAnchor.minX,
        priceAnchor.maxY - productAnchor.maxY
      );
      if (dist < bestDist) {
        bestDist = dist;
        best = product;
      }
    }

    if (best && bestDist < 180) best.push(...price);
    else products.push(price);
  }

  return products;
}

async function extractPageItems(page) {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items = [];

  for (const raw of content.items) {
    const str = (raw.str || '').replace(/\s+/g, ' ').trim();
    if (!str) continue;

    const transform = raw.transform || [1, 0, 0, 1, 0, 0];
    const x = transform[4];
    const y = transform[5];
    if (isNoise(str, y, viewport.height)) continue;

    items.push({
      str,
      x,
      y,
      w: Math.max(raw.width || 0, 2),
      h: Math.max(raw.height || Math.abs(transform[3]) || 8, 4),
    });
  }

  return { items, width: viewport.width, height: viewport.height };
}

async function splitPdfProducts(filePath, options = {}) {
  const absolutePath = path.resolve(filePath);
  const buffer = await fs.readFile(absolutePath);
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const onlyPage = options.page ? Number(options.page) : null;
  const fromPage = options.fromPage ? Number(options.fromPage) : 1;
  const pages = [];

  try {
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      if (onlyPage && pageNum !== onlyPage) continue;
      if (!onlyPage && pageNum < fromPage) continue;

      const page = await doc.getPage(pageNum);
      const { items, width, height } = await extractPageItems(page);

      if (!items.length) {
        pages.push({ page: pageNum, pageWidth: width, pageHeight: height, products: [] });
        await page.cleanup();
        continue;
      }

      const lines = groupIntoLines(items);
      const fragments = lines.flatMap((line) => splitLineFragments(line, 18));
      const clusters = absorbPriceOrphans(
        clusterFragments(fragments)
          .filter((cluster) => cluster.length > 0)
          .flatMap(splitClusterByColumns)
      ).sort((a, b) => {
        const aa = clusterAnchor(a);
        const bb = clusterAnchor(b);
        if (Math.abs(aa.maxY - bb.maxY) > 22) return bb.maxY - aa.maxY;
        return aa.minX - bb.minX;
      });

      const products = clusters
        .map((cluster) => ({
          text: textFromCluster(cluster),
          bbox: clusterBBox(cluster, width, height),
        }))
        .filter((product) => product.text && isProductBlock(product.text));

      await page.cleanup();
      pages.push({ page: pageNum, pageWidth: width, pageHeight: height, products });
    }
  } finally {
    await doc.destroy();
  }

  if (options.screenshotsDir) {
    const { spawn } = require('child_process');
    const renderScript = path.join(__dirname, '../../scripts/render-pdf-page.js');
    const scale = options.scale || 2;

    await fs.mkdir(options.screenshotsDir, { recursive: true });

    for (const pageResult of pages) {
      if (!pageResult.products.length) continue;
      const pagePng = path.join(
        options.screenshotsDir,
        `_page-${String(pageResult.page).padStart(2, '0')}.png`
      );

      await new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [renderScript, absolutePath, String(pageResult.page), pagePng, String(scale)],
          { stdio: ['ignore', 'pipe', 'pipe'] }
        );
        let stderr = '';
        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });
        child.on('error', reject);
        child.on('exit', (code) => {
          if (code === 0) resolve();
          else reject(new Error(stderr.trim() || `render-pdf-page exited with ${code}`));
        });
      });

      const png = await fs.readFile(pagePng);
      await savePageProductShots(png, pageResult.products, {
        pageNum: pageResult.page,
        pageWidth: pageResult.pageWidth,
        pageHeight: pageResult.pageHeight,
        outDir: options.screenshotsDir,
      });
      await fs.unlink(pagePng).catch(() => {});
    }
  }

  return {
    fileName: path.basename(absolutePath),
    pages,
  };
}

function formatSplitProducts(result) {
  const chunks = [`===== PDF: ${result.fileName} =====`, `pages: ${result.pages.length}`];

  for (const page of result.pages) {
    chunks.push(`\n===== page ${page.page} (${page.products.length} продукта) =====`);
    if (!page.products.length) {
      chunks.push('(няма текст)');
      continue;
    }
    chunks.push(page.products.map((product) => `---\n${product.text}`).join('\n'));
    chunks.push('---');
  }

  return chunks.join('\n');
}

async function logPdfProducts(filePath, options = {}) {
  const result = await splitPdfProducts(filePath, options);
  const output = formatSplitProducts(result);
  console.log(output);
  return result;
}

module.exports = {
  splitPdfProducts,
  formatSplitProducts,
  logPdfProducts,
};
