-- Per-project test-name normalization (spec sections 5.1 and 7).
--
-- Kotlin Multiplatform stamps the platform into both names its iOS simulator target reports:
-- the test the JVM run calls `com.ostomate.app.ui.home.HomeViewModelTest` / `rendersToday`
-- arrives from the simulator as `iosSimulatorArm64Test.com.ostomate.app.ui.home.HomeViewModelTest`
-- / `rendersToday[iosSimulatorArm64]`. tests.test_key hashes module, suite and name, so one
-- logical test became two rows, and the prefixed suite matched none of the project's layer
-- globs, so every iOS test resolved to `unit`. Ingestion now strips the affixes listed here
-- before it computes the key and resolves the layer.
--
-- It is a column rather than parser behaviour because the affixes belong to a project's
-- toolchain, not to the JUnit format: the parsers stay generic and the same file posted by a
-- different project is read the same way.
alter table public.projects
  add column name_normalization jsonb not null default '{}'::jsonb
    check (jsonb_typeof(name_normalization) = 'object');
