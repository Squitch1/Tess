pub mod process;
pub mod title_formatter;

#[allow(clippy::module_inception)]
mod pty;
pub use pty::Pty;
