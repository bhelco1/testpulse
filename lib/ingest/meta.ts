import { z } from 'zod';

import { storabilityIssue } from '../parsers/limits';

// Spec section 6.2: the `meta` part of a report request, as the Appendix A script posts it.
export const REPORT_EVENTS = ['push', 'pull_request', 'schedule', 'workflow_dispatch'] as const;
export const ReportEventSchema = z.enum(REPORT_EVENTS);

// Every meta string is stored, and job, module and platform identify a report (5.3) with
// module in every test_key, so control characters (line breaks included) are refused instead
// of becoming identifiers, and text Postgres cannot hold is refused instead of failing the write.
const CONTROL_CHARACTER = /\p{Cc}/u;

function textProblem(value: string): string | undefined {
  if (CONTROL_CHARACTER.test(value)) return 'must not contain control characters';
  const issue = storabilityIssue(value);
  return issue === undefined ? undefined : `must not contain ${issue}`;
}

const storable = <T extends z.ZodType<string>>(schema: T) =>
  schema.superRefine((value, context) => {
    const problem = textProblem(value);
    if (problem !== undefined) context.addIssue({ code: 'custom', message: problem });
  });

const identifier = storable(z.string().min(1).max(100));

export const ReportMetaSchema = z.strictObject({
  ci_run_id: storable(z.string().min(1).max(100)),
  run_attempt: z.int().min(1).default(1),
  job: identifier,
  module: identifier,
  platform: identifier,
  commit_sha: z.string().regex(/^[0-9a-fA-F]{7,40}$/, 'must be 7 to 40 hexadecimal characters'),
  branch: storable(z.string().min(1).max(255)),
  event: ReportEventSchema,
  // z.url hands on the URL parser's normalised form, which drops line breaks and re-encodes
  // lone surrogates, so the storable rule has to run on the raw string before it.
  run_url: storable(z.string().max(2000))
    .pipe(z.url({ protocol: /^https$/ }))
    .optional(),
  path_prefix: storable(z.string().max(1000)).optional(),
});

export type ReportMeta = z.output<typeof ReportMetaSchema>;
export type ReportMetaInput = z.input<typeof ReportMetaSchema>;
export type ReportEvent = z.infer<typeof ReportEventSchema>;
