import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

// testpulse reports its own results like any other project (reporting standard, sections 2 and
// 4). These checks hold .github/workflows/ci.yml to the standard's rules, so a job or a
// Playwright project added later cannot quietly go unreported.

const StepSchema = z.object({
  name: z.string().optional(),
  if: z.string().optional(),
  uses: z.string().optional(),
  run: z.string().optional(),
  with: z.record(z.string(), z.union([z.string(), z.number()]).transform(String)).optional(),
});
type Step = z.infer<typeof StepSchema>;

const WorkflowSchema = z.object({
  on: z.object({ schedule: z.array(z.object({ cron: z.string() })).optional() }).loose(),
  jobs: z.record(
    z.string(),
    z.object({
      needs: z.string().optional(),
      if: z.string().optional(),
      steps: z.array(StepSchema),
    }),
  ),
});

const workflow = WorkflowSchema.parse(parseYaml(readFileSync('.github/workflows/ci.yml', 'utf8')));
const jobs = Object.entries(workflow.jobs);

const REPORT_ACTION = './.github/actions/report';
const TEST_COMMAND = /npm run (test|test:int|test:e2e:docker)(\s|$)/;

const isReport = (step: Step): boolean => step.uses === REPORT_ACTION;
const runsTests = (step: Step): boolean => TEST_COMMAND.test(step.run ?? '');
const reportsOf = (steps: readonly Step[]) => steps.filter(isReport).map((step) => step.with ?? {});

// The Playwright projects in playwright.config.ts that hold tests: every named project but the
// empty `seeded` one, which is named through a constant.
const playwrightProjects = [
  ...readFileSync('playwright.config.ts', 'utf8').matchAll(/^\s+name: '([^']+)',$/gm),
].map(([, name]) => name);

describe('.github/workflows/ci.yml reporting to testpulse', () => {
  it('has a test step in exactly the checks, integration and e2e jobs', () => {
    expect(jobs.filter(([, job]) => job.steps.some(runsTests)).map(([id]) => id)).toEqual([
      'checks',
      'integration',
      'e2e',
    ]);
  });

  it.each(jobs.filter(([, job]) => job.steps.some(runsTests)))(
    'reports from %s after its tests, always, as that job, with the variable and the secret',
    (id, job) => {
      const firstTest = job.steps.findIndex(runsTests);
      const reports = job.steps
        .map((step, index) => [step, index] as const)
        .filter(([s]) => isReport(s));
      expect(reports.length).toBeGreaterThan(0);
      for (const [step, index] of reports) {
        expect(index).toBeGreaterThan(firstTest);
        expect(step.if).toBe('always()');
        expect(step.with?.job).toBe(id);
        expect(step.with?.url).toBe('${{ vars.TESTPULSE_URL }}');
        expect(step.with?.token).toBe('${{ secrets.TESTPULSE_TOKEN }}');
      }
    },
  );

  it('gives every report in a run a distinct (job, module, platform)', () => {
    const keys = jobs.flatMap(([, job]) =>
      reportsOf(job.steps).map(({ job: j, module, platform }) => `${j}/${module}/${platform}`),
    );
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('reports the unit run as module unit with its junit file and coverage summary', () => {
    const checks = workflow.jobs.checks;
    const test = checks?.steps.find(runsTests);
    expect(test?.run).toContain('--outputFile.junit=test-results/junit/unit.xml');
    expect(reportsOf(checks?.steps ?? [])).toEqual([
      expect.objectContaining({
        module: 'unit',
        platform: 'node',
        format: 'junit',
        results: 'test-results/junit/unit.xml',
        'coverage-format': 'istanbul',
        'coverage-file': 'coverage/coverage-summary.json',
      }),
    ]);
  });

  it('reports the integration run as module integration with its junit file', () => {
    const integration = workflow.jobs.integration;
    expect(integration?.steps.find(runsTests)?.run).toContain(
      '--outputFile.junit=test-results/junit/integration.xml',
    );
    expect(reportsOf(integration?.steps ?? [])).toEqual([
      expect.objectContaining({
        module: 'integration',
        platform: 'node',
        format: 'junit',
        results: 'test-results/junit/integration.xml',
      }),
    ]);
  });

  it('reports each Playwright project with tests as its own platform of module e2e', () => {
    expect(playwrightProjects).toEqual([
      'desktop-dark',
      'desktop-light',
      'phone-dark',
      'phone-light',
      'no-js',
      'harness',
      'leak-sweep',
      'live',
    ]);
    const reports = reportsOf(workflow.jobs.e2e?.steps ?? []);
    expect(reports.map(({ platform }) => platform)).toEqual(playwrightProjects);
    for (const report of reports) {
      expect(report).toMatchObject({
        module: 'e2e',
        format: 'junit',
        results: `\${{ runner.temp }}/e2e-junit/${report.platform}.xml`,
      });
    }
  });

  it('splits the junit file playwright.config.ts writes into the directory the reports read', () => {
    expect(readFileSync('playwright.config.ts', 'utf8')).toContain(
      "['junit', { outputFile: 'test-results/e2e-junit.xml' }]",
    );
    const split = workflow.jobs.e2e?.steps.find((step) =>
      (step.run ?? '').includes('scripts/split-playwright-junit.ts'),
    );
    expect(split?.if).toBe('always()');
    expect(split?.run).toBe(
      'node scripts/split-playwright-junit.ts test-results/e2e-junit.xml "$RUNNER_TEMP/e2e-junit"',
    );
  });

  // Rule 2.4: a test step or a job that depends on another runs after a failure.
  it('runs the unit tests after a failed check, and integration and e2e after a failed checks job', () => {
    expect(workflow.jobs.checks?.steps.find(runsTests)?.if).toBe('${{ !cancelled() }}');
    for (const id of ['integration', 'e2e']) {
      expect(workflow.jobs[id]?.needs).toBe('checks');
      expect(workflow.jobs[id]?.if).toBe('${{ !cancelled() }}');
    }
  });

  // Rule 2.8: a weekly scheduled run, so a quiet week is not mistaken for silence.
  it('runs on a weekly schedule', () => {
    expect(workflow.on.schedule?.map(({ cron }) => cron)).toEqual([
      expect.stringMatching(/^\d+ \d+ \* \* [0-6]$/),
    ]);
  });
});
