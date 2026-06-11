"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import EyLogo from "@/components/EyLogo";
import { strings } from "@/lib/strings";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(strings.login.error);
        setSubmitting(false);
        return;
      }

      // Server components + middleware read the session from cookies.
      router.replace("/admin");
      router.refresh();
    } catch {
      setError(strings.login.unexpected);
      setSubmitting(false);
    }
  }

  return (
    <main className="vignette min-h-dvh flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-charcoal-line bg-charcoal-soft/70 px-6 py-8 sm:px-8 sm:py-10 shadow-2xl shadow-black/40">
          <header className="text-center mb-8">
            <EyLogo className="w-14 mx-auto mb-5" />
            <h1 className="font-serif text-3xl text-cream">
              {strings.login.heading}
            </h1>
            <div className="gold-rule my-4 mx-auto w-1/2" />
            <p className="text-sm text-cream-dim">{strings.login.subheading}</p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-sm text-cream-dim mb-1.5">
                {strings.login.email}
              </label>
              <input
                className="field"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={submitting}
                required
              />
            </div>
            <div>
              <label className="block text-sm text-cream-dim mb-1.5">
                {strings.login.password}
              </label>
              <input
                className="field"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={submitting}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-danger text-center" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-gold text-charcoal font-medium py-3 transition hover:bg-gold-soft disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? strings.login.submitting : strings.login.submit}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
