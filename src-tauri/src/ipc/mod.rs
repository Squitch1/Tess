#[cfg(target_family = "unix")]
mod unix;

#[cfg(target_family = "unix")]
pub use unix::*;

#[derive(bitcode::Decode, bitcode::Encode, Debug)]
pub struct TransmissionPayload<'a> {
    pub window: bool,
    pub exec: Option<&'a str>,
}

impl Default for TransmissionPayload<'_> {
    fn default() -> Self {
        Self {
            window: false,
            exec: None,
        }
    }
}
