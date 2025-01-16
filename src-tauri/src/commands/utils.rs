use crate::configuration::deserialized::Option;
use std::sync::Arc;
use tokio::sync::Mutex;

#[tauri::command]
pub fn utils_close_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub async fn utils_get_configuration(
    option: tauri::State<'_, Arc<Mutex<Option>>>,
) -> Result<Option, ()> {
    Ok(option.lock().await.clone())
}
