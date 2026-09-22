"use client";

import { useTheme, type Accent, type ThemeMode } from "./ThemeProvider";
import { IconCheck, IconMonitor, IconMoon, IconSun } from "./Icons";

const MODES: { value: ThemeMode; label: string; Icon: typeof IconSun }[] = [
  { value: "light", label: "Light", Icon: IconSun },
  { value: "dark", label: "Dark", Icon: IconMoon },
  { value: "system", label: "System", Icon: IconMonitor },
];

const ACCENTS: { value: Accent; label: string; swatch: string }[] = [
  { value: "blue", label: "Blue", swatch: "#2563eb" },
  { value: "green", label: "Green", swatch: "#059669" },
  { value: "purple", label: "Purple", swatch: "#7c3aed" },
  { value: "teal", label: "Teal", swatch: "#0d9488" },
];

export function ThemeSettings() {
  const { mode, accent, setMode, setAccent } = useTheme();

  return (
    <div className="space-y-5">
      <div>
        <span className="label">Appearance</span>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
          {MODES.map(({ value, label, Icon }) => {
            const on = mode === value;
            return (
              <button
                key={value}
                role="radio"
                aria-checked={on}
                onClick={() => setMode(value)}
                className="flex flex-col items-center gap-1.5 py-3 rounded-lg transition-colors"
                style={{
                  border: `1.5px solid ${on ? "var(--accent)" : "var(--border-strong)"}`,
                  background: on ? "var(--accent-soft)" : "var(--surface)",
                  color: on ? "var(--accent)" : "var(--text-muted)",
                }}
              >
                <Icon size={18} />
                <span className="text-xs font-semibold">{label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] mt-1.5 m-0" style={{ color: "var(--text-muted)" }}>
          System follows your device setting and switches automatically.
        </p>
      </div>

      <div>
        <span className="label">Accent colour</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map(({ value, label, swatch }) => {
            const on = accent === value;
            return (
              <button
                key={value}
                role="radio"
                aria-checked={on}
                onClick={() => setAccent(value)}
                className="flex items-center gap-2 h-9 px-3 rounded-lg transition-colors"
                style={{
                  border: `1.5px solid ${on ? "var(--accent)" : "var(--border-strong)"}`,
                  background: on ? "var(--accent-soft)" : "var(--surface)",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ width: 14, height: 14, borderRadius: 5, background: swatch }}
                />
                <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>
                  {label}
                </span>
                {on && (
                  <span style={{ color: "var(--accent)" }}>
                    <IconCheck size={13} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] mt-1.5 m-0" style={{ color: "var(--text-muted)" }}>
          Affects buttons, highlights and selected navigation. Chart colours stay
          fixed so a series keeps its identity across themes.
        </p>
      </div>
    </div>
  );
}
