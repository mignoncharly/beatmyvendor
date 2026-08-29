"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f2f0e9", color: "#171713", fontFamily: "Arial, Helvetica, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <section role="alert" aria-labelledby="global-error-title" style={{ width: "min(600px, 100%)", boxSizing: "border-box", padding: "clamp(40px, 7vw, 80px)", border: "1px solid #171713", background: "#fffdf7", boxShadow: "10px 10px 0 #d9ff43" }}>
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase" }}>VendorDuel recovery</p>
            <h1 id="global-error-title" style={{ margin: "22px 0", fontSize: "clamp(42px, 8vw, 72px)", lineHeight: .95, letterSpacing: "-.06em" }}>We hit a hard stop.</h1>
            <p style={{ color: "#5b5a52", lineHeight: 1.6 }}>Your request was not completed. Retry safely, or return to the homepage if the problem continues.</p>
            {error.digest && <p style={{ color: "#5b5a52", fontSize: 12 }}>Reference: {error.digest}</p>}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
              <button type="button" onClick={retry} style={{ minHeight: 48, padding: "0 22px", border: "1px solid #171713", background: "#171713", color: "#fffdf7", font: "inherit", fontWeight: 800, cursor: "pointer" }}>Try again</button>
              <Link href="/" style={{ minHeight: 46, display: "inline-flex", alignItems: "center", padding: "0 22px", border: "1px solid #171713", color: "#171713", fontWeight: 800, textDecoration: "none" }}>Return home</Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
