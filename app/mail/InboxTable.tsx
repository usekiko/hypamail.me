"use client";

// The message list. Client-side because HeroUI's Table is react-aria's grid,
// which needs the browser. RouterProvider is what keeps a row's href a Next
// client-side navigation rather than a full document load.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RouterProvider } from "react-aria-components";
import { Button, Chip, Table } from "@heroui/react";
import { Alert } from "../ui/Alert";
import type { MailSummary } from "@/lib/jmap";
import { loadMoreInbox } from "./actions";

// Two widths of the same timestamp: the narrow date column on a phone can't
// hold "Aug 1, 2026", so it drops the year and the wider one is swapped in
// from sm up. Today's mail shows a clock time at both sizes.
function when(iso: string): { short: string; full: string } {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return { short: t, full: t };
  }
  return {
    short: d.toLocaleDateString([], { month: "short", day: "numeric" }),
    full: d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }),
  };
}

function sender(m: MailSummary): string {
  const f = m.from[0];
  return f ? f.name || f.email : "(unknown)";
}

const CELL = "px-2.5 sm:px-4";

export default function InboxTable({
  initialMail,
  total,
}: {
  initialMail: MailSummary[];
  total: number;
}) {
  const router = useRouter();
  const [mail, setMail] = useState(initialMail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    setBusy(true);
    setError(null);
    try {
      const res = await loadMoreInbox(mail.length);
      if (!res.mail) return setError(res.error || "Couldn't load more messages.");
      // Dedupe by id: new mail arriving between pages shifts everything down by
      // one, which would otherwise repeat the message on the seam.
      setMail((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...res.mail!.filter((m) => !seen.has(m.id))];
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <RouterProvider navigate={router.push}>
      <Table>
        <Table.ScrollContainer>
          {/* table-fixed is load-bearing: HeroUI ships .table__content as w-full
              with auto layout, and an auto-layout cell whose content is
              white-space:nowrap (what `truncate` sets) demands its full text
              width. Long subjects then push the table past the viewport and the
              scroll container scrolls sideways instead of truncating. Fixed
              layout makes the column widths below authoritative. */}
          <Table.Content aria-label="Inbox" className="table-fixed">
            <Table.Header>
              <Table.Column isRowHeader className={`w-[30%] sm:w-[26%] ${CELL}`}>
                From
              </Table.Column>
              <Table.Column className={CELL}>Subject</Table.Column>
              <Table.Column className={`w-[24%] text-right sm:w-[20%] ${CELL}`}>Date</Table.Column>
            </Table.Header>
            <Table.Body items={mail}>
              {(m) => (
                <Table.Row href={`/mail/${m.id}`} className="cursor-pointer">
                  <Table.Cell
                    className={`truncate ${CELL} ${m.unread ? "font-semibold text-foreground" : "text-muted"}`}
                  >
                    {sender(m)}
                  </Table.Cell>
                  {/* No preview snippet: bodies are encrypted at rest, so the
                      server has nothing to preview. Subject/sender stay visible. */}
                  <Table.Cell className={CELL}>
                    <span className="flex min-w-0 items-center gap-1.5">
                      {m.spam && (
                        <Chip color="warning" size="sm" className="shrink-0">
                          <Chip.Label>Spam</Chip.Label>
                        </Chip>
                      )}
                      <span className={`truncate ${m.unread ? "font-bold" : ""}`}>
                        {m.subject || "(no subject)"}
                      </span>
                    </span>
                  </Table.Cell>
                  <Table.Cell className={`truncate text-right text-muted ${CELL}`}>
                    {/* Locale formatting can differ between the server render
                        and the browser, so let the client value win quietly. */}
                    <span suppressHydrationWarning>
                      <span className="sm:hidden">{when(m.receivedAt).short}</span>
                      <span className="hidden sm:inline">{when(m.receivedAt).full}</span>
                    </span>
                  </Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>

      {error && (
        <Alert tone="error" style={{ marginTop: 12, marginBottom: 0 }}>
          {error}
        </Alert>
      )}

      {mail.length < total && (
        <div className="mt-4 flex items-center gap-3">
          <Button variant="outline" size="sm" onPress={loadMore} isDisabled={busy}>
            {busy ? "Loading…" : "Load more"}
          </Button>
          <span className="text-xs text-muted">
            showing {mail.length} of {total}
          </span>
        </div>
      )}
    </RouterProvider>
  );
}
