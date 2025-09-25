# データベース設計（家計簿アプリ・複数ユーザー対応）

外出先で即入力（モバイル/PWA）＋PCで閲覧・分析。**オフラインファースト＋同期**を想定。  
バックエンド：Supabase(PostgreSQL)、フロント：IndexedDBは同スキーマでミラー。

### 方針
- 個人開発でも保守しやすい**最小テーブル**構成
- **複数ユーザー対応**（RLS前提）
- **均等按分**は `transaction_splits` で表現（将来割合拡張可能）

---

# データベース設計

## テーブル一覧
- **users**: ログインユーザー（メール等）
- **accounts**: 支払元（カード/口座/現金）
- **categories**: 目的カテゴリ（初期5分類＋将来ユーザー定義）
- **transactions**: 取引（支出）
- **transaction_splits**: 取引のカテゴリ按分（均等配分）
- **user_settings**: 表示や通貨などの設定（任意）
- **sync_state**: 同期カーソル等（任意）

## 主要テーブル DDL

### users
```sql
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text,
  created_at timestamptz not null default now()
);
```

### accounts
```sql
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,              -- 例: 楽天カード / 三井住友VISA
  type text not null,              -- 'credit' | 'debit' | 'cash' | 'other'
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_accounts_user on accounts(user_id);
```

### categories
```sql
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,              -- 例: 乃木坂 / 櫻坂 / 日向坂 / スポーツ / その他
  color text,                      -- UI用（#RRGGBB）
  is_builtin boolean not null default false, -- 初期5分類フラグ
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);
create index if not exists idx_categories_user on categories(user_id);
```

### transactions
```sql
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete restrict,
  amount integer not null check (amount > 0), -- 円（整数）
  memo text,
  occurred_at date not null,        -- 発生日
  is_deleted boolean not null default false,  -- 論理削除（同期のため）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_transactions_user_date on transactions(user_id, occurred_at desc);
create index if not exists idx_transactions_account on transactions(account_id);
create index if not exists idx_transactions_updated on transactions(user_id, updated_at);
```

### transaction_splits（均等按分）
```sql
create table if not exists transaction_splits (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  category_id uuid not null references categories(id) on delete restrict,
  ratio numeric(5,4) not null default 1.0, -- MVPは均等配分。将来0.0〜1.0で割合指定
  amount integer generated always as (floor((ratio * (
    select t.amount from transactions t where t.id = transaction_id
  )))) stored, -- オプション: 自動金額（端数調整はUI側でもOK）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(transaction_id, category_id)
);
create index if not exists idx_splits_tx on transaction_splits(transaction_id);
create index if not exists idx_splits_cat on transaction_splits(category_id);
```

### user_settings（任意）
```sql
create table if not exists user_settings (
  user_id uuid primary key references users(id) on delete cascade,
  currency text not null default 'JPY',
  decimals smallint not null default 0,
  theme text default 'system',     -- 'light' | 'dark' | 'system'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### sync_state（任意）
```sql
create table if not exists sync_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  entity text not null,            -- 'transactions' | 'categories' など
  last_synced_at timestamptz,      -- サーバ観点のカーソル
  updated_at timestamptz not null default now(),
  unique(user_id, entity)
);
```

## リレーション
- accounts.user_id → users.id（1:N）
- categories.user_id → users.id（1:N）
- transactions.user_id → users.id（1:N）
- transactions.account_id → accounts.id（N:1）
- transaction_splits.transaction_id → transactions.id（N:1）
- transaction_splits.category_id → categories.id（N:1）
- user_settings.user_id → users.id（1:1）

## インデックス/制約（推奨）
- transactions(user_id, occurred_at desc) — 期間集計
- transactions(user_id, updated_at) — 差分同期
- categories unique(user_id, name) — 重複名禁止
- transactions.amount > 0 — チェック制約
- 論理削除フラグ is_deleted — 同期や“消し戻し”対応

## シードデータ（初期カテゴリ例）
```sql
insert into categories (user_id, name, color, is_builtin, sort_order)
values
  (:user_id, '乃木坂', '#742581', true, 1),
  (:user_id, '櫻坂', '#f144b6', true, 2),
  (:user_id, '日向坂', '#54d6de', true, 3),
  (:user_id, 'スポーツ', '#E17055', true, 4),
  (:user_id, 'その他', '#B2BEC3', true, 5);
```
