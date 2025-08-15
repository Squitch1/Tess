#[tauri::command]
pub fn window_close(window: tauri::Window) {
    window.destroy().ok();
}

#[tauri::command]
pub fn window_focus(window: tauri::Window) {
    window.unminimize().ok();
    window.set_focus().ok();
}

#[tauri::command]
pub fn window_set_title(window: tauri::Window, title: &str) {
    window.set_title(&format!("Tess - {title}")).ok();
}

#[tauri::command]
pub fn window_request_attention(window: tauri::Window) {
    window
        .request_user_attention(Some(tauri::UserAttentionType::Informational))
        .ok();
}
