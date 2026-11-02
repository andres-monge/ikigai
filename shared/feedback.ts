import { z } from 'zod';

export const feedbackInputSchema = z.object({
  submissionId: z.string().uuid(),
  text: z.string().trim().min(1).max(4000),
  page: z.enum(['chat', 'map']),
}).strict();
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;
export const feedbackResponseSchema = z.object({
  id: z.string().uuid(),
  saved: z.literal(true),
  notification: z.enum(['pending', 'unavailable', 'accepted', 'failed', 'uncertain', 'review-required']),
});
export type FeedbackResponse = z.infer<typeof feedbackResponseSchema>;
export const safeReplyEmail = z.string().email().max(254).refine(value => !/[\r\n<>\s]/.test(value));
