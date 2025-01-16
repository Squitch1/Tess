#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::{Manager, WindowEvent};
use tess::configuration::types::BackgroundType;
use tess::utils::Logger;
use tess::{configuration::deserialized::Option, schemas};

use tess::commands;

#[cfg(target_family = "unix")]
use futures::stream::StreamExt;
#[cfg(target_family = "unix")]
use gtk::{glib::ObjectExt, prelude::WidgetExt};
#[cfg(target_family = "unix")]
use signal_hook::consts::signal::*;

use tess::utils::states::Ptys;

use std::io::ErrorKind;
use std::sync::Arc;
use tokio::sync::Mutex;

#[tokio::main]
async fn main() {
    let start = std::time::Instant::now();

    let logger = Logger {};

    #[cfg(target_family = "unix")]
    let config_path = dirs_next::config_dir().map(|path| path.join("tess/config.json"));
    #[cfg(target_os = "windows")]
    let config_path = dirs_next::config_dir().map(|path| path.join("Tess/config.json"));

    let mut config_error = None;
    let config = match std::fs::read_to_string(config_path.unwrap_or_default()) {
        Ok(config_file) => {
            let parsed_option = serde_json::from_str(&config_file);
            if let Err(err) = &parsed_option {
                logger.warn(&format!("Malformed configuration file: {err}."));
                config_error = Some(err.to_string());
            }
            parsed_option.unwrap_or_default()
        }
        Err(err) => {
            if !matches!(err.kind(), ErrorKind::NotFound) {
                logger.warn("Cannot read configuration file.");
                config_error = Some("Unable to read the file.".to_owned());
            }

            Option::default()
        }
    };
    #[cfg(target_family = "unix")]
    if !config.webkit_compositing_mode {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }

    let config = Arc::from(Mutex::from(config));
    tauri::async_runtime::set(tokio::runtime::Handle::current());
    let app = tauri::Builder::default()
        .manage(config.clone())
        .manage(Ptys::default())
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
            commands::utils_get_configuration,
            commands::window_close,
            commands::window_set_title
        ])
        .build(tauri::generate_context!())
        .unwrap();

    match &config.lock().await.background {
        BackgroundType::Media(media) => {
            app.fs_scope().allow_file(&media.location).ok();
        }
        #[cfg(target_family = "unix")]
        BackgroundType::Blurred => {
            todo!()
        }
        #[cfg(target_os = "windows")]
        BackgroundType::Mica => {
            if window_vibrancy::apply_mica(app.get_window("main").unwrap()).is_err() {
                logger.warn(
                    "Cannot apply mica background effect. Switching back to transparent background",
                );
            }
        }
        #[cfg(target_os = "windows")]
        BackgroundType::Acrylic => {
            if window_vibrancy::apply_acrylic(app.get_window("main").unwrap(), None).is_err() {
                logger.warn("Cannot apply acrylic background effect. Switching back to transparent background");
            }
        }
        #[cfg(target_os = "macos")]
        BackgroundType::Vibrancy => {
            todo!()
        }
        _ => {}
    }

    app.get_window("main").unwrap().set_decorations(true).ok();

    #[cfg(target_family = "unix")]
    app.get_window("main")
        .unwrap()
        .gtk_window()
        .unwrap()
        .settings()
        .unwrap()
        .set_property("gtk-menu-bar-accel", ""); // Fix F10 not being inputed on Linux

    app.fs_scope()
        .allow_file(&config.lock().await.app_theme)
        .ok();

    app.run(move |app, event| match event {
        tauri::RunEvent::Ready => {
            #[cfg(debug_assertions)]
            app.get_window("main").unwrap().open_devtools();

            #[cfg(target_family = "unix")]
            {
                let app = app.clone();
                tokio::spawn(async move {
                    if let Ok(mut signals_stream) =
                        signal_hook_tokio::Signals::new([SIGQUIT, SIGTERM])
                    {
                        while signals_stream.next().await.is_some() {
                            let windows_count = app.windows().len();
                            if windows_count > 1 {
                                app.get_window("main")
                                    .unwrap()
                                    .emit("js_app_request_exit", windows_count)
                                    .ok();
                            } else {
                                app.get_window("main")
                                    .unwrap()
                                    .emit("js_window_request_closing", ())
                                    .ok();
                            }
                        }
                    } else {
                        logger.fatal("Unable to register the signal handler.")
                    }
                });
            }

            if let Some(parsing_error) = config_error.clone() {
                let app = app.clone();
                app.get_window("main").unwrap().listen("loaded", move |e| {
                    app.get_window("main")
                        .unwrap()
                        .emit(
                            "js_show_toast",
                            schemas::utils::Toast {
                                title: "Malformed configuration",
                                message: Some(&parsing_error),
                                r#type: schemas::utils::ToastType::Warn,
                            },
                        )
                        .ok();
                    app.unlisten(e.id());
                });
            }

            logger.info(&format!("Launched in {}ms.", start.elapsed().as_millis()));
        }
        tauri::RunEvent::WindowEvent {
            label,
            event: WindowEvent::CloseRequested { api, .. },
            ..
        } => tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                if config.lock().await.close_confirmation.window {
                    app.get_window(&label)
                        .unwrap()
                        .emit("js_window_request_closing", ())
                        .ok();

                    api.prevent_close()
                }
            })
        }),
        _ => (),
    })
}
