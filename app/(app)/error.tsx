"use client";

import { useEffect } from "react";
import { IconAlert } from "@/components/Icons";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="card p-6 sm:p-8 max-w-lg mx-auto mt-8">
      <div
        className="flex items-center justify-center rounded-full mb-4"
        style={{ width: 40, height: 40, background: "var(--expense-bg)", color: "var(--expense)" }}
      >
        <IconAlert size={20} />
      </div>

      <h1 className="text-lg font-semibold mb-1">Something went wrong</h1>
      <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
        This screen could not be loaded. Your data has not been changed.
      </p>

      <pre
        className="p-3 rounded-md text-xs overflow-x-auto mb-4 m-0"
        style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
      >
        {error.message}
      </pre>

      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={reset}>
          Try again
        </button>
        <a href="/" className="btn no-underline">
          Back to dashboard
        </a>
      </div>
    </div>
  );
}
