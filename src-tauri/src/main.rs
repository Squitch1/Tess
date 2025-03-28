#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tess::commands;
use tess::common::Logger;
use tess::schemas;
use tess::settings::deserialized::Settings;
use tess::settings::types::BackgroundType;
use tess::states::Ptys;

use std::io::ErrorKind;
use std::sync::Arc;
use tauri::{Emitter, Listener, Manager, WindowEvent};
use tokio::sync::Mutex;

#[cfg(target_family = "unix")]
use futures::stream::StreamExt;
#[cfg(target_family = "unix")]
use gtk::{glib::ObjectExt, prelude::WidgetExt};
#[cfg(target_family = "unix")]
use signal_hook::consts::signal::*;

#[cfg(target_os = "windows")]
use tauri::window::{self, EffectsBuilder};

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

    let settings = Arc::new(Mutex::new(settings));
    tauri::async_runtime::set(tokio::runtime::Handle::current());
    let app = tauri::Builder::default()
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
            {
                #[cfg(target_os = "windows")]
                let app = app.clone();
                let settings = settings.clone();
                tokio::spawn(async move {
                    match &settings.lock().await.background {
                        #[cfg(target_family = "unix")]
                        BackgroundType::Blurred => {
                            todo!()
                        }
                        #[cfg(target_os = "windows")]
                        BackgroundType::Acrylic => {
                            if app.get_webview_window("main").unwrap().set_effects(EffectsBuilder::new().effect(window::Effect::Acrylic).build()).is_err() {
                                logger.warn("Cannot apply acrylic background effect. Switching back to transparent background");
                            }
                        }
                        #[cfg(target_os = "windows")]
                        BackgroundType::Mica => {
                            if app.get_webview_window("main").unwrap().set_effects(EffectsBuilder::new().effect(window::Effect::Mica).build()).is_err() {
                                logger.warn("Cannot apply mica background effect. Switching back to transparent background");
                            }
                        }
                        #[cfg(target_os = "windows")]
                        BackgroundType::Tabbed => {
                            if app.get_webview_window("main").unwrap().set_effects(EffectsBuilder::new().effect(window::Effect::Tabbed).build()).is_err() {
                                logger.warn("Cannot apply tabbed background effect. Switching back to transparent background");
                            }
                        }
                        #[cfg(target_os = "macos")]
                        BackgroundType::Vibrancy => {
                            todo!()
                        }
                        _ => {}
                    }
                });
            }

            #[cfg(debug_assertions)]
            app.get_webview_window("main").unwrap().open_devtools();

            app.get_webview_window("main")
                .unwrap()
                .set_decorations(true)
                .ok();

            #[cfg(target_family = "unix")]
            app.get_webview_window("main")
                .unwrap()
                .gtk_window()
                .unwrap()
                .settings()
                .unwrap()
                .set_property("gtk-menu-bar-accel", ""); // Fix F10 not being inputed on Linux

            #[cfg(target_family = "unix")]
            {
                let app = app.clone();
                tokio::spawn(async move {
                    if let Ok(mut signals_stream) =
                        signal_hook_tokio::Signals::new([SIGQUIT, SIGTERM])
                    {
                        while signals_stream.next().await.is_some() {
                            let windows_count = app.webview_windows().len();
                            if windows_count > 1 {
                                app.get_webview_window("main")
                                    .unwrap()
                                    .emit("js_app_request_exit", windows_count)
                                    .ok();
                            } else {
                                app.get_webview_window("main")
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

            if let Some(parsing_error) = settings_error.clone() {
                let app = app.clone();
                app.get_webview_window("main")
                    .unwrap()
                    .listen("loaded", move |e| {
                        app.get_webview_window("main")
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
                if settings.lock().await.close_confirmation.window {
                    app.get_webview_window(&label)
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
