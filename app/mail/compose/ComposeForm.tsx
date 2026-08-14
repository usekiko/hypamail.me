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
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <div className="text-[13px] text-muted">
              From <span className="text-foreground">{from}</span>
            </div>

            <InputGroup fullWidth>
              <InputGroup.Prefix>
                <MIcon name="person" size={16} />
              </InputGroup.Prefix>
              <InputGroup.Input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={busy}
                placeholder="To — comma-separated for more than one"
                autoComplete="off"
                inputMode="email"
              />
            </InputGroup>

            {showCc ? (
              <InputGroup fullWidth>
                <InputGroup.Prefix>
                  <MIcon name="group" size={16} />
                </InputGroup.Prefix>
                <InputGroup.Input
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  disabled={busy}
                  placeholder="Cc"
                  autoComplete="off"
                  inputMode="email"
                />
              </InputGroup>
            ) : (
              <button
                type="button"
                onClick={() => setShowCc(true)}
                className="w-fit text-[12px] text-muted hover:text-foreground"
              >
                Add Cc
              </button>
            )}

            <InputGroup fullWidth>
              <InputGroup.Prefix>
                <MIcon name="subject" size={16} />
              </InputGroup.Prefix>
              <InputGroup.Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={busy}
                placeholder="Subject"
                autoComplete="off"
              />
            </InputGroup>

            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={busy}
              rows={14}
              placeholder="Write your message…"
              className="w-full resize-y rounded-lg border border-border bg-[var(--field-background)] p-3 text-[13px] leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-[var(--focus)]"
            />

            {error && <Alert tone="error" style={{ marginBottom: 0 }}>{error}</Alert>}
            {notice && <Alert tone="warning" style={{ marginBottom: 0 }}>{notice}</Alert>}

            <div className="flex items-center gap-3">
              <Button type="submit" variant="primary" isDisabled={busy || !to.trim() || !body.trim()}>
                {busy ? "Sending…" : "Send"}
              </Button>
              <span className="text-[11px] text-muted">
                Messages you send leave our servers in plain text, like all email.
              </span>
            </div>
          </form>
        </Card.Content>
      </Card>
    </div>
  );
}
