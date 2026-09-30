"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Could not sign in");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Could not sign in");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <label className="block text-sm text-stone-700" htmlFor="password">
        Password
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-base text-stone-900 outline-none ring-stone-400 focus:ring-2"
        />
      </label>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-2xl bg-stone-800 px-4 py-3 text-sm font-medium text-stone-50 transition hover:bg-stone-700 disabled:opacity-60"
      >
        {pending ? "Checking…" : "Enter"}
      </button>
    </form>
  );
}
