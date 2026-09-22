"use client";

import { useAddTransaction } from "./AppShell";
import { IconPlus } from "./Icons";

export function AddButton({
  label = "Add Transaction",
  variant = "primary",
  small,
}: {
  label?: string;
  variant?: "primary" | "plain";
  small?: boolean;
}) {
  const open = useAddTransaction();
  return (
    <button
      className={`btn ${variant === "primary" ? "btn-primary" : ""} ${small ? "btn-sm" : ""}`}
      onClick={open}
    >
      <IconPlus size={small ? 14 : 16} />
      {label}
    </button>
  );
}
