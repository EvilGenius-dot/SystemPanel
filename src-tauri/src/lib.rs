mod metrics;
mod position;

use metrics::{Collector, Snapshot};
use position::Bounds;
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    window::{Color, Effect, EffectState, EffectsBuilder},
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Rect, State, Theme, Window, WindowEvent,
};

#[derive(Default)]
struct Latest {
    snapshot: Option<Snapshot>,
    error: Option<String>,
}

struct MonitorState {
    latest: Mutex<Latest>,
    pinned: AtomicBool,
    interval: AtomicU64,
    anchor: Mutex<Option<(PhysicalPosition<f64>, Rect)>>,
    last_blur_hide: Mutex<Option<Instant>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PanelState {
    snapshot: Option<Snapshot>,
    error: Option<String>,
    pinned: bool,
    interval: u64,
}

#[tauri::command]
fn get_panel_state(state: State<'_, Arc<MonitorState>>) -> Result<PanelState, String> {
    let latest = state
        .latest
        .lock()
        .map_err(|_| "采集服务状态不可用".to_string())?;
    Ok(PanelState {
        snapshot: latest.snapshot.clone(),
        error: latest.error.clone(),
        pinned: state.pinned.load(Ordering::Relaxed),
        interval: state.interval.load(Ordering::Relaxed),
    })
}

#[tauri::command]
fn set_refresh_interval(seconds: u64, state: State<'_, Arc<MonitorState>>) -> Result<(), String> {
    if !matches!(seconds, 1 | 2 | 5) {
        return Err("刷新频率只能为 1、2 或 5 秒".into());
    }
    state.interval.store(seconds, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
fn set_pinned(pinned: bool, state: State<'_, Arc<MonitorState>>) -> bool {
    state.pinned.store(pinned, Ordering::Relaxed);
    pinned
}

fn apply_material(window: &Window, theme: Theme) -> tauri::Result<()> {
    let light = theme == Theme::Light;
    window.set_effects(
        EffectsBuilder::new()
            .effects([
                if light {
                    Effect::Popover
                } else {
                    Effect::HudWindow
                },
                Effect::Acrylic,
            ])
            .state(EffectState::Active)
            .radius(16.0)
            .color(if light {
                Color(245, 248, 252, 190)
            } else {
                Color(8, 10, 14, 190)
            })
            .build(),
    )
}

#[tauri::command]
fn set_appearance(theme: &str, app: AppHandle) -> Result<(), String> {
    let requested = match theme {
        "light" => Some(Theme::Light),
        "dark" => Some(Theme::Dark),
        "system" => None,
        _ => return Err("不支持的外观设置".into()),
    };
    let window = app
        .get_webview_window("main")
        .ok_or("面板不存在")?
        .as_ref()
        .window();
    // Clear the native override for System so media queries follow the OS again.
    window.set_theme(requested).map_err(|e| e.to_string())?;
    let resolved = match requested {
        Some(theme) => theme,
        None => window.theme().map_err(|e| e.to_string())?,
    };
    apply_material(&window, resolved).map_err(|e| e.to_string())
}

#[tauri::command]
fn hide_panel(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or("面板不存在")?
        .hide()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn show_panel(app: &AppHandle) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    let state = app.state::<Arc<MonitorState>>();
    let anchor = state.anchor.lock().ok().and_then(|a| *a);
    let monitors = window.available_monitors()?;
    let monitor = anchor
        .and_then(|(point, _)| {
            monitors
                .iter()
                .find(|m| {
                    let p = m.position();
                    let s = m.size();
                    point.x >= p.x as f64
                        && point.y >= p.y as f64
                        && point.x < p.x as f64 + s.width as f64
                        && point.y < p.y as f64 + s.height as f64
                })
                .cloned()
        })
        .or(window.current_monitor()?)
        .or(window.primary_monitor()?);
    if let Some(monitor) = monitor {
        let scale = monitor.scale_factor();
        let area = monitor.work_area();
        let work = Bounds {
            x: area.position.x as f64,
            y: area.position.y as f64,
            width: area.size.width as f64,
            height: area.size.height as f64,
        };
        let gap = 8.0 * scale;
        let width = (400.0 * scale).min((work.width - 2.0 * gap).max(1.0));
        let height = (660.0 * scale).min((work.height - 2.0 * gap).max(1.0));
        let tray = if let Some((_, rect)) = anchor {
            let point = rect.position.to_physical::<f64>(scale);
            let size = rect.size.to_physical::<f64>(scale);
            Bounds {
                x: point.x,
                y: point.y,
                width: size.width,
                height: size.height,
            }
        } else {
            Bounds {
                x: work.x + work.width - width / 2.0,
                y: work.y,
                width: 0.0,
                height: 0.0,
            }
        };
        let (x, y) = position::panel_position(work, tray, width, height, gap);
        window.set_position(PhysicalPosition::new(x as i32, y as i32))?;
        window.set_size(PhysicalSize::new(width as u32, height as u32))?;
    }
    window.show()?;
    window.set_focus()?;
    Ok(())
}

fn report(result: tauri::Result<()>) {
    if let Err(error) = result {
        eprintln!("SystemPanel window: {error}");
    }
}

pub fn diagnostics() -> Result<String, String> {
    let mut collector = Collector::new();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL.max(Duration::from_secs(1)));
    serde_json::to_string_pretty(&collector.sample()?).map_err(|e| e.to_string())
}

pub fn run() {
    let state = Arc::new(MonitorState {
        latest: Mutex::new(Latest::default()),
        pinned: AtomicBool::new(false),
        interval: AtomicU64::new(2),
        anchor: Mutex::new(None),
        last_blur_hide: Mutex::new(None),
    });
    let sampler = state.clone();
    std::thread::Builder::new()
        .name("system-sampler".into())
        .spawn(move || {
            let mut collector = Collector::new();
            std::thread::sleep(
                sysinfo::MINIMUM_CPU_UPDATE_INTERVAL.max(Duration::from_millis(500)),
            );
            loop {
                let sample = collector.sample();
                if let Ok(mut latest) = sampler.latest.lock() {
                    match sample {
                        Ok(snapshot) => {
                            latest.snapshot = Some(snapshot);
                            latest.error = None;
                        }
                        Err(error) => latest.error = Some(error),
                    }
                }
                std::thread::sleep(Duration::from_secs(
                    sampler.interval.load(Ordering::Relaxed),
                ));
            }
        })
        .expect("Unable to start system sampler");

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            report(show_panel(app))
        }))
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_panel_state,
            set_refresh_interval,
            set_pinned,
            set_appearance,
            hide_panel,
            quit_app
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let show = MenuItem::with_id(app, "show", "显示系统看板", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出 SystemPanel", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&show, &separator, &quit])?;
            let icon_bytes: &[u8] = if cfg!(target_os = "macos") {
                include_bytes!("../icons/tray.png")
            } else {
                include_bytes!("../icons/32x32.png")
            };
            TrayIconBuilder::with_id("system-panel")
                .icon(Image::from_bytes(icon_bytes)?)
                .icon_as_template(cfg!(target_os = "macos"))
                .tooltip("SystemPanel · 系统看板")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => report(show_panel(app)),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        position,
                        rect,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        let state = app.state::<Arc<MonitorState>>();
                        if let Ok(mut anchor) = state.anchor.lock() {
                            *anchor = Some((position, rect));
                        }
                        if let Some(window) = app.get_webview_window("main") {
                            // Some systems deliver blur before the tray's mouse-up event.
                            let just_hidden = state
                                .last_blur_hide
                                .lock()
                                .ok()
                                .and_then(|t| *t)
                                .is_some_and(|t| t.elapsed() < Duration::from_millis(300));
                            if window.is_visible().unwrap_or(false) {
                                report(window.hide());
                            } else if !just_hidden {
                                report(show_panel(app));
                            }
                        }
                    }
                })
                .build(app)?;
            if std::env::args().any(|arg| arg == "--show") {
                report(show_panel(app.handle()));
            }
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::ThemeChanged(theme) => report(apply_material(window, *theme)),
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                report(window.hide());
            }
            WindowEvent::Focused(false) => {
                let state = window.state::<Arc<MonitorState>>();
                if !state.pinned.load(Ordering::Relaxed) && window.is_visible().unwrap_or(false) {
                    if let Ok(mut last) = state.last_blur_hide.lock() {
                        *last = Some(Instant::now());
                    }
                    report(window.hide());
                }
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("Unable to launch SystemPanel");

    app.run(|app, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            report(show_panel(app));
        }
        #[cfg(not(target_os = "macos"))]
        let _ = (app, event);
    });
}
