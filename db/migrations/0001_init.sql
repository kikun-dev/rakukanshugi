-- === Extensions ===
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- === Common helpers ===
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- user_id を未指定 INSERT 時に auth.uid() を自動補完（NULL のときだけ）
create or replace function public.ensure_user_id()
returns trigger language plpgsql as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end $$;

-- === Tables ===
-- すべての user_id は auth.users(id) に紐づく（Supabase標準のユーザー）
create table if not exists public.accounts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  type       text not null check (type in ('credit','debit','cash','other')),
  is_active  boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_accounts_user on public.accounts(user_id);
create trigger tg_accounts_updated before update on public.accounts
  for each row execute function public.set_updated_at();
create trigger tg_accounts_ensure_uid before insert on public.accounts
  for each row execute function public.ensure_user_id();

create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  color      text,
  is_builtin boolean not null default false,
  is_active  boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);
create index if not exists idx_categories_user on public.categories(user_id);
create trigger tg_categories_updated before update on public.categories
  for each row execute function public.set_updated_at();
create trigger tg_categories_ensure_uid before insert on public.categories
  for each row execute function public.ensure_user_id();

create table if not exists public.transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  amount     integer not null check (amount > 0), -- 円（整数）
  memo       text,
  occurred_at date not null,
  is_deleted boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_tx_user_date on public.transactions(user_id, occurred_at desc);
create index if not exists idx_tx_account on public.transactions(account_id);
create index if not exists idx_tx_updated on public.transactions(user_id, updated_at);
create trigger tg_tx_updated before update on public.transactions
  for each row execute function public.set_updated_at();
create trigger tg_tx_ensure_uid before insert on public.transactions
  for each row execute function public.ensure_user_id();

create table if not exists public.transaction_splits (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  category_id    uuid not null references public.categories(id) on delete restrict,
  ratio          numeric(5,4) not null default 1.0 check (ratio > 0 and ratio <= 1),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique(transaction_id, category_id)
);
create index if not exists idx_splits_tx on public.transaction_splits(transaction_id);
create index if not exists idx_splits_cat on public.transaction_splits(category_id);
create trigger tg_splits_updated before update on public.transaction_splits
  for each row execute function public.set_updated_at();

create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  currency   text not null default 'JPY',
  decimals   smallint not null default 0,
  theme      text default 'system', -- 'light' | 'dark' | 'system'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger tg_user_settings_updated before update on public.user_settings
  for each row execute function public.set_updated_at();
create trigger tg_user_settings_ensure_uid before insert on public.user_settings
  for each row execute function public.ensure_user_id();

-- （任意）同期カーソル
create table if not exists public.sync_state (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  entity       text not null,
  last_synced_at timestamptz,
  updated_at   timestamptz not null default now(),
  unique(user_id, entity)
);
create trigger tg_sync_state_updated before update on public.sync_state
  for each row execute function public.set_updated_at();
create trigger tg_sync_state_ensure_uid before insert on public.sync_state
  for each row execute function public.ensure_user_id();

-- === View（表示用：スプリットの金額計算はビューで提供） ===
create or replace view public.v_transaction_splits as
select
  s.*,
  (floor(s.ratio * t.amount))::int as amount_calc
from public.transaction_splits s
join public.transactions t on t.id = s.transaction_id;

-- === RLS（Row Level Security） ===
alter table public.accounts            enable row level security;
alter table public.categories          enable row level security;
alter table public.transactions        enable row level security;
alter table public.transaction_splits  enable row level security;
alter table public.user_settings       enable row level security;
alter table public.sync_state          enable row level security;

-- 自分の行のみ SELECT/INSERT/UPDATE/DELETE 可能（accounts/categories/transactions/user_settings/sync_state）
create policy "select_own_accounts" on public.accounts
  for select using (user_id = auth.uid());
create policy "insert_own_accounts" on public.accounts
  for insert with check (user_id = auth.uid());
create policy "update_own_accounts" on public.accounts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete_own_accounts" on public.accounts
  for delete using (user_id = auth.uid());

create policy "select_own_categories" on public.categories
  for select using (user_id = auth.uid());
create policy "insert_own_categories" on public.categories
  for insert with check (user_id = auth.uid());
create policy "update_own_categories" on public.categories
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete_own_categories" on public.categories
  for delete using (user_id = auth.uid());

-- transactions: account_id も自分のものに限定
create policy "select_own_transactions" on public.transactions
  for select using (user_id = auth.uid());
create policy "insert_own_transactions" on public.transactions
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid())
  );
create policy "update_own_transactions" on public.transactions
  for update using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid())
  );
create policy "delete_own_transactions" on public.transactions
  for delete using (user_id = auth.uid());

-- transaction_splits: 紐づく取引・カテゴリが自分のものに限定
create policy "select_own_splits" on public.transaction_splits
  for select using (
    exists (select 1 from public.transactions t where t.id = transaction_id and t.user_id = auth.uid())
  );
create policy "insert_own_splits" on public.transaction_splits
  for insert with check (
    exists (select 1 from public.transactions t where t.id = transaction_id and t.user_id = auth.uid())
    and exists (select 1 from public.categories  c where c.id = category_id  and c.user_id = auth.uid())
  );
create policy "update_own_splits" on public.transaction_splits
  for update using (
    exists (select 1 from public.transactions t where t.id = transaction_id and t.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.transactions t where t.id = transaction_id and t.user_id = auth.uid())
    and exists (select 1 from public.categories  c where c.id = category_id  and c.user_id = auth.uid())
  );
create policy "delete_own_splits" on public.transaction_splits
  for delete using (
    exists (select 1 from public.transactions t where t.id = transaction_id and t.user_id = auth.uid())
  );

create policy "select_own_user_settings" on public.user_settings
  for select using (user_id = auth.uid());
create policy "upsert_own_user_settings" on public.user_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "select_own_sync_state" on public.sync_state
  for select using (user_id = auth.uid());
create policy "upsert_own_sync_state" on public.sync_state
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- === 初期カテゴリINSERT用の関数（任意、呼ぶと5分類を挿入） ===
create or replace function public.seed_default_categories()
returns void
language plpgsql
security definer
as $$
begin
  insert into public.categories (user_id, name, color, is_builtin, sort_order)
  values
    (auth.uid(), '乃木坂', '#742581', true, 1),
    (auth.uid(), '櫻坂', '#f144b6', true, 2),
    (auth.uid(), '日向坂', '#54d6de', true, 3),
    (auth.uid(), 'スポーツ', '#E17055', true, 4),
    (auth.uid(), 'その他', '#B2BEC3', true, 5)
  on conflict (user_id, name) do nothing;
end $$;

-- ビューのRLS（必要に応じて）
-- v_transaction_splits は transactions 経由で制限されるため、明示的ポリシーは不要
