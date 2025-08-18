use crate::{
    schemas,
    settings::{deserialized::Settings, types::BackgroundType},
};

#[cfg(target_os = "windows")]
use crate::common::Logger;

use std::sync::Arc;
use tauri::{AppHandle, Emitter, Listener, Manager, WebviewWindow};
use tokio::sync::RwLock;

#[cfg(target_family = "unix")]
use gtk::glib::gobject_ffi::g_signal_handlers_destroy;
#[cfg(target_family = "unix")]
use webkit2gtk::glib::ObjectExt;

#[cfg(target_os = "windows")]
use tauri::window::{self, EffectsBuilder};

#[inline]
#[must_use]
pub fn get_focused_or_random(app: &AppHandle) -> WebviewWindow {
    app.webview_windows()
        .values()
        .find(|w| w.is_focused().unwrap_or(false))
        .cloned()
        .unwrap_or_else(|| app.webview_windows().values().next().unwrap().clone())
}

pub async fn create(
    app: &AppHandle,
    settings: Arc<RwLock<Settings>>,
    tab: schemas::utils::OpenTab,
) -> Result<WebviewWindow, tauri::Error> {
    let webview = tauri::WebviewWindowBuilder::new(
        app,
        uuid::Uuid::new_v4()
            .as_simple()
            .encode_lower(&mut uuid::Uuid::encode_buffer()),
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("Tess")
    .transparent(true)
    .inner_size(1440f64, 810f64)
    .min_inner_size(640f64, 360f64)
    .use_https_scheme(true)
    .visible(false)
    .build()?;

    #[cfg(target_family = "unix")]
    webview
        .with_webview(|gtk_webview| unsafe {
            if let Some(handler) = gtk_webview
                .inner()
                .data::<gtk::GestureZoom>("wk-view-zoom-gesture")
            {
                g_signal_handlers_destroy(handler.as_ptr().cast());
            }
        })
        .ok();

    match settings.read().await.background {
        #[cfg(target_family = "unix")]
        BackgroundType::Blurred => {
            todo!()
        }
        #[cfg(target_os = "windows")]
        BackgroundType::Acrylic => {
            if webview
                .set_effects(
                    EffectsBuilder::new()
                        .effect(window::Effect::Acrylic)
                        .build(),
                )
                .is_err()
            {
                Logger{}.warn("Cannot apply acrylic background effect. Switching back to transparent background");
            }
        }
        #[cfg(target_os = "windows")]
        BackgroundType::Mica => {
            if webview
                .set_effects(EffectsBuilder::new().effect(window::Effect::Mica).build())
                .is_err()
            {
                Logger {}.warn(
                    "Cannot apply mica background effect. Switching back to transparent background",
                );
            }
        }
        #[cfg(target_os = "windows")]
        BackgroundType::Tabbed => {
            if webview
                .set_effects(EffectsBuilder::new().effect(window::Effect::Tabbed).build())
                .is_err()
            {
                Logger{}.warn("Cannot apply tabbed background effect. Switching back to transparent background");
            }
        }
        #[cfg(target_os = "macos")]
        BackgroundType::Vibrancy => {
            todo!()
        }
        _ => {}
    }

    let cloned_webview = webview.clone();
    webview.once("loaded", move |_| {
        cloned_webview.show().unwrap();
        cloned_webview.unminimize().ok();
        cloned_webview.set_focus().ok();

        #[cfg(debug_assertions)]
        cloned_webview.open_devtools();

        cloned_webview
            .emit_to(cloned_webview.label(), "js_open_tab", tab)
            .ok();
    });

    Ok(webview)
}
