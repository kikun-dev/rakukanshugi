import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useAppBootstrap } from "../lib/hooks/useAppBootstrap";
import { LoadingScreen } from "./LoadingScreen";

const navItems = [
  { to: "/", label: "ホーム" },
  { to: "/transactions", label: "履歴" },
  { to: "/reports", label: "レポート" },
  { to: "/settings", label: "設定" },
];

function formatSyncTime(iso?: string) {
  if (!iso) return "";
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch (error) {
    console.warn("Failed to format sync time", error);
    return "";
  }
}

export function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const {
    isBootstrapping,
    didBootstrap,
    bootstrapError,
    retryBootstrap,
    isSyncing,
    syncError,
    lastSyncedAt,
    triggerSync,
  } = useAppBootstrap(user?.id);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateOnlineStatus = () => {
      setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    };

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    setSignOutError(null);
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (err) {
      console.error(err);
      setSignOutError(err instanceof Error ? err.message : "サインアウトに失敗しました");
    }
  }, [signOut, navigate]);

  const alerts = useMemo(() => {
    return [signOutError, syncError].filter(Boolean) as string[];
  }, [signOutError, syncError]);

  const statusLabel = useMemo(() => {
    if (isSyncing) return "同期中…";
    const formatted = formatSyncTime(lastSyncedAt);
    if (formatted) {
      return `最終同期 ${formatted}`;
    }
    return "同期待ち";
  }, [isSyncing, lastSyncedAt]);

  if (isBootstrapping && !didBootstrap) {
    return <LoadingScreen label="データを準備しています" />;
  }

  if (bootstrapError && !didBootstrap) {
    return (
      <div className="app-bootstrap-error">
        <div className="app-bootstrap-error__card" role="alert">
          <h1 className="app-bootstrap-error__title">データを読み込めませんでした</h1>
          <p className="app-bootstrap-error__message">{bootstrapError}</p>
          <button
            type="button"
            className="app-bootstrap-error__retry"
            onClick={retryBootstrap}
            disabled={isBootstrapping}
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <div className="app-shell__brand">
          <span className="app-shell__title">楽勘主義</span>
          <nav className="app-shell__nav" aria-label="メイン">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `app-shell__nav-link${isActive ? " app-shell__nav-link--active" : ""}`
                }
                end={item.to === "/"}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="app-shell__actions">
          <div className="app-shell__status" role="status" aria-live="polite">
            {!isOnline ? (
              <span className="app-shell__status-badge app-shell__status-badge--offline">オフライン</span>
            ) : null}
            <span>{statusLabel}</span>
          </div>
          <button
            type="button"
            className="app-shell__sync-button"
            onClick={() => void triggerSync()}
            disabled={isSyncing || !isOnline}
          >
            {isSyncing ? "同期中…" : "再同期"}
          </button>
          {user?.email ? <span className="app-shell__user">{user.email}</span> : null}
          <button type="button" className="app-shell__signout" onClick={handleSignOut}>
            サインアウト
          </button>
        </div>
      </header>
      {alerts.map((message, index) => (
        <p key={index} role="alert" className="app-shell__error">
          {message}
        </p>
      ))}
      <main className="app-shell__main">
        <Outlet />
      </main>
    </div>
  );
}

