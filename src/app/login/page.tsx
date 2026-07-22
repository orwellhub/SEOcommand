"use client";

import { FormEvent, useState } from "react";
import { LockKeyhole } from "lucide-react";

function safeNext(): string {
  if (typeof window === "undefined") return "/portfolio";
  const value = new URLSearchParams(window.location.search).get("next");
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/portfolio";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Sign-in failed.");
      window.location.assign(safeNext());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-rail px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-white p-7 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple text-white">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-purple">Orwell</div>
            <h1 className="text-lg font-semibold text-ink">SEO Command Centre</h1>
          </div>
        </div>
        <p className="mb-5 text-sm text-muted">Sign in with your internal portfolio account.</p>
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label htmlFor="email" className="text-xs font-medium text-ink">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1.5 h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink"
            />
          </div>
          <div>
            <label htmlFor="password" className="text-xs font-medium text-ink">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink"
            />
          </div>
          {error && <p role="alert" className="rounded-md border border-critical/20 bg-critical/10 px-3 py-2 text-xs text-critical">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-purple px-4 text-sm font-semibold text-white transition-colors hover:bg-purple-deep disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
