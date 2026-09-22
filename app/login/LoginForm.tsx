"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction } from "@/lib/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? "Checking…" : "Sign in"}
    </button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(loginAction, {});

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={next} />

      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete="current-password"
          autoFocus
          required
          aria-describedby={state?.error ? "login-error" : undefined}
        />
      </div>

      {state?.error && (
        <p
          id="login-error"
          role="alert"
          className="text-xs px-3 py-2 rounded-md"
          style={{ background: "var(--expense-bg)", color: "var(--expense)" }}
        >
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
