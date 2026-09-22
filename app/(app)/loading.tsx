export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="skeleton" style={{ height: 28, width: 190 }} />
        <div className="skeleton" style={{ height: 36, width: 150 }} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card p-4">
            <div className="skeleton" style={{ height: 11, width: "55%" }} />
            <div className="skeleton mt-2.5" style={{ height: 20, width: "75%" }} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <div className="skeleton" style={{ height: 180 }} />
        </div>
        <div className="card p-5">
          <div className="skeleton" style={{ height: 180 }} />
        </div>
      </div>
    </div>
  );
}
