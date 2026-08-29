import Link from "next/link";

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="eyebrow">Software buying, reversed</div>
        <h1>Make software vendors <em>compete for you.</em></h1>
        <p>Tell us what you use and what you pay. Competitors send their best offers privately. You choose who earns the conversation.</p>
        <div className="hero-actions">
          <Link href="/login" className="button button-primary">Start a Duel <span>→</span></Link>
          <Link href="/login?role=vendor" className="button button-secondary">Find Duels</Link>
        </div>
        <div className="trust-row"><span>Business buyers only</span><span>No reverse auction</span><span>No selection, no charge</span></div>
      </section>
      <section className="split-section">
        <article className="persona-card buyer-card"><span className="card-index">01 / BUYERS</span><h2>Your spend is leverage.</h2><p>Share your current software, spend, and requirements once. Receive structured, comparable offers without sales spam.</p><Link href="/login">Create buyer workspace →</Link></article>
        <article className="persona-card vendor-card"><span className="card-index">02 / VENDORS</span><h2>Compete where intent is real.</h2><p>Browse verified businesses already paying for your competitors. Submit free. Pay only when a buyer picks you.</p><Link href="/login?role=vendor">Create vendor workspace →</Link></article>
      </section>
    </>
  );
}
