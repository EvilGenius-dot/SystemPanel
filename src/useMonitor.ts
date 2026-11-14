import { useCallback, useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { readPreferences, writePreferences } from './preferences';
import { previewSnapshot } from './preview';
import type { PanelState, Preferences, RefreshInterval, Theme } from './types';

export const desktop = isTauri();

export function useMonitor() {
  const [preferences, setPreferences] = useState<Preferences>(readPreferences);
  const [state, setState] = useState<PanelState>({ snapshot: null, pinned: false, interval: preferences.interval, error: null });
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [appearanceError, setAppearanceError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    writePreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void invoke('set_appearance', { theme: preferences.theme }).then(() => {
      if (active) setAppearanceError(null);
    }).catch(() => {
      if (active) setAppearanceError('原生玻璃外观切换失败，请重新选择主题。');
    });
    return () => { active = false; };
  }, [preferences.theme]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = desktop ? await invoke<PanelState>('get_panel_state') : {
          snapshot: previewSnapshot(), interval: preferences.interval, pinned: false, error: null,
        };
        if (active) {
          setState(previous => desktop ? next : { ...next, pinned: previous.pinned });
          setConnectionError(null);
        }
      } catch {
        if (active) setConnectionError('暂时无法连接系统采集服务，正在重试。');
      }
      if (active) {
        setNow(Date.now());
        timer = setTimeout(poll, document.hidden ? 5000 : 1000);
      }
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [preferences.interval]);

  useEffect(() => {
    if (desktop) void invoke('set_refresh_interval', { seconds: preferences.interval }).catch(() => {
      setActionError('刷新频率设置失败，请重试。');
    });
  }, [preferences.interval]);

  const setInterval = useCallback(async (interval: RefreshInterval) => {
    try {
      if (desktop) await invoke('set_refresh_interval', { seconds: interval });
      setPreferences(p => ({ ...p, interval }));
      setActionError(null);
    } catch { setActionError('刷新频率设置失败，请重试。'); }
  }, []);

  const togglePin = useCallback(async () => {
    try {
      const pinned = desktop ? await invoke<boolean>('set_pinned', { pinned: !state.pinned }) : !state.pinned;
      setState(previous => ({ ...previous, pinned }));
      setActionError(null);
    } catch { setActionError('固定面板失败，请重试。'); }
  }, [state.pinned]);

  const hide = useCallback(async () => {
    if (!desktop) return;
    try { await invoke('hide_panel'); }
    catch { setActionError('暂时无法收起面板，请点击托盘图标重试。'); }
  }, []);

  const setTheme = (theme: Theme) => setPreferences(p => ({ ...p, theme }));
  const stale = !!state.snapshot && now - state.snapshot.timestamp > Math.max(15_000, preferences.interval * 3000);
  return { ...state, preferences, setInterval, togglePin, setTheme, hide, stale,
    error: actionError ?? connectionError ?? state.error ?? appearanceError };
}
