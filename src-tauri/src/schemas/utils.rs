use crate::{cli::RunCommand, ipc::TransmissionPayload};

use std::path::PathBuf;
use uuid::Uuid;

#[derive(serde::Serialize, Clone, Copy)]
pub struct Toast<'a> {
    pub title: &'a str,
    pub message: Option<&'a str>,
    pub r#type: ToastType,
}

#[derive(serde::Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum ToastType {
    Error,
    Warn,
    Info,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum OpenTab {
    Profile {
        uuid: Option<Uuid>,
        command: Option<String>,
        workdir: Option<PathBuf>,
        title: Option<String>,
    },
}

impl Default for OpenTab {
    fn default() -> Self {
        Self::Profile {
            uuid: None,
            command: None,
            workdir: None,
            title: None,
        }
    }
}

impl From<TransmissionPayload<'_>> for OpenTab {
    fn from(payload: TransmissionPayload) -> Self {
        Self::Profile {
            uuid: payload.profile.map(Uuid::from_u128),
            command: payload.command.map(str::to_owned),
            workdir: payload.workdir.map(PathBuf::from),
            title: payload.title.map(str::to_owned),
        }
    }
}

impl From<RunCommand> for OpenTab {
    fn from(cmd: RunCommand) -> Self {
        Self::Profile {
            uuid: cmd.profile,
            command: cmd.command,
            workdir: cmd.workdir,
            title: cmd.title,
        }
    }
}
