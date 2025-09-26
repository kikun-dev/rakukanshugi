import { useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { TransactionWithSplits as StoredTransaction } from "../lib/db";
import { useAccountStore, useCategoryStore, useTransactionStore } from "../lib/store";

type StatusFilter = "all" | "pending" | "synced";

type FilterState = {
  search: string;
  accountId: string;
  categoryId: string;
  status: StatusFilter;
  startDate: string;
  endDate: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  accountId: "",
  categoryId: "",
  status: "all",
  startDate: "",
  endDate: "",
};

export default function Transactions() {
  const accounts = useAccountStore((state) => state.items);
  const categories = useCategoryStore((state) => state.items);
  const transactions = useTransactionStore((state) => state.items);
  const isLoading = useTransactionStore((state) => state.isLoading);
  const error = useTransactionStore((state) => state.error);

  const [filters, setFilters] = useState<FilterState>(() => ({ ...DEFAULT_FILTERS }));

  const accountNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of accounts) {
      map.set(account.id, account.name);
    }
    return map;
  }, [accounts]);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categories) {
      map.set(category.id, category.name);
    }
    return map;
  }, [categories]);

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }),
    []
  );

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    []
  );

  const hasActiveFilters = useMemo(() => {
    return (
      filters.search.trim() !== "" ||
      filters.accountId !== "" ||
      filters.categoryId !== "" ||
      filters.startDate !== "" ||
      filters.endDate !== "" ||
      filters.status !== "all"
    );
  }, [filters]);

  const filteredTransactions = useMemo<StoredTransaction[]>(() => {
    const searchTerm = filters.search.trim().toLowerCase();

    return transactions.filter((transaction) => {
      if (filters.accountId && transaction.accountId !== filters.accountId) {
        return false;
      }

      if (filters.status === "pending" && !transaction.pendingSync) {
        return false;
      }

      if (filters.status === "synced" && transaction.pendingSync) {
        return false;
      }

      if (filters.startDate && transaction.occurredAt < filters.startDate) {
        return false;
      }

      if (filters.endDate && transaction.occurredAt > filters.endDate) {
        return false;
      }

      if (filters.categoryId) {
        const hasCategory = transaction.splits.some((split) => split.categoryId === filters.categoryId);
        if (!hasCategory) {
          return false;
        }
      }

      if (searchTerm) {
        const memoText = transaction.memo?.toLowerCase() ?? "";
        const accountName = accountNameById.get(transaction.accountId)?.toLowerCase() ?? "";
        const categoryNames = transaction.splits
          .map((split) => categoryNameById.get(split.categoryId)?.toLowerCase() ?? "")
          .join(" ");
        const amountText = transaction.amount.toString();
        const haystack = `${memoText} ${accountName} ${categoryNames} ${amountText}`;
        if (!haystack.includes(searchTerm)) {
          return false;
        }
      }

      return true;
    });
  }, [transactions, filters, accountNameById, categoryNameById]);

  const limitedTransactions = useMemo<StoredTransaction[]>(() => filteredTransactions.slice(0, 200), [filteredTransactions]);

  const totalAmount = useMemo(
    () => filteredTransactions.reduce((sum, transaction) => sum + transaction.amount, 0),
    [filteredTransactions]
  );

  const pendingCount = useMemo(
    () => filteredTransactions.reduce((count, transaction) => count + (transaction.pendingSync ? 1 : 0), 0),
    [filteredTransactions]
  );

  function handleFilterChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.currentTarget;
    setFilters((prev) => ({ ...prev, [name]: value }));
  }

  function handleFiltersReset() {
    setFilters(() => ({ ...DEFAULT_FILTERS }));
  }

  function handleFiltersSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <div className="transactions">
      <header className="transactions__header">
        <h1>取引一覧</h1>
        <p>ローカルに保存された取引を表示します。必要に応じて検索・フィルタを行ってください。</p>
      </header>

      <section className="transactions__summary">
        <div className="transactions__summary-card" role="status" aria-live="polite">
          <span className="transactions__summary-label">表示件数</span>
          <strong className="transactions__summary-value">{filteredTransactions.length}</strong>
        </div>
        <div className="transactions__summary-card">
          <span className="transactions__summary-label">合計金額</span>
          <strong className="transactions__summary-value">{currencyFormatter.format(totalAmount)}</strong>
        </div>
        <div className="transactions__summary-card">
          <span className="transactions__summary-label">未同期</span>
          <strong className="transactions__summary-value">{pendingCount}</strong>
        </div>
      </section>

      <form className="transactions__filters" onSubmit={handleFiltersSubmit}>
        <div className="transactions__filters-row">
          <label className="transactions__filters-group">
            <span className="transactions__filters-label">キーワード</span>
            <input
              type="search"
              name="search"
              className="home__input"
              placeholder="メモ / カテゴリ / 金額"
              value={filters.search}
              onChange={handleFilterChange}
            />
          </label>
          <label className="transactions__filters-group">
            <span className="transactions__filters-label">支払アカウント</span>
            <select name="accountId" className="home__input" value={filters.accountId} onChange={handleFilterChange}>
              <option value="">すべて</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label className="transactions__filters-group">
            <span className="transactions__filters-label">カテゴリ</span>
            <select name="categoryId" className="home__input" value={filters.categoryId} onChange={handleFilterChange}>
              <option value="">すべて</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="transactions__filters-row">
          <label className="transactions__filters-group">
            <span className="transactions__filters-label">開始日</span>
            <input
              type="date"
              name="startDate"
              className="home__input"
              value={filters.startDate}
              onChange={handleFilterChange}
            />
          </label>
          <label className="transactions__filters-group">
            <span className="transactions__filters-label">終了日</span>
            <input
              type="date"
              name="endDate"
              className="home__input"
              value={filters.endDate}
              onChange={handleFilterChange}
            />
          </label>
          <label className="transactions__filters-group">
            <span className="transactions__filters-label">同期状態</span>
            <select name="status" className="home__input" value={filters.status} onChange={handleFilterChange}>
              <option value="all">すべて</option>
              <option value="pending">未同期のみ</option>
              <option value="synced">同期済のみ</option>
            </select>
          </label>
          <div className="transactions__filters-actions">
            <button type="submit" className="transactions__filters-apply">
              適用
            </button>
            <button type="button" className="transactions__filters-reset" onClick={handleFiltersReset} disabled={!hasActiveFilters}>
              クリア
            </button>
          </div>
        </div>
      </form>

      {error ? (
        <p className="transactions__error" role="alert">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <p className="transactions__loading" role="status" aria-live="polite">
          読み込み中…
        </p>
      ) : null}

      {!isLoading && limitedTransactions.length === 0 ? (
        <p className="transactions__empty">
          {hasActiveFilters ? "条件に一致する取引が見つかりませんでした" : "まだ取引がありません。ホーム画面から入力してください。"}
        </p>
      ) : null}

      {limitedTransactions.length > 0 ? (
        <section className="transactions__list" aria-label="取引結果">
          <div className="transactions__table-container">
            <table className="transactions__table">
              <thead>
                <tr>
                  <th scope="col">日付</th>
                  <th scope="col">金額</th>
                  <th scope="col">支払</th>
                  <th scope="col">カテゴリ</th>
                  <th scope="col">メモ</th>
                  <th scope="col">状態</th>
                </tr>
              </thead>
              <tbody>
                {limitedTransactions.map((transaction) => {
                  const categoriesLabel = transaction.splits.length
                    ? transaction.splits
                        .map((split) => categoryNameById.get(split.categoryId) ?? "カテゴリ不明")
                        .join("、")
                    : "未分類";
                  const accountName = accountNameById.get(transaction.accountId) ?? "支払不明";
                  return (
                    <tr key={transaction.id}>
                      <td data-title="日付">{dateFormatter.format(new Date(transaction.occurredAt))}</td>
                      <td data-title="金額" className="transactions__cell--amount">
                        {currencyFormatter.format(transaction.amount)}
                      </td>
                      <td data-title="支払">{accountName}</td>
                      <td data-title="カテゴリ">
                        <span className="transactions__categories" title={categoriesLabel}>
                          {categoriesLabel}
                        </span>
                      </td>
                      <td data-title="メモ" className="transactions__cell--memo">
                        {transaction.memo ? transaction.memo : <span className="transactions__memo-placeholder">—</span>}
                      </td>
                      <td data-title="状態">
                        {transaction.pendingSync ? (
                          <span className="transactions__badge transactions__badge--pending" role="status">
                            未同期
                          </span>
                        ) : (
                          <span className="transactions__badge transactions__badge--synced">同期済</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredTransactions.length > limitedTransactions.length ? (
            <p className="transactions__note" role="note">
              {limitedTransactions.length}件まで表示しています（全{filteredTransactions.length}件）。フィルタで絞り込んでください。
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
