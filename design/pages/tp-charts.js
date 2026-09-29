/* testpulse TrendChart — canonical chart for the design bundle.
   Drawn in real pixels from the measured container width (no viewBox scaling), the way Recharts lays out:
   text sizes are fixed (axis 12px, end labels 13px/600, tooltip 13px) at every width.
   Props: kind 'line'|'bar', series [{name, values, dashed}], labels [x label per point], floor, marks [{index,status}],
   format 'pct'|'int'|'sec'|'dur', zero (y from 0), height, ariaLabel, loading, error, onRetry, unit ('run'|'day').
   v5: one counting rule (latest = "Latest", point i = n−1−i ago; axis, tooltip and table agree); whole-number steps for
   int/dur; all-zero domain 0…1; no repeated x labels; "1 run ago"; right margin fits the end labels; in-chart error state. */
(function () {
  const R = new Proxy({}, { get: (_, k) => window.React[k] }); /* React may load after this script */
  const h = (...a) => window.React.createElement(...a);
  const fmtFor = f => f === 'pct' ? (v, e) => (e ? v.toFixed(1) : String(Math.round(v * 10) / 10)) + '%'
    : f === 'sec' ? (v, e) => (e ? v.toFixed(2) : String(+v.toFixed(2))) + ' s'
    : f === 'dur' ? v => Math.round(v) + ' s'
    : v => Math.round(v).toLocaleString('en-US');
  const ago = (k, unit) => k === 0 ? 'Latest' : k + (unit === 'day' ? (k === 1 ? ' day ago' : ' days ago') : (k === 1 ? ' run ago' : ' runs ago'));
  let mctx = null;
  const textW = (t, f) => { mctx = mctx || document.createElement('canvas').getContext('2d'); mctx.font = f; return mctx.measureText(t).width; };
  function nice(lo, hi, count, pct, whole, zero) {
    if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
    if (hi === lo) { if (zero || lo === 0) { lo = Math.max(0, lo); hi = lo + 1; } else { hi = lo + 1; lo = lo - 1; } }
    const raw = (hi - lo) / count, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    let step = (whole ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10]).map(m => m * mag).find(s => s >= raw) || 10 * mag;
    if (whole) step = Math.max(1, Math.round(step));
    let a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
    if (pct) { a = Math.max(0, a); b = Math.min(100, b); }
    const t = []; if (!(step > 0)) return { min: a, max: b, ticks: [a, b] }; for (let v = a, g = 0; v <= b + 1e-9 && g < 20; v += step, g++) t.push(+v.toFixed(6));
    return { min: a, max: b, ticks: t };
  }
  function useWidth(ref) {
    const [w, setW] = R.useState(0);
    R.useLayoutEffect(() => {
      const el = ref.current; if (!el) return;
      let last = -1, raf = 0;
      const read = () => { const v = Math.floor(el.getBoundingClientRect().width); if (Math.abs(v - last) >= 2) { last = v; setW(v); } };
      const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(read); });
      ro.observe(el); read();
      return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    }, []);
    return w;
  }
  const font = "'Public Sans',system-ui,sans-serif";
  function Frame(props, H, inner) {
    return h('div', { style: { position: 'relative', height: H, borderRadius: 12, display: 'grid', placeItems: 'center', background: props.loading ? 'var(--raised)' : 'transparent', border: props.loading ? 'none' : '1px dashed var(--line-strong)', animation: props.loading ? 'tpShimmer 1.6s ease-in-out infinite' : 'none' } }, inner);
  }
  function Trend(props) {
    const ref = R.useRef(null);
    const W = useWidth(ref);
    const [hover, setHover] = R.useState(props.initialHover ?? null);
    const [table, setTable] = R.useState(!!props.initialTable);
    const phone = W > 0 && W < 560;
    const H = props.height || (phone ? 200 : 250);
    const series = props.series || [];
    const n = series.length ? series[0].values.length : 0;
    const f = fmtFor(props.format);
    const labels = props.labels || [];
    let body;
    if (props.error) body = h('div', { role: 'alert', style: { height: H, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '0 16px', textAlign: 'center', borderRadius: 12, background: 'var(--inset)', border: '1px solid var(--line)' } },
      h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'var(--fail)', strokeWidth: 2.6, strokeLinecap: 'round', style: { marginBottom: 6 } }, h('circle', { cx: 12, cy: 12, r: 10 }), h('path', { d: 'M12 7v6M12 17h.01' })),
      h('span', { style: { font: "500 20px 'Source Serif 4',serif", color: 'var(--ink)' } }, 'Chart couldn’t be loaded'),
      h('span', { style: { font: '14px ' + font, color: 'var(--ink-2)' } }, 'The rest of the page is still current.'),
      h('button', { onClick: props.onRetry, style: { marginTop: 8, /* + gap 4 = 12 below the message (v6 item 6) */ minHeight: 44, padding: '0 16px', borderRadius: 10, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)', font: '600 15px ' + font, cursor: 'pointer' } }, 'Try again'));
    else if (props.loading) body = Frame(props, H, h('span', { style: { font: '14px ' + font, color: 'var(--ink-3)' } }, 'Loading chart…'));
    else if (n === 0) body = Frame(props, H, h('span', { style: { font: '14px ' + font, color: 'var(--ink-3)' } }, 'No runs yet'));
    else if (n === 1) {
      const v = series[0].values[0];
      body = h('div', { style: { height: H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 12, border: '1px dashed var(--line-strong)' } },
        h('span', { style: { font: '600 13px ' + font, color: 'var(--ink)' } }, f(v, true)),
        h('span', { style: { width: 9, height: 9, borderRadius: '50%', background: 'var(--ink)' } }),
        h('span', { style: { font: '14px ' + font, color: 'var(--ink-2)', textAlign: 'center', padding: '0 16px' } }, 'One run so far. The trend appears after the next run.'));
    } else if (W > 0) {
      const bar = props.kind === 'bar';
      const bar0 = props.kind === 'bar';
      const endW = bar0 ? 0 : Math.max(...series.map(s => textW(f(s.values[n - 1], true), '600 13px ' + font)));
      const L = phone ? 44 : 56, Rr = Math.max(phone ? 44 : 60, Math.ceil(8 + endW + 6)), T = 22, B = 30;
      const all = series.flatMap(s => s.values).concat(props.floor != null ? [props.floor] : []);
      const zero = bar || props.zero;
      const pct = props.format === 'pct';
      let lo = zero ? 0 : Math.min(...all), hi = Math.max(...all);
      if (!zero) { const pad = Math.max((hi - lo) * 0.12, pct ? 1 : (hi || 1) * 0.02); lo -= pad; hi += pad; }
      const dom = nice(lo, hi, phone ? 2 : 3, pct, props.format === 'int' || props.format === 'dur', zero);
      const X = bar ? (i => L + (i + 0.5) * (W - L - Rr) / n) : (i => L + i * (W - L - Rr) / (n - 1));
      const Y = v => T + (dom.max - v) / (dom.max - dom.min) * (H - T - B);
      const k = [];
      dom.ticks.forEach(t => {
        k.push(h('line', { key: 'g' + t, x1: L, x2: W - Rr, y1: Y(t), y2: Y(t), stroke: 'var(--line)' }));
        k.push(h('text', { key: 't' + t, x: L - 8, y: Y(t) + 4, textAnchor: 'end', fill: 'var(--ink-3)', fontSize: 12 }, f(t)));
      });
      if (props.floor != null) {
        k.push(h('line', { key: 'fl', x1: L, x2: W - Rr, y1: Y(props.floor), y2: Y(props.floor), stroke: 'var(--attn)', strokeWidth: 1.5, strokeDasharray: '5 4' }));
        k.push(h('text', { key: 'flt', x: L + 6, y: Y(props.floor) - 6, fill: 'var(--attn)', fontSize: 12, fontWeight: 600 }, 'floor ' + f(props.floor)));
      }
      if (bar) {
        const bw = Math.max(2, (W - L - Rr) / n * 0.62);
        series[0].values.forEach((v, i) => k.push(h('rect', { key: 'b' + i, x: X(i) - bw / 2, y: Y(v), width: bw, height: Math.max(0, Y(0) - Y(v)), rx: 2, fill: hover === i ? 'var(--ink)' : 'var(--layer-2)' })));
      } else {
        series.forEach((s, si) => {
          k.push(h('polyline', { key: 'l' + si, points: s.values.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' '), fill: 'none', stroke: si ? 'var(--ink-3)' : 'var(--ink)', strokeWidth: si ? 2 : 2.5, strokeDasharray: s.dashed || si ? '6 4' : 'none', strokeLinejoin: 'round', strokeLinecap: 'round' }));
          if (n <= 12 && !phone) s.values.forEach((v, i) => { if (i > 0 && i < n - 1) k.push(h('circle', { key: 'd' + si + i, cx: X(i), cy: Y(v), r: 3, fill: 'var(--surface)', stroke: si ? 'var(--ink-3)' : 'var(--ink)', strokeWidth: 1.5 })); });
          k.push(h('circle', { key: 'e' + si, cx: X(n - 1), cy: Y(s.values[n - 1]), r: 4.5, fill: si ? 'var(--ink-3)' : 'var(--ink)' }));
          k.push(h('text', { key: 'ev' + si, x: X(n - 1) + 8, y: Y(s.values[n - 1]) + 4, fill: 'var(--ink)', fontSize: 13, fontWeight: 600 }, f(s.values[n - 1], true)));
          if (si === 0) {
            k.push(h('circle', { key: 's0', cx: X(0), cy: Y(s.values[0]), r: 4.5, fill: 'var(--ink)' }));
            k.push(h('text', { key: 'sv', x: X(0) + 8, y: Y(s.values[0]) + (Y(s.values[0]) > H - B - 20 ? -10 : 18), fill: 'var(--ink)', fontSize: 13, fontWeight: 600 }, f(s.values[0], true)));
          }
        });
        (props.marks || []).forEach(m => { const v = series[0].values[m.index]; k.push(h('rect', { key: 'm' + m.index, x: X(m.index) - 4, y: Y(v) - 4, width: 8, height: 8, fill: m.status === 'fail' ? 'var(--fail)' : 'var(--attn)', stroke: 'var(--surface)', strokeWidth: 2 })); });
      }
      const xi = Array.from(new Set(phone || !labels.length ? [0, n - 1] : [0, Math.round((n - 1) / 3), Math.round((n - 1) * 2 / 3), n - 1]));
      xi.forEach((i, j) => k.push(h('text', { key: 'x' + j, x: X(i), y: H - 8, textAnchor: j === 0 ? 'start' : (j === xi.length - 1 ? 'end' : 'middle'), fill: 'var(--ink-3)', fontSize: 12 }, labels[i] || ago(n - 1 - i, props.unit))));
      if (hover != null) {
        k.push(h('line', { key: 'hv', x1: X(hover), x2: X(hover), y1: T - 6, y2: H - B, stroke: 'var(--line-strong)' }));
        if (!bar) series.forEach((s, si) => k.push(h('circle', { key: 'hd' + si, cx: X(hover), cy: Y(s.values[hover]), r: 5, fill: 'var(--surface)', stroke: si ? 'var(--ink-3)' : 'var(--ink)', strokeWidth: 2 })));
      }
      const pick = e => { const r = e.currentTarget.getBoundingClientRect(); const x = e.clientX - r.left; let best = 0, bd = 1e9; for (let i = 0; i < n; i++) { const d = Math.abs(X(i) - x); if (d < bd) { bd = d; best = i; } } setHover(best); };
      const key = e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setHover(v => Math.max(0, Math.min(n - 1, (v == null ? n - 1 : v) + (e.key === 'ArrowRight' ? 1 : -1)))); } if (e.key === 'Escape') setHover(null); };
      const svg = h('svg', { width: W, height: H, tabIndex: 0, role: 'img', 'aria-label': props.ariaLabel, onPointerMove: pick, onPointerLeave: () => setHover(props.initialHover ?? null), onFocus: () => setHover(n - 1), onBlur: () => setHover(props.initialHover ?? null), onKeyDown: key, style: { display: 'block', fontFamily: font, fontVariantNumeric: 'tabular-nums', outline: 'none', touchAction: 'pan-y' } }, k);
      let tip = null;
      if (hover != null) {
        const left = Math.min(Math.max(X(hover) - 90, 0), W - 180);
        tip = h('div', { role: 'status', style: { position: 'absolute', left, top: 0, width: 180, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12, background: 'var(--raised)', border: '1px solid var(--line-strong)', boxShadow: 'var(--shadow-menu)', font: '13px ' + font, pointerEvents: 'none' } },
          h('div', { style: { color: 'var(--ink-3)', fontSize: 12 } }, labels[hover] || ago(n - 1 - hover, props.unit)),
          series.map((s, si) => h('div', { key: si, style: { display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 } }, h('span', { style: { color: 'var(--ink-2)' } }, s.name), h('b', { style: { fontWeight: 600, color: 'var(--ink)' } }, f(s.values[hover], true)))),
          (props.marks || []).filter(m => m.index === hover).map(m => h('div', { key: 'mk', style: { marginTop: 4, color: m.status === 'fail' ? 'var(--fail)' : 'var(--attn)', fontWeight: 600 } }, m.status === 'fail' ? 'Run failed' : 'Run empty')));
      }
      body = h('div', { style: { position: 'relative' } }, svg, tip);
    } else body = h('div', { style: { height: H } });
    const legend = series.length > 1 ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginBottom: 10, font: '13px ' + font, color: 'var(--ink-2)' } },
      series.map((s, si) => h('span', { key: si, style: { display: 'flex', alignItems: 'center', gap: 8 } }, h('span', { style: { width: 20, height: 0, borderTop: (si ? '2px dashed var(--ink-3)' : '2.5px solid var(--ink)') } }), s.name))) : null;
    const canTable = n > 1 && !props.loading && !props.error;
    const btn = canTable ? h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: 8 } }, h('button', { onClick: () => setTable(t => !t), 'aria-expanded': table, style: { minHeight: 44, padding: '0 14px', borderRadius: 10, border: '1px solid var(--line-strong)', background: 'none', color: 'var(--ink)', font: '500 14px ' + font, cursor: 'pointer' } }, table ? 'Hide table' : 'Show table')) : null;
    const tbl = table && canTable ? h('div', { style: { maxHeight: 320, overflow: 'auto', marginTop: 8, border: '1px solid var(--line)', borderRadius: 12 } },
      h('table', { style: { width: '100%', borderCollapse: 'collapse', font: '14px ' + font, fontVariantNumeric: 'tabular-nums' } },
        h('thead', null, h('tr', null, [h('th', { key: 'x', style: th }, props.unit === 'day' ? 'Day (UTC)' : 'Run')].concat(series.map((s, si) => h('th', { key: si, style: Object.assign({}, th, { textAlign: 'right' }) }, s.name))))),
        h('tbody', null, Array.from({ length: n }, (_, i) => n - 1 - i).map(i => h('tr', { key: i }, [h('td', { key: 'x', style: td }, labels[i] || ago(n - 1 - i, props.unit))].concat(series.map((s, si) => h('td', { key: si, style: Object.assign({}, td, { textAlign: 'right', fontWeight: 600 }) }, f(s.values[i], true))))))))) : null;
    return h('div', { ref, style: { width: '100%', minWidth: 0 } }, legend, body, btn, tbl);
  }
  const th = { position: 'sticky', top: 0, background: 'var(--surface)', textAlign: 'left', padding: '10px 14px', borderBottom: '1px solid var(--line)', font: "600 12px 'JetBrains Mono',monospace", letterSpacing: '.04em', color: 'var(--ink-3)' };
  const td = { padding: '8px 14px', borderBottom: '1px solid var(--line)', color: 'var(--ink)' };
  window.TPCharts = { Trend };
})();
