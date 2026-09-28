# Contrast pairs (v3)

Generated from `tokens.css` with the WCAG 2.x relative-luminance formula, rounded to 2 decimals. The Design System page computes the same list live, and the CI check must require exactly these pairs. Text pairs need ≥ 4.5:1; graphics ≥ 3:1.

v3 adds: `--ink-3` on `--pass-tint` and `--fail-tint` (new-row meta, expanded-row suite text), `--on-ink` on `--fail` (✕ and ! in failed and error timeline cells).

## Dark

| Foreground | Background | Ratio | Required |
|---|---|---|---|
| --ink | --bg | 15.60:1 | 4.5:1 |
| --ink | --surface | 14.53:1 | 4.5:1 |
| --ink | --inset | 15.22:1 | 4.5:1 |
| --ink | --raised | 13.59:1 | 4.5:1 |
| --ink-2 | --bg | 11.46:1 | 4.5:1 |
| --ink-2 | --surface | 10.67:1 | 4.5:1 |
| --ink-2 | --inset | 11.19:1 | 4.5:1 |
| --ink-2 | --raised | 9.99:1 | 4.5:1 |
| --ink-3 | --bg | 7.44:1 | 4.5:1 |
| --ink-3 | --surface | 6.93:1 | 4.5:1 |
| --ink-3 | --inset | 7.26:1 | 4.5:1 |
| --ink-3 | --raised | 6.49:1 | 4.5:1 |
| --pass | --bg | 10.86:1 | 4.5:1 |
| --pass | --surface | 10.11:1 | 4.5:1 |
| --pass | --inset | 10.60:1 | 4.5:1 |
| --pass | --raised | 9.46:1 | 4.5:1 |
| --pass | --pass-tint | 8.61:1 | 4.5:1 |
| --fail | --bg | 7.83:1 | 4.5:1 |
| --fail | --surface | 7.29:1 | 4.5:1 |
| --fail | --inset | 7.64:1 | 4.5:1 |
| --fail | --raised | 6.82:1 | 4.5:1 |
| --fail | --fail-tint | 6.39:1 | 4.5:1 |
| --attn | --bg | 9.76:1 | 4.5:1 |
| --attn | --surface | 9.09:1 | 4.5:1 |
| --attn | --inset | 9.53:1 | 4.5:1 |
| --attn | --raised | 8.51:1 | 4.5:1 |
| --attn | --attn-tint | 7.61:1 | 4.5:1 |
| --neutral | --bg | 8.46:1 | 4.5:1 |
| --neutral | --surface | 7.88:1 | 4.5:1 |
| --neutral | --inset | 8.26:1 | 4.5:1 |
| --neutral | --raised | 7.38:1 | 4.5:1 |
| --neutral | --neutral-tint | 7.03:1 | 4.5:1 |
| --ink-3 | --pass-tint | 5.90:1 | 4.5:1 |
| --ink-3 | --fail-tint | 6.07:1 | 4.5:1 |
| --ink-2 | --fail-tint | 9.35:1 | 4.5:1 |
| --on-ink | --fail | 7.83:1 | 4.5:1 |
| --on-ink | --ink | 15.60:1 | 4.5:1 |
| --attn (graphic) | --surface | 9.09:1 | 3:1 |
| --layer-4 (graphic) | --surface | 3.27:1 | 3:1 |
| --pass (graphic) | --surface | 10.11:1 | 3:1 |

Lowest text pair: --ink-3 on --pass-tint, 5.90:1.

## Light

| Foreground | Background | Ratio | Required |
|---|---|---|---|
| --ink | --bg | 15.81:1 | 4.5:1 |
| --ink | --surface | 17.36:1 | 4.5:1 |
| --ink | --inset | 15.27:1 | 4.5:1 |
| --ink | --raised | 14.22:1 | 4.5:1 |
| --ink-2 | --bg | 9.22:1 | 4.5:1 |
| --ink-2 | --surface | 10.13:1 | 4.5:1 |
| --ink-2 | --inset | 8.91:1 | 4.5:1 |
| --ink-2 | --raised | 8.30:1 | 4.5:1 |
| --ink-3 | --bg | 5.42:1 | 4.5:1 |
| --ink-3 | --surface | 5.96:1 | 4.5:1 |
| --ink-3 | --inset | 5.24:1 | 4.5:1 |
| --ink-3 | --raised | 4.88:1 | 4.5:1 |
| --pass | --bg | 5.38:1 | 4.5:1 |
| --pass | --surface | 5.91:1 | 4.5:1 |
| --pass | --inset | 5.20:1 | 4.5:1 |
| --pass | --raised | 4.84:1 | 4.5:1 |
| --pass | --pass-tint | 5.11:1 | 4.5:1 |
| --fail | --bg | 5.95:1 | 4.5:1 |
| --fail | --surface | 6.54:1 | 4.5:1 |
| --fail | --inset | 5.75:1 | 4.5:1 |
| --fail | --raised | 5.35:1 | 4.5:1 |
| --fail | --fail-tint | 5.53:1 | 4.5:1 |
| --attn | --bg | 5.40:1 | 4.5:1 |
| --attn | --surface | 5.93:1 | 4.5:1 |
| --attn | --inset | 5.21:1 | 4.5:1 |
| --attn | --raised | 4.85:1 | 4.5:1 |
| --attn | --attn-tint | 5.24:1 | 4.5:1 |
| --neutral | --bg | 6.41:1 | 4.5:1 |
| --neutral | --surface | 7.05:1 | 4.5:1 |
| --neutral | --inset | 6.20:1 | 4.5:1 |
| --neutral | --raised | 5.77:1 | 4.5:1 |
| --neutral | --neutral-tint | 5.98:1 | 4.5:1 |
| --ink-3 | --pass-tint | 5.15:1 | 4.5:1 |
| --ink-3 | --fail-tint | 5.04:1 | 4.5:1 |
| --ink-2 | --fail-tint | 8.58:1 | 4.5:1 |
| --on-ink | --fail | 5.95:1 | 4.5:1 |
| --on-ink | --ink | 15.81:1 | 4.5:1 |
| --attn (graphic) | --surface | 5.93:1 | 3:1 |
| --layer-4 (graphic) | --surface | 3.47:1 | 3:1 |
| --pass (graphic) | --surface | 5.91:1 | 3:1 |

Lowest text pair: --pass on --raised, 4.84:1.

