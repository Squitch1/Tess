use crate::configuration::deserialized::TerminalTheme;

#[must_use]
pub fn parse_theme(location: &str) -> (Option<String>, Option<TerminalTheme>) {
    dirs_next::config_dir()
        .unwrap_or_default()
        .join("tess/themes")
        .join(location)
        .canonicalize()
        .map_or((None, None), |theme_path| {
            let app_theme = theme_path
                .join("style.css")
                .canonicalize()
                .map_or(None, |app_theme_file| {
                    app_theme_file.to_str().map(String::from)
                });
            let terminal_theme = theme_path.join("terminal.json").canonicalize().map_or(
                None,
                |terminal_theme_file| {
                    serde_json::from_str(
                        &std::fs::read_to_string(terminal_theme_file).unwrap_or_default(),
                    )
                    .ok()
                },
            );

            (app_theme, terminal_theme)
        })
}
