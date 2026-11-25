// Prevents an additional console window on Windows. Applied in every profile for now
// so the mockup launches cleanly from Explorer and from WSL alike.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

fn main() {
    computer_visualizer_lib::run()
}
