#[derive(Clone, Copy)]
pub struct Logger {}

impl Logger {
    pub fn info(self, content: &str) {
        println!("\x1b[34m\x1b[1m[INFO]\x1b[0m {content}");
    }

    pub fn fatal(self, content: &str) {
        println!("\x1b[31m\x1b[1m[FATAL]\x1b[0m {content}");
    }

    pub fn warn(self, content: &str) {
        println!("\x1b[33m\x1b[1m[WARN]\x1b[0m {content}");
    }
}
