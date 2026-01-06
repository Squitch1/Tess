use regex_lite::Regex;
use std::{path::PathBuf, sync::LazyLock};

pub const DEFAULT_PROFILE_TITLE: &str = "%|leader_name|%";
pub const PTY_BUFFER_SIZE: usize = 16384;
pub const TESS_VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(target_os = "windows")]
pub const STRINGTABLE_JUMPLIST_NEW_WINDOW: u16 = 101;
#[cfg(target_os = "windows")]
pub const STRINGTABLE_JUMPLIST_NEW_TAB: u16 = 102;

pub static IPC_SOCKET_ADDR: LazyLock<PathBuf> = LazyLock::new(|| {
    #[cfg(target_os = "linux")]
    return dirs::runtime_dir().unwrap().join("tess.sock");

    #[cfg(target_os = "windows")]
    return PathBuf::from("//./").join("pipe").join("tess");
});

pub static RE_PERCENTAGE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(([0-9]*[.])?[0-9]+%)").unwrap());
pub static RE_FRACTION: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(\d+/\d+)").unwrap());

#[cfg(target_os = "windows")]
pub static ENCODED_EXECUTABLE_PATH: LazyLock<Vec<u16>> = LazyLock::new(|| {
    use std::os::windows::ffi::OsStrExt;

    std::env::current_exe()
        .unwrap()
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<u16>>()
});
