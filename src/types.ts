export interface Sample { timestamp: number; usage: number }
export interface DiskInfo {
  name: string;
  mount: string;
  total: number;
  available: number;
  removable: boolean;
  system: boolean;
}
export interface Snapshot {
  timestamp: number;
  cpuUsage: number;
  cpuBrand: string;
  cores: number[];
  physicalCores: number | null;
  memoryTotal: number;
  memoryUsed: number;
  swapTotal: number;
  swapUsed: number;
  disks: DiskInfo[];
  history: Sample[];
  uptime: number;
  os: string;
  host: string;
}
export type RefreshInterval = 1 | 2 | 5;
export type Theme = 'system' | 'light' | 'dark';
export interface Preferences { interval: RefreshInterval; theme: Theme }
export interface PanelState {
  snapshot: Snapshot | null;
  pinned: boolean;
  interval: RefreshInterval;
  error: string | null;
}
