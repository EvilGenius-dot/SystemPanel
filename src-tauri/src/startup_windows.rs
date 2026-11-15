//! Only touch this application's values under the current user's startup keys.
use std::path::Path;
use tauri::AppHandle;
use windows_registry::{Result as RegistryResult, CURRENT_USER};

const NAME: &str = "SystemPanel";
const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const APPROVED: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";

fn optional<T>(result: RegistryResult<T>) -> Result<Option<T>, String> {
    match result {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.code().0 as u32 == 0x80070002 => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn command(path: &Path) -> Result<String, String> {
    let path = path.to_str().ok_or("无法编码程序路径")?;
    // Windows paths cannot contain quotes. Always quote the executable path so
    // an installation under Program Files (or a spaced user name) is valid.
    Ok(format!("\"{path}\" {}", super::AUTOSTART_ARG))
}

fn approved(bytes: &[u8]) -> Result<bool, String> {
    if bytes.len() != 12 {
        return Err("无法识别系统启动项状态".into());
    }
    match bytes[0] {
        2 | 6 => Ok(true),
        3 | 7 => Ok(false),
        _ => Err("无法识别系统启动项状态".into()),
    }
}

pub fn is_enabled(_: &AppHandle) -> Result<bool, String> {
    let expected = command(&std::env::current_exe().map_err(|error| error.to_string())?)?;
    let registered = optional(CURRENT_USER.open(RUN).and_then(|key| key.get_string(NAME)))?;
    if registered.as_deref() != Some(expected.as_str()) {
        return Ok(false);
    }
    match optional(
        CURRENT_USER
            .open(APPROVED)
            .and_then(|key| key.get_value(NAME)),
    )? {
        Some(value) => approved(&value),
        None => Ok(true),
    }
}

pub fn set_enabled(_: &AppHandle, enabled: bool) -> Result<(), String> {
    if enabled {
        let executable = std::env::current_exe().map_err(|error| error.to_string())?;
        let value = command(&executable)?;
        CURRENT_USER
            .create(RUN)
            .and_then(|key| key.set_string(NAME, &value))
            .map_err(|error| error.to_string())?;
        // An explicit enable also clears this app's prior Task Manager override.
        // No other application's approval or machine-wide key is touched.
        optional(
            CURRENT_USER
                .options()
                .write()
                .open(APPROVED)
                .and_then(|key| key.remove_value(NAME)),
        )?;
    } else {
        optional(
            CURRENT_USER
                .options()
                .write()
                .open(RUN)
                .and_then(|key| key.remove_value(NAME)),
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quoted_unicode_path_keeps_startup_argument_separate() {
        assert_eq!(
            command(Path::new(r"C:\Program Files\系统看板\system-panel.exe")).unwrap(),
            "\"C:\\Program Files\\系统看板\\system-panel.exe\" --autostart"
        );
    }

    #[test]
    fn recognizes_task_manager_disabled_and_unknown_states() {
        let mut value = [0; 12];
        for state in [2, 6] {
            value[0] = state;
            assert_eq!(approved(&value), Ok(true));
        }
        for state in [3, 7] {
            value[0] = state;
            assert_eq!(approved(&value), Ok(false));
        }
        value[0] = 99;
        assert!(approved(&value).is_err());
        assert!(approved(&[]).is_err());
    }
}
