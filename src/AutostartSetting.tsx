import { useCallback, useEffect, useRef, useState } from 'react';
import { Power } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { desktop } from './useMonitor';

async function readEnabled() {
  const value = await invoke<boolean>('get_autostart');
  if (typeof value !== 'boolean') throw new Error('Invalid startup status');
  return value;
}

export default function AutostartSetting() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [pending, setPending] = useState(desktop);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (!desktop || busy.current) return;
    const id = ++request.current;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const value = await readEnabled();
      if (id === request.current) setEnabled(value);
    } catch {
      if (id === request.current) {
        setEnabled(null);
        setError('无法读取启动设置，请重试。');
      }
    } finally {
      if (id === request.current) { busy.current = false; setPending(false); }
    }
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener('focus', refresh);
    return () => {
      ++request.current;
      busy.current = false;
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  async function toggle() {
    if (!desktop || busy.current || enabled === null) return;
    const id = ++request.current;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const value = await invoke<boolean>('set_autostart', { enabled: !enabled });
      if (typeof value !== 'boolean') throw new Error('Invalid startup status');
      if (id === request.current) setEnabled(value);
    } catch {
      // A failed response can follow a successful OS write. Read back rather
      // than guessing that the previous state still applies.
      const actual = await readEnabled().catch(() => null);
      if (id === request.current) {
        setEnabled(actual);
        setError('无法更改启动设置，请重试。');
      }
    } finally {
      if (id === request.current) { busy.current = false; setPending(false); }
    }
  }

  const status = !desktop ? '仅桌面版' : pending ? '处理中…' : enabled === null ? '读取失败' : enabled ? '已开启' : '已关闭';
  return <>
    <button className="settings-row autostart-row" role="switch" aria-label="跟随系统启动"
      aria-checked={enabled === true} aria-busy={pending} aria-describedby="autostart-hint"
      disabled={!desktop || pending || enabled === null} onClick={() => void toggle()}>
      <Power size={15} />跟随系统启动
      <span className="startup-state">{status}<i className={`startup-switch${enabled ? ' on' : ''}`} aria-hidden="true" /></span>
    </button>
    <p id="autostart-hint" className="setting-hint startup-hint">{desktop ? '登录后自动运行，保持面板收起。' : '请在桌面版中管理自动启动。'}</p>
    {error && <p className="setting-error" role="alert">{error}<button className="setting-retry" disabled={pending} onClick={() => void refresh()}>重新读取</button></p>}
  </>;
}
