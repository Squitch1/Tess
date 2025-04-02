#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tess::common::Logger;
use tess::schemas;
use tess::settings::deserialized::Settings;
use tess::states::Ptys;
use tess::{commands, utils};

use std::io::ErrorKind;
use std::sync::Arc;
use tauri::{Emitter, Listener, Manager, WindowEvent};
use tokio::sync::RwLock;

#[cfg(target_family = "unix")]
use futures::stream::StreamExt;
#[cfg(target_family = "unix")]
use signal_hook::consts::signal::*;

#[tokio::main]
async fn main() {
    let start = std::time::Instant::now();

    let logger = Logger {};

    #[cfg(target_family = "unix")]
    let settings_path = dirs_next::config_dir()
        .map(|path| path.join("tess/settings.json"))
        .unwrap_or_default();
    #[cfg(target_os = "windows")]
    let settings_path = dirs_next::config_dir()
        .map(|path| path.join("Tess/settings.json"))
        .unwrap_or_default();

    let mut settings_error = None;
    let settings = match tokio::fs::metadata(&settings_path)
        .await
        .map(|metadata| metadata.len())
        .unwrap_or_default()
    {
        0 => Settings::default(),
        _ => match tokio::fs::read(settings_path).await {
            Ok(buf) => serde_json::from_slice(&buf)
                .inspect_err(|err| {
                    logger.warn(&format!("Malformed configuration file: {err}."));
                    settings_error = Some(err.to_string());
                })
                .unwrap_or_default(),
            Err(err) => {
                if !matches!(err.kind(), ErrorKind::NotFound) {
                    logger.warn("Cannot read configuration file.");
                    settings_error = Some("Unable to read the file.".to_owned());
                }

                Settings::default()
            }
        },
    };

    #[cfg(target_family = "unix")]
    {
        std::env::set_var("GDK_BACKEND", "x11");
        if !settings.webkit_compositing_mode {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
    }

    let window_close_confirmation = settings.close_confirmation.window;
    let settings = Arc::new(RwLock::new(settings));
    let cloned_settings = settings.clone();
    tauri::async_runtime::set(tokio::runtime::Handle::current());
    let app = tauri::Builder::default()
        .setup(move |app| {
            let webview_window = tokio::task::block_in_place(|| {
                tokio::runtime::Handle::current()
                    .block_on(async { utils::window::create(app.handle(), cloned_settings).await })
            })?;
            webview_window.clone().once("loaded", move |_| {
                if settings_error.is_some() {
                    webview_window
                        .emit(
                            "js_show_toast",
                            schemas::utils::Toast {
                                title: "Malformed configuration",
                                message: settings_error.as_deref(),
                                r#type: schemas::utils::ToastType::Warn,
                            },
                        )
                        .ok();
                }

                logger.info(&format!("Launched in {}ms.", start.elapsed().as_millis()));
            });
            Ok(())
        })
        .manage(settings.clone())
        .manage(Ptys::default())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            commands::pty_open,
            commands::pty_close,
            commands::pty_write,
            commands::pty_resize,
            commands::pty_get_leader_name,
            commands::pty_get_closable,
            commands::pty_resume,
            commands::pty_pause,
            commands::utils_close_app,
            commands::utils_get_settings,
            commands::window_close,
            commands::window_set_title
        ])
        .build(tauri::generate_context!())
        .unwrap();
    app.run(move |app, event| match event {
        tauri::RunEvent::Ready => {
            #[cfg(target_family = "unix")]
            {
                let app = app.clone();
                tokio::spawn(async move {
                    if let Ok(mut signals_stream) =
                        signal_hook_tokio::Signals::new([SIGQUIT, SIGTERM])
                    {
                        while signals_stream.next().await.is_some() {
                            let windows_count = app.webview_windows().len();
                            let webview_window = app
                                .get_focused_window()
                                .unwrap_or(app.windows().values().next().unwrap().clone());
                            if windows_count > 1 {
                                webview_window
                                    .emit("js_app_request_exit", windows_count)
                                    .ok();
                            } else {
                                webview_window.emit("js_window_request_closing", ()).ok();
                            }
                        }
                    } else {
                        logger.fatal("Unable to register the signal handler.")
                    }
                });
            }
        }
        tauri::RunEvent::WindowEvent {
            label,
            event: WindowEvent::CloseRequested { api, .. },
            ..
        } => {
            if window_close_confirmation {
                app.get_webview_window(&label)
                    .unwrap()
                    .emit("js_window_request_closing", ())
                    .ok();

                api.prevent_close()
            }
        }
        _ => (),
    })
}
