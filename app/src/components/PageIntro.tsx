// The top of every page: what it is, and what it gives you. Two short lines, no more.
import type { ReactNode } from "react";

/** `width` and `pad` match the page's own <main> so the edges line up; `center` for single-column pages. */
export function PageIntro({ title, what, why, children, width = 1180, pad = 24, center = false }: { title: string; what: ReactNode; why: ReactNode; children?: ReactNode; width?: number; pad?: number; center?: boolean }) {
  return (
    <div style={{ maxWidth: `${width}px`, margin: "0 auto", padding: `24px ${pad}px 0`, display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "12px 24px", textAlign: center ? "center" : undefined, justifyContent: center ? "center" : undefined }}>
      <div style={{ flex: center ? "0 1 640px" : "1 1 420px", minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 600, color: "#131313" }}>{title}</h1>
        <p style={{ margin: "6px 0 0", fontSize: "16px", color: "#131313" }}>{what}</p>
        <p style={{ margin: "2px 0 0", fontSize: "14px", color: "#7D7D7D" }}>{why}</p>
      </div>
      {children}
    </div>
  );
}
