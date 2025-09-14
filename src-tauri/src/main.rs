#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tess::cli;
use tess::common::consts::{IPC_SOCKET_ADDR, TESS_VERSION};
use tess::common::Logger;
use tess::ipc;
use tess::schemas;
use tess::states::Ptys;
use tess::{commands, utils};

use clap::Parser;
use std::sync::Arc;
use tauri::{Emitter, Listener, Manager, WindowEvent};
use tokio::sync::RwLock;

#[cfg(target_family = "unix")]
use futures::stream::StreamExt;
#[cfg(target_family = "unix")]
use signal_hook::consts::signal::*;
#[cfg(target_family = "unix")]
use std::io::ErrorKind;

#[cfg(target_os = "windows")]
use windows::Win32::System::Console::{AttachConsole, FreeConsole, ATTACH_PARENT_PROCESS};

#[tokio::main]
async fn main() {
    #[cfg(target_os = "windows")]
    unsafe {
        AttachConsole(ATTACH_PARENT_PROCESS).ok();
    };

    let start = std::time::Instant::now();
    let logger = Logger {};

    let cli = cli::Cli::parse();

    if cli.version {
        println!(
            "{} {}{}",
            env!("CARGO_PKG_NAME"),
            TESS_VERSION,
            option_env!("GIT_COMMIT_INFO")
                .map(|commit_info| format!(" ({commit_info})"))
                .unwrap_or_default()
        );
        return;
    }

    #[cfg(target_os = "windows")]
    unsafe {
        FreeConsole().ok();
    }

    let mut launch_args = match cli {
        cli::Cli {
            default_command: None,
            command: None,
            ..
        } => cli::RunCommand::default(),
        cli::Cli {
            default_command: Some(command),
            ..
        }
        | cli::Cli {
            command: Some(cli::Commands::Run(command)),
            ..
        } => command,
    };
    launch_args.workdir = launch_args
        .workdir
        .and_then(|workdir| workdir.canonicalize().ok());

    match ipc::Client::new(&*IPC_SOCKET_ADDR).await {
        Ok(mut socket) => {
            let payload = &bitcode::encode(&ipc::TransmissionPayload::from(&launch_args));
            let mut n = 0;
            while n < payload.len() {
                match socket.send(&payload[n..]).await {
                    Ok(x) => n += x,
                    Err(e) => {
                        logger.fatal(&format!("Unable to send data through socket: {e}."));
                        return;
                    }
                }
            }
            return;
        }
        #[cfg(target_os = "linux")]
        Err(e) if e.kind() == ErrorKind::ConnectionRefused => {
            tokio::fs::remove_file(&*IPC_SOCKET_ADDR).await.ok();
        }
        Err(_) => (),
    }

    let (settings, settings_error) = utils::settings::read().await;

    #[cfg(target_family = "unix")]
    {
        std::env::set_var("GDK_BACKEND", "x11");
        if !settings.webkit_compositing_mode {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
    }

    let window_close_confirmation = settings.close_confirmation.window;
    #[cfg(target_family = "unix")]
    let intercept_signals = settings.desktop_integration.intercept_signals;
    let settings = Arc::new(RwLock::new(settings));
    let cloned_settings = settings.clone();
    tauri::async_runtime::set(tokio::runtime::Handle::current());
    let app = tauri::Builder::default()
        .setup(move |app| {
            if let Err(e) = utils::jumplist::update() {
                logger.warn(&format!("Unable to actualize jumplist content: {e}."));
            }

            match ipc::Server::new(&*IPC_SOCKET_ADDR) {
                Err(_) => {
                    logger.warn(
                        "IPC server cannot be created; an external connection is impossible.",
                    );
                }
                Ok(server) => {
                    let app = app.handle().clone();
                    let cloned_settings = cloned_settings.clone();
                    server.listen(move |payload| match payload {
                        Err(_) => {
                            logger.warn("Unable to receive data through socket.");
                            app.emit_to(
                                utils::window::get_focused_or_random(&app).label(),
                                "js_show_toast",
                                schemas::utils::Toast {
                                    title: "Socket failure",
                                    message: Some("Unable to receive data through socket."),
                                    r#type: schemas::utils::ToastType::Error,
                                },
                            )
                            .ok();
                        }
                        Ok(payload) => tokio::task::block_in_place(|| {
                            tokio::runtime::Handle::current().block_on(async {
                                if payload.open_in_tab.unwrap_or(
                                    cloned_settings.read().await.desktop_integration.open_in_tab,
                                ) {
                                    app.emit_to(
                                        utils::window::get_focused_or_random(&app).label(),
                                        "js_open_tab",
                                        schemas::utils::OpenTab::from(payload),
                                    )
                                    .ok();
                                    return;
                                }

                                if let Err(e) = utils::window::create(
                                    &app,
                                    cloned_settings.clone(),
                                    schemas::utils::OpenTab::from(payload),
                                )
                                .await
                                {
                                    logger.warn(&format!("Window creation failed: {e}."));
                                    app.emit_to(
                                        utils::window::get_focused_or_random(&app).label(),
                                        "js_show_toast",
                                        schemas::utils::Toast {
                                            title: "Window creation failed",
                                            message: Some(&e.to_string()),
                                            r#type: schemas::utils::ToastType::Error,
                                        },
                                    )
                                    .ok();
                                }
                            })
                        }),
                    });
                }
            }

            let window = tokio::task::block_in_place(|| {
                tokio::runtime::Handle::current().block_on(async {
                    utils::window::create(
                        app.handle(),
                        cloned_settings,
                        schemas::utils::OpenTab::from(launch_args),
                    )
                    .await
                })
            })?;
            window.clone().once("loaded", move |_| {
                if settings_error.is_some() {
                    window
                        .emit_to(
                            window.label(),
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
            commands::utils_open_uri,
            commands::window_close,
            commands::window_set_title
        ])
        .build(tauri::generate_context!())
        .unwrap();
    app.run_return(move |app, event| match event {
        tauri::RunEvent::Ready => {
            #[cfg(target_family = "unix")]
            {
                if intercept_signals {
                    let app = app.clone();
                    tokio::spawn(async move {
                        if let Ok(mut signals_stream) =
                            signal_hook_tokio::Signals::new([SIGQUIT, SIGTERM])
                        {
                            while signals_stream.next().await.is_some() {
                                let window = utils::window::get_focused_or_random(&app);
                                if app.webview_windows().len() > 1 {
                                    window
                                        .emit_to(
                                            window.label(),
                                            "js_app_request_exit",
                                            app.webview_windows().len(),
                                        )
                                        .ok();
                                } else {
                                    window
                                        .emit_to(window.label(), "js_window_request_closing", ())
                                        .ok();
                                }
                            }
                        } else {
                            logger.warn("Unable to register the signal handler.")
                        }
                    });
                }
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
                    .emit_to(label, "js_window_request_closing", ())
                    .ok();

                api.prevent_close()
            }
        }
        _ => (),
    });
}
