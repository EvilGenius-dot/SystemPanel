import type { Sample } from './types';

export function percent(used: number, total: number): number {
  return total > 0 && Number.isFinite(used) && Number.isFinite(total)
    ? Math.min(100, Math.max(0, used / total * 100)) : 0;
}
export function bytes(value: number, decimals = 1): string {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value < 1024) return `${Math.round(value)} B`;
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** exponent).toFixed(decimals)} ${units[exponent]}`;
}
export function uptime(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  return days ? `${days} 天 ${hours % 24} 小时` : hours ? `${hours} 小时 ${minutes % 60} 分` : `${minutes} 分钟`;
}
export function chartPoints(history: Sample[], now: number, width = 340, height = 62): string {
  return history.filter(p => p.timestamp >= now - 120_000 && p.timestamp <= now)
    .map(p => `${(((p.timestamp - (now - 120_000)) / 120_000) * width).toFixed(2)},${(height - Math.min(100, Math.max(0, p.usage)) / 100 * height).toFixed(2)}`)
    .join(' ');
}
