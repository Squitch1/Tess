#![deny(clippy::all, clippy::pedantic)]
#![allow(clippy::missing_panics_doc, clippy::missing_errors_doc)]

pub mod cli;
pub mod commands;
pub mod common;
pub mod ipc;
pub mod pty;
pub mod schemas;
pub mod settings;
pub mod states;
pub mod utils;
