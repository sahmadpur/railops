"use client";

import { useActionState } from "react";

import { signIn } from "@/actions/auth";

type Labels = {
  title: string;
  email: string;
  password: string;
  submit: string;
  invalid: string;
  hint: string;
};

export default function LoginForm({ labels }: { labels: Labels }) {
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <form action={action} className="card space-y-4 p-6">
      <h2 className="text-lg font-semibold">{labels.title}</h2>

      <label className="block">
        <span className="text-muted mb-1.5 block text-xs font-medium">{labels.email}</span>
        <input name="email" type="email" required autoComplete="username" autoFocus className="field" />
      </label>

      <label className="block">
        <span className="text-muted mb-1.5 block text-xs font-medium">{labels.password}</span>
        <input name="password" type="password" required autoComplete="current-password" className="field" />
      </label>

      {state?.error && (
        <p role="alert" className="text-danger text-xs">
          {labels.invalid}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary w-full justify-center">
        {labels.submit}
      </button>
      <p className="text-muted text-xs">{labels.hint}</p>
    </form>
  );
}
