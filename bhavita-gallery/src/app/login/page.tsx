import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <section className="w-full max-w-sm rounded-3xl bg-white/80 px-8 py-10 shadow-sm ring-1 ring-stone-200">
        <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Private</p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight text-stone-900">
          Gallery
        </h1>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Enter the password to view this collection.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
