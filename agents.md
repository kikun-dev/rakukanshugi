# Codexエージェント運用ルール

## 1. 役割と目標 `[docs/01_requirements.md]`
- プロダクト名は「楽勘主義」。推し活支出を月次/年次で可視化する個人向け家計簿を維持し、手動入力を通じて支出実感を保つ。
- ユーザーは単一想定だが最大数千人規模まで視野に入れる。複数カード/口座の支出を統合表示し、収入管理は対象外。
- MVPでは手動入力高速化、カテゴリ（推し別など）による均等按分、月次/年次サマリと可視化、検索フィルタ、マルチカード統合を死守し、外部API連携やエクスポートは将来拡張扱い。

## 2. 技術スタックと設計原則 `[docs/02_architecture.md]`
- フロントは React + Vite + PWA（Service Worker / Background Sync）+ Zustand + Recharts を前提とし、オフライン即時入力→オンライン自動同期を基本とする。
- ローカル永続は IndexedDB + Dexie、サーバは Supabase (PostgreSQL, Auth, PostgREST/Edge Functions)。秘匿鍵はクライアントに置かず、Cloudflare Pages 環境変数で管理。
- アーキテクチャはローカル書き込み優先、最新勝ちで整合性確保、UI/状態/データアクセスの層分離を崩さない。

## 3. データモデルと同期方針 `[docs/03_databese.md][docs/06_Non-functionalRequirements.md]`
- コアテーブルは `users`, `accounts`, `categories`, `transactions`, `transaction_splits`, `user_settings`, `sync_state`。`transactions` は金額整数JPY、論理削除 `is_deleted`。`transaction_splits` でカテゴリ按分（均等 or 比率）。
- クライアントも同スキーマを IndexedDB にミラー。UUID を事前採番し、`updated_at` を用いた最新勝ち戦略で同期。
- 書き込みはローカルに即保存→同期キュー→オンライン時POST。失敗時は指数バックオフで再試行し、キューは7日保持。`If-Unmodified-Since` と `Idempotency-Key` を活用して整合性を守る。

## 4. API利用ルール `[docs/04_api_v1.md]`
- Base URL は `/v1`。Supabase JWT を `Authorization: Bearer` で送る。JSON, ISO8601, 金額整数JPYが基本規約。
- `GET /accounts|categories|transactions` 等は絞り込み/ソート/カーソルページング対応。取引作成時はカテゴリ配列または比率配列を送信し、端数処理は最後のスプリットで調整。
- 更新系は `If-Unmodified-Since`、作成は `Idempotency-Key` を推奨。削除は論理削除（`is_deleted=true`）を徹底。

## 5. UX・非機能要件 `[docs/05_ScreenFlowDiagram.md][docs/06_Non-functionalRequirements.md]`
- 主要画面フロー（即入力→一覧→レポート）とショートカット (`N`, `Enter`, `/`) を尊重し、PWAでモバイル片手操作最適化＆PCで集計閲覧を両立。
- パフォーマンス目標: 初期表示 LCP < 2.5s, TTI < 1.5s, 主要操作 100ms、初回バンドル < 200KB gzip。リストは50件表示/200件で仮想化。60fpsスクロールを維持。
- アクセシビリティ: WCAG AA相当のコントラスト、フォーカスリング常時可視、フォームARIA整備、トーストはライブルージョンで通知。

## 6. セキュリティ・運用ポリシー `[docs/06_Non-functionalRequirements.md][docs/07_operation-Security.md]`
- 認証は Supabase Auth。許可メール（現状 `kikun_dev@gmail.com`）のみ招待制ログイン。全テーブルに RLS `user_id = auth.uid()` を適用。
- 通信は HTTPS。Supabase 側はマネージド暗号化。ローカル IndexedDB は平文保持なため、アプリPINロック（起動/復帰/無操作）と OS ロックを推奨。PINはBKDF2+ソルトでハッシュ保管し、連続誤入力時は短時間ロックアウト。
- サービスロールキーはサーバ限定。Cloudflare Pages の環境変数で `SUPABASE_URL` と `SUPABASE_ANON_KEY` を管理。キー漏洩時は即ローテーション。
- バックアップは月次手動エクスポート (SQL/CSV)。復旧はエクスポートからの限定インポート、または端末再ログインでサーバ正本を同期。IndexedDB破損時は再初期化→同期復旧。
- ログは基本ローカルのみ。重大エラー時に匿名化して Sentry を有効化可。障害時は影響範囲特定→該当セッション停止→バックアップ確認→再発防止メモ。

## 7. 開発プロセス・リリース管理 `[docs/07_operation-Security.md][docs/06_Non-functionalRequirements.md]`
- ブランチ運用は `main` / `dev`。SemVer でタグ付けし、Cloudflare Pages でPRプレビューを確認。
- `db/migrations` でスキーマ管理し、破壊的変更は避ける。リリース後は直前ビルドへ即ロールバック可能な状態を維持。
- 依存は月次で更新確認し、Dependabot / `npm audit` を活用。CIではビルド・Lint・最小テストを実行し、テストは入力保存・フィルタ・オフライン同期などの主要シナリオを網羅。

---
これらは Codex エージェントが提案・実装・レビューを行う際のベースラインとする。逸脱が必要な場合は根拠と対応策を明示したうえで合意を取る。
