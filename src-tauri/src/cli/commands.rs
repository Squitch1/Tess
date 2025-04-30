use clap::{Args, Subcommand, ValueHint};
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Subcommand)]
pub enum Commands {
    /// Run a new instance of Tess
    Run(RunCommand),
}

#[derive(Debug, Args, Default)]
pub struct RunCommand {
    /// Command to be executed
    #[arg(short = 'e', long)]
    pub command: Option<String>,
    /// Initial working directory. Must be valid Unicode
    #[arg(short, long, value_name="DIR", value_hint = ValueHint::DirPath)]
    pub workdir: Option<PathBuf>,
    /// The profile to use
    #[arg(short, long, value_name = "UUID")]
    pub profile: Option<Uuid>,
    /// Run in a new window
    #[arg(long, default_value_t = false, conflicts_with = "tab")]
    pub window: bool,
    /// Run in a new tab
    #[arg(long, default_value_t = false)]
    pub tab: bool,
}
