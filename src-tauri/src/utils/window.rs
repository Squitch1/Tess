use crate::{
    schemas,
    settings::{deserialized::Settings, types::BackgroundType},
};

#[cfg(target_os = "windows")]
use crate::common::Logger;

use std::sync::Arc;
use tauri::{AppHandle, Emitter, Listener, WebviewWindow};
use tokio::sync::RwLock;

#[cfg(target_os = "windows")]
use tauri::window::{self, EffectsBuilder};

#[must_use]
pub async fn create(
    app: &AppHandle,
    settings: Arc<RwLock<Settings>>,
) -> Result<WebviewWindow, tauri::Error> {
    let webview =
        tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
            .title("Tess")
            .transparent(true)
            .inner_size(1440f64, 810f64)
            .min_inner_size(640f64, 360f64)
            .use_https_scheme(true)
            .visible(false)
            .build()?;

    let settings = settings.read().await;

    match settings.background {
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
    let default_profile_uuid = settings.default_profile.uuid;
    webview.once("loaded", move |_| {
        cloned_webview.show().unwrap();

        #[cfg(debug_assertions)]
        cloned_webview.open_devtools();

        cloned_webview
            .emit(
                "js_open_tab",
                schemas::utils::OpenTab::Profile {
                    uuid: default_profile_uuid.into(),
                    executable: None,
                },
            )
            .ok();
    });

    Ok(webview)
}
