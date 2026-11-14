import { describe, expect, it } from 'vitest';
import { bytes, chartPoints, percent, uptime } from './format';

describe('system metric formatting', () => {
  it('uses binary units consistently and preserves unknown values', () => {
    expect(bytes(0)).toBe('0 B');
    expect(bytes(1024)).toBe('1.0 KiB');
    expect(bytes(1024 ** 2)).toBe('1.0 MiB');
    expect(bytes(16 * 1024 ** 3, 0)).toBe('16 GiB');
    expect(bytes(NaN)).toBe('—');
    expect(bytes(-1)).toBe('—');
  });
  it('bounds meters when capacities are missing or inconsistent', () => {
    expect(percent(50, 100)).toBe(50);
    expect(percent(10, 0)).toBe(0);
    expect(percent(110, 100)).toBe(100);
    expect(percent(-10, 100)).toBe(0);
    expect(percent(NaN, 100)).toBe(0);
  });
  it('places chart samples by time even after refresh interval changes', () => {
    expect(chartPoints([
      { timestamp: 0, usage: 10 },
      { timestamp: 120_000, usage: 50 },
      { timestamp: 125_000, usage: 100 },
      { timestamp: 126_000, usage: 0 },
    ], 125_000, 120, 100)).toBe('115.00,50.00 120.00,0.00');
  });
  it('formats long uptime without wrapping at 24 hours', () => {
    expect(uptime(183420)).toBe('2 天 2 小时');
    expect(uptime(3600)).toBe('1 小时 0 分');
    expect(uptime(59)).toBe('0 分钟');
  });
});
