-- Full-text search по всички текстови колони на brochure_products.
-- Пусни в Supabase SQL Editor.

alter table brochure_products
  add column if not exists search_vector tsvector
  generated always as (
    to_tsvector(
      'simple'::regconfig,
      coalesce(store_name, '') || ' ' ||
      coalesce(name, '') || ' ' ||
      coalesce(product_type, '') || ' ' ||
      coalesce(brand, '') || ' ' ||
      coalesce(quantity, '') || ' ' ||
      coalesce(note, '') || ' ' ||
      coalesce(raw_text, '') || ' ' ||
      coalesce(price::text, '') || ' ' ||
      coalesce(page_number::text, '')
    )
  ) stored;

create index if not exists idx_brochure_products_fts
  on brochure_products
  using gin (search_vector);

create index if not exists idx_brochure_products_valid_until
  on brochure_products (valid_until);
