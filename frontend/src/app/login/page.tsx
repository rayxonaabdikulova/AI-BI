"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { ArrowRight, Lock, ShieldCheck, UserPlus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";

function tx(t: (k: string) => string, key: string, fallback: string) {
  const value = t(key);
  return value === key ? fallback : value;
}

export default function LoginPage() {
  const router = useRouter();
  const { token, initialized, login, register } = useAuth();
  const { t } = useLanguage();

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [loginInputLocked, setLoginInputLocked] = useState(true);
  const [registerInputLocked, setRegisterInputLocked] = useState(true);
  const [busy, setBusy] = useState<"login" | "register" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetFormState = useCallback(() => {
    setLoginUsername("");
    setLoginPassword("");
    setRegisterUsername("");
    setRegisterPassword("");
    setLoginInputLocked(true);
    setRegisterInputLocked(true);
    setError(null);
    setBusy(null);
  }, []);

  const text = useMemo(
    () => ({
      pretitle: tx(t, "auth.pretitle", "Secure Access"),
      title: tx(t, "auth.title", "Login to Your Intelligence Workspace"),
      subtitle: tx(
        t,
        "auth.subtitle",
        "Premium BI workflows now require authentication before upload and segmentation.",
      ),
      loginTitle: tx(t, "auth.loginTitle", "Login"),
      signupTitle: tx(t, "auth.signupTitle", "Sign Up"),
      username: tx(t, "auth.username", "Username"),
      password: tx(t, "auth.password", "Password"),
      loginButton: tx(t, "auth.loginButton", "Sign In"),
      signupButton: tx(t, "auth.signupButton", "Create Account"),
      goDashboard: tx(t, "auth.goDashboard", "Continue to Dashboard"),
      busyLogin: tx(t, "auth.busyLogin", "Signing in..."),
      busySignup: tx(t, "auth.busySignup", "Creating account..."),
      errorDefault: tx(t, "auth.errorDefault", "Authentication failed."),
      errorNetwork: tx(
        t,
        "auth.errorNetwork",
        "Cannot reach the API server. Wait a moment and try again.",
      ),
      errorCredentials: tx(
        t,
        "auth.errorCredentials",
        "Incorrect username or password. Create an account first if you are new.",
      ),
      hint: tx(t, "auth.hint", "New here? Use Sign Up on the right first."),
    }),
    [t],
  );

  useEffect(() => {
    if (!initialized) return;
    if (token) router.replace("/dashboard");
  }, [initialized, token, router]);

  useEffect(() => {
    // Ensure a clean form whenever this page is mounted or restored.
    const onPageShow = () => resetFormState();
    resetFormState();
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [resetFormState]);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setBusy("login");
    try {
      await login(loginUsername.trim(), loginPassword);
      resetFormState();
      router.replace("/dashboard");
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (!err.response) {
          setError(text.errorNetwork);
        } else if (err.response.status === 401) {
          const detail = err.response.data?.detail;
          setError(typeof detail === "string" ? detail : text.errorCredentials);
        } else {
          const detail = err.response.data?.detail;
          setError(typeof detail === "string" ? detail : text.errorDefault);
        }
      } else {
        setError(err instanceof Error ? err.message : text.errorDefault);
      }
    } finally {
      setBusy(null);
    }
  };

  const handleRegister = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setBusy("register");
    try {
      await register(registerUsername.trim(), registerPassword);
      resetFormState();
      router.replace("/dashboard");
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (!err.response) {
          setError(text.errorNetwork);
        } else {
          const detail = err.response.data?.detail;
          setError(typeof detail === "string" ? detail : text.errorDefault);
        }
      } else {
        setError(err instanceof Error ? err.message : text.errorDefault);
      }
    } finally {
      setBusy(null);
    }
  };

  if (!initialized) {
    return (
      <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-zinc-950 text-zinc-100">
        <p className="text-sm text-zinc-400">Loading...</p>
      </main>
    );
  }

  return (
    <main className="relative isolate min-h-[calc(100vh-3.5rem)] overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.22),transparent_42%),radial-gradient(circle_at_80%_20%,rgba(168,85,247,0.20),transparent_38%)]" />
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-5 lg:px-8">
        <section className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-8 shadow-2xl shadow-black/30 backdrop-blur lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">{text.pretitle}</p>
          <h1 className="mt-4 text-3xl font-semibold leading-tight text-white">{text.title}</h1>
          <p className="mt-4 text-sm leading-relaxed text-zinc-300">{text.subtitle}</p>

          <div className="mt-8 space-y-3 text-sm text-zinc-300">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-4 text-emerald-300" aria-hidden />
              <span>JWT-protected API access for upload and clustering.</span>
            </div>
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 size-4 text-violet-300" aria-hidden />
              <span>Token is stored in browser localStorage for this workspace.</span>
            </div>
          </div>

          <Link
            href="/dashboard"
            className="mt-8 inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
          >
            {text.goDashboard}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </section>

        <section className="grid gap-6 lg:col-span-3 sm:grid-cols-2">
          {error ? (
            <div className="sm:col-span-2">
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </p>
            </div>
          ) : null}

          <form
            onSubmit={handleLogin}
            autoComplete="on"
            className="overflow-hidden rounded-3xl border border-zinc-800/70 bg-zinc-900/75 p-6 shadow-xl shadow-black/20 backdrop-blur"
          >
            <h2 className="text-xl font-semibold text-white">{text.loginTitle}</h2>
            <p className="mt-2 text-xs text-zinc-400">{text.hint}</p>

            <label className="mt-5 block text-xs font-medium uppercase tracking-wider text-zinc-400">{text.username}</label>
            <input
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              onFocus={() => setLoginInputLocked(false)}
              readOnly={loginInputLocked}
              name="login-username"
              autoComplete="username"
              required
              className="mt-2 h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 text-sm text-zinc-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/30"
              placeholder="owner"
            />

            <label className="mt-4 block text-xs font-medium uppercase tracking-wider text-zinc-400">{text.password}</label>
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              onFocus={() => setLoginInputLocked(false)}
              readOnly={loginInputLocked}
              name="login-password"
              autoComplete="current-password"
              required
              minLength={6}
              className="mt-2 h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 text-sm text-zinc-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/30"
              placeholder="********"
            />

            <button
              type="submit"
              disabled={busy !== null}
              className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-sky-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "login" ? text.busyLogin : text.loginButton}
            </button>
          </form>

          <form
            onSubmit={handleRegister}
            autoComplete="on"
            className="overflow-hidden rounded-3xl border border-zinc-800/70 bg-zinc-900/75 p-6 shadow-xl shadow-black/20 backdrop-blur"
          >
            <div className="flex items-center gap-2">
              <UserPlus className="size-5 text-violet-300" aria-hidden />
              <h2 className="text-xl font-semibold text-white">{text.signupTitle}</h2>
            </div>

            <label className="mt-5 block text-xs font-medium uppercase tracking-wider text-zinc-400">{text.username}</label>
            <input
              value={registerUsername}
              onChange={(e) => setRegisterUsername(e.target.value)}
              onFocus={() => setRegisterInputLocked(false)}
              readOnly={registerInputLocked}
              name="register-username"
              autoComplete="username"
              required
              className="mt-2 h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 text-sm text-zinc-100 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30"
              placeholder="owner"
            />

            <label className="mt-4 block text-xs font-medium uppercase tracking-wider text-zinc-400">{text.password}</label>
            <input
              type="password"
              value={registerPassword}
              onChange={(e) => setRegisterPassword(e.target.value)}
              onFocus={() => setRegisterInputLocked(false)}
              readOnly={registerInputLocked}
              name="register-password"
              autoComplete="new-password"
              required
              minLength={6}
              className="mt-2 h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 text-sm text-zinc-100 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30"
              placeholder="********"
            />

            <button
              type="submit"
              disabled={busy !== null}
              className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "register" ? text.busySignup : text.signupButton}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
