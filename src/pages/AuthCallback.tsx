import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LoadingScreen } from "../components/LoadingScreen";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

function clearAuthParams() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  window.history.replaceState(window.history.state, "", url.toString());
}

function parseParams(raw: string) {
  if (!raw) return new URLSearchParams();
  const normalized = raw.startsWith("#") ? raw.slice(1) : raw.startsWith("?") ? raw.slice(1) : raw;
  return new URLSearchParams(normalized);
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoading, session } = useAuth();

  useEffect(() => {
    let isActive = true;

    async function handleCallback() {
      if (session) {
        clearAuthParams();
        if (isActive) {
          navigate("/", { replace: true });
        }
        return;
      }

      const searchParams = parseParams(location.search);
      const hashParams = parseParams(location.hash);
      const errorDescription =
        searchParams.get("error_description") ?? hashParams.get("error_description");

      if (errorDescription) {
        clearAuthParams();
        if (isActive) {
          navigate("/login", {
            replace: true,
            state: { authError: errorDescription },
          });
        }
        return;
      }

      try {
        if (searchParams.get("code")) {
          const code = searchParams.get("code");
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) throw error;
          }
        } else {
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");

          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) throw error;
          }
        }

        clearAuthParams();
        if (isActive) {
          navigate("/", { replace: true });
        }
      } catch (error) {
        console.error("Failed to finalize Supabase sign-in", error);
        const message =
          error instanceof Error
            ? error.message
            : "サインイン処理で問題が発生しました。時間をおいて再試行してください。";
        clearAuthParams();
        if (isActive) {
          navigate("/login", { replace: true, state: { authError: message } });
        }
      }
    }

    if (!isLoading) {
      void handleCallback();
    }

    return () => {
      isActive = false;
    };
  }, [isLoading, location.hash, location.search, navigate, session]);

  return <LoadingScreen label="サインインを処理しています" />;
}