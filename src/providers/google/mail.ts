import { OAuth2Client } from "google-auth-library";

export function mailConfigured() { return !!(process.env.MAIL_GOOGLE_CLIENT_ID && process.env.MAIL_GOOGLE_CLIENT_SECRET && process.env.MAIL_GOOGLE_REFRESH_TOKEN && process.env.MAIL_FROM); }
async function mailToken() {
  if (!mailConfigured()) throw new Error("Connect a dedicated Gmail mailbox before sending reports or syncing outreach replies.");
  const auth = new OAuth2Client(process.env.MAIL_GOOGLE_CLIENT_ID, process.env.MAIL_GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.MAIL_GOOGLE_REFRESH_TOKEN });
  const { token } = await auth.getAccessToken();
  if (!token) throw new Error("Mailbox access expired. Reconnect Gmail.");
  return token;
}
const email = (value: string) => /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value) && !/[\r\n]/.test(value);
export function mailMessage(input: { id: string; from: string; to: string[]; subject: string; text: string; attachment?: Buffer; attachments?: { name: string; mime: "application/pdf" | "text/csv"; data: Buffer }[]; threadId?: string; inReplyTo?: string }) {
  if (!email(input.from) || !input.to.length || input.to.some((v) => !email(v)) || /[\r\n]/.test(input.subject)) throw new Error("Invalid email headers.");
  if (input.inReplyTo && !/^<[^<>\r\n ]+@[^<>\r\n ]+>$/.test(input.inReplyTo)) throw new Error("Invalid reply header.");
  const boundary = `orwell_${input.id.replace(/[^a-z0-9]/gi, "")}`;
  const lines = [`From: ${input.from}`, `To: ${input.to.join(", ")}`, `Subject: =?UTF-8?B?${Buffer.from(input.subject).toString("base64")}?=`, `Message-ID: <${boundary}@${input.from.split("@")[1]}>`, "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${boundary}"`, "", `--${boundary}`, 'Content-Type: text/plain; charset="utf-8"', "Content-Transfer-Encoding: base64", "", (Buffer.from(input.text).toString("base64").match(/.{1,76}/g) ?? []).join("\r\n")];
  if (input.inReplyTo) lines.splice(4, 0, `In-Reply-To: ${input.inReplyTo}`, `References: ${input.inReplyTo}`);
  const attachments = input.attachments ?? (input.attachment ? [{ name: "seo-report.pdf", mime: "application/pdf", data: input.attachment }] : []);
  for (const file of attachments) {
    if (!/^[a-zA-Z0-9._-]+$/.test(file.name) || !["application/pdf", "text/csv"].includes(file.mime)) throw new Error("Invalid attachment metadata.");
    lines.push(`--${boundary}`, `Content-Type: ${file.mime}; name="${file.name}"`, `Content-Disposition: attachment; filename="${file.name}"`, "Content-Transfer-Encoding: base64", "", (file.data.toString("base64").match(/.{1,76}/g) ?? []).join("\r\n"));
  }
  lines.push(`--${boundary}--`);
  return lines.join("\r\n");
}
/** Called only by an explicitly approved message action or an enabled report schedule. No automatic HTTP retries. */
export async function sendMail(input: { id: string; to: string[]; subject: string; text: string; attachment?: Buffer; attachments?: { name: string; mime: "application/pdf" | "text/csv"; data: Buffer }[]; threadId?: string; inReplyTo?: string }) {
  if (process.env.QA_SYNTHETIC === "true") throw new Error("Email delivery is disabled in previews.");
  const token = await mailToken();
  const raw = Buffer.from(mailMessage({ ...input, from: process.env.MAIL_FROM! })).toString("base64url");
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ raw, ...(input.threadId ? { threadId: input.threadId } : {}) }), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Mailbox returned HTTP ${response.status}. Check Sent before retrying; delivery may be uncertain.`);
  return await response.json() as { id: string; threadId: string };
}
export async function readMailThread(threadId: string, correspondent: string) {
  if (!/^[a-zA-Z0-9]+$/.test(threadId) || !email(correspondent)) throw new Error("Invalid saved mailbox thread.");
  const token = await mailToken();
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Replies could not be read (${response.status}). Reconnect the outreach mailbox if access expired.`);
  type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[]; headers?: { name: string; value: string }[] };
  const body = await response.json() as { messages?: { id: string; internalDate?: string; payload?: Part }[] };
  const text = (part: Part): string => part.mimeType === "text/plain" && part.body?.data ? Buffer.from(part.body.data, "base64url").toString("utf8").slice(0, 20000) : (part.parts ?? []).map(text).join("\n");
  return (body.messages ?? []).slice(-50).flatMap((message) => {
    const payload = message.payload ?? {}, headers = payload.headers ?? [], from = headers.find((h) => h.name.toLowerCase() === "from")?.value ?? "";
    const address = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
    if (address !== correspondent.toLowerCase()) return [];
    return [{ id: message.id, messageId: headers.find(h => h.name.toLowerCase() === "message-id")?.value ?? null, from: correspondent, date: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null, subject: headers.find((h) => h.name.toLowerCase() === "subject")?.value ?? "", text: text(payload) || "No plain-text content supplied by Gmail." }];
  });
}
