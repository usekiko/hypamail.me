"use client";

// Fetches the raw encrypted blob and decrypts + renders it locally. If this tab
// doesn't hold the unlocked mail key (fresh tab / browser restart), shows the
// Unlock panel first.
import { useCallback, useEffect, useState } from "react";
import { loadMailKey } from "@/lib/client/crypto";
import { decryptMail, type DecryptedMail } from "@/lib/client/mail";
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
    return <div style={{ color: "#878787", padding: "1.5rem", textAlign: "center" }}>Decrypting…</div>;
  }
  if (state.phase === "error") {
    return <div style={{ color: "#e06a6a", padding: "1rem" }}>{state.message}</div>;
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
        <p style={{ color: "#d8a657", fontSize: "12px", marginTop: "12px" }}>
          This message was stored before encryption was enabled for your mailbox.
        </p>
      )}
    </>
  );
}
