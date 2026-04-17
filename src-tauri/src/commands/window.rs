use tauri::window::{ProgressBarState, ProgressBarStatus};

#[cfg(target_family = "unix")]
use crate::states::Progress;

#[cfg(target_family = "unix")]
#[tauri::command]
pub async fn window_close(
    window: tauri::Window,
    windows_progress: tauri::State<Progress, '_>,
) -> Result<(), ()> {
    let mut windows_progress = windows_progress.0.lock().await;

    windows_progress.remove(window.label());
    apply_overall_progress(&window, *windows_progress.values().min().unwrap_or(&100));

    window.destroy().ok();

    Ok(())
}

#[cfg(not(target_family = "unix"))]
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

#[cfg(target_family = "unix")]
#[tauri::command]
pub async fn window_set_overall_progress(
    progress: u8,
    window: tauri::Window,
    windows_progress: tauri::State<Progress, '_>,
) -> Result<(), ()> {
    let mut windows_progress = windows_progress.0.lock().await;

    *windows_progress
        .entry(window.label().to_owned())
        .or_default() = progress;
    apply_overall_progress(&window, *windows_progress.values().min().unwrap());

    Ok(())
}

#[cfg(not(target_family = "unix"))]
#[tauri::command]
pub fn window_set_overall_progress(progress: u8, window: tauri::Window) {
    apply_overall_progress(&window, progress);
}

#[tauri::command]
pub fn window_request_attention(window: tauri::Window) {
    window
        .request_user_attention(Some(tauri::UserAttentionType::Informational))
        .ok();
}

fn apply_overall_progress(window: &tauri::Window, progress: u8) {
    let progress_state = if progress < 100 {
        ProgressBarState {
            status: Some(ProgressBarStatus::Normal),
            progress: Some(progress.into()),
        }
    } else {
        ProgressBarState {
            status: Some(ProgressBarStatus::None),
            progress: None,
        }
    };
    window.set_progress_bar(progress_state).ok();
}
