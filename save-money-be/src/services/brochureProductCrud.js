const supabase = require('../../supabase');

const SELECT_FIELDS =
  'id, store_name, page_number, valid_until, name, product_type, brand, quantity, price, note, screenshot_path, screenshot_url, raw_text, brochure_id, created_at';

const WRITABLE_FIELDS = [
  'store_name',
  'page_number',
  'valid_until',
  'name',
  'product_type',
  'brand',
  'quantity',
  'price',
  'note',
  'screenshot_path',
  'screenshot_url',
  'raw_text',
  'brochure_id',
];

function sofiaToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Sofia' });
}

function pickWritable(body = {}) {
  const row = {};
  for (const key of WRITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      row[key] = body[key];
    }
  }
  return row;
}

function toTsQuery(raw) {
  const terms = String(raw || '')
    .trim()
    .split(/\s+/)
    .map((term) => term.replace(/[^\p{L}\p{N}]+/gu, ''))
    .filter(Boolean);

  if (!terms.length) return null;
  return terms.map((term) => `${term}:*`).join(' & ');
}

function applyActiveFilter(query, reqQuery) {
  const includeExpired =
    reqQuery?.include_expired === 'true' || reqQuery?.active === 'false';
  if (includeExpired) return query;
  return query.gte('valid_until', sofiaToday());
}

async function listProducts(req, res) {
  try {
    const {
      q,
      store,
      product_type,
      limit = '50',
      offset = '0',
    } = req.query;

    const take = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const skip = Math.max(parseInt(offset, 10) || 0, 0);

    let query = supabase
      .from('brochure_products')
      .select(SELECT_FIELDS, { count: 'exact' })
      .order('valid_until', { ascending: true })
      .order('name', { ascending: true })
      .range(skip, skip + take - 1);

    query = applyActiveFilter(query, req.query);

    if (store) {
      query = query.ilike('store_name', store);
    }
    if (product_type) {
      query = query.ilike('product_type', `%${product_type}%`);
    }

    const tsQuery = toTsQuery(q);
    if (tsQuery) {
      query = query.textSearch('search_vector', tsQuery, {
        type: 'raw',
        config: 'simple',
      });
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return res.json({
      products: data || [],
      count: count || 0,
      limit: take,
      offset: skip,
      active_only: !(req.query.include_expired === 'true' || req.query.active === 'false'),
    });
  } catch (err) {
    console.error('listProducts:', err.message);
    return res.status(500).json({ error: 'Грешка при търсене на продукти.', details: err.message });
  }
}

async function getProductById(req, res) {
  try {
    const { data, error } = await supabase
      .from('brochure_products')
      .select(SELECT_FIELDS)
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Продуктът не е намерен.' });
    return res.json({ product: data });
  } catch (err) {
    console.error('getProductById:', err.message);
    return res.status(500).json({ error: 'Грешка при взимане на продукта.', details: err.message });
  }
}

async function createProduct(req, res) {
  try {
    const row = pickWritable(req.body);
    if (!row.store_name) {
      return res.status(400).json({ error: 'store_name е задължително.' });
    }

    const { data, error } = await supabase
      .from('brochure_products')
      .insert([row])
      .select(SELECT_FIELDS)
      .single();

    if (error) throw error;
    return res.status(201).json({ product: data });
  } catch (err) {
    console.error('createProduct:', err.message);
    return res.status(500).json({ error: 'Грешка при създаване на продукта.', details: err.message });
  }
}

async function updateProduct(req, res) {
  try {
    const row = pickWritable(req.body);
    if (!Object.keys(row).length) {
      return res.status(400).json({ error: 'Няма полета за обновяване.' });
    }

    const { data, error } = await supabase
      .from('brochure_products')
      .update(row)
      .eq('id', req.params.id)
      .select(SELECT_FIELDS)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Продуктът не е намерен.' });
    return res.json({ product: data });
  } catch (err) {
    console.error('updateProduct:', err.message);
    return res.status(500).json({ error: 'Грешка при обновяване на продукта.', details: err.message });
  }
}

async function deleteProduct(req, res) {
  try {
    const { data, error } = await supabase
      .from('brochure_products')
      .delete()
      .eq('id', req.params.id)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Продуктът не е намерен.' });
    return res.json({ message: 'Продуктът е изтрит.', id: data.id });
  } catch (err) {
    console.error('deleteProduct:', err.message);
    return res.status(500).json({ error: 'Грешка при изтриване на продукта.', details: err.message });
  }
}

module.exports = {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};
