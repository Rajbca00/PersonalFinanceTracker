"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { IconChevronLeft, IconChevronRight } from "./Icons";

export function Pagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));

  if (total <= pageSize) return null;

  const go = (p: number) => {
    const next = new URLSearchParams(params.toString());
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    router.push(`?${next.toString()}`, { scroll: true });
  };

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav className="flex items-center justify-between gap-3 mt-4" aria-label="Pagination">
      <p className="text-xs tnum m-0" style={{ color: "var(--text-muted)" }}>
        {first.toLocaleString("en-IN")}–{last.toLocaleString("en-IN")} of{" "}
        {total.toLocaleString("en-IN")}
      </p>

      <div className="flex items-center gap-1.5">
        <button
          className="btn btn-sm"
          onClick={() => go(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <IconChevronLeft size={15} />
          <span className="hidden sm:inline">Previous</span>
        </button>
        <span className="text-xs tnum px-1.5" style={{ color: "var(--text-muted)" }}>
          {page} / {pages}
        </span>
        <button
          className="btn btn-sm"
          onClick={() => go(page + 1)}
          disabled={page >= pages}
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          <IconChevronRight size={15} />
        </button>
      </div>
    </nav>
  );
}
