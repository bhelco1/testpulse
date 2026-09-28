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
  };
  const H = {
    healthy: { label: 'Reporting healthy', ink: 'var(--pass)', d: 'M20 6 9 17l-5-5', r: 0, dash: 'none' },
    stale: { label: 'No report in 12 days', ink: 'var(--attn)', d: 'M12 7v5l3 2', r: 10, dash: 'none' },
    empty: { label: 'Last run empty', ink: 'var(--attn)', d: 'M8 12h8', r: 10, dash: '3.5 3' },
    below_floor: { label: 'Coverage below floor', ink: 'var(--attn)', d: 'M12 5v14M6 13l6 6 6-6', r: 0, dash: 'none' },
    not_reporting: { label: 'Not reporting yet', ink: 'var(--neutral)', d: '', r: 10, dash: '3.5 3' },
  };
  const ORDER = ['unit', 'component', 'integration', 'api', 'visual', 'e2e'];
  const TONE = { unit: 'var(--layer-1)', component: 'var(--layer-2)', integration: 'var(--layer-3)', api: 'var(--layer-4)', visual: 'var(--layer-2)', e2e: 'var(--layer-3)' };
  const NAME = { unit: 'Unit', component: 'Component', integration: 'Integration', api: 'API', visual: 'Visual', e2e: 'E2E' };
  const n = v => Number(v).toLocaleString('en-US');
  const layers = obj => ORDER.filter(k => obj[k] != null).map(k => ({ key: k, label: NAME[k], count: obj[k], n: obj[k], countText: n(obj[k]), tone: TONE[k], bg: TONE[k] }));
  function cov(m, v, f) {
    const below = v < f;
    return { m, v: (v === 100 ? '100' : v.toFixed(1)) + '%', w: v + '%', fl: f + '%', below, ink: below ? 'var(--attn)' : 'var(--ink)', floorInk: below ? 'var(--attn)' : 'var(--ink-3)', floorLabel: below ? `below floor ${f}%` : `floor ${f}%` };
  }
  const part = (t, ink, w) => ({ t, ink: ink || 'inherit', w: w || 400 });
  /* v4 item 28: run titles from stored data only (event, branch). */
  function runTitle(event, branch) {
    return { push: `Push to ${branch}`, pull_request: `Pull request from ${branch}`, schedule: 'Scheduled run', workflow_dispatch: 'Manual run' }[event] || `Run on ${branch}`;
  }
  /* v4 item 20: suite shortening. Path-style keeps the last path segment; dotted class names keep the last dotted segment. */
  function shortSuite(s) { if (!s) return ''; return s.includes('/') ? s.split('/').pop() : s.split('.').pop(); }
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
    if (suites.length === 1) { const s = suites[0]; return s.count > 0 ? `Not counted: ${s.name} (${counts([s])}), ${PHRASE[s.status]}` : `Not counted: ${s.name}, ${PHRASE[s.status]}`; } /* v5 item 12: sync rejects count < 1; defensive fallback drops the brackets */
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
    const f = run && run.failed || 0;
    const subParts = !run ? [] : empty
      ? [part('tests executed ·'), part(`${qty(o.reports.length, 'report')} received`)]
      : [part('tests ·'), f ? part(`${f} failed`, 'var(--fail)', 600) : part('0 failed'), part('·'), part(`${run.skipped || 0} skipped ·`), part(run.dur)];
    const health = H[o.health || (!run ? 'not_reporting' : empty ? 'empty' : o.stale ? 'stale' : 'healthy')];
    const failing = (o.failing || []).map(x => ({ short: `${shortSuite(x.suite)} › ${x.name}`, full: `${x.suite} › ${x.name}`, plat: x.platform }));
    const subK = subParts.slice(1);
    return {
      st: S[status], hasRun: !!run, notReporting: !run,
      when: run ? run.when : '', whenInk: o.stale ? 'var(--attn)' : 'var(--ink-3)', branch: run ? run.branch : '', sha: run ? run.sha : '',
      shaLink: !!run && !o.private, shaPlain: !!run && !!o.private,
      name: o.name, private: !!o.private, tagline: o.tagline,
      total: run ? (empty ? '0' : n(run.total)) : '', totalInk: empty ? 'var(--attn)' : 'var(--ink)', subParts,
      hasFailing: failed && failing.length > 0, failName: failing[0] ? failing[0].short : '', failFull: failing[0] ? failing[0].full : '', failPlat: failing[0] ? failing[0].plat : '',
      hasMore: failing.length > 1, more: `+${failing.length - 1} more`,
      hasLayers: !!run && !empty && !!o.layers, kLayers: !!run && !empty && !failed && !!o.layers, layers: o.layers ? layers(o.layers) : [],
      kHead: empty ? 'tests executed' : 'tests', kRest: subK, metaInk: o.stale ? 'var(--attn)' : 'var(--ink-3)',
      emptyNote: empty ? 'Every report in this run arrived with no test results. An empty run is treated as a problem, not a pass, and isn’t counted in any total.' : '',
      hasCov: !!run && !empty && (o.cov || []).length > 0, noCov: !!run && !empty && !(o.cov || []).length, cov: (o.cov || []).map(x => cov(...x)),
      hasReports: !!run && (o.reports || []).length > 0, repHead: `${qty((o.reports || []).length, 'report')} in this run`, repSide: platformSplit(empty ? (o.reports || []).map(([k]) => [k, 0]) : o.reports),
      reports: (o.reports || []).map(([k, v]) => ({ k, n: empty ? '0' : n(v), ink: empty ? 'var(--attn)' : 'var(--ink)' })),
      declared: Array.isArray(o.declared) ? declaredSummary(o.declared) : (o.declared || ''), health,
      frame: failed ? 'var(--fail)' : (o.stale || empty) ? 'var(--attn)' : 'var(--line)',
    };
  }
  /* RunFeedRow view-model. o: {status, title, project, branch, sha, total, failed, passed, dur, reports, when, private, isNew} */
  function row(o, showProject) {
    const st = S[o.status];
    const count = o.status === 'failed' ? `${n(o.failed)} failed` : o.status === 'empty' ? '0 tests' : qty(o.total, 'test');
    const count2 = o.status === 'failed' ? `· ${n(o.passed)} of ${n(o.total)}` : o.status === 'empty' ? `· ${qty(o.reports, 'report')}` : `· ${o.dur}`;
    return { st, title: o.title || '', hasTitle: !o.private, private: !!o.private, project: o.project, showProject: showProject !== false,
      branch: o.branch, sha: o.sha, count, count2, countInk: o.status === 'failed' ? 'var(--fail)' : o.status === 'empty' ? 'var(--attn)' : 'var(--ink)',
      countW: o.status === 'passed' ? 400 : 600, kInk: o.status === 'passed' ? 'var(--ink-2)' : o.status === 'failed' ? 'var(--fail)' : 'var(--attn)', when: o.when, isNew: !!o.isNew, bg: o.isNew ? 'var(--raised)' : 'transparent' };
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
  window.TPKit = { DARK, LIGHT, themeVars, S, H, ORDER, TONE, NAME, layers, cov, card, row, pairs, ratio, n, runTitle, shortSuite, platformSplit, declaredSummary, qty };
})();
