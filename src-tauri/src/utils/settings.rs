use crate::{common::Logger, settings::deserialized::Settings};

use std::io::ErrorKind;

pub async fn read() -> (Settings, Option<String>) {
    let logger = Logger {};
    #[cfg(target_family = "unix")]
    let settings_path = dirs::config_dir()
        .map(|path| path.join("tess/settings.json"))
        .unwrap_or_default();
    #[cfg(target_os = "windows")]
    let settings_path = dirs::config_dir()
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

    (settings, settings_error)
}
