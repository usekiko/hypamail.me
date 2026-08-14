"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, InputGroup } from "@heroui/react";
import { Alert } from "../../ui/Alert";
import { MIcon } from "@/components/ui/material-icon";
import { sendMail } from "../../actions";

export default function ComposeForm({
  from,
  initialTo,
  initialSubject,
  inReplyTo,
  references,
}: {
  from: string;
  initialTo: string;
  initialSubject: string;
  inReplyTo: string;
  references: string;
}) {
  const router = useRouter();
  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bodyFocused, setBodyFocused] = useState(false);

  // The textarea isn't a HeroUI field, so it reads the same tokens by hand —
  // otherwise it renders with a different radius and border to the InputGroups
  // stacked above it.
  const bodyStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 300,
    resize: "vertical",
    background: "var(--field-background)",
    border: "1px solid var(--border)",
    borderRadius: "var(--field-radius)",
    boxShadow: bodyFocused ? "0 0 0 2px var(--focus)" : undefined,
    color: "var(--foreground)",
    padding: "12px 14px",
    fontFamily: "inherit",
    fontSize: "14px",
    lineHeight: 1.65,
    outline: "none",
  };

  const labelClass = "block text-sm font-medium mb-2 pl-1 text-foreground";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await sendMail({ to, cc, subject, body, inReplyTo, references });
      if (!res.ok) {
        setError(res.error || "Couldn't send that.");
        return;
      }
      if (res.sentCopyFailed) {
        setNotice("Sent — but the copy for your Sent folder couldn't be saved.");
        return;
      }
      router.push("/mail");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h1 className="m-0 text-[1.1rem] font-semibold tracking-tight">
          {inReplyTo ? "Reply" : "New message"}
        </h1>
        <Link href="/mail" className="text-[13px] text-muted">
          Back to inbox
        </Link>
      </div>

      <Card>
        <Card.Content>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
              <span className="text-[13px] text-muted">
                From <span className="text-foreground">{from}</span>
              </span>
              {!showCc && (
                <button
                  type="button"
                  onClick={() => setShowCc(true)}
                  className="shrink-0 text-[12px] text-muted hover:text-foreground"
                >
                  Add Cc
                </button>
              )}
            </div>

            <div>
              <label className={labelClass} htmlFor="to">
                To
              </label>
              <InputGroup fullWidth>
                <InputGroup.Prefix>
                  <MIcon name="person" size={16} />
                </InputGroup.Prefix>
                <InputGroup.Input
                  id="to"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  disabled={busy}
                  placeholder="someone@example.com"
                  autoComplete="off"
                  inputMode="email"
                />
              </InputGroup>
              <p className="mt-1.5 pl-1 text-[11px] text-muted">
                Separate multiple addresses with commas.
              </p>
            </div>

            {showCc && (
              <div>
                <label className={labelClass} htmlFor="cc">
                  Cc
                </label>
                <InputGroup fullWidth>
                  <InputGroup.Prefix>
                    <MIcon name="group" size={16} />
                  </InputGroup.Prefix>
                  <InputGroup.Input
                    id="cc"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    disabled={busy}
                    placeholder="someone-else@example.com"
                    autoComplete="off"
                    inputMode="email"
                  />
                </InputGroup>
              </div>
            )}

            <div>
              <label className={labelClass} htmlFor="subject">
                Subject
              </label>
              <InputGroup fullWidth>
                <InputGroup.Prefix>
                  <MIcon name="subject" size={16} />
                </InputGroup.Prefix>
                <InputGroup.Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={busy}
                  placeholder="What's it about?"
                  autoComplete="off"
                />
              </InputGroup>
            </div>

            <div>
              <label className={labelClass} htmlFor="body">
                Message
              </label>
              <textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onFocus={() => setBodyFocused(true)}
                onBlur={() => setBodyFocused(false)}
                disabled={busy}
                placeholder="Write your message…"
                style={bodyStyle}
              />
            </div>

            {error && <Alert tone="error" style={{ marginBottom: 0 }}>{error}</Alert>}
            {notice && <Alert tone="warning" style={{ marginBottom: 0 }}>{notice}</Alert>}

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button type="submit" variant="primary" isDisabled={busy || !to.trim() || !body.trim()}>
                <MIcon name="send" size={16} style={{ marginRight: 6 }} />
                {busy ? "Sending…" : "Send"}
              </Button>
              <Button type="button" variant="outline" onPress={() => router.push("/mail")} isDisabled={busy}>
                Cancel
              </Button>
              <span className="text-[11px] leading-relaxed text-muted">
                Messages you send leave our servers in plain text, like all email.
              </span>
            </div>
          </form>
        </Card.Content>
      </Card>
    </div>
  );
}
