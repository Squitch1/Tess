use crate::{
    schemas,
    settings::{deserialized::Settings, types::BackgroundType},
};

#[cfg(target_os = "windows")]
use crate::common::Logger;

use std::sync::Arc;
use tauri::{AppHandle, Emitter, Listener, Manager, WebviewWindow, Window};
use tokio::sync::RwLock;

#[cfg(target_os = "windows")]
use tauri::window::{self, EffectsBuilder};

#[inline]
#[must_use]
pub fn get_focused_or_random(app: &AppHandle) -> Window {
    app.get_focused_window()
        .unwrap_or_else(|| app.windows().values().next().unwrap().clone())
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

        #[cfg(debug_assertions)]
        cloned_webview.open_devtools();

        cloned_webview
            .emit_to(cloned_webview.label(), "js_open_tab", tab)
            .ok();
    });

    Ok(webview)
}
