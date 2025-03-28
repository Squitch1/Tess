#[tauri::command]
pub fn window_close(window: tauri::Window) {
    window.destroy().ok();
}

#[tauri::command]
pub fn window_set_title(window: tauri::Window, title: &str) {
    window.set_title(&format!("Tess - {title}")).ok();
}
