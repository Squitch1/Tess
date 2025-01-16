use crate::pty::pty::Pty;
use std::collections::HashMap;
use tokio::sync::Mutex;

#[derive(Default)]
pub struct Ptys(pub Mutex<HashMap<String, Pty>>);
