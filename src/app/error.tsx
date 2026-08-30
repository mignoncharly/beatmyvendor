"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    try {
      fetch("/api/observability/client-error", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: error.message, digest: error.digest, path: window.location.pathname }), keepalive: true }).catch(() => {});
    } catch { /* best-effort */ }
  }, [error]);

  return (
    <section className="center-page" aria-labelledby="error-title">
      <div className="status-card" role="alert">
        <span className="eyebrow">Something went wrong</span>
        <h1 id="error-title">That didn’t land.</h1>
        <p>Your data is still safe. Try the request again; if the problem continues, contact BeatMyVendor support.</p>
        {error.digest && <p className="error-reference">Reference: {error.digest}</p>}
        <div className="error-actions">
          <button className="button button-primary" type="button" onClick={retry}>Try again</button>
          <Link className="button button-secondary" href="/">Return home</Link>
        </div>
      </div>
    </section>
  );
}
