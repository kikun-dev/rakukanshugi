import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { session, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ type: "idle" | "sending" | "sent" | "error"; message?: string }>({
    type: "idle",
  });

  const from = (location.state as { from?: Location } | undefined)?.from?.pathname ?? "/";
  const authError = (location.state as { authError?: string } | undefined)?.authError;

  useEffect(() => {
    if (!authError) return;
    setStatus({ type: "error", message: authError });
    navigate(location.pathname, { replace: true });
  }, [authError, navigate, location.pathname]);

  if (!isLoading && session) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ type: "sending" });
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
      setStatus({ type: "sent" });
    } catch (error) {
      console.error(error);
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "リンク送信に失敗しました",
      });
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>楽勘主義 ログイン</h1>
        <p className="login-card__hint">許可されたメールアドレスにマジックリンクを送信します。</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-form__label">
            メールアドレス
            <input
              className="login-form__input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </label>
          <button type="submit" disabled={status.type === "sending"}>{status.type === "sending" ? "送信中…" : "マジックリンクを送信"}</button>
        </form>
        {status.type === "sent" ? (
          <p className="login-card__success" role="status">
            メールのリンクを確認してください。
          </p>
        ) : null}
        {status.type === "error" ? (
          <p className="login-card__error" role="alert">
            {status.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
