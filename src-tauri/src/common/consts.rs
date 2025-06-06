use std::{path::PathBuf, sync::LazyLock};

pub const DEFAULT_PROFILE_TITLE: &str = "%|leader_name|%";
pub const PTY_BUFFER_SIZE: usize = 16384;
pub const TESS_VERSION: &str = env!("CARGO_PKG_VERSION");

pub static IPC_SOCKET_ADDR: LazyLock<PathBuf> = LazyLock::new(|| {
    #[cfg(target_os = "linux")]
    return dirs::runtime_dir().unwrap().join("tess.sock");

    #[cfg(target_os = "windows")]
    return PathBuf::from("//./").join("pipe").join("tess");
});
