"use client";

// The message list. Client-side because HeroUI's Table is react-aria's grid,
// which needs the browser. RouterProvider is what keeps a row's href a Next
// client-side navigation rather than a full document load.
import { useRouter } from "next/navigation";
import { RouterProvider } from "react-aria-components";
import { Chip, Table } from "@heroui/react";
import type { MailSummary } from "@/lib/jmap";

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

export default function InboxTable({ mail }: { mail: MailSummary[] }) {
  const router = useRouter();
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
    </RouterProvider>
  );
}
