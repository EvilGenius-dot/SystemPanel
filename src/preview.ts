import type { Snapshot } from './types';

// Browser preview only. Desktop IPC never falls back to these values.
export function previewSnapshot(): Snapshot {
  const timestamp = Date.now();
  const wave = (t: number) => 21 + Math.sin(t / 9) * 8 + Math.cos(t / 3.7) * 5;
  const cpuUsage = wave(timestamp / 1000);
  return {
    timestamp, cpuUsage, cpuBrand: 'Apple M 系列 · 示例设备',
    cores: [31, 26, 42, 18, 12, 9, 28, 34], physicalCores: 8,
    memoryTotal: 16 * 1024 ** 3, memoryUsed: 9.2 * 1024 ** 3,
    swapTotal: 1024 ** 3, swapUsed: 0,
    disks: [{ name: 'Macintosh HD', mount: '/', total: 460 * 1024 ** 3, available: 184 * 1024 ** 3, removable: false, system: true }],
    history: Array.from({ length: 61 }, (_, i) => ({ timestamp: timestamp - (60 - i) * 2000, usage: wave(timestamp / 1000 - (60 - i) * 2) })),
    uptime: 183420, os: 'macOS · 示例', host: '我的电脑',
  };
}
