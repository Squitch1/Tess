#[cfg(target_family = "unix")]
mod unix;

#[cfg(target_family = "unix")]
pub use unix::*;

#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "windows")]
pub use windows::*;
