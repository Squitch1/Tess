#[cfg(target_family = "unix")]
mod unix;

#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_family = "unix")]
pub use unix::*;

#[cfg(target_os = "windows")]
pub use windows::*;

use crate::cli::RunCommand;

#[derive(bitcode::Decode, bitcode::Encode, Debug, Default)]
pub struct TransmissionPayload<'a> {
    pub open_in_tab: Option<bool>,
    pub command: Option<&'a str>,
    pub workdir: Option<&'a str>,
    pub title: Option<&'a str>,
    pub profile: Option<u128>,
}

impl<'a> From<&'a RunCommand> for TransmissionPayload<'a> {
    fn from(cmd: &'a RunCommand) -> Self {
        let open_in_tab = if cmd.tab || cmd.window {
            Some(cmd.tab)
        } else {
            None
        };

        Self {
            open_in_tab,
            command: cmd.command.as_deref(),
            workdir: cmd.workdir.as_ref().and_then(|p| p.to_str()),
            profile: cmd.profile.map(|id| id.as_u128()),
            title: cmd.title.as_deref(),
        }
    }
}
