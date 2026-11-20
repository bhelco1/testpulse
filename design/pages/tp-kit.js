/* testpulse view-model kit: one source for status, health, layer tones, CoverageBar, ProjectCard and RunFeedRow data,
   shared by every page so each component renders identically. Plain data only; markup lives in the templates. */
(function () {
  const DARK = { bg:'#121110', surface:'#1a1917', inset:'#151412', raised:'#211f1c', line:'#2a2825', 'line-strong':'#3d3a35', ink:'#ede9e3', 'ink-2':'#cfc9bf', 'ink-3':'#a8a298', pass:'#7fd79a', 'pass-tint':'#1d2a20', fail:'#f4897c', 'fail-tint':'#33201c', attn:'#e3b35c', 'attn-tint':'#302716', neutral:'#b3ada3', 'neutral-tint':'#252320', 'on-ink':'#121110', 'layer-1':'#ede9e3', 'layer-2':'#b8b2a8', 'layer-3':'#8a847a', 'layer-4':'#6f6a62' };
  const LIGHT = { bg:'#f6f4f0', surface:'#ffffff', inset:'#f3f0eb', raised:'#ece8e1', line:'#e4e0d9', 'line-strong':'#c9c3b9', ink:'#1c1a17', 'ink-2':'#45413b', 'ink-3':'#68635b', pass:'#197339', 'pass-tint':'#e4f2e7', fail:'#b3261e', 'fail-tint':'#fbe8e5', attn:'#8a5a00', 'attn-tint':'#fbf0d8', neutral:'#5d5851', 'neutral-tint':'#efece7', 'on-ink':'#f6f4f0', 'layer-1':'#1c1a17', 'layer-2':'#57524b', 'layer-3':'#7a746b', 'layer-4':'#8f897f' };
  function themeVars(dark) {
    const tv = { background: 'var(--bg)', color: 'var(--ink)', minHeight: '100vh' };
    if (!dark) Object.keys(LIGHT).forEach(k => tv['--' + k] = LIGHT[k]);
    tv['--shadow-card'] = dark ? 'none' : '0 1px 2px rgba(28,26,23,.06)';
    tv['--shadow-menu'] = dark ? '0 16px 40px -12px rgba(0,0,0,.7)' : '0 16px 40px -12px rgba(28,26,23,.22)';
    return tv;
  }
  const c = (w, ink, tint, d, dash, r) => ({ w, ink: `var(--${ink})`, tint: `var(--${tint})`, d, dash: dash || 'none', r: r == null ? 10 : r });
  const S = {
    passed: c('Passed', 'pass', 'pass-tint', 'm8 12 3 3 5-6'),
    failed: c('Failed', 'fail', 'fail-tint', 'm15 9-6 6M9 9l6 6'),
    error: c('Error', 'fail', 'fail-tint', 'M12 7v6M12 17h.01'),
    empty: c('Empty', 'attn', 'attn-tint', 'M8 12h8', '3.5 3'),
    skipped: c('Skipped', 'neutral', 'neutral-tint', 'M8 12h8'),
    flaky: c('Flaky', 'attn', 'attn-tint', 'M2 12h4l3-7 6 14 3-7h4', 'none', 0),
    stale: c('Stale', 'attn', 'attn-tint', 'M12 7v5l3 2'),
    not_reporting: c('Not reporting yet', 'neutral', 'neutral-tint', '', '3.5 3'),
    /* v23 items 2, 3, 5: a run's completeness against its expected reports. In progress: some expected reports not in yet, within the time limit (three dots). Incomplete: the limit passed with reports missing (a ring with a piece missing). */
    in_progress: c('In progress', 'neutral', 'neutral-tint', 'M8 12h.01M12 12h.01M16 12h.01'),
    incomplete: c('Incomplete', 'attn', 'attn-tint', '', '44 18.8'),
  };
  const H = {
    healthy: { label: 'Reporting healthy', ink: 'var(--pass)', d: 'M20 6 9 17l-5-5', r: 0, dash: 'none' },
    stale: { label: 'No report in 12 days', ink: 'var(--attn)', d: 'M12 7v5l3 2', r: 10, dash: 'none' },
    empty: { label: 'Last run empty', ink: 'var(--attn)', d: 'M8 12h8', r: 10, dash: '3.5 3' },
    below_floor: { label: 'Coverage below floor', ink: 'var(--attn)', d: 'M12 5v14M6 13l6 6 6-6', r: 0, dash: 'none' },
    not_reporting: { label: 'Not reporting yet', ink: 'var(--neutral)', d: '', r: 10, dash: '3.5 3' },
    incomplete: { label: 'Last run incomplete', ink: 'var(--attn)', d: '', r: 10, dash: '44 18.8' }, /* v23 item 5; precedence stale, empty, incomplete, below_floor */
  };
  const ORDER = ['unit', 'component', 'integration', 'api', 'visual', 'e2e'];
  const TONE = { unit: 'var(--layer-1)', component: 'var(--layer-2)', integration: 'var(--layer-3)', api: 'var(--layer-4)', visual: 'var(--layer-2)', e2e: 'var(--layer-3)' };
  const NAME = { unit: 'Unit', component: 'Component', integration: 'Integration', api: 'API', visual: 'Visual', e2e: 'E2E' };
  const n = v => Number(v).toLocaleString('en-US');
  const layers = obj => ORDER.filter(k => obj[k] != null).map(k => ({ key: k, label: NAME[k], count: obj[k], n: obj[k], countText: n(obj[k]), tone: TONE[k], bg: TONE[k] }));
  const down1 = v => Math.floor(v * 10 + 1e-9) / 10; /* v8 item 5: percentages round down to the tenth */
  /* v24 item 16: coverage rounds to the nearest tenth (96.396 → 96.4), except that it never rounds up onto its floor or onto 100 (79.96 under an 80 floor reads 79.9%; 99.96 reads 99.9%). Pass rates keep down1. */
  function covPct(v, f) {
    let r = Math.round(v * 10 + 1e-9) / 10;
    if (v < 100 && r >= 100) r = down1(v);
    if (f != null && v < f && r >= f) r = down1(v);
    return v === 100 ? '100' : r.toFixed(1);
  }
  /* v24 item 16: a coverage trend under 0.1 points reads "Held at" */
  function covTrend(a, b, runs) {
    const A = covPct(a), B = covPct(b);
    return Math.abs(b - a) < 0.1 ? `Held at ${B}% over ${runs} runs` : `${b > a ? 'Rose' : 'Fell'} from ${A}% to ${B}% over ${runs} runs`;
  }
  function cov(m, v, f) {
    const noFloor = f == null, below = !noFloor && v < f; /* v8 item 15: no floor → no marker, no floor text */
    return { m, v: covPct(v, f) + '%', w: v + '%', fl: noFloor ? '0%' : f + '%', flDisp: noFloor ? 'none' : 'block', below, ink: below ? 'var(--attn)' : 'var(--ink)', floorInk: below ? 'var(--attn)' : 'var(--ink-3)', floorLabel: noFloor ? '' : below ? `below floor ${f}%` : `floor ${f}%` };
  }
  const part = (t, ink, w) => ({ t, ink: ink || 'inherit', w: w || 400 });
  /* v4 item 28: run titles from stored data only (event, branch). */
  function runTitle(event, branch) {
    return { push: `Push to ${branch}`, pull_request: `Pull request from ${branch}`, schedule: 'Scheduled run', workflow_dispatch: 'Manual run' }[event] || `Run on ${branch}`;
  }
  /* v22 item 9: the run page's Event value, in the same words as the run titles; any other event shows its stored value */
  function eventWord(event) { return { push: 'Push', pull_request: 'Pull request', schedule: 'Scheduled run', workflow_dispatch: 'Manual run' }[event] || String(event || ''); }
  /* v22 item 12: a report key "job/module/platform" drops a part that repeats the part before it ("e2e/e2e/desktop-dark" → "e2e/desktop-dark"); the stored key goes in `title` */
  function reportKey(k) { return String(k).split('/').filter((x, i, a) => i === 0 || x !== a[i - 1]).join('/'); }
  /* v22 items 1, 2, 4: a private project's failures as counts only. f: [{n, status:'failed'|'error', platform, layer}] → "2 tests failed", "1 test errored", "2 failed, 1 errored" and "node · API, Integration" */
  function privFailHead(f) {
    const fl = (f || []).filter(x => x.status !== 'error').reduce((a, x) => a + x.n, 0), er = (f || []).filter(x => x.status === 'error').reduce((a, x) => a + x.n, 0);
    return fl && er ? `${n(fl)} failed, ${n(er)} errored` : er ? `${qty(er, 'test')} errored` : `${qty(fl, 'test')} failed`;
  }
  function privFailWhere(f) {
    const u = k => Array.from(new Set((f || []).map(x => x[k]).filter(Boolean)));
    return [u('platform').join(', '), u('layer').join(', ')].filter(Boolean).join(' · ');
  }
  /* v4 item 20: suite shortening. Path-style keeps the last path segment; dotted class names keep the last dotted segment. */
  function shortSuite(s) { if (!s) return ''; if (s.includes('/')) return s.split('/').pop(); if (/\.(spec|test)\.[cm]?[jt]sx?$|\.(ts|tsx|js|jsx|mjs|cjs|kt|kts|swift|py|rb|go)$/.test(s)) return s; return s.split('.').pop(); } /* v8 item 12: a bare file name is kept whole */
  /* v23 item 9: a suite equal to its test's name (Maestro flows send the flow name as both) is not shown a second time; compared trimmed, whole or shortened */
  function sameSuite(suite, name) { const a = String(suite || '').trim(), b = String(name || '').trim(); return !a || a === b || shortSuite(a) === b; }
  /* v23 item 5: a missing report is named by the shortest trailing part of its key that no other expected key of the run shares ("android-emulator"); else the shortened key */
  function missingName(k, keys) {
    const parts = String(k).split('/'), others = (keys || []).filter(x => x !== k).map(x => String(x).split('/'));
    for (let i = parts.length - 1; i >= 0; i--) { const tail = parts.slice(i).join('/'); if (!others.some(o => o.slice(-(parts.length - i)).join('/') === tail)) return tail; }
    return reportKey(k);
  }
  /* v23 item 7: a trigger in the expected-reports list and the incomplete note ("Scheduled runs expect 6 reports") */
  function triggerWord(event) { return { push: 'Push', pull_request: 'Pull request', schedule: 'Scheduled', workflow_dispatch: 'Manual' }[event] || String(event || ''); }
  const andList = a => a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  /* v4 item 18: per-platform split, platform = last segment of the report key "job/module/platform"; counts always shown. */
  function platformSplit(reports) {
    const by = {}, order = [];
    (reports || []).forEach(([k, v]) => { const p = String(k).split('/').pop(); if (!(p in by)) { by[p] = 0; order.push(p); } by[p] += v; });
    return order.map(p => `${p} ${n(by[p])}`).join(' · ');
  }
  /* v4 item 17: "Not counted" footer summary from projects.declared_suites. */
  const PHRASE = { runs_in_ci_not_reported: 'run in CI, not yet reported', authored_not_executed: 'authored, not yet executed' };
  const qty = (c, u) => `${n(c)} ${u}${c === 1 ? '' : 's'}`; /* v4 item 50: every count noun is singular at 1 */
  const counts = list => { const by = {}; list.forEach(s => { const u = s.layer === 'e2e' ? 'flow' : 'test'; by[u] = (by[u] || 0) + s.count; }); return ['flow', 'test'].filter(u => by[u]).map(u => qty(by[u], u)).join(' and '); };
  function declaredSummary(suites) {
    if (!suites || !suites.length) return '';
    if (suites.length === 1) { const s = suites[0]; return s.count > 0 ? `Not counted: ${counts([s])} in ${s.name}, ${PHRASE[s.status]}` : `Not counted: ${s.name}, ${PHRASE[s.status]}`; } /* v21 item 15: "{count} {unit} in {name}", so a name with its own brackets never doubles them; sync rejects count < 1; defensive fallback drops the count */
    const groups = ['runs_in_ci_not_reported', 'authored_not_executed'].map(st => suites.filter(s => s.status === st)).filter(g => g.length);
    if (groups.length === 1) return `Not counted: ${counts(groups[0])} in ${groups[0].length} suites, ${PHRASE[groups[0][0].status]}`;
    return 'Not counted: ' + groups.map(g => `${counts(g)} ${PHRASE[g[0].status]}`).join('; ');
  }
  /* ProjectCard view-model. o: {name, tagline, private, run:{status, when, branch, sha, total, failed, skipped, dur}|null,
     layers:{}, cov:[[m,v,f]], reports:[[k,n]], declared:[{name, layer, count, status}], health, failing:[{suite, name, platform}], stale} */
  function card(o) {
    const run = o.run;
    const status = !run ? 'not_reporting' : run.status;
    const failed = status === 'failed', empty = status === 'empty';
    /* v23 items 2, 5. o.arriving {got, of, last} while expected reports are still coming (o.last = the last complete run's {total, failed, skipped, dur, when, sha}: its figures stay on the card);
       o.missing [keys] once the time limit passed without them (o.event, o.limit). o.expected [keys] lists every expected report so the block can show what is still to come. */
    const prog = !!(run && o.arriving), inc = !!(run && o.missing && o.missing.length);
    const fig = prog && o.last ? o.last : run;
    const f = fig && fig.failed || 0;
    /* v24 item 1: four figures. Total = every test in the latest copy of each report key the project sends (stable); Passed and Failed from the run;
       Not run = the Total's tests this run didn't run (skipped, plus the tests of a report that didn't arrive or that this trigger doesn't send: fig.notRun). Passed + Failed + Not run = Total. */
    const nr = fig ? (fig.skipped || 0) + (fig.notRun || 0) : 0, pz = fig ? fig.total - f - nr : 0;
    const why = o.notRunWhy || [], unsent = why.filter(w => w.kind === 'not_sent'), bigSkip = fig && (fig.skipped || 0) >= 0.05 * fig.total;
    const nrLoud = !!fig && !empty && nr > 0 && (inc || unsent.length > 0 || bigSkip);
    const subParts = !run ? [] : empty
      ? [part('tests executed ·'), part(`${qty(o.reports.length, 'report')} received`)]
      : [part('tests ·'), part(`${n(pz)} passed ·`), f ? part(`${n(f)} failed`, 'var(--fail)', 600) : part('0 failed'), part('·'), nrLoud ? part(`${n(nr)} not run`, 'var(--ink)', 600) : part(`${n(nr)} not run`), part('·'), part(`${fig.ci || fig.dur} CI time`)]; /* v24 item 9: CI time leads on the card */
    /* v24 items 1, 6: a large Not run gets its own block (a word, a glyph and a bold count, so it never relies on colour): not sent by this trigger → neutral; skipped ≥ 5% of Total → neutral. A missing report is said in the incomplete note instead. */
    const nrBlock = nrLoud && !inc ? (unsent.length
      ? { head: `${n(nr)} of ${n(fig.total)} not run`, body: `${triggerWord(o.event || 'schedule')} runs don’t send ${andList(unsent.map(w => w.what))}, by the project’s settings. ${unsent.reduce((a, w) => a + w.n, 0) === nr ? '' : `${n(fig.skipped || 0)} more skipped. `}Those tests last ran ${o.lastRanAll || 'on the last push'}.` }
      : { head: `${n(nr)} of ${n(fig.total)} not run`, body: `${qty(fig.skipped || 0, 'test')} skipped by the test files themselves.` }) : null;
    /* v24 item 6: a red stretch ends only when the tests that failed have run and passed. o.stillRed {what, sha, when} while the failing suite hasn't run since */
    const stillRed = o.stillRed ? `Still red: ${o.stillRed.what} failed ${o.stillRed.when} (${o.stillRed.sha}) and hasn’t run since.` : '';
    const health = H[o.health || (!run ? 'not_reporting' : o.stale ? 'stale' : empty ? 'empty' : inc ? 'incomplete' : 'healthy')];
    const got = (o.reports || []).length, of = prog ? o.arriving.of : inc ? got + o.missing.length : got;
    const exp = (o.expected || []).length ? o.expected : (o.reports || []).map(r => r[0]).concat(o.missing || []);
    const recv = {}; (o.reports || []).forEach(([k, v]) => { recv[k] = v; });
    const repRows = (prog || inc) ? exp.map(k => k in recv ? { k: reportKey(k), full: k, n: n(recv[k]), ink: 'var(--ink)', w: 400 } : prog ? { k: reportKey(k), full: k, n: 'waiting', ink: 'var(--ink-3)', w: 400 } : { k: reportKey(k), full: k, n: 'missing', ink: 'var(--attn)', w: 600 })
      : (o.reports || []).map(([k, v]) => ({ k: reportKey(k), full: k, n: empty ? '0' : n(v), ink: empty ? 'var(--attn)' : 'var(--ink)', w: 400 }));
    const failing = (o.failing || []).map(x => ({ short: `${shortSuite(x.suite)} › ${x.name}`, full: `${x.suite} › ${x.name}`, plat: x.platform }));
    /* v22 item 4: a private project's card never names a test. failing: [{n, status, platform, layer}] (no suite, no name) → "2 tests failed" over "node · API" */
    const pf = o.private ? (o.failing || []) : null;
    const exec = (o.reports || []).reduce((a, r) => a + r[1], 0);
    const subK = subParts.slice(1);
    return {
      st: S[status], hasRun: !!run, notReporting: !run,
      when: run ? run.when : '', whenInk: o.stale ? 'var(--attn)' : 'var(--ink-3)', branch: run ? run.branch : '', sha: run ? run.sha : '',
      shaLink: !!run && !o.private, shaPlain: !!run && !!o.private,
      name: o.name, private: !!o.private, tagline: o.tagline,
      total: run ? (empty ? '0' : n(fig.total)) : '', totalInk: empty ? 'var(--attn)' : 'var(--ink)', subParts,
      /* v23 item 2: in progress, a 44 px inset block under the total: "{got} of {of} reports received", "last {when}", one 8 px cell per expected report, then where the figures come from */
      arr: prog, arrHead: prog ? `${got} of ${qty(of, 'report')} received` : '', arrSide: prog ? `last ${o.arriving.last}` : '',
      arrCells: prog ? Array.from({ length: of }, (_, i) => ({ bg: i < got ? 'var(--ink-2)' : 'var(--line-strong)' })) : [],
      arrNote: prog && o.last ? `Figures are from the last complete run (${o.last.sha}, ${o.last.when}) until the rest arrive.` : '',
      /* v23 item 5: incomplete, the note names each missing report */
      /* v24 item 1: the note also says how many tests didn't run (from that report's latest copy); the overview now counts the run's own figures, so its last sentence is gone */
      missNote: inc ? `${andList(o.missing.map(k => missingName(k, exp)))} didn’t report, so its ${qty(fig.notRun || 0, 'test')} didn’t run. ${triggerWord(o.event || 'push')} runs expect ${qty(of, 'report')}; ${got} arrived within the ${o.limit || '1-hour'} limit, so this run is incomplete.` : '',
      nrBlock: !!nrBlock, nrHead: nrBlock ? nrBlock.head : '', nrBody: nrBlock ? nrBlock.body : '', stillRed,
      testTime: fig && fig.testTime && !empty && !prog ? `${fig.testTime} test time across ${qty((o.reports || []).length, 'report')}` : '', /* v24 item 9: Test time sits in the per-report block's foot */
      hasFailing: failed && failing.length > 0, failName: pf ? privFailHead(pf) : failing[0] ? failing[0].short : '', failFull: pf ? `${privFailHead(pf)} on ${privFailWhere(pf)}` : failing[0] ? failing[0].full : '', failPlat: pf ? privFailWhere(pf) : failing[0] ? failing[0].plat : '',
      failFont: pf ? "600 13px 'Public Sans',sans-serif" : "13px 'JetBrains Mono',monospace",
      hasMore: !pf && failing.length > 1, more: `+${failing.length - 1} more`,
      hasLayers: !!run && !empty && !!o.layers, kLayers: !!run && !empty && !failed && !!o.layers, layers: o.layers ? layers(o.layers) : [],
      kHead: empty ? 'tests executed' : 'tests', kRest: subK, metaInk: o.stale ? 'var(--attn)' : 'var(--ink-3)',
      emptyNote: empty ? 'Every report in this run arrived with no test results. An empty run is treated as a problem, not a pass, and isn’t counted in any total.' : '',
      hasCov: !!run && !empty && (o.cov || []).length > 0, noCov: !!run && !empty && !(o.cov || []).length, cov: (o.cov || []).slice().sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0).map(x => cov(...x)), /* v6 item 9: by module key */
      hasReports: !!run && (o.reports || []).length > 0, repHead: (prog || inc) ? `${got} of ${qty(of, 'report')} received` : `${qty((o.reports || []).length, 'report')} in this run`, repSide: platformSplit(empty ? (o.reports || []).map(([k]) => [k, 0]) : o.reports),
      reports: repRows,
      /* v22 item 11: where report counts meet the card's total, say which is which; only when they differ (v23: not while in progress, when the total is the last complete run's) */
      repFoot: !!run && !empty && !prog && !inc && !nr && exec !== run.total ? `Reports add up to ${qty(exec, 'execution')} of ${qty(run.total, 'distinct test')}. A test run on several platforms, or retried, counts once in the total.` : '',
      declared: Array.isArray(o.declared) ? declaredSummary(o.declared) : (o.declared || ''), health,
      frame: failed ? 'var(--fail)' : (o.stale || empty) ? 'var(--attn)' : 'var(--line)',
    };
  }
  /* RunFeedRow view-model. o: {status, title, project, branch, sha, total, failed, passed, dur, reports, when, private, isNew} */
  function row(o, showProject) {
    const st = S[o.status];
    /* v24 items 1, 6, 9: o.total is the project's Total; o.notRun the tests this run didn't run. "{ran} of {total} ran" when any didn't; the time is CI time */
    const ran = (o.total || 0) - (o.notRun || 0);
    let count = o.status === 'failed' ? `${n(o.failed)} failed` : o.status === 'empty' ? '0 tests' : o.notRun ? `${n(ran)} of ${n(o.total)} ran` : qty(o.total, 'test');
    let count2 = o.status === 'failed' ? `· ${n(o.passed)} of ${n(o.notRun ? ran : o.total)}` : o.status === 'empty' ? `· ${qty(o.reports, 'report')}` : `· ${o.ci || o.dur} CI time`;
    /* v23 items 3, 5: o.got/o.of while reports are still arriving; o.missingN once the limit passed. Never Passed until complete; Failed as soon as a failure has arrived */
    if (o.status === 'in_progress') { count = `${o.got} of ${qty(o.of, 'report')}`; count2 = `· ${qty(o.total, 'test')} so far`; }
    else if (o.status === 'failed' && o.of) { count = `${n(o.failed)} failed so far`; count2 = `· ${o.got} of ${qty(o.of, 'report')}`; }
    else if (o.status === 'incomplete') { count = `${qty(o.missingN, 'report')} missing`; count2 = o.notRun ? `· ${n(ran)} of ${n(o.total)} ran` : `· ${qty(o.total, 'test')}`; }
    else if (o.status === 'failed' && o.missingN) { count2 = `· ${qty(o.missingN, 'report')} missing`; }
    /* v22 item 8: a private run is titled like a public one (event and branch); the lock after the title says it is private */
    /* v24 item 6: o.scope says a trigger leaves suites out on purpose ("E2E not in scheduled runs"), in the meta. v24 item 13: o.attempt (2, 3…) adds an "Attempt {n}" tag after the title; attempt 1 is tagged only when a later attempt exists (o.attempts > 1) */
    const att = o.attempt && (o.attempt > 1 || o.attempts > 1) ? `Attempt ${o.attempt}` : '';
    return { st, title: o.title || runTitle(o.event || 'push', o.branch), hasTitle: true, private: !!o.private, project: o.project, showProject: showProject !== false,
      branch: o.branch, sha: o.sha, count, count2, scope: o.scope ? ` · ${o.scope}` : '', attempt: att, hasAttempt: !!att, countInk: o.status === 'failed' ? 'var(--fail)' : (o.status === 'empty' || o.status === 'incomplete') ? 'var(--attn)' : 'var(--ink)',
      countW: (o.status === 'passed' || o.status === 'in_progress') ? 400 : 600, kInk: (o.status === 'passed' || o.status === 'in_progress') ? 'var(--ink-2)' : o.status === 'failed' ? 'var(--fail)' : 'var(--attn)', when: o.when, isNew: !!o.isNew, bg: o.isNew ? 'var(--raised)' : 'transparent' };
  }
  const lum = h => { const q = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * q[0] + 0.7152 * q[1] + 0.0722 * q[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  /* Every required pair (README v2 item 2, v3 item 69). CI checks the same list. */
  function pairs(T) {
    const P = [];
    for (const f of ['ink', 'ink-2', 'ink-3']) for (const b of ['bg', 'surface', 'inset', 'raised']) P.push([f, b, 4.5]);
    for (const f of ['pass', 'fail', 'attn', 'neutral']) for (const b of ['bg', 'surface', 'inset', 'raised', f + '-tint']) P.push([f, b, 4.5]);
    P.push(['ink-3', 'pass-tint', 4.5], ['ink-3', 'fail-tint', 4.5], ['ink-2', 'fail-tint', 4.5], ['on-ink', 'fail', 4.5], ['on-ink', 'ink', 4.5]);
    P.push(['attn', 'surface', 3, 'graphic'], ['layer-4', 'surface', 3, 'graphic'], ['pass', 'surface', 3, 'graphic']);
    return P.map(([f, b, min, kind]) => { const r = ratio(T[f], T[b]); const ok = r >= min;
      return { label: `--${f} on --${b}` + (kind ? ' (graphic)' : ''), fg: T[f], bg: T[b], ratio: r.toFixed(2) + ':1', verdict: ok ? (min === 3 ? '3:1 ✓' : 'AA ✓') : 'FAIL', verdictColor: ok ? 'var(--pass)' : 'var(--fail)' }; });
  }
    /* v9 item 5/17: relative time from whole elapsed days D (0 = today, handled by the caller), date otherwise */
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const shortDate = (d, nowYear) => d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + (d.getUTCFullYear() === (nowYear || 2026) ? '' : ' ' + d.getUTCFullYear());
  const relDays = (D, d) => D === 1 ? '1 day ago' : D < 7 ? D + ' days ago' : D < 28 ? (D < 14 ? '1 week ago' : Math.floor(D / 7) + ' weeks ago') : shortDate(d); /* v24 item 14: "1 day ago", never "yesterday" */
  /* v24 item 14: relative time counts elapsed time, not UTC calendar days. ms = now − then. Under 1 min "just now"; under 1 h "{m} min ago"; under 24 h "{h} h ago"; 24–48 h "1 day ago"; then whole elapsed days (D = floor(ms / 24 h)) through relDays */
  const relTime = (ms, d) => { const m = Math.floor(ms / 60000), h = Math.floor(ms / 3600000); return m < 1 ? 'just now' : h < 1 ? m + ' min ago' : h < 24 ? h + ' h ago' : relDays(Math.floor(h / 24), d); };
  /* v13 item 6: run durations. <60 s "{s} s"; <60 min "{m}m {ss}s"; else "{h}h {mm}m". Whole seconds, rounded down. v21 item 12: under 1 s "<1 s", never "0 s". */
  /* v24 item 17: ONE rule for every duration (runs, reports, tests, charts), in seconds s: under 1 ms "<1 ms"; under 1 s "{ms} ms"; under 10 s one decimal, rounded down, ".0" dropped ("4.2 s", "4 s"); under 60 s whole seconds ("29 s"); under 60 min "{m}m {ss}s" ("5m 18s"); else "{h}h {mm}m". Replaces v21 item 12's "<1 s" and the test pages' "318.40 s". */
  const dur = s => { if (s < 0.001) return '<1 ms'; if (s < 1) return Math.floor(s * 1000) + ' ms'; if (s < 10) return String(Math.floor(s * 10) / 10) + ' s'; const t = Math.floor(s); if (t < 60) return t + ' s'; const p = x => String(x).padStart(2, '0'); if (t < 3600) return Math.floor(t / 60) + 'm ' + p(t % 60) + 's'; return Math.floor(t / 3600) + 'h ' + p(Math.floor(t % 3600 / 60)) + 'm'; };
  const runDur = ms => dur(ms / 1000);
  /* v21 item 8: where mono keys and names may wrap. A soft break (<wbr>) goes after every "/" and "."; for test names also between a lower-case letter or digit and the capital that follows it (camelCase). The " › " separator already breaks at its spaces. overflow-wrap:anywhere stays only as the last resort for a piece longer than the line. Returns plain pieces; pages turn each break into a <wbr> element. */
  const breakPieces = (s, camel) => String(s == null ? '' : s).split(camel ? /(?<=[\/.])|(?<=[a-z0-9])(?=[A-Z])/ : /(?<=[\/.])/);
window.TPKit = { dur, relTime, covPct, covTrend, triggerWord, sameSuite, missingName, andList, eventWord, reportKey, privFailHead, privFailWhere, breakPieces, runDur, down1, relDays, shortDate, DARK, LIGHT, themeVars, S, H, ORDER, TONE, NAME, layers, cov, card, row, pairs, ratio, n, runTitle, shortSuite, platformSplit, declaredSummary, qty };
})();
