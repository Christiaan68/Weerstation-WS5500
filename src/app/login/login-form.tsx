"use client";

import { useActionState } from "react";

import { login, type LoginActionState } from "./actions";

const inputClass =
  "border-border bg-background text-foreground focus-visible:outline-primary w-full rounded-md border px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1";

const INITIAL_STATE: LoginActionState = {};

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<LoginActionState, FormData>(
    login,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}

      {state?.error && (
        <p
          role="alert"
          className="border-danger/30 bg-danger/10 text-danger rounded-md border px-3 py-2 text-sm"
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="username" className="text-foreground text-sm font-medium">
          Gebruikersnaam
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          className={inputClass}
          required
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-foreground text-sm font-medium">
          Wachtwoord
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className={inputClass}
          required
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="bg-primary text-primary-foreground mt-2 inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium transition-colors hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Bezig met inloggen…" : "Inloggen"}
      </button>
    </form>
  );
}
