mod commands;

pub use commands::*;

#[derive(Debug, clap::Parser)]
#[clap(
    disable_version_flag = true,
    long_about = "A hackable, simple, and rapid terminal for the new era of \
                    technology.\nIt includes emoji support, tabs, screen \
                    splitting, as well as theming and fully customizable \
                    settings."
)]
#[command(args_conflicts_with_subcommands = true)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<commands::Commands>,
    #[command(flatten)]
    pub default_command: Option<commands::RunCommand>,
    /// Print build information
    #[arg(short, long, exclusive = true)]
    pub version: bool,
}
