use crate::common::errors::PtyError;
use crate::pty::Pty;
use crate::schemas;
use crate::settings::deserialized::Settings;
use crate::states::Ptys;

use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::RwLock;
use uuid::Uuid;

#[tauri::command]
pub async fn pty_open(
    pty_id: Uuid,
    profile_id: Uuid,
    command: Option<&str>,
    title: Option<String>,
    workdir: Option<&str>,
    app: tauri::AppHandle,
    ptys: tauri::State<'_, Ptys>,
    settings: tauri::State<'_, Arc<RwLock<Settings>>>,
) -> Result<(), PtyError> {
    let settings = settings.read().await;
    let app_title_update = app.clone();
    let app_progress_update = app.clone();
    let app_displayed_content_update = app.clone();
    let app_pty_closed = app.clone();

    let opening_profile = settings
        .profiles
        .iter()
        .find(|profile| profile.id == profile_id)
        .ok_or_else(|| {
            PtyError::Creation(String::from(
                "There is no profile corresponding to this ID.",
            ))
        })?;

    ptys.0.write().await.insert(
        pty_id,
        Pty::build_and_run(
            command.unwrap_or(&opening_profile.command),
            workdir,
            title.or(opening_profile.title.clone()),
            opening_profile.title_format.clone(),
            opening_profile.terminal_settings.progress_tracking,
            opening_profile.terminal_settings.notify_content_change,
            move |data| {
                app.emit(
                    "js_pty_incoming_data",
                    schemas::pty::SendData { data, pty_id },
                )
                .ok();
            },
            move |title| {
                app_title_update
                    .emit(
                        "js_pty_title_update",
                        schemas::pty::TitleChanged { pty_id, title },
                    )
                    .ok();
            },
            move |progress| {
                app_progress_update
                    .emit(
                        "js_pty_progress_update",
                        schemas::pty::ProgressUpdated { pty_id, progress },
                    )
                    .ok();
            },
            move || {
                app_displayed_content_update
                    .emit("js_pty_display_content_update", &pty_id)
                    .ok();
            },
            move || {
                app_pty_closed.emit("js_pty_closed", pty_id).ok();
            },
        )?,
    );

    Ok(())
}

#[tauri::command]
pub async fn pty_close(pty_id: Uuid, ptys: tauri::State<'_, Ptys>) -> Result<(), PtyError> {
    let mut ptys = ptys.0.write().await;
    ptys.get_mut(&pty_id)
        .ok_or(PtyError::UnknownPty)?
        .kill()
        .inspect(|()| {
            ptys.remove(&pty_id);
        })
}

#[tauri::command]
pub async fn pty_write(
    pty_id: Uuid,
    data: String,
    ptys: tauri::State<'_, Ptys>,
) -> Result<(), PtyError> {
    ptys.0
        .read()
        .await
        .get(&pty_id)
        .ok_or(PtyError::UnknownPty)?
        .write(&data)
        .await
}

#[tauri::command]
pub async fn pty_resize(
    pty_id: Uuid,
    cols: u16,
    rows: u16,
    ptys: tauri::State<'_, Ptys>,
) -> Result<(), PtyError> {
    ptys.0
        .read()
        .await
        .get(&pty_id)
        .ok_or(PtyError::UnknownPty)?
        .resize(cols, rows)
        .await
}

#[tauri::command]
pub async fn pty_get_closable(
    pty_id: Uuid,
    ptys: tauri::State<'_, Ptys>,
    settings: tauri::State<'_, Arc<RwLock<Settings>>>,
) -> Result<bool, PtyError> {
    let settings = settings.read().await;
    if settings.close_confirmation.process {
        let locked_ptys = ptys.0.read().await;
        let pty = locked_ptys.get(&pty_id).ok_or(PtyError::UnknownPty)?;

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
    pty_id: Uuid,
    ptys: tauri::State<'_, Ptys>,
) -> Result<String, PtyError> {
    Ok(ptys
        .0
        .read()
        .await
        .get(&pty_id)
        .ok_or(PtyError::UnknownPty)?
        .leader_name
        .lock()
        .await
        .to_string())
}

#[tauri::command]
pub async fn pty_pause(pty_id: Uuid, ptys: tauri::State<'_, Ptys>) -> Result<(), PtyError> {
    ptys.0
        .read()
        .await
        .get(&pty_id)
        .ok_or(PtyError::UnknownPty)?
        .pause();
    Ok(())
}

#[tauri::command]
pub async fn pty_resume(pty_id: Uuid, ptys: tauri::State<'_, Ptys>) -> Result<(), PtyError> {
    ptys.0
        .read()
        .await
        .get(&pty_id)
        .ok_or(PtyError::UnknownPty)?
        .resume();
    Ok(())
}
