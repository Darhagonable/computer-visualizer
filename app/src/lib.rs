//! Native shell for Computer Visualizer — see docs/architecture.md.
//!
//! M1 scope: open the window that hosts the web UI (`../ui`) and expose one command
//! that proves the Rust ↔ UI bridge works. There are no OS data providers yet —
//! everything the UI shows in this milestone is mock data.

use serde::Serialize;

/// Reported to the UI so it can label the shell it is running in.
#[derive(Serialize)]
struct PlatformInfo {
    os: String,
    arch: String,
    /// True for the whole of M1: the UI is driven by the mock engine, not by the OS.
    mock: bool,
}

#[tauri::command]
fn platform_info() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        mock: true,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![platform_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
