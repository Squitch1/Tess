use crate::settings::deserialized::Settings;

use std::sync::Arc;
use tokio::sync::Mutex;

#[tauri::command]
pub fn utils_close_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub async fn utils_get_settings(
    settings: tauri::State<'_, Arc<Mutex<Settings>>>,
) -> Result<Settings, ()> {
    Ok(settings.lock().await.clone())
}
