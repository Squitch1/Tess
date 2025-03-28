use crate::common::errors::PtyError;
use crate::pty::Pty;
use crate::schemas;
use crate::settings::deserialized::Settings;
use crate::states::Ptys;

use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::Mutex;
use uuid::Uuid;

#[tauri::command]
pub async fn pty_open(
    app: tauri::AppHandle,
    uuid: Uuid,
    profile_uuid: Uuid,
    settings: tauri::State<'_, Arc<Mutex<Settings>>>,
    ptys: tauri::State<'_, Ptys>,
) -> Result<(), PtyError> {
    let app_title_update = app.clone();
    let app_progress_update = app.clone();
    let app_displayed_content_update = app.clone();
    let app_pty_closed = app.clone();

    let locked_settings = settings.lock().await;
    let opening_profile = locked_settings
        .profiles
        .iter()
        .find(|profile| profile.uuid == profile_uuid)
        .ok_or(PtyError::UnknownPty)?;

    ptys.0.write().await.insert(
        uuid,
        Pty::build_and_run(
            &opening_profile.command,
            opening_profile.title_format.clone(),
            opening_profile.terminal_settings.progress_tracking,
            opening_profile.terminal_settings.notify_content_change,
            move |readed| {
                app.emit(
                    "js_pty_incoming_data",
                    schemas::pty::SendData { data: readed, uuid },
                )
                .ok();
            },
            move |tab_title| {
                app_title_update
                    .emit(
                        "js_pty_title_update",
                        schemas::pty::TitleChanged {
                            uuid,
                            title: tab_title,
                        },
                    )
                    .ok();
            },
            move |progress| {
                app_progress_update
                    .emit(
                        "js_pty_progress_update",
                        schemas::pty::ProgressUpdated { uuid, progress },
                    )
                    .ok();
            },
            move || {
                app_displayed_content_update
                    .emit("js_pty_display_content_update", &uuid)
                    .ok();
            },
            move || {
                app_pty_closed.emit("js_pty_closed", uuid).ok();
            },
        )?,
    );

    Ok(())
}

#[tauri::command]
pub async fn pty_close(ptys: tauri::State<'_, Ptys>, uuid: Uuid) -> Result<(), PtyError> {
    let mut ptys = ptys.0.write().await;
    ptys.get(&uuid)
        .ok_or(PtyError::UnknownPty)?
        .kill()
        .await
        .inspect(|()| {
            ptys.remove(&uuid);
        })
}

#[tauri::command]
pub async fn pty_write(
    uuid: Uuid,
    data: String,
    ptys: tauri::State<'_, Ptys>,
) -> Result<(), PtyError> {
    ptys.0
        .read()
        .await
        .get(&uuid)
        .ok_or(PtyError::UnknownPty)?
        .write(&data)
        .await
}

#[tauri::command]
pub async fn pty_resize(
    ptys: tauri::State<'_, Ptys>,
    uuid: Uuid,
    cols: u16,
    rows: u16,
) -> Result<(), PtyError> {
    ptys.0
        .read()
        .await
        .get(&uuid)
        .ok_or(PtyError::UnknownPty)?
        .resize(cols, rows)
        .await
}

#[tauri::command]
pub async fn pty_get_closable(
    ptys: tauri::State<'_, Ptys>,
    settings: tauri::State<'_, Arc<Mutex<Settings>>>,
    uuid: Uuid,
) -> Result<bool, PtyError> {
    let settings = settings.lock().await;

    if settings.close_confirmation.tab {
        let locked_ptys = ptys.0.read().await;
        let pty = locked_ptys.get(&uuid).ok_or(PtyError::UnknownPty)?;

        Ok(pty.closed.load(std::sync::atomic::Ordering::Relaxed)
            || settings
                .close_confirmation
                .excluded_processes
                .contains(&*pty.leader_name.lock().await))
    } else {
        Ok(true)
    }
}

#[tauri::command]
pub async fn pty_get_leader_name(
    ptys: tauri::State<'_, Ptys>,
    uuid: Uuid,
) -> Result<String, PtyError> {
    Ok(ptys
        .0
        .read()
        .await
        .get(&uuid)
        .ok_or(PtyError::UnknownPty)?
        .leader_name
        .lock()
        .await
        .to_string())
}

#[tauri::command]
pub async fn pty_pause(ptys: tauri::State<'_, Ptys>, uuid: Uuid) -> Result<(), PtyError> {
    ptys.0
        .read()
        .await
        .get(&uuid)
        .ok_or(PtyError::UnknownPty)?
        .pause();
    Ok(())
}

#[tauri::command]
pub async fn pty_resume(ptys: tauri::State<'_, Ptys>, uuid: Uuid) -> Result<(), PtyError> {
    ptys.0
        .read()
        .await
        .get(&uuid)
        .ok_or(PtyError::UnknownPty)?
        .resume();
    Ok(())
}
