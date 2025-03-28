use crate::pty::Pty;

use std::collections::HashMap;
use tokio::sync::RwLock;
use uuid::Uuid;

#[derive(Default)]
pub struct Ptys(pub RwLock<HashMap<Uuid, Pty>>);
