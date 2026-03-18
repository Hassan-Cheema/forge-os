"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

// ─── Google "G" icon ──────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

// ─── Eye icons ────────────────────────────────────────────────────────────────

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}

// ─── Password strength ────────────────────────────────────────────────────────

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  if (pw.length === 0) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { score, label: "Weak", color: "bg-red-500" };
  if (score <= 2) return { score, label: "Fair", color: "bg-yellow-500" };
  if (score <= 3) return { score, label: "Good", color: "bg-blue-500" };
  return { score, label: "Strong", color: "bg-green-500" };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const supabase = createClient();
  const strength = passwordStrength(password);

  // ── Google OAuth ─────────────────────────────────────────────────────────

  async function handleGoogle() {
    setGoogleLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  }

  // ── Email / password signup ───────────────────────────────────────────────

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // If email confirmation is disabled in Supabase, the user is signed in
    // immediately — redirect straight to the dashboard.
    if (data.session) {
      window.location.href = "/dashboard";
    } else {
      setDone(true);
    }
  }

  // ── Check-email state ─────────────────────────────────────────────────────

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-12">
        <Link href="/" className="mb-8 text-lg font-semibold text-white hover:text-zinc-300 transition-colors">
          forge-os
        </Link>
        <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <div className="mb-4 text-4xl">📬</div>
          <h2 className="text-xl font-semibold text-white">Check your email</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            We sent a confirmation link to{" "}
            <span className="font-medium text-zinc-200">{email}</span>.
            <br />
            Click it to activate your account.
          </p>
          <p className="mt-6 text-xs text-zinc-600">
            Didn&apos;t get it? Check spam or{" "}
            <button
              onClick={() => setDone(false)}
              className="text-zinc-400 hover:text-white transition-colors"
            >
              try again
            </button>
            .
          </p>
        </div>
      </div>
    );
  }

  // ── Signup form ───────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-12">

      {/* Brand */}
      <Link href="/" className="mb-8 text-lg font-semibold text-white hover:text-zinc-300 transition-colors">
        forge-os
      </Link>

      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-white">Create your account</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Start building with forge-os — free forever
          </p>
        </div>

        {/* Google */}
        <button
          onClick={handleGoogle}
          disabled={googleLoading}
          className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-50"
        >
          {googleLoading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-500 border-t-white" />
          ) : (
            <GoogleIcon />
          )}
          {googleLoading ? "Redirecting…" : "Continue with Google"}
        </button>

        {/* Divider */}
        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-800" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-zinc-950 px-3 text-xs text-zinc-500">
              or continue with email
            </span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder-zinc-500 transition focus:border-zinc-600 focus:outline-none"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 pr-10 text-sm text-white placeholder-zinc-500 transition focus:border-zinc-600 focus:outline-none"
                placeholder="Min. 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>

            {/* Strength meter */}
            {password.length > 0 && (
              <div className="mt-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                        i <= strength.score ? strength.color : "bg-zinc-800"
                      }`}
                    />
                  ))}
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  Password strength:{" "}
                  <span
                    className={
                      strength.score <= 1
                        ? "text-red-400"
                        : strength.score <= 2
                        ? "text-yellow-400"
                        : strength.score <= 3
                        ? "text-blue-400"
                        : "text-green-400"
                    }
                  >
                    {strength.label}
                  </span>
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-100 disabled:opacity-50"
          >
            {loading ? "Creating account…" : "Create account →"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Already have an account?{" "}
          <Link
            href="/auth/login"
            className="text-zinc-300 transition-colors hover:text-white"
          >
            Sign in
          </Link>
        </p>

        <p className="mt-4 text-center text-xs leading-relaxed text-zinc-600">
          By creating an account you agree to our{" "}
          <span className="text-zinc-500">Terms of Service</span> and{" "}
          <span className="text-zinc-500">Privacy Policy</span>.
        </p>
      </div>
    </div>
  );
}
