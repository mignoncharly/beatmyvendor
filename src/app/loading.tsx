export default function Loading() {
  return (
    <div className="route-loading" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading page</span>
      <div aria-hidden="true">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line" />
      </div>
    </div>
  );
}
