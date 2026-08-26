"use client";

import { FormEvent, useState } from "react";
import { Activity, ArrowRight, CheckCircle2, LockKeyhole, Sparkles } from "lucide-react";

function safeNext(): string {
  if (typeof window === "undefined") return "/action-centre";
  const value = new URLSearchParams(window.location.search).get("next");
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/action-centre";
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
    <main className="grid min-h-screen bg-workspace lg:grid-cols-[minmax(0,1.2fr)_minmax(420px,0.8fr)]">
      <section className="signal-grid relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 grid-cols-2 gap-1 rounded-md bg-white/10 p-2"><span className="rounded-[2px] bg-[#335CFF]" /><span className="rounded-[2px] bg-[#12B8C4]" /><span className="rounded-[2px] bg-[#FF6B5E]" /><span className="rounded-[2px] bg-[#F2B544]" /></span><div><div className="text-sm font-extrabold">Orwell Command</div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">SEO operations</div></div></div>
        <div className="max-w-xl">
          <div className="mb-6 flex items-center gap-3"><span className="h-1 w-12 rounded-full bg-[#12B8C4]" /><span className="text-xs font-bold uppercase tracking-[0.14em] text-[#7FE4EA]">Signal to action</span></div>
          <h1 className="text-balance text-5xl font-extrabold leading-[1.04] tracking-[-0.05em]">See the portfolio clearly. Act on what matters.</h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-white/60">One operating system for search performance, technical health, AI visibility, local presence and approved growth work.</p>
          <div className="mt-10 grid grid-cols-3 gap-3"><LoginSignal icon={<Activity />} label="Monitor" color="#12B8C4" /><LoginSignal icon={<Sparkles />} label="Prioritise" color="#F2B544" /><LoginSignal icon={<CheckCircle2 />} label="Verify" color="#16A879" /></div>
        </div>
        <p className="text-xs text-white/35">Portfolio access is restricted to authorised Orwell accounts.</p>
      </section>
      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-7 shadow-pop sm:p-9">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple text-white">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-purple">Secure workspace</div>
            <h2 className="text-xl font-extrabold tracking-tight text-ink">Welcome back</h2>
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
            {submitting ? "Signing in…" : <span className="inline-flex items-center gap-2">Sign in <ArrowRight className="h-4 w-4" /></span>}
          </button>
        </form>
      </div>
      </section>
    </main>
  );
}

function LoginSignal({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return <div className="rounded-lg border border-white/10 bg-white/5 p-4"><span className="block [&>svg]:h-5 [&>svg]:w-5" style={{ color }}>{icon}</span><div className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-white/65">{label}</div></div>;
}
