"use client";

// Fetches the raw encrypted blob and decrypts + renders it locally. If this tab
// doesn't hold the unlocked mail key (fresh tab / browser restart), shows the
// Unlock panel first.
import { useCallback, useEffect, useState } from "react";
import { loadMailKey } from "@/lib/client/crypto";
import { decryptMail, type DecryptedMail } from "@/lib/client/mail";
import { Alert } from "../ui/Alert";
import Unlock from "../ui/Unlock";

type State =
  | { phase: "loading" }
  | { phase: "locked" }
  | { phase: "error"; message: string }
  | { phase: "ready"; mail: DecryptedMail };

export default function MessageBody({ emailId }: { emailId: string }) {
  const [state, setState] = useState<State>({ phase: "loading" });

  const load = useCallback(async (key: string) => {
    setState({ phase: "loading" });
    try {
      const res = await fetch(`/mail/raw/${encodeURIComponent(emailId)}`);
      if (!res.ok) throw new Error(String(res.status));
      const raw = await res.arrayBuffer();
      setState({ phase: "ready", mail: await decryptMail(raw, key) });
    } catch {
      setState({ phase: "error", message: "Couldn't decrypt this message." });
    }
  }, [emailId]);

  useEffect(() => {
    const key = loadMailKey();
    if (!key) setState({ phase: "locked" });
    else void load(key);
  }, [load]);

  if (state.phase === "locked") return <Unlock onUnlocked={(key) => void load(key)} />;
  if (state.phase === "loading") {
    return <div style={{ color: "var(--muted-foreground)", padding: "1.5rem", textAlign: "center" }}>Decrypting…</div>;
  }
  if (state.phase === "error") {
    return <Alert tone="error" style={{ marginBottom: 0 }}>{state.message}</Alert>;
  }

  const { mail } = state;
  return (
    <>
      {mail.html ? (
        <div dangerouslySetInnerHTML={{ __html: mail.html }} />
      ) : (
        <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit" }}>
          {mail.text || "(empty message)"}
        </pre>
      )}
      {!mail.encrypted && (
        <Alert tone="warning" icon={null} style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
          This message was stored before encryption was enabled for your mailbox.
        </Alert>
      )}
    </>
  );
}
