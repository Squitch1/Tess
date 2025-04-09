#[cfg(target_family = "unix")]
mod unix;

#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_family = "unix")]
pub use unix::*;

#[cfg(target_os = "windows")]
pub use windows::*;

#[derive(bitcode::Decode, bitcode::Encode, Debug)]
pub struct TransmissionPayload<'a> {
    pub window: bool,
    pub command: Option<&'a str>,
}

impl Default for TransmissionPayload<'_> {
    fn default() -> Self {
        Self {
            window: false,
            command: None,
        }
    }
}
