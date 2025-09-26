import type { CSSProperties } from "react";

const containerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "100vh",
  padding: "1.5rem",
};

export function LoadingScreen({ label = "Loading" }: { label?: string }) {
  return (
    <div style={containerStyle} role="status" aria-live="polite">
      <span>{label}…</span>
    </div>
  );
}
