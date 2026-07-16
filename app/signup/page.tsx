"use client";

import Link from "next/link";
import Script from "next/script";
import { useActionState } from "react";
import { signupAction, type FormState } from "../actions";
import { ShineButton } from "@/components/ui/shine-button";
import { ShineLink } from "@/components/ui/link-button";
import { TextInput } from "@/components/ui/text-input";
import { AlertMessage } from "@/components/ui/alert-message";
import { MIcon } from "@/components/ui/material-icon";
import { AuthColumn, AuthPanel } from "@/components/auth-panel";

const DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN || "hypamail.me";
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

export default function SignupPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(signupAction, null);

  if (state?.ok) {
    return (
      <div className="flex min-h-screen bg-[#151515]">
        <AuthColumn
          title="Account created"
          subtitle="Save your password somewhere safe. It won't be shown again."
          footer={
            <>
              Not taken straight to your inbox?{" "}
              <Link href="/login" className="text-[#f7f8f8] font-semibold hover:underline">
                Sign in
              </Link>{" "}
              with the details above.
            </>
          }
        >
          <div className="panel mb-5 p-4">
            <span className="block text-[10px] font-semibold text-[#898e97] uppercase tracking-widest mb-2">
              Address
            </span>
            <div className="text-[13px] text-[#f7f8f8] break-all leading-[1.7] select-all mb-4">
              {state.email}
            </div>
            <span className="block text-[10px] font-semibold text-[#898e97] uppercase tracking-widest mb-2">
              Password
            </span>
            <div className="text-[13px] text-[#f7f8f8] break-all leading-[1.7] font-mono select-all">
              {state.password}
            </div>
          </div>
          <ShineLink href="/mail" size="lg" fullWidth>
            Continue
          </ShineLink>
        </AuthColumn>
        <AuthPanel />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#151515]">
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <AuthColumn
        title="Create account"
        footer={
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-[#f7f8f8] font-semibold hover:underline">
              Sign in
            </Link>
          </>
        }
      >
        {state?.error && <AlertMessage tone="error" className="mb-5">{state.error}</AlertMessage>}

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
              trailing={<span className="text-[13px] whitespace-nowrap">@{DOMAIN}</span>}
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[#f7f8f8] mb-2 pl-1" htmlFor="invite">
              Invite code
            </label>
            <TextInput
              id="invite"
              name="invite"
              disabled={pending}
              placeholder="Invite code"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              required
              fullWidth
              leading={<MIcon name="confirmation_number" size={16} />}
            />
          </div>

          <ShineButton type="submit" disabled={pending} fullWidth variant="primary">
            {pending ? "Creating…" : "Create account"}
          </ShineButton>

          {SITE_KEY ? (
            <div className="flex justify-center pt-1">
              <div className="cf-turnstile" data-sitekey={SITE_KEY} data-theme="dark" />
            </div>
          ) : (
            <p className="text-[12px] text-[#898e97] pl-1">(Turnstile not configured)</p>
          )}
        </form>
      </AuthColumn>
      <AuthPanel />
    </div>
  );
}
