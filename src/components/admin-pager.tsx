import Link from "next/link";

// Server-side page/range helper so admin lists stop relying on the implicit
// 1,000-row cap and fetch one bounded page at a time.
export function pageRange(pageParam: string | undefined, size: number) {
  const page = Math.max(1, Number(pageParam) || 1);
  return { page, from: (page - 1) * size, to: page * size - 1, size };
}

export function AdminPager({ basePath, page, hasNext }: { basePath: string; page: number; hasNext: boolean }) {
  if (page <= 1 && !hasNext) return null;
  return (
    <div className="pagination-bar">
      {page > 1 ? <Link className="button button-secondary" href={`${basePath}?page=${page - 1}`}>← Previous</Link> : <span />}
      <span>Page {page}</span>
      {hasNext ? <Link className="button button-primary" href={`${basePath}?page=${page + 1}`}>Next →</Link> : <span />}
    </div>
  );
}
