import picomatch from 'picomatch';
import { z } from 'zod';

// Spec section 8: the allowed layers, in the order pyramid charts draw them.
export const LAYER_ORDER = ['unit', 'component', 'integration', 'api', 'visual', 'e2e'] as const;

export const LayerSchema = z.enum(LAYER_ORDER);
export type Layer = z.infer<typeof LayerSchema>;

const matchValue = z.string().min(1);

export const LayerMatchSchema = z
  .strictObject({
    job: matchValue.optional(),
    module: matchValue.optional(),
    platform: matchValue.optional(),
    suite: matchValue.optional(),
  })
  .refine((match) => Object.values(match).some((value) => value !== undefined), {
    message: 'match must name at least one of job, module, platform, suite',
  });

export const LayerMatchRuleSchema = z.strictObject({ match: LayerMatchSchema, layer: LayerSchema });
export const LayerDefaultRuleSchema = z.strictObject({ default: LayerSchema });

// A plain union would report a bad rule as "Invalid input" with the real issues nested per
// option. Choosing the branch by the presence of `default` first surfaces that branch's issues
// at the rule's own path, e.g. `[0].layer: Invalid option: ...`.
export const LayerRuleSchema = z.looseObject({}).transform((rule, ctx) => {
  const branch = 'default' in rule ? LayerDefaultRuleSchema : LayerMatchRuleSchema;
  const result = branch.safeParse(rule);
  if (!result.success) {
    for (const issue of result.error.issues) {
      // Spread because Zod's issue interfaces lack the index signature addIssue's parameter wants.
      ctx.addIssue({ ...issue });
    }
    return z.NEVER;
  }
  return result.data;
});

export const LayerRulesSchema = z.array(LayerRuleSchema).superRefine((rules, ctx) => {
  const defaultIndexes = rules.flatMap((rule, index) => ('default' in rule ? [index] : []));
  const [first, ...extra] = defaultIndexes;

  if (first === undefined) {
    ctx.addIssue({ code: 'custom', message: 'layer_rules must end with a default rule', path: [] });
    return;
  }
  for (const index of extra) {
    ctx.addIssue({
      code: 'custom',
      message: `only one default rule is allowed; extra default at index ${index}`,
      path: [index],
    });
  }
  if (extra.length === 0 && first !== rules.length - 1) {
    ctx.addIssue({
      code: 'custom',
      message: `default rule must be last, found at index ${first}`,
      path: [first],
    });
  }
});

export type LayerMatch = z.infer<typeof LayerMatchSchema>;
export type LayerMatchRule = z.infer<typeof LayerMatchRuleSchema>;
export type LayerDefaultRule = z.infer<typeof LayerDefaultRuleSchema>;
export type LayerRule = z.infer<typeof LayerRuleSchema>;
export type LayerRules = z.infer<typeof LayerRulesSchema>;

export interface LayerTarget {
  readonly job: string;
  readonly module: string;
  readonly platform: string;
  readonly suite: string;
}

export type LayerResolver = (target: LayerTarget) => Layer;

type Predicate = (target: LayerTarget) => boolean;

const EXACT_KEYS = ['job', 'module', 'platform'] as const;

// picomatch treats `/` as the only segment separator and a dot as an ordinary character, so a JVM
// class name such as `com.ostomate.app.ui.home.HomeViewModelTest` is one segment: both
// `com.ostomate.app.ui.*` and `com.ostomate.app.ui.**` match it, and `*` cannot stop at a dot.
// `dot: true` lets `**` and `*` also cover segments that start with a dot (e.g. `.maestro/x.yaml`),
// which picomatch otherwise skips as hidden files; a layer rule has no reason to skip them.
const suitePredicate = (glob: string): Predicate => {
  const isMatch = picomatch(glob, { dot: true });
  return (target) => isMatch(target.suite);
};

const predicatesFor = (match: LayerMatch): readonly Predicate[] => {
  const predicates: Predicate[] = [];
  for (const key of EXACT_KEYS) {
    const expected = match[key];
    if (expected !== undefined) {
      predicates.push((target) => target[key] === expected);
    }
  }
  if (match.suite !== undefined) {
    predicates.push(suitePredicate(match.suite));
  }
  return predicates;
};

const isDefaultRule = (rule: LayerRule): rule is LayerDefaultRule => 'default' in rule;

/**
 * Builds the picomatch matchers once per rule set so ingestion resolves each test without
 * recompiling globs; this is the only way to resolve a layer, so there is no per-call path to
 * reach for by mistake. Accepts `unknown` because callers usually hold `projects.layer_rules`
 * straight from jsonb; validation here also guarantees the default the resolver relies on.
 */
export function compileLayerRules(rules: unknown): LayerResolver {
  const parsed = LayerRulesSchema.parse(rules);
  const fallback = parsed.find(isDefaultRule);
  if (fallback === undefined) {
    throw new Error('LayerRulesSchema guarantees a default rule');
  }
  const compiled = parsed
    .filter((rule): rule is LayerMatchRule => !isDefaultRule(rule))
    .map((rule) => ({ layer: rule.layer, predicates: predicatesFor(rule.match) }));

  return (target) =>
    compiled.find((rule) => rule.predicates.every((holds) => holds(target)))?.layer ??
    fallback.default;
}
