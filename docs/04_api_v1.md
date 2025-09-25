# REST API設計（家計簿アプリ / v1）

外出先で即入力（PWA＋IndexedDB）→オンライン時にSupabase(PostgreSQL)へ同期する前提のREST設計。

## 共通仕様
- **Base URL**: `https://api.example.com/v1`
- **Auth**: `Authorization: Bearer <supabase_jwt>`
- **Headers**:
  - `Content-Type: application/json`
  - `Idempotency-Key: <uuid>`（POST時推奨）
  - `If-Unmodified-Since: <ISO8601>`（更新時推奨）
- **Pagination**: `?limit=50&cursor=<opaque>`（次のページは `next_cursor` を返却）
- **Sort**: `?sort=field.asc|desc`（例：`occurred_at.desc`）
- **Filter**: `?filter[key]=value`（例：`filter[occurred_at_from]=YYYY-MM-DD`）
- **型/表記ポリシー**: ID=UUID, 日付=`YYYY-MM-DD`, 日時=ISO8601, 金額=**整数（JPY）**
- **成功レスポンス（一覧）例**
```json
{
  "data": [ /* items */ ],
  "next_cursor": "opaque",
  "count": 50
}
```
- **共通エラーフォーマット**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力値が不正です",
    "details": "amount must be > 0",
    "field_errors": [
      { "field": "amount", "message": "must be greater than 0" }
    ],
    "request_id": "req_12345"
  }
}
```
- **代表ステータス**: `400, 401, 403, 404, 409, 422, 429, 500`

---

# リソース定義

## accounts（支払元）

### GET /v1/accounts
**認証**: 必要  
**説明**: 自分のアカウント一覧

**クエリ**: `limit`, `cursor`, `sort`, `filter[is_active]`

**例（curl）**
```bash
curl -H "Authorization: Bearer $TOKEN"   "https://api.example.com/v1/accounts?limit=50&sort=sort_order.asc"
```

**レスポンス（200）**
```json
{
  "data": [
    { "id": "uuid", "name": "楽天カード", "type": "credit", "is_active": true, "sort_order": 1, "created_at": "2025-09-10T12:00:00Z", "updated_at": "2025-09-10T12:00:00Z" }
  ],
  "next_cursor": null,
  "count": 1
}
```

### POST /v1/accounts
**認証**: 必要  
**説明**: アカウント作成

**リクエスト例**
```json
{ "name": "三井住友VISA", "type": "credit", "sort_order": 2 }
```

**レスポンス（201）**
```json
{ "id": "uuid", "name": "三井住友VISA", "type": "credit", "is_active": true, "sort_order": 2, "created_at": "...", "updated_at": "..." }
```

### PATCH /v1/accounts/{id}
**認証**: 必要  
**説明**: 部分更新（名称・is_active など）  
**推奨ヘッダ**: `If-Unmodified-Since`

### DELETE /v1/accounts/{id}
**認証**: 必要  
**説明**: 削除（関連取引がある場合は `409` か、`is_active=false` 運用）

---

## categories（目的カテゴリ）

### GET /v1/categories
**認証**: 必要  
**説明**: 自分のカテゴリ一覧（初期5＋ユーザー追加）

**クエリ**: `filter[is_active]`

**例（200）**
```json
{
  "data": [
    { "id": "uuid_nogi", "name": "乃木坂", "color": "#742581", "is_builtin": true, "is_active": true, "sort_order": 1 }
  ],
  "next_cursor": null,
  "count": 5
}
```

### POST /v1/categories
**認証**: 必要  
**説明**: カスタムカテゴリ追加（同名禁止）

**リクエスト例**
```json
{ "name": "現場", "color": "#8B98A1", "sort_order": 6 }
```

---

## transactions（取引）

### GET /v1/transactions
**認証**: 必要  
**説明**: 取引一覧（論理削除は既定で除外）

**クエリ**
- `limit`, `cursor`, `sort=occurred_at.desc`
- `filter[occurred_at_from]=YYYY-MM-DD`
- `filter[occurred_at_to]=YYYY-MM-DD`
- `filter[category_id]=<uuid>`（スプリット経由も含む）
- `filter[account_id]=<uuid>`
- `filter[q]=<string>`（memo全文検索）

**レスポンス（200）**
```json
{
  "data": [
    {
      "id": "uuid_tx",
      "account_id": "uuid_acc",
      "amount": 6000,
      "memo": "グッズ購入",
      "occurred_at": "2025-09-20",
      "updated_at": "2025-09-20T10:00:00Z",
      "splits": [
        { "category_id": "uuid_nogi", "ratio": 0.5, "amount": 3000 },
        { "category_id": "uuid_saku", "ratio": 0.5, "amount": 3000 }
      ]
    }
  ],
  "next_cursor": null,
  "count": 1
}
```

### GET /v1/transactions/{id}
**認証**: 必要  
**説明**: 単一取得（スプリット含む）

### POST /v1/transactions
**認証**: 必要  
**説明**: 取引作成（**均等按分**はサーバで自動計算可）

**リクエスト（均等按分）**
```json
{
  "account_id": "uuid_acc",
  "amount": 6000,
  "memo": "グッズ購入",
  "occurred_at": "2025-09-20",
  "categories": ["uuid_nogi", "uuid_saku"]
}
```

**リクエスト（将来：割合指定）**
```json
{
  "account_id": "uuid_acc",
  "amount": 10000,
  "memo": "現場交通費",
  "occurred_at": "2025-09-21",
  "splits": [
    { "category_id": "uuid_sports", "ratio": 0.6 },
    { "category_id": "uuid_others", "ratio": 0.4 }
  ]
}
```

**レスポンス（201）**
```json
{
  "id": "uuid_tx",
  "account_id": "uuid_acc",
  "amount": 6000,
  "memo": "グッズ購入",
  "occurred_at": "2025-09-20",
  "updated_at": "2025-09-20T10:00:00Z",
  "splits": [
    { "category_id": "uuid_nogi", "ratio": 0.5, "amount": 3000 },
    { "category_id": "uuid_saku", "ratio": 0.5, "amount": 3000 }
  ]
}
```
**端数処理**: `floor` 配分＋**最後のスプリットで調整**。

### PATCH /v1/transactions/{id}
**認証**: 必要  
**説明**: 部分更新（`If-Unmodified-Since` 推奨）

### DELETE /v1/transactions/{id}
**認証**: 必要  
**説明**: 論理削除（`is_deleted=true`）

---

## transaction_splits（参照用）

### GET /v1/transaction_splits
**認証**: 必要  
**説明**: スプリット一覧（デバッグ/分析用。通常は `/transactions` に含めて返却）

**クエリ**: `filter[transaction_id]`, `filter[category_id]`

---

## reports（集計）

### GET /v1/reports/monthly
**認証**: 必要  
**説明**: 年指定の月次レポート（カテゴリ別合計・割合）

**クエリ**: `year=2025`

**レスポンス（200）**
```json
{
  "year": 2025,
  "months": [
    {
      "month": 1,
      "total": 45000,
      "by_category": [
        { "category_id": "uuid_nogi", "total": 20000, "ratio": 0.4444 },
        { "category_id": "uuid_saku", "total": 15000, "ratio": 0.3333 },
        { "category_id": "uuid_hina", "total": 5000, "ratio": 0.1111 },
        { "category_id": "uuid_sports", "total": 3000, "ratio": 0.0667 },
        { "category_id": "uuid_others", "total": 2000, "ratio": 0.0444 }
      ]
    }
  ]
}
```

### GET /v1/reports/yearly
**認証**: 必要  
**説明**: 指定期間（`from`, `to`）の年次合計

**クエリ**: `from=2024-01-01&to=2025-12-31`

**レスポンス（200）**
```json
{
  "from": "2024-01-01",
  "to": "2025-12-31",
  "by_year": [
    { "year": 2024, "total": 520000, "by_category": [ /* ... */ ] },
    { "year": 2025, "total": 410000, "by_category": [ /* ... */ ] }
  ]
}
```

---

## 備考
- 既定ソート：`transactions` は `occurred_at.desc, created_at.desc`
- 取引の検索は memo の全文を対象（インデックスは将来検討）
- エクスポート/インポートはMVP対象外（将来 `/v1/export` を検討）
