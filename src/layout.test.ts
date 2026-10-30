import { describe, it, expect } from 'vitest';
import { layoutCity, spiral, heightOf, healthOf } from './layout';
const A = (id: string, platform: string, i = 0) => ({ id, name: id, platform, status: 'ok' as const, first_seen: new Date(1e12 + i).toISOString() });
describe('layoutCity', () => {
  it('groups by platform into stable districts, unknown -> custom', () => {
    const d = layoutCity([A('a', 'openai', 2), A('b', 'claude', 1), A('c', 'openai', 3), A('z', 'weird', 4)]);
    expect(d.map((x) => x.platform)).toEqual(['claude', 'openai', 'custom']);
    expect(d[1].lots.map((l) => [l.gx, l.gy])).toEqual([[0, 0], [1, 0]]);
    expect(new Set(d.map((x) => `${x.bx},${x.by}`)).size).toBe(3);
  });
  it('overflows past 9 lots', () => {
    const d = layoutCity(Array.from({ length: 12 }, (_, i) => A('n' + i, 'n8n', i)));
    expect(d[0].lots).toHaveLength(9); expect(d[0].overflow).toBe(3);
  });
  it('spiral never hits the plaza and is unique', () => {
    const s = spiral(30); expect(s.some(([x, y]) => x === 0 && y === 0)).toBe(false);
    expect(new Set(s.map(String)).size).toBe(30);
  });
  it('height grows with activity, capped', () => {
    expect(heightOf({ ...A('a', 'x'), activity: 50 })).toBeGreaterThan(heightOf({ ...A('a', 'x'), activity: 1 }));
    expect(heightOf({ ...A('a', 'x'), activity: 1e9 })).toBeLessThanOrEqual(150);
  });
  it('health from updated_at', () => {
    const now = Date.now();
    expect(healthOf({ ...A('a', 'x'), updated_at: new Date(now - 1000).toISOString() }, now)).toBe('live');
    expect(healthOf({ ...A('a', 'x') }, now)).toBe('offline');
  });
});
