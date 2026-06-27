import Link from "next/link";
import { notFound } from "next/navigation";
import sanitizeHtml from "sanitize-html";
import { getSession } from "@/lib/session";
import { getEmail, markSeen } from "@/lib/jmap";
import { deleteEmailAction } from "../actions";

export const dynamic = "force-dynamic";

// Privacy-first: strip scripts/styles/iframes and drop <img> entirely so remote
// tracking pixels never load. Links open in a new tab, no referrer.
function clean(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "a", "b", "i", "em", "strong", "u", "p", "br", "ul", "ol", "li",
      "blockquote", "pre", "code", "span", "div", "h1", "h2", "h3", "h4",
      "h5", "h6", "hr", "table", "thead", "tbody", "tr", "td", "th",
    ],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" },
      }),
    },
  });
}

export default async function ReadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = (await getSession())!;
  const mail = await getEmail(session.email, session.password, session.accountId, id);
  if (!mail) notFound();
  if (mail.unread) {
    try {
      await markSeen(session.email, session.password, session.accountId, id);
    } catch {}
  }

  const from = mail.from[0];
  const cleanHtml = mail.html ? clean(mail.html) : null;

  return (
    <article>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <Link href="/mail" className="btn btn-ghost" style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}>
          ← Inbox
        </Link>
        <form action={deleteEmailAction}>
          <input type="hidden" name="id" value={mail.id} />
          <button className="btn btn-ghost" style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", color: "#ff9a9a" }}>
            Delete
          </button>
        </form>
      </div>

      <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.75rem" }}>{mail.subject || "(no subject)"}</h1>
      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)", fontSize: "0.9rem", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <span>
          <strong style={{ color: "var(--text)" }}>{from ? from.name || from.email : "(unknown)"}</strong>
          {from?.name && <span> &lt;{from.email}&gt;</span>}
        </span>
        <span>{new Date(mail.receivedAt).toLocaleString()}</span>
      </div>

      <div className="card" style={{ padding: "1.25rem", lineHeight: 1.6, overflowWrap: "anywhere" }}>
        {cleanHtml ? (
          <div dangerouslySetInnerHTML={{ __html: cleanHtml }} />
        ) : (
          <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit" }}>
            {mail.text || mail.preview}
          </pre>
        )}
      </div>
      <p style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: "0.75rem" }}>
        Remote images are blocked for your privacy.
      </p>
    </article>
  );
}
