import { z } from "zod";
import { safeEvidenceUrl } from "./research-evidence";
const publicUrl = z.string().url().max(2000).refine(value => !!safeEvidenceUrl(value), "Use a public HTTP or HTTPS link.");
export const LocalPostSchema = z.object({ businessId: z.string().uuid(), title: z.string().trim().min(2).max(160), summary: z.string().trim().min(1).max(1500), languageCode: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/).default("en"), actionUrl: publicUrl.optional(), actionType: z.enum(["LEARN_MORE", "BOOK", "ORDER", "SHOP", "SIGN_UP"]).default("LEARN_MORE"), imageUrl: publicUrl.optional() });
export const ReviewCampaignSchema = z.object({ businessId: z.string().uuid(), title: z.string().trim().min(2).max(160), subject: z.string().trim().min(2).max(150).refine(value => !/[\r\n]/.test(value)), message: z.string().trim().min(5).max(5000), recipients: z.array(z.string().email().max(254)).min(1).max(50) });
export function googlePostBody(input: z.infer<typeof LocalPostSchema>) {
  return { languageCode: input.languageCode, summary: input.summary, topicType: "STANDARD", ...(input.actionUrl ? { callToAction: { actionType: input.actionType, url: input.actionUrl } } : {}), ...(input.imageUrl ? { media: [{ mediaFormat: "PHOTO", sourceUrl: input.imageUrl }] } : {}) };
}
export function googleReviewUrl(placeId: string) { return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`; }
