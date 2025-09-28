import { useEffect, useMemo, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { useAuth } from "../lib/auth";
import {
  createTransaction,
  listAccounts,
  listCategories,
  type Account,
  type Category,
} from "../lib/api";

type SubmitState = "idle" | "submitting";

type StatusMessage = { type: "success" | "error"; message: string } | null;

type SelectOption = { value: string; label: string };

function formatToday() {
  return format(new Date(), "yyyy-MM-dd");
}

export default function Home() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(formatToday);
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [memo, setMemo] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [status, setStatus] = useState<StatusMessage>(null);

  useEffect(() => {
    if (!user) return;

    let active = true;
    async function loadOptions() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [accountRows, categoryRows] = await Promise.all([listAccounts(), listCategories()]);
        if (!active) return;

        const activeAccounts = accountRows.filter((account) => account.is_active !== false);
        const activeCategories = categoryRows.filter((category) => category.is_active !== false);

        setAccounts(activeAccounts);
        setCategories(activeCategories);

        if (activeAccounts.length > 0) {
          setAccountId((prev) => (prev ? prev : activeAccounts[0].id));
        }
        if (activeCategories.length > 0) {
          setCategoryId((prev) => (prev ? prev : activeCategories[0].id));
        }
      } catch (error) {
        console.error("Failed to load accounts or categories", error);
        if (active) {
          setLoadError(error instanceof Error ? error.message : "データの取得に失敗しました");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadOptions();
    return () => {
      active = false;
    };
  }, [user]);

  const accountOptions = useMemo<SelectOption[]>(
    () => accounts.map((account) => ({ value: account.id, label: account.name })),
    [accounts]
  );

  const categoryOptions = useMemo<SelectOption[]>(
    () => categories.map((category) => ({ value: category.id, label: category.name })),
    [categories]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || submitState === "submitting") return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setStatus({ type: "error", message: "タイトルを入力してください" });
      return;
    }

    if (!amount || Number.parseInt(amount, 10) <= 0) {
      setStatus({ type: "error", message: "金額は1円以上の整数で入力してください" });
      return;
    }

    if (!accountId) {
      setStatus({ type: "error", message: "支払い方法を選択してください" });
      return;
    }

    if (!categoryId) {
      setStatus({ type: "error", message: "分類を選択してください" });
      return;
    }

    setSubmitState("submitting");
    setStatus(null);

    try {
      await createTransaction({
        accountId,
        amount: Number.parseInt(amount, 10),
        title: trimmedTitle,
        occurredAt,
        memo: memo.trim() || undefined,
        categoryIds: [categoryId],
      });

      setTitle("");
      setAmount("");
      setMemo("");
      setStatus({ type: "success", message: "保存しました" });
      window.alert("保存しました");
    } catch (error) {
      console.error("Failed to save transaction", error);
      const message = error instanceof Error ? error.message : "保存に失敗しました";
      setStatus({ type: "error", message });
      window.alert(`保存に失敗しました: ${message}`);
    } finally {
      setSubmitState("idle");
    }
  }

  const isFormDisabled =
    !user || submitState === "submitting" || isLoading || accountOptions.length === 0 || categoryOptions.length === 0;

  return (
    <div className="home-page">
      <section className="home-card" aria-labelledby="quick-entry-heading">
        <div>
          <h1 id="quick-entry-heading">支出を記録する</h1>
          <p>タイトルと必要項目を入力し、保存すると Supabase に記録されます。</p>
        </div>

        <form className="home-form" onSubmit={handleSubmit}>
          <div className="home-field">
            <label htmlFor="title">タイトル</label>
            <input
              id="title"
              name="title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              required
            />
          </div>

          <div className="home-field">
            <label htmlFor="amount">金額 (円)</label>
            <input
              id="amount"
              name="amount"
              type="number"
              inputMode="numeric"
              min={1}
              required
              value={amount}
              onChange={(event) => setAmount(event.currentTarget.value.replace(/[^0-9]/g, ""))}
            />
          </div>

          <div className="home-field">
            <label htmlFor="account">支払い方法</label>
            <select
              id="account"
              name="accountId"
              required
              value={accountId}
              onChange={(event) => setAccountId(event.currentTarget.value)}
              disabled={isLoading || accountOptions.length === 0}
            >
              {accountOptions.length === 0 ? <option value="">支払い方法が設定されていません</option> : null}
              {accountOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="home-field">
            <label htmlFor="occurred-at">日付</label>
            <input
              id="occurred-at"
              name="occurredAt"
              type="date"
              required
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.currentTarget.value)}
            />
          </div>

          <div className="home-field">
            <label htmlFor="category">分類</label>
            <select
              id="category"
              name="categoryId"
              required
              value={categoryId}
              onChange={(event) => setCategoryId(event.currentTarget.value)}
              disabled={isLoading || categoryOptions.length === 0}
            >
              {categoryOptions.length === 0 ? <option value="">分類が設定されていません</option> : null}
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="home-field">
            <label htmlFor="memo">メモ (任意)</label>
            <textarea
              id="memo"
              name="memo"
              rows={3}
              value={memo}
              onChange={(event) => setMemo(event.currentTarget.value)}
              placeholder="詳細や備考があれば入力してください"
            />
          </div>

          {loadError ? <p className="home-hint">{loadError}</p> : null}

          <div className="home-actions">
            <button type="submit" disabled={isFormDisabled}>
              {submitState === "submitting" ? "送信中..." : "保存"}
            </button>
            <span className="home-hint">メモ以外の項目は必須です</span>
          </div>

          {status ? (
            <p
              className={`home-status home-status--${status.type}`}
              role={status.type === "error" ? "alert" : "status"}
            >
              {status.message}
            </p>
          ) : null}
        </form>
      </section>
    </div>
  );
}
