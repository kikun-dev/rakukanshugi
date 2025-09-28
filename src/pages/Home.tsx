import { useEffect, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { useAuth } from "../lib/auth";
import { createTransaction, listAccounts, type Account } from "../lib/api";

type SubmitState = "idle" | "submitting";

type StatusMessage = { type: "success" | "error"; message: string } | null;

function formatToday() {
  return format(new Date(), "yyyy-MM-dd");
}

export default function Home() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(formatToday);
  const [accountId, setAccountId] = useState("");
  const [memo, setMemo] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [status, setStatus] = useState<StatusMessage>(null);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    setLoadError(null);

    listAccounts()
      .then((items) => {
        setAccounts(items);
        if (items.length > 0) {
          setAccountId((prev) => (prev ? prev : items[0].id));
        }
      })
      .catch((error) => {
        console.error("Failed to load accounts", error);
        setLoadError(error instanceof Error ? error.message : "支払アカウントの取得に失敗しました");
      })
      .finally(() => setIsLoading(false));
  }, [user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || submitState === "submitting") return;

    if (!amount || Number.parseInt(amount, 10) <= 0) {
      setStatus({ type: "error", message: "金額は1円以上の整数で入力してください" });
      return;
    }
    if (!accountId) {
      setStatus({ type: "error", message: "支払アカウントを選択してください" });
      return;
    }

    setSubmitState("submitting");
    setStatus(null);

    try {
      await createTransaction({
        accountId,
        amount: Number.parseInt(amount, 10),
        occurredAt,
        memo: memo.trim() || undefined,
      });

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

  return (
    <div className="home-page">
      <section className="home-card" aria-labelledby="quick-entry-heading">
        <div>
          <h1 id="quick-entry-heading">支出を記録する</h1>
          <p>金額・日付・メモを入力し保存します。送信結果はポップアップでお知らせします。</p>
        </div>

        <form className="home-form" onSubmit={handleSubmit}>
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
            <label htmlFor="account">支払アカウント</label>
            <select
              id="account"
              name="accountId"
              required
              value={accountId}
              onChange={(event) => setAccountId(event.currentTarget.value)}
              disabled={isLoading || accounts.length === 0}
            >
              {accounts.length === 0 ? <option value="">アカウントがありません</option> : null}
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            {loadError ? <p className="home-hint">{loadError}</p> : null}
          </div>

          <div className="home-field">
            <label htmlFor="memo">メモ (任意)</label>
            <textarea
              id="memo"
              name="memo"
              rows={3}
              value={memo}
              onChange={(event) => setMemo(event.currentTarget.value)}
            />
          </div>

          <div className="home-actions">
            <button type="submit" disabled={submitState === "submitting" || !user}>
              {submitState === "submitting" ? "送信中..." : "保存"}
            </button>
            <span className="home-hint">保存すると Supabase に記録されます</span>
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
