use tauri::window::{ProgressBarState, ProgressBarStatus};

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
pub fn window_set_title(title: &str, window: tauri::Window) {
    window.set_title(&format!("Tess - {title}")).ok();
}

#[tauri::command]
pub fn window_set_overall_progress(progress: u8, windows: tauri::Window) {
    let progress_state = if progress > 0 && progress < 100 {
        ProgressBarState {
            progress: Some(progress.into()),
            status: Some(ProgressBarStatus::Normal),
        }
    } else {
        ProgressBarState {
            progress: None,
            status: Some(ProgressBarStatus::None),
        }
    };
    windows.set_progress_bar(progress_state).ok();
}

#[tauri::command]
pub fn window_request_attention(window: tauri::Window) {
    window
        .request_user_attention(Some(tauri::UserAttentionType::Informational))
        .ok();
}
