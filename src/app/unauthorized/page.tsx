import Link from "next/link";

export default function UnauthorizedPage() {
  return <section className="center-page"><div className="status-card"><div className="eyebrow">Access denied</div><h1>This room isn’t yours.</h1><p>Your session is valid, but your account does not have permission to access this workspace.</p><Link className="button button-primary" href="/onboarding">Return to your workspaces</Link></div></section>;
}
