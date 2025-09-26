import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { format } from "date-fns";
import { useAuth } from "../lib/auth";
import {
  useAccountStore,
  useCategoryStore,
  useTransactionStore,
} from "../lib/store";

type FormStatus =
  | { type: "idle" }
  | { type: "saving" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

function formatDateInput(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export default function Home() {
  const { user } = useAuth();
  const amountInputRef = useRef<HTMLInputElement>(null);
  const accounts = useAccountStore((state) => state.items.filter((account) => account.isActive));
  const accountsLoading = useAccountStore((state) => state.isLoading);
  const categoriesAll = useCategoryStore((state) => state.items);
  const categories = categoriesAll.filter((category) => category.isActive);
  const categoriesLoading = useCategoryStore((state) => state.isLoading);
  const transactions = useTransactionStore((state) => state.items);
  const addTransaction = useTransactionStore((state) => state.addTransaction);

  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => formatDateInput(new Date()));
  const [accountId, setAccountId] = useState<string>("");
  const [memo, setMemo] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [status, setStatus] = useState<FormStatus>({ type: "idle" });

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categoriesAll) {
      map.set(category.id, category.name);
    }
    return map;
  }, [categoriesAll]);

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }),
    []
  );

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric" }),
    []
  );

  useEffect(() => {
    if (!accountId && accounts.length > 0) {
      setAccountId(accounts[0].id);
    }
  }, [accountId, accounts]);

  useEffect(() => {
    if (status.type !== "success") return;
    const timer = window.setTimeout(() => {
      setStatus({ type: "idle" });
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const hasAccounts = accounts.length > 0;
  const isSaving = status.type === "saving";
  const amountValue = Number.parseInt(amount, 10);
  const isAmountValid = Number.isFinite(amountValue) && amountValue > 0;
  const canSubmit =
    !!user && hasAccounts && !!accountId && isAmountValid && !isSaving && !accountsLoading;

  const recentTransactions = useMemo(() => transactions.slice(0, 5), [transactions]);

  function resetStatus() {
    setStatus((prev) => {
      if (prev.type === "success" || prev.type === "error") {
        return { type: "idle" };
      }
      return prev;
    });
  }

  function handleCategoryToggle(categoryId: string) {
    setSelectedCategoryIds((prev) =>
      prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId]
    );
    resetStatus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !hasAccounts) return;

    if (!isAmountValid) {
      setStatus({ type: "error", message: "金額は1円以上の整数で入力してください" });
      return;
    }

    if (!accountId) {
      setStatus({ type: "error", message: "支払アカウントを選択してください" });
      return;
    }

    setStatus({ type: "saving" });
    try {
      await addTransaction({
        userId: user.id,
        accountId,
        amount: amountValue,
        occurredAt,
        memo: memo.trim() || undefined,
        categoryIds: selectedCategoryIds.length > 0 ? selectedCategoryIds : undefined,
      });

      setStatus({ type: "success", message: "保存しました (オフライン時は後で同期します)" });
      setAmount("");
      setMemo("");
      setSelectedCategoryIds([]);
      requestAnimationFrame(() => {
        amountInputRef.current?.focus();
      });
    } catch (error) {
      console.error("Failed to add transaction", error);
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "保存に失敗しました",
      });
    }
  }

  return (
    <div className="home">
      <section className="home__layout">
        <form className="home__form" onSubmit={handleSubmit}>
          <header className="home__header">
            <h1 className="home__title">即入力</h1>
            <p className="home__subtitle">金額とカテゴリを素早く記録します。N キーでこのフォームにフォーカスできます。</p>
          </header>

          <div className="home__field">
            <label className="home__label" htmlFor="amount">
              金額 (円)
            </label>
            <input
              id="amount"
              name="amount"
              type="number"
              inputMode="numeric"
              min={1}
              required
              ref={amountInputRef}
              className="home__input"
              value={amount}
              onChange={(event) => {
                setAmount(event.currentTarget.value.replace(/[^0-9]/g, ""));
                resetStatus();
              }}
            />
          </div>

          <div className="home__two-column">
            <div className="home__field">
              <label className="home__label" htmlFor="occurred-at">
                日付
              </label>
              <input
                id="occurred-at"
                name="occurredAt"
                type="date"
                required
                className="home__input"
                value={occurredAt}
                onChange={(event) => {
                  setOccurredAt(event.currentTarget.value);
                  resetStatus();
                }}
              />
            </div>
            <div className="home__field">
              <label className="home__label" htmlFor="account">
                支払アカウント
              </label>
              <select
                id="account"
                name="accountId"
                required
                className="home__input"
                value={accountId}
                onChange={(event) => {
                  setAccountId(event.currentTarget.value);
                  resetStatus();
                }}
                disabled={!hasAccounts}
              >
                {!hasAccounts ? <option value="">アカウントがありません</option> : null}
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
              {!hasAccounts && !accountsLoading ? (
                <p className="home__hint" role="note">
                  アカウントが未設定です。先に設定画面で登録してください。
                </p>
              ) : null}
            </div>
          </div>

          <div className="home__field">
            <label className="home__label" htmlFor="memo">
              メモ (任意)
            </label>
            <input
              id="memo"
              name="memo"
              type="text"
              className="home__input"
              value={memo}
              onChange={(event) => {
                setMemo(event.currentTarget.value);
                resetStatus();
              }}
            />
          </div>

          <fieldset className="home__field home__field--categories">
            <legend className="home__label">カテゴリ (複数選択可・均等按分)</legend>
            {categoriesLoading ? (
              <p className="home__hint">読み込み中…</p>
            ) : categories.length === 0 ? (
              <p className="home__hint">カテゴリがまだありません。デフォルトカテゴリを同期してください。</p>
            ) : (
              <div className="home__categories">
                {categories.map((category) => {
                  const checked = selectedCategoryIds.includes(category.id);
                  return (
                    <label key={category.id} className={`home__category${checked ? " home__category--selected" : ""}`}>
                      <input
                        type="checkbox"
                        value={category.id}
                        checked={checked}
                        onChange={() => handleCategoryToggle(category.id)}
                      />
                      <span>{category.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>

          <div className="home__actions">
            <button type="submit" className="home__submit" disabled={!canSubmit}>
              {isSaving ? "保存中…" : "保存"}
            </button>
            <span className="home__hint">Enter で保存できます</span>
          </div>

          {status.type === "success" ? (
            <p className="home__status home__status--success" role="status">
              {status.message}
            </p>
          ) : null}
          {status.type === "error" ? (
            <p className="home__status home__status--error" role="alert">
              {status.message}
            </p>
          ) : null}
        </form>

        <section className="home__recent" aria-label="最近の入力">
          <header className="home__recent-header">
            <h2>最近の取引</h2>
            <p className="home__recent-hint">最新5件を表示します。詳細は履歴タブへ。</p>
          </header>

          {recentTransactions.length === 0 ? (
            <p className="home__empty">まだ取引がありません。入力するとここに表示されます。</p>
          ) : (
            <ul className="home__recent-list">
              {recentTransactions.map((transaction) => (
                <li key={transaction.id} className="home__transaction">
                  <div className="home__transaction-meta">
                    <span className="home__transaction-date">
                      {dateFormatter.format(new Date(transaction.occurredAt))}
                    </span>
                    <span className="home__transaction-amount">
                      {currencyFormatter.format(transaction.amount)}
                    </span>
                    {transaction.pendingSync ? (
                      <span className="home__pending" role="status">
                        未同期
                      </span>
                    ) : null}
                  </div>
                  {transaction.memo ? <p className="home__transaction-memo">{transaction.memo}</p> : null}
                  {transaction.splits.length > 0 ? (
                    <ul className="home__transaction-categories">
                      {transaction.splits.map((split) => (
                        <li key={split.id}>{categoryNameById.get(split.categoryId) ?? "カテゴリ不明"}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </div>
  );
}




