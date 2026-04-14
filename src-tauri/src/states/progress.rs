use std::collections::HashMap;
use tokio::sync::Mutex;

#[derive(Default)]
pub struct Progress(pub Mutex<HashMap<String, u8>>);
