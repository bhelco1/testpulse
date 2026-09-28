import type { Layer } from '../ingest/layer-rules';
import { LAYER_ORDER } from '../ingest/layer-rules';

// Which --layer-N token draws a layer. Fixed per spec section 8 layer, the same in every project
// and chart (design v3 item 67). Component and visual share a tone, as do integration and e2e;
// in section 8 order no two layers sharing a tone are neighbours.
export type LayerTone = 1 | 2 | 3 | 4;

export const LAYER_TONE: Readonly<Record<Layer, LayerTone>> = {
  unit: 1,
  component: 2,
  integration: 3,
  api: 4,
  visual: 2,
  e2e: 3,
};

export const LAYER_LABEL: Readonly<Record<Layer, string>> = {
  unit: 'Unit',
  component: 'Component',
  integration: 'Integration',
  api: 'API',
  visual: 'Visual',
  e2e: 'E2E',
};

export interface LayerSegment {
  label: string;
  count: number;
  tone: LayerTone;
}

// A run's test count per layer, as LayerBar and Pyramid take it: section 8 order, fixed tones.
export function layerSegments(counts: Partial<Record<Layer, number>>): LayerSegment[] {
  return LAYER_ORDER.flatMap((layer) => {
    const count = counts[layer];
    return count === undefined
      ? []
      : [{ label: LAYER_LABEL[layer], count, tone: LAYER_TONE[layer] }];
  });
}
