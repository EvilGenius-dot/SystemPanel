//! Let DWM clip the web content and acrylic to the same native window corners.

use std::{ffi::c_void, io, mem::size_of_val};
use tauri::Window;
use windows_sys::Win32::{
    Foundation::E_INVALIDARG,
    Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE,
        DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
    },
};

pub fn apply(window: &Window) -> tauri::Result<()> {
    let hwnd = window.hwnd()?.0;
    for (attribute, value) in [
        (DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND as u32),
        (DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE),
    ] {
        // SAFETY: hwnd belongs to the live panel; both attributes accept a
        // four-byte value, which stays alive for this synchronous call.
        let result = unsafe {
            DwmSetWindowAttribute(
                hwnd,
                attribute as u32,
                &value as *const u32 as *const c_void,
                size_of_val(&value) as u32,
            )
        };
        // These attributes require Windows 11. Older Windows versions retain
        // clean square corners rather than exposing acrylic outside a CSS mask.
        if result < 0 && result != E_INVALIDARG {
            return Err(io::Error::other(format!(
                "Unable to configure native window corners: {result:#x}"
            ))
            .into());
        }
    }
    Ok(())
}
