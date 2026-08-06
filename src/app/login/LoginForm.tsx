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
    <form action={action} className="border-line bg-surface space-y-3 rounded border p-4">
      <h2 className="font-medium">{labels.title}</h2>

      <label className="block">
        <span className="text-muted text-xs">{labels.email}</span>
        <input name="email" type="email" required autoComplete="username" autoFocus className="field mt-1" />
      </label>

      <label className="block">
        <span className="text-muted text-xs">{labels.password}</span>
        <input name="password" type="password" required autoComplete="current-password" className="field mt-1" />
      </label>

      {state?.error && (
        <p role="alert" className="text-danger text-xs">
          {labels.invalid}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {labels.submit}
      </button>
      <p className="text-muted text-xs">{labels.hint}</p>
    </form>
  );
}
