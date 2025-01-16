use crate::configuration::deserialized::Option;
use crate::schemas;
use crate::utils::states::Ptys;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

use crate::utils::errors::PtyError;

use crate::pty::pty::Pty;

#[tauri::command]
pub async fn pty_open(
    app: tauri::AppHandle,
    id: String,
    profile_id: String,
    option: tauri::State<'_, Arc<Mutex<Option>>>,
    ptys: tauri::State<'_, Ptys>,
) -> Result<(), PtyError> {
    let id_title_update = id.clone();
    let id_progress_update = id.clone();
    let id_displayed_content_update = id.clone();
    let id_pty_closed = id.clone();
    let app_title_update = app.clone();
    let app_progress_update = app.clone();
    let app_displayed_content_update = app.clone();
    let app_pty_closed = app.clone();

    let locked_option = option.lock().await;
    let opening_profile = locked_option
        .profiles
        .iter()
        .find(|profile| profile.id == profile_id)
        .ok_or(PtyError::UnknownPty)?;

    ptys.0.lock().await.insert(
        id.clone(),
        Pty::build_and_run(
            &opening_profile.command,
            opening_profile.title_format.clone(),
            opening_profile.terminal_options.progress_tracking,
            opening_profile.terminal_options.show_unread_data_mark,
            move |readed| {
                app.emit_all(
                    "js_pty_incoming_data",
                    schemas::pty::SendData {
                        data: readed,
                        id: &id,
                    },
                )
                .ok();
            },
            move |tab_title| {
                app_title_update
                    .emit_all(
                        "js_pty_title_update",
                        schemas::pty::TitleChanged {
                            id: &id_title_update,
                            title: tab_title,
                        },
                    )
                    .ok();
            },
            move |progress| {
                app_progress_update
                    .emit_all(
                        "js_pty_progress_update",
                        schemas::pty::ProgressUpdated {
                            id: &id_progress_update,
                            progress,
                        },
                    )
                    .ok();
            },
            move || {
                app_displayed_content_update
                    .emit_all("js_pty_display_content_update", &id_pty_closed)
                    .ok();
            },
            move || {
                app_pty_closed
                    .emit_all("js_pty_closed", id_displayed_content_update)
                    .ok();
            },
        )?,
    );

    Ok(())
}

#[tauri::command]
pub async fn pty_close(ptys: tauri::State<'_, Ptys>, id: String) -> Result<(), PtyError> {
    let mut ptys = ptys.0.lock().await;
    ptys.get(&id)
        .ok_or(PtyError::UnknownPty)?
        .kill()
        .await
        .inspect(|()| {
            ptys.remove(&id);
        })
}

#[tauri::command]
pub async fn pty_write(
    id: String,
    data: String,
    ptys: tauri::State<'_, Ptys>,
) -> Result<(), PtyError> {
    ptys.0
        .lock()
        .await
        .get_mut(&id)
        .ok_or(PtyError::UnknownPty)?
        .write(&data)
}

#[tauri::command]
pub async fn pty_resize(
    ptys: tauri::State<'_, Ptys>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), PtyError> {
    ptys.0
        .lock()
        .await
        .get(&id)
        .ok_or(PtyError::UnknownPty)?
        .resize(cols, rows)
        .await
}

#[tauri::command]
pub async fn pty_get_closable(
    ptys: tauri::State<'_, Ptys>,
    app_config: tauri::State<'_, Arc<Mutex<Option>>>,
    id: String,
) -> Result<bool, PtyError> {
    let app_config = app_config.lock().await;

    if app_config.close_confirmation.tab {
        let locked_ptys = ptys.0.lock().await;
        let pty = locked_ptys.get(&id).ok_or(PtyError::UnknownPty)?;

        Ok(pty.closed.load(std::sync::atomic::Ordering::Relaxed)
            || app_config
                .close_confirmation
                .excluded_process
                .contains(&*pty.leader_name.lock().await))
    } else {
        Ok(true)
    }
}

#[tauri::command]
pub async fn pty_get_leader_name(
    ptys: tauri::State<'_, Ptys>,
    id: String,
) -> Result<String, PtyError> {
    Ok(ptys
        .0
        .lock()
        .await
        .get_mut(&id)
        .ok_or(PtyError::UnknownPty)?
        .leader_name
        .lock()
        .await
        .to_string())
}

#[tauri::command]
pub async fn pty_pause(ptys: tauri::State<'_, Ptys>, id: String) -> Result<(), PtyError> {
    ptys.0
        .lock()
        .await
        .get(&id)
        .ok_or(PtyError::UnknownPty)?
        .pause();
    Ok(())
}

#[tauri::command]
pub async fn pty_resume(ptys: tauri::State<'_, Ptys>, id: String) -> Result<(), PtyError> {
    ptys.0
        .lock()
        .await
        .get(&id)
        .ok_or(PtyError::UnknownPty)?
        .resume();
    Ok(())
}
