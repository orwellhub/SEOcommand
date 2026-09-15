import { expect, it } from "vitest";
import { mailMessage } from "./mail";
const message = { id: "review-1", from: "sender@example.test", to: ["contact@example.test"], subject: "Re: Link correction", text: "Reviewed response" };
it("preserves RFC reply headers and both report attachment types", () => {
  const result = mailMessage({ ...message, inReplyTo: "<original@example.test>", attachments: [{ name: "report.pdf", mime: "application/pdf", data: Buffer.from("%PDF-test") }, { name: "report.csv", mime: "text/csv", data: Buffer.from("Clicks,223") }] });
  expect(result).toContain("In-Reply-To: <original@example.test>\r\nReferences: <original@example.test>");
  expect(result).toContain('filename="report.pdf"'); expect(result).toContain('filename="report.csv"');
  expect(result).toContain(Buffer.from("Clicks,223").toString("base64"));
});
it("refuses recipient, reply and attachment header injection", () => {
  expect(() => mailMessage({ ...message, to: ["victim@example.test\r\nBcc: hidden@example.test"] })).toThrow();
  expect(() => mailMessage({ ...message, inReplyTo: "<original@example.test>\r\nX: injected" })).toThrow();
  expect(() => mailMessage({ ...message, attachments: [{ name: 'x.csv"\r\nX: injected', mime: "text/csv", data: Buffer.alloc(0) }] })).toThrow();
});
