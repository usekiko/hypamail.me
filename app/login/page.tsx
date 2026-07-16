"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type FormState } from "../actions";
import { ShineButton } from "@/components/ui/shine-button";
import { TextInput } from "@/components/ui/text-input";
import { AlertMessage } from "@/components/ui/alert-message";
import { MIcon } from "@/components/ui/material-icon";
import { AuthColumn, AuthPanel } from "@/components/auth-panel";

export default function LoginPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, null);
  return (
    <div className="flex min-h-screen bg-[#151515]">
      <AuthColumn
        title="Sign in"
        footer={
          <>
            No account?{" "}
            <Link href="/signup" className="text-[#f7f8f8] font-semibold hover:underline">
              Create one
            </Link>
          </>
        }
      >
        <form action={action} className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-[#f7f8f8] mb-2 pl-1" htmlFor="username">
              Username
            </label>
            <TextInput
              id="username"
              name="username"
              disabled={pending}
              placeholder="you"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              required
              fullWidth
              leading={<MIcon name="person" size={16} />}
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[#f7f8f8] mb-2 pl-1" htmlFor="password">
              Password
            </label>
            <TextInput
              id="password"
              name="password"
              type="password"
              disabled={pending}
              placeholder="••••••••"
              // "new-password" (not "current-password") — the strongest signal
              // Chrome honours for "do not offer a saved password here".
              autoComplete="new-password"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              required
              fullWidth
              leading={<MIcon name="key" size={16} />}
            />
          </div>
          {state?.error && (
            <div>
              <AlertMessage tone="error" style={{ marginBottom: 0 }}>
                {state.error}
              </AlertMessage>
            </div>
          )}
          <ShineButton type="submit" disabled={pending} fullWidth variant="primary">
            {pending ? "Signing in…" : "Sign in"}
          </ShineButton>
        </form>
      </AuthColumn>
      <AuthPanel />
    </div>
  );
}
