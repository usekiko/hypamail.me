"use client";

// The message list. Client-side because HeroUI's Table is react-aria's grid,
// which needs the browser. RouterProvider is what keeps a row's href a Next
// client-side navigation rather than a full document load.
import { useRouter } from "next/navigation";
import { RouterProvider } from "react-aria-components";
import { Chip, Table } from "@heroui/react";
import type { MailSummary } from "@/lib/jmap";

function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function sender(m: MailSummary): string {
  const f = m.from[0];
  return f ? f.name || f.email : "(unknown)";
}

export default function InboxTable({ mail }: { mail: MailSummary[] }) {
  const router = useRouter();
  return (
    <RouterProvider navigate={router.push}>
      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label="Inbox">
            <Table.Header>
              <Table.Column isRowHeader className="w-[26%]">
                From
              </Table.Column>
              <Table.Column>Subject</Table.Column>
              <Table.Column className="w-[20%] text-right">Date</Table.Column>
            </Table.Header>
            <Table.Body items={mail}>
              {(m) => (
                <Table.Row href={`/mail/${m.id}`} className="cursor-pointer">
                  <Table.Cell
                    className={`truncate ${m.unread ? "font-semibold text-foreground" : "text-muted"}`}
                  >
                    {sender(m)}
                  </Table.Cell>
                  {/* No preview snippet: bodies are encrypted at rest, so the
                      server has nothing to preview. Subject/sender stay visible. */}
                  <Table.Cell className={`truncate ${m.unread ? "font-bold" : ""}`}>
                    {m.subject || "(no subject)"}
                  </Table.Cell>
                  <Table.Cell className="whitespace-nowrap text-right">
                    {m.spam && (
                      <Chip color="warning" size="sm" className="mr-2 align-middle">
                        <Chip.Label>Spam</Chip.Label>
                      </Chip>
                    )}
                    <span className="text-muted">{when(m.receivedAt)}</span>
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
