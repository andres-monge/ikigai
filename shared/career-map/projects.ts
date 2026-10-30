import { z } from 'zod';
import {
  confirmationSchema,
  entityIdSchema,
  exactThree,
  languageTagSchema,
  modelPresentationSchema,
  revisionRefSchema,
  revisionSchema,
  timestampSchema,
  userActionProvenanceSchema,
} from './common.js';

export const pathProjectInputSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
  title: z.string().min(1).max(500),
  briefFormat: z.literal('simple-v1').optional(),
  relationship: z.enum(['linked', 'unrelated']).optional(),
  outcome: z.string().min(1).max(3_000).optional(),
  audience: z.string().min(1).max(2_000).optional(),
  whyWanted: z.string().min(1).max(2_000).optional(),
  learningGoal: z.string().min(1).max(2_000),
  firstVersion: z.string().min(1).max(3_000),
  firstStep: z.string().min(1).max(2_000),
  decisionQuestion: z.string().min(1).max(2_000).optional(),
  evidenceCue: z.string().min(1).max(2_000).optional(),
}).strict();

export const projectWorkStatusSchema = z.enum(['not-started', 'in-progress', 'stopped', 'completed']);
export const projectReportedActivitySchema = z.string().min(1).max(2_000);

export const projectWorkUpdateSchema = z.object({
  status: projectWorkStatusSchema,
  action: userActionProvenanceSchema,
  sourceId: entityIdSchema.optional(),
  reportedActivity: projectReportedActivitySchema.optional(),
  correctsActionId: entityIdSchema.optional(),
}).strict();

export const projectProceedingReportSchema = z.object({
  sourceId: entityIdSchema,
  projectId: entityIdSchema,
  projectRevision: revisionSchema,
  action: userActionProvenanceSchema,
  reportedActivity: projectReportedActivitySchema,
  retractedBy: userActionProvenanceSchema.optional(),
}).strict();

export const projectAcceptancePhraseSchema = z.string().min(1).max(240)
  .refine((value) => !value.includes('\n'), 'Acceptance phrase must be one line.');

export const projectAcceptanceQuestionSchema = z.string().min(1).max(240)
  .refine((value) => !value.includes('\n'), 'Acceptance question must be one line.')
  .refine(
    (value) => /^[^?\uFF1F]*[?\uFF1F]$/u.test(value.replace(/^\u00BF/u, '')),
    'Acceptance question must end with one question mark.',
  );

export const projectAcceptanceFramingSchema = z.object({
  locale: languageTagSchema,
  framingText: z.string().min(1).max(2_000),
  framingFormat: z.literal('natural-v1').optional(),
  acceptancePhrase: projectAcceptancePhraseSchema.optional(),
  acceptanceQuestion: projectAcceptanceQuestionSchema.optional(),
  moduleVersion: z.string().min(1).max(80),
  status: z.enum(['pending', 'delivered']),
  assistantTurnId: entityIdSchema,
  turnSequence: z.number().int().nonnegative(),
  initiatedAt: timestampSchema,
  presentation: modelPresentationSchema.optional(),
}).strict();

export const pathProjectSchema = pathProjectInputSchema.extend({
  number: z.number().int().positive(),
  basisAction: z.object({ sourceId: entityIdSchema, action: userActionProvenanceSchema }).strict().optional(),
  basisPath: revisionRefSchema,
  agreementStatus: z.enum(['suggested', 'accepted', 'parked', 'superseded']),
  workStatus: projectWorkStatusSchema,
  workUpdates: z.array(projectWorkUpdateSchema),
  presentation: modelPresentationSchema,
  acceptanceFraming: projectAcceptanceFramingSchema.optional(),
  confirmation: confirmationSchema.optional(),
  proceedingReport: projectProceedingReportSchema.optional(),
  supersedesProjectId: entityIdSchema.optional(),
  sourceOptionSetId: entityIdSchema.optional(),
}).strict();

export const projectOptionSchema = pathProjectInputSchema.extend({
  selection: z.enum(['available', 'active', 'parked']),
  equalWeight: z.literal(true),
}).strict();

export const projectOptionSetSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
  status: z.enum(['suggested', 'selected', 'superseded']),
  projectNumber: z.number().int().positive(),
  supersedesSetId: entityIdSchema.optional(),
  basisPath: revisionRefSchema,
  basisNextMove: revisionRefSchema.optional(),
  basisAction: z.object({ sourceId: entityIdSchema, action: userActionProvenanceSchema }).strict().optional(),
  projects: exactThree(projectOptionSchema),
  presentation: modelPresentationSchema,
  confirmation: confirmationSchema.optional(),
}).strict();

export function validateProjectBrief(project: z.infer<typeof pathProjectInputSchema>, context: z.RefinementCtx) {
  if (!project.briefFormat && ['outcome','audience','whyWanted','decisionQuestion','evidenceCue'].some((key) => !project[key as keyof typeof project])) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Legacy detailed briefs require every detailed field; simple briefs require briefFormat.' });
  }
}

export type PathProjectInput = z.infer<typeof pathProjectInputSchema>;
export type PathProject = z.infer<typeof pathProjectSchema>;
export type ProjectWorkStatus = z.infer<typeof projectWorkStatusSchema>;
export type ProjectOption = z.infer<typeof projectOptionSchema>;
export type ProjectOptionSet = z.infer<typeof projectOptionSetSchema>;
