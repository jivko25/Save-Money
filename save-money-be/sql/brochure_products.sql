-- 1. Таблица brochure_products
create table brochure_products (
  id uuid primary key default gen_random_uuid(),
  store_name text not null,
  page_number integer,
  valid_until date,
  name text,
  product_type text,
  brand text,
  quantity text,
  price numeric(10,2),
  note text,
  screenshot_path text,
  screenshot_url text,
  raw_text text,
  brochure_id uuid references brochures(id) on delete set null,
  created_at timestamp with time zone default now()
);

-- 2. Индекси
create index idx_brochure_products_store_valid on brochure_products (store_name, valid_until);
create index idx_brochure_products_brochure_id on brochure_products (brochure_id);

-- 3. RLS (публичен read)
alter table brochure_products enable row level security;

create policy "brochure_products_public_read"
  on brochure_products
  for select
  using (true);

-- 4. Storage bucket за скрийншоти
insert into storage.buckets (id, name, public)
values ('brochure-products', 'brochure-products', true);

create policy "brochure_products_images_public_read"
  on storage.objects
  for select
  using (bucket_id = 'brochure-products');
