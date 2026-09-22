import { z } from 'zod';

// Scripts run this module under Node's type stripping, which needs real extensions on imports.
import { ParseError } from '../parsers/types.ts';

// Spec section 7: some toolchains stamp the platform into the names they report. Kotlin
// Multiplatform's iOS simulator target writes the test the JVM run calls
// `com.ostomate.app.ui.home.HomeViewModelTest` / `rendersToday` as
// `iosSimulatorArm64Test.com.ostomate.app.ui.home.HomeViewModelTest` /
// `rendersToday[iosSimulatorArm64]`. A project lists the affixes its toolchain adds and
// ingestion strips them before the test key is computed and the layer resolved, so identity
// and layer are the same whichever platform reported the run.

// Ten affixes is more platforms than a project reports, and 200 characters is far longer than
// any real target name; the caps keep a project file from growing into a rewrite engine.
const MAX_AFFIXES = 10;
const MAX_AFFIX_LENGTH = 200;

const affixList = z.array(z.string().min(1).max(MAX_AFFIX_LENGTH)).max(MAX_AFFIXES);

export const NameNormalizationSchema = z.strictObject({
  suite_prefixes: affixList.optional(),
  name_suffixes: affixList.optional(),
});

export type NameNormalization = z.infer<typeof NameNormalizationSchema>;

export interface TestIdentity {
  readonly suite: string;
  readonly name: string;
}

export type NameNormalizer = (suite: string, name: string) => TestIdentity;

type Affix = 'suite_prefixes' | 'name_suffixes';

const matches = (key: Affix, value: string, affix: string): boolean =>
  key === 'suite_prefixes' ? value.startsWith(affix) : value.endsWith(affix);

const cut = (key: Affix, value: string, affix: string): string =>
  key === 'suite_prefixes'
    ? value.slice(affix.length)
    : value.slice(0, value.length - affix.length);

/**
 * Removes at most one affix: the first in the project's list that matches. The list is ordered
 * configuration, not a rewrite loop, so a longer affix later in the list never wins over a
 * shorter one before it.
 */
function stripFirst(
  field: 'suite' | 'name',
  key: Affix,
  value: string,
  affixes: readonly string[],
): string {
  const affix = affixes.find((candidate) => matches(key, value, candidate));
  if (affix === undefined) {
    return value;
  }
  const stripped = cut(key, value, affix);
  if (stripped === '') {
    // An empty suite or name is not storable and would identify nothing, so the report is
    // refused with the configuration key at fault rather than written under a broken identity.
    throw new ParseError(
      `name_normalization.${key} entry "${affix}" strips the whole of ${field} "${value}", ` +
        'leaving no identifier',
      { field },
    );
  }
  return stripped;
}

/**
 * Builds the normalizer once per report. Accepts `unknown` because callers hold
 * `projects.name_normalization` straight from jsonb, where the column only guarantees an
 * object; validating here is what makes the rest of the function total.
 */
export function compileNameNormalization(config: unknown): NameNormalizer {
  const parsed = NameNormalizationSchema.parse(config);
  const suitePrefixes = parsed.suite_prefixes ?? [];
  const nameSuffixes = parsed.name_suffixes ?? [];

  return (suite, name) => ({
    suite: stripFirst('suite', 'suite_prefixes', suite, suitePrefixes),
    name: stripFirst('name', 'name_suffixes', name, nameSuffixes),
  });
}
