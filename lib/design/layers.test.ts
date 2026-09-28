import { describe, expect, it } from 'vitest';

import { LAYER_ORDER } from '../ingest/layer-rules';
import { LAYER_LABEL, LAYER_TONE, layerSegments } from './layers';

describe('LAYER_TONE', () => {
  it('fixes one tone per spec section 8 layer, the same in every project (v3 item 67)', () => {
    expect(LAYER_TONE).toEqual({
      unit: 1,
      component: 2,
      integration: 3,
      api: 4,
      visual: 2,
      e2e: 3,
    });
  });

  it('never gives two neighbouring layers in section 8 order the same tone', () => {
    const tones = LAYER_ORDER.map((layer) => LAYER_TONE[layer]);
    tones.slice(1).forEach((tone, i) => expect(tone).not.toBe(tones[i]));
  });
});

describe('LAYER_LABEL', () => {
  it('names each layer as the design does', () => {
    expect(LAYER_ORDER.map((layer) => LAYER_LABEL[layer])).toEqual([
      'Unit',
      'Component',
      'Integration',
      'API',
      'Visual',
      'E2E',
    ]);
  });
});

describe('layerSegments', () => {
  it("builds Ostomate2's bar in section 8 order with each layer's fixed tone", () => {
    expect(layerSegments({ visual: 10, unit: 103, integration: 29 })).toEqual([
      { label: 'Unit', count: 103, tone: 1 },
      { label: 'Integration', count: 29, tone: 3 },
      { label: 'Visual', count: 10, tone: 2 },
    ]);
  });

  it("builds RouteServe's bar, api on the fourth tone", () => {
    expect(layerSegments({ api: 269, unit: 608, integration: 3, component: 165 })).toEqual([
      { label: 'Unit', count: 608, tone: 1 },
      { label: 'Component', count: 165, tone: 2 },
      { label: 'Integration', count: 3, tone: 3 },
      { label: 'API', count: 269, tone: 4 },
    ]);
  });

  it('leaves out layers with no count and keeps a layer counted as zero', () => {
    expect(layerSegments({})).toEqual([]);
    expect(layerSegments({ e2e: 0 })).toEqual([{ label: 'E2E', count: 0, tone: 3 }]);
  });
});
