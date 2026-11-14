import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowDownToLine, Check, ChevronDown, Cpu, HardDrive, Laptop, MemoryStick, Minus, Monitor, Moon, Pin, Power, Settings2, ShieldCheck, Sun, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { bytes, chartPoints, percent, uptime } from './format';
import { desktop, useMonitor } from './useMonitor';
import type { RefreshInterval, Theme } from './types';

function Meter({ value, label, tone = '' }: { value: number; label: string; tone?: string }) {
  return <div className={`meter ${tone}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
    <span style={{ width: `${value}%` }} />
  </div>;
}

function Ring({ value, tone = '' }: { value: number; tone?: string }) {
  return <svg viewBox="0 0 48 48" className={`ring ${tone}`} aria-hidden="true">
    <circle cx="24" cy="24" r="23" className="ring-ticks" strokeDasharray=".7 3.31" />
    <circle cx="24" cy="24" r="19" className="ring-track" />
    <circle cx="24" cy="24" r="19" className="ring-value" strokeDasharray={`${value * 1.194} 119.4`} />
  </svg>;
}

export default function App() {
  const monitor = useMonitor();
  const { snapshot: data, error, stale, pinned, preferences } = monitor;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quitError, setQuitError] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const cpu = data?.cpuUsage ?? 0;
  const memory = data ? percent(data.memoryUsed, data.memoryTotal) : 0;
  const busy = cpu >= 85 || memory >= 90;
  const points = data ? chartPoints(data.history, data.timestamp) : '';

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (settingsOpen) { setSettingsOpen(false); settingsButton.current?.focus(); }
        else void monitor.hide();
      }
    }
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [settingsOpen, monitor.hide]);

  useEffect(() => {
    if (!settingsOpen) return;
    settingsRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function outside(event: PointerEvent) {
      if (!settingsRef.current?.contains(event.target as Node) && !settingsButton.current?.contains(event.target as Node)) setSettingsOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [settingsOpen]);

  async function quit() {
    try { await invoke('quit_app'); }
    catch { setQuitError(true); }
  }

  return <main className={`panel ${desktop ? 'desktop' : 'preview'}`}>
    <header className="header">
      <div className="brand"><div className="brand-icon"><Activity size={20} strokeWidth={2.2} /></div>
        <div><h1>SystemPanel<span className="brand-dot">.</span></h1><p>PERSONAL SYSTEM MONITOR</p></div>
      </div>
      <div className="header-actions">
        <button className={`icon-button ${pinned ? 'active' : ''}`} title={pinned ? '取消固定面板' : '固定面板'} aria-label={pinned ? '取消固定面板' : '固定面板'} aria-pressed={pinned} onClick={() => void monitor.togglePin()}><Pin size={15} /></button>
        <button ref={settingsButton} className={`icon-button ${settingsOpen ? 'active' : ''}`} title="设置" aria-label="设置" aria-expanded={settingsOpen} aria-controls="settings" onClick={() => setSettingsOpen(v => !v)}><Settings2 size={16} /></button>
        {desktop && <button className="icon-button" title="收起面板 · Esc" aria-label="收起面板" onClick={() => void monitor.hide()}><Minus size={17} /></button>}
      </div>
    </header>

    {!desktop && <div className="preview-notice"><Monitor size={13} /> 浏览器预览 · 以下为示例数据</div>}

    <div className="content">
      <div className="device-line">
        <span className="device-name" title={data?.host}><Laptop size={14} /> {data?.host ?? '正在连接设备'}</span>
        <span className={`live-label ${busy || stale || error ? 'warning' : ''}`}><i />{error || stale ? '数据待更新' : !data ? '采集中' : busy ? '负载较高' : '实时监测'}</span>
      </div>

      {(error || stale) && <div className="error-banner" role="status">{error ?? '采集数据已过期，正在等待更新。'}{data && ' 当前显示上次采集结果。'}</div>}

      <section className="summary-grid" aria-label="资源概览">
        <article className="summary-card">
          <div className="card-label"><Cpu size={14} /><h2>CPU</h2><span>PROCESSOR</span></div>
          <div className="metric-row"><div className="big-number">{data ? cpu.toFixed(0) : '—'}<small>%</small></div><Ring value={cpu} /></div>
          <p className="card-caption">{data ? `${data.physicalCores ?? data.cores.length} 核心 · ${data.cores.length} 逻辑处理器` : '正在获取处理器信息'}</p>
        </article>
        <article className="summary-card memory-card">
          <div className="card-label"><MemoryStick size={14} /><h2>内存</h2><span>MEMORY</span></div>
          <div className="metric-row"><div className="big-number">{data ? memory.toFixed(0) : '—'}<small>%</small></div><Ring value={memory} tone="purple" /></div>
          <p className="card-caption">{data ? `${bytes(data.memoryUsed)} / ${bytes(data.memoryTotal, 0)}` : '正在获取内存信息'}</p>
        </article>
      </section>

      <section className="cpu-section" aria-labelledby="cpu-heading">
        <div className="section-heading"><h2 id="cpu-heading"><em>01</em>CPU 活动</h2><span className="chart-period">最近 2 分钟 <b>LIVE</b></span></div>
        <div className="chart" role="img" aria-label={data ? `CPU 使用率趋势，当前 ${cpu.toFixed(0)}%` : '等待 CPU 采样'}>
          <div className="chart-grid"><span>100%</span><span>50%</span></div>
          <svg viewBox="0 0 340 62" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity="var(--chart-fill-opacity)" /><stop offset="100%" stopColor="var(--accent)" stopOpacity=".015" /></linearGradient></defs>
            {points && <><polygon fill="url(#chart-fill)" points={`${points.split(' ')[0].split(',')[0]},62 ${points} 340,62`} /><polyline className="chart-stroke" points={points} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" /><circle cx="340" cy={62 - cpu / 100 * 62} r="2.4" fill="var(--accent)" /></>}
          </svg>
          {!data && <span className="chart-loading">正在进行首次采样…</span>}
        </div>
        <div className="chart-axis"><span>−2 分钟</span><span>现在</span></div>
        <div className="cpu-info"><span title={data?.cpuBrand}>{data?.cpuBrand ?? '读取处理器…'}</span>
          <div className="core-bars" aria-label="各逻辑处理器使用率">{data?.cores.slice(0, 64).map((usage, i) => <i key={i} title={`CPU ${i + 1}: ${usage.toFixed(0)}%`}><span style={{ height: `${Math.max(5, usage)}%` }} /></i>)}</div>
        </div>
      </section>

      <section className="memory-section" aria-labelledby="memory-heading">
        <div className="section-heading"><h2 id="memory-heading"><em>02</em>内存用量</h2><span>{data ? `未使用 ${bytes(Math.max(0, data.memoryTotal - data.memoryUsed))}` : '—'}</span></div>
        <Meter value={memory} label="内存使用率" tone="purple" />
        <div className="memory-legend"><span><i />已用 {data ? bytes(data.memoryUsed) : '—'}</span><span>交换空间 {data ? bytes(data.swapUsed) : '—'}</span></div>
      </section>

      <section className="disk-section" aria-labelledby="disk-heading">
        <div className="section-heading"><h2 id="disk-heading"><em>03</em>存储空间</h2><span>{data ? `${data.disks.length} 个磁盘卷` : '—'}</span></div>
        <div className="disk-list">{data?.disks.map(disk => {
          const used = Math.max(0, disk.total - disk.available);
          const usage = percent(used, disk.total);
          return <article className="disk" key={disk.mount}>
            <div className="disk-icon"><HardDrive size={19} /></div>
            <div className="disk-details">
              <div className="disk-title"><h3 title={`${disk.name} · ${disk.mount}`}>{disk.name || disk.mount}</h3><span className="disk-tag">{disk.system ? '系统' : disk.removable ? '可移动' : '磁盘卷'}</span><strong>{usage.toFixed(0)}<small>%</small></strong></div>
              <Meter value={usage} label={`${disk.name} 使用率`} tone={usage >= 90 ? 'amber' : 'blue'} />
              <div className="disk-caption"><span>{bytes(used)} / {bytes(disk.total, 0)}</span><span>可用 {bytes(disk.available)}</span></div>
            </div>
          </article>;
        })}
        {(!data || !data.disks.length) && <div className="empty-disks"><HardDrive size={19} />{data ? '暂未读取到磁盘信息' : '正在读取存储空间…'}</div>}</div>
      </section>

      <div className="system-line"><span title={data?.os}><Monitor size={12} />{data?.os ?? '系统信息读取中'}</span><span>已运行 {data ? uptime(data.uptime) : '—'}</span></div>
    </div>

    <footer><span className="privacy"><ShieldCheck size={13} />仅在本机处理</span><span className="updated" title={data ? `上次采集：${new Date(data.timestamp).toLocaleTimeString('zh-CN')}` : '等待采样'}>{pinned && <Pin size={11} />}每 {preferences.interval} 秒刷新</span><button className="text-button" onClick={() => setSettingsOpen(v => !v)} aria-label="调整刷新频率"><ChevronDown size={13} /></button></footer>

    {settingsOpen && <div className="settings-popover" id="settings" role="dialog" aria-label="面板设置" ref={settingsRef}>
      <div className="settings-heading"><h2>面板设置</h2><button className="icon-button" aria-label="关闭设置" onClick={() => { setSettingsOpen(false); settingsButton.current?.focus(); }}><X size={15} /></button></div>
      <p className="setting-label">外观</p><div className="segmented" role="group" aria-label="外观">
        {([['system', Monitor, '跟随系统'], ['light', Sun, '浅色'], ['dark', Moon, '深色']] as const).map(([value, Icon, label]) => <button key={value} className={preferences.theme === value ? 'selected' : ''} aria-pressed={preferences.theme === value} onClick={() => monitor.setTheme(value as Theme)}><Icon size={14} />{label}</button>)}
      </div>
      <p className="setting-label">刷新频率</p><div className="segmented" role="group" aria-label="刷新频率">
        {([1, 2, 5] as RefreshInterval[]).map(value => <button key={value} className={preferences.interval === value ? 'selected' : ''} aria-pressed={preferences.interval === value} onClick={() => void monitor.setInterval(value)}>{value} 秒{preferences.interval === value && <Check size={12} />}</button>)}
      </div>
      <p className="setting-hint">磁盘空间每 15 秒刷新。设置自动保存。</p>
      <button className="settings-row" onClick={() => void monitor.togglePin()}><Pin size={15} />保持面板展开<span>{pinned ? '已开启' : '已关闭'}</span></button>
      {desktop && <><button className="settings-row quit" onClick={() => void quit()}><Power size={15} />退出 SystemPanel</button>{quitError && <p role="alert">退出失败，请使用托盘菜单重试。</p>}</>}
      {!desktop && <p className="setting-hint preview-hint"><ArrowDownToLine size={13} />桌面版支持托盘常驻与真实系统数据</p>}
      <p className="version">SystemPanel <span>v0.1.0</span></p>
    </div>}
  </main>;
}
