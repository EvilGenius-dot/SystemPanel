use tauri::AppHandle;
#[cfg(target_os = "windows")]
#[path = "startup_windows.rs"]
mod platform;

#[cfg(target_os = "macos")]
mod platform {
    use tauri::AppHandle;
    use tauri_plugin_autostart::ManagerExt;

    pub fn is_enabled(app: &AppHandle) -> Result<bool, String> {
        app.autolaunch()
            .is_enabled()
            .map_err(|error| error.to_string())
    }

    pub fn set_enabled(app: &AppHandle, enabled: bool) -> Result<(), String> {
        let manager = app.autolaunch();
        if enabled {
            manager.enable()
        } else {
            manager.disable()
        }
        .map_err(|error| error.to_string())
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
mod platform {
    use tauri::AppHandle;
    pub fn is_enabled(_: &AppHandle) -> Result<bool, String> {
        Err("当前平台不支持自动启动".into())
    }
    pub fn set_enabled(_: &AppHandle, _: bool) -> Result<(), String> {
        Err("当前平台不支持自动启动".into())
    }
}

pub const AUTOSTART_ARG: &str = "--autostart";

pub fn should_show_panel(args: &[String], second_instance: bool) -> bool {
    !args.iter().any(|arg| arg == AUTOSTART_ARG)
        && (second_instance || args.iter().any(|arg| arg == "--show"))
}

#[tauri::command]
pub async fn get_autostart(app: AppHandle) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        platform::is_enabled(&app).map_err(|error| format!("无法读取启动设置：{error}"))
    })
    .await
    .map_err(|error| format!("启动设置读取任务失败：{error}"))?
}

#[tauri::command]
pub async fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        platform::set_enabled(&app, enabled)
            .map_err(|error| format!("无法更改启动设置：{error}"))?;
        let actual =
            platform::is_enabled(&app).map_err(|error| format!("无法确认启动设置：{error}"))?;
        if actual != enabled {
            return Err("系统未保存启动设置，请重试。".into());
        }
        Ok(actual)
    })
    .await
    .map_err(|error| format!("启动设置更新任务失败：{error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_owned()).collect()
    }

    #[test]
    fn login_launch_stays_hidden_even_with_an_existing_instance() {
        for second_instance in [false, true] {
            assert!(!should_show_panel(
                &args(&["SystemPanel", "--autostart"]),
                second_instance
            ));
            assert!(!should_show_panel(
                &args(&["SystemPanel", "--autostart", "--show"]),
                second_instance
            ));
        }
    }

    #[test]
    fn manual_launch_preserves_explicit_show_and_reopen() {
        assert!(!should_show_panel(&args(&["SystemPanel"]), false));
        assert!(should_show_panel(&args(&["SystemPanel", "--show"]), false));
        assert!(should_show_panel(&args(&["SystemPanel"]), true));
    }
}
