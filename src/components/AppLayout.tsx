import { useCallback, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

const navItems = [
  { to: "/", label: "入力" },
];

export function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = useCallback(async () => {
    setError(null);
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "サインアウトに失敗しました");
    }
  }, [signOut, navigate]);

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
          {user?.email ? <span className="app-shell__user">{user.email}</span> : null}
          <button type="button" className="app-shell__signout" onClick={handleSignOut}>
            サインアウト
          </button>
        </div>
      </header>
      {error ? (
        <p role="alert" className="app-shell__error">
          {error}
        </p>
      ) : null}
      <main className="app-shell__main">
        <Outlet />
      </main>
    </div>
  );
}
