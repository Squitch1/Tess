use crate::configuration::partial::PartialOption;
use crate::configuration::types::CursorType;
use crate::configuration::types::RangedInt;
use crate::configuration::types::{BackgroundMedia, BackgroundType};
use crate::utils::formatter::Formatter;
use serde::Deserialize;
use serde::{ser::SerializeSeq, Serialize, Serializer};

use crate::utils::theme::parse_theme;

use super::partial::default_title_format;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct Option {
    pub app_theme: String,
    pub terminal_theme: TerminalTheme,
    pub background: BackgroundType,
    pub background_transparency: RangedInt<0, 100, 100>,
    pub profiles: Vec<Profile>,
    pub terminal: TerminalOption,
    pub shortcuts: Vec<Shortcut>,
    pub macros: Vec<Macro>,
    pub default_profile: Profile,
    pub close_confirmation: CloseConfirmation,
    pub desktop_integration: DesktopIntegration,

    #[cfg(target_family = "unix")]
    pub webkit_compositing_mode: bool,

    #[serde(skip_serializing)]
    theme: String,
}

impl Default for Option {
    fn default() -> Self {
        let id = uuid::Uuid::new_v4().to_string();

        Self {
            app_theme: String::default(),
            terminal_theme: TerminalTheme::default(),
            background: BackgroundType::default(),
            profiles: vec![default_profile(
                id.clone(),
                &default_title_format(),
                RangedInt::default(),
                TerminalOption::default(),
                TerminalTheme::default(),
            )],
            terminal: TerminalOption::default(),
            background_transparency: RangedInt::default(),
            shortcuts: default_shortcuts(),
            macros: Vec::default(),
            default_profile: default_profile(
                id,
                &default_title_format(),
                RangedInt::default(),
                TerminalOption::default(),
                TerminalTheme::default(),
            ),
            close_confirmation: CloseConfirmation::default(),
            desktop_integration: DesktopIntegration::default(),

            #[cfg(target_family = "unix")]
            webkit_compositing_mode: false,

            theme: String::default(),
        }
    }
}

impl<'de> serde::Deserialize<'de> for Option {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let mut partial_option = PartialOption::deserialize(deserializer)?;

        if matches!(partial_option.background, BackgroundType::Opaque) {
            partial_option.background_transparency = RangedInt(100);
        }

        let (app_theme, terminal_theme) = parse_theme(&partial_option.theme);
        let app_theme = app_theme.unwrap_or_default();
        let terminal_theme = terminal_theme.unwrap_or_default();

        let mut profiles = vec![];

        if partial_option.profiles.is_empty() {
            profiles.push(default_profile(
                uuid::Uuid::new_v4().to_string(),
                &partial_option.title_format,
                partial_option.background_transparency,
                partial_option.terminal.clone(),
                terminal_theme.clone(),
            ));
        } else {
            for partial_profile in partial_option.profiles {
                let profile_option = TerminalOption {
                    buffer_size: partial_profile
                        .buffer_size
                        .unwrap_or(partial_option.terminal.buffer_size),
                    cursor: partial_profile
                        .cursor
                        .unwrap_or(partial_option.terminal.cursor),
                    font_size: partial_profile
                        .font_size
                        .unwrap_or(partial_option.terminal.font_size),
                    bell: partial_profile.bell.unwrap_or(partial_option.terminal.bell),
                    font_ligature: partial_profile
                        .font_ligature
                        .unwrap_or(partial_option.terminal.font_ligature),
                    show_picture: partial_profile
                        .show_picture
                        .unwrap_or(partial_option.terminal.show_picture),
                    cursor_blink: partial_profile
                        .cursor_blink
                        .unwrap_or(partial_option.terminal.cursor_blink),
                    draw_bold_in_bright: partial_profile
                        .draw_bold_in_bright
                        .unwrap_or(partial_option.terminal.draw_bold_in_bright),
                    show_unread_data_mark: partial_profile
                        .show_unread_data_mark
                        .unwrap_or(partial_option.terminal.show_unread_data_mark),
                    line_height: partial_profile
                        .line_height
                        .unwrap_or(partial_option.terminal.line_height),
                    letter_spacing: partial_profile
                        .letter_spacing
                        .unwrap_or(partial_option.terminal.letter_spacing),
                    font_weight: partial_profile
                        .font_weight
                        .unwrap_or(partial_option.terminal.font_weight),
                    font_weight_bold: partial_profile
                        .font_weight_bold
                        .unwrap_or(partial_option.terminal.font_weight_bold),
                    progress_tracking: partial_profile
                        .progress_tracking
                        .unwrap_or(partial_option.terminal.progress_tracking),
                };

                let profile_theme = partial_profile.theme.map_or_else(
                    || terminal_theme.clone(),
                    |partial_profile_theme| {
                        parse_theme(&partial_profile_theme)
                            .1
                            .unwrap_or_else(|| terminal_theme.clone())
                    },
                );

                profiles.push(Profile {
                    title_format: Formatter::new(
                        &partial_profile
                            .title_format
                            .unwrap_or_else(|| partial_option.title_format.clone()),
                        &partial_profile.name,
                    ),
                    name: partial_profile.name,
                    terminal_options: profile_option,
                    theme: profile_theme,
                    background_transparency: partial_profile
                        .background_transparency
                        .unwrap_or(partial_option.background_transparency),
                    id: uuid::Uuid::parse_str(&partial_profile.id.unwrap_or_default())
                        .unwrap_or_else(|_| uuid::Uuid::new_v4())
                        .to_string(),
                    command: partial_profile.command,
                    background: partial_profile.background,
                });
            }
        }

        let mut macros = Vec::new();
        if let Some(partial_macros) = partial_option.macros {
            macros.reserve(partial_macros.len());
            for macro_command in partial_macros {
                macros.push(Macro {
                    content: macro_command.content,
                    id: macro_command
                        .id
                        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
                });
            }
        }

        let shortcuts = partial_option
            .shortcuts
            .map(|shortcuts| {
                shortcuts
                    .iter()
                    .filter(|shortcut| match shortcut.action {
                        ShortcutAction::OpenProfile(ref profile_id)
                        | ShortcutAction::SplitSpecificPaneAndOpenProfile(ref profile_id)
                        | ShortcutAction::SplitFocusedPaneAndOpenProfile(ref profile_id)
                        | ShortcutAction::SplitTabAndOpenProfile(ref profile_id) => {
                            profiles.iter().any(|profile| &profile.id == profile_id)
                        }
                        ShortcutAction::ExecuteMacro(ref macro_id) => macros
                            .iter()
                            .any(|macro_command| &macro_command.id == macro_id),
                        _ => true,
                    })
                    .cloned()
                    .collect::<Vec<Shortcut>>()
            })
            .unwrap_or_else(default_shortcuts);

        Ok(Self {
            theme: partial_option.theme,

            terminal_theme,
            app_theme,
            background: partial_option.background,
            terminal: partial_option.terminal,
            profiles: profiles.clone(),
            background_transparency: partial_option.background_transparency,
            shortcuts,
            macros,
            default_profile: profiles
                .iter()
                .find(|&profile| profile.id == partial_option.default_profile)
                .unwrap_or(&profiles[0])
                .clone(),
            close_confirmation: partial_option.close_confirmation,
            desktop_integration: partial_option.desktop_integration,

            #[cfg(target_family = "unix")]
            webkit_compositing_mode: partial_option.webkit_compositing_mode,
        })
    }
}

#[derive(Deserialize, Debug, Serialize, Clone)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct TerminalOption {
    #[serde(default)]
    buffer_size: RangedInt<500, 5000, 3000>,
    #[serde(default)]
    cursor: CursorType,
    #[serde(default)]
    font_size: RangedInt<10, 30, 15>,
    #[serde(default)]
    font_ligature: bool,
    #[serde(default)]
    show_picture: bool,
    #[serde(default)]
    bell: bool,
    #[serde(default)]
    cursor_blink: bool,
    #[serde(default)]
    draw_bold_in_bright: bool,
    #[serde(default = "default_to_true")]
    pub show_unread_data_mark: bool,
    #[serde(default)]
    line_height: RangedInt<100, 200, 100>,
    #[serde(default)]
    letter_spacing: RangedInt<0, 8, 0>,
    #[serde(default)]
    font_weight: RangedInt<1, 9, 4>,
    #[serde(default)]
    font_weight_bold: RangedInt<1, 9, 6>,
    #[serde(default)]
    pub progress_tracking: bool,
}

impl Default for TerminalOption {
    fn default() -> Self {
        Self {
            buffer_size: RangedInt::default(),
            cursor: CursorType::default(),
            font_size: RangedInt::default(),
            font_ligature: false,
            show_picture: false,
            bell: false,
            cursor_blink: false,
            draw_bold_in_bright: false,
            show_unread_data_mark: true,
            line_height: RangedInt::default(),
            letter_spacing: RangedInt::default(),
            font_weight: RangedInt::default(),
            font_weight_bold: RangedInt::default(),
            progress_tracking: false,
        }
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct Macro {
    pub content: String,
    pub id: String,
}

#[derive(Debug, Serialize, Clone, Deserialize)]
pub struct Shortcut {
    pub shortcut: String,
    pub action: ShortcutAction,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all(deserialize = "snake_case"))]
pub enum ShortcutAction {
    CloseFocusedTab,
    CloseWindow,
    CloseFocusedPane,
    CloseSpecificPane,
    OpenDefaultProfile,
    SplitTabAndOpenDefaultProfile,
    SplitFocusedPaneAndOpenDefaultProfile,
    SplitSpecificPaneAndOpenDefaultProfile,
    Copy,
    Paste,
    FocusFirstTab,
    FocusLastTab,
    FocusNextTab,
    FocusPrevTab,
    FocusTab(usize),
    ExecuteMacro(String),
    OpenProfile(String),
    SplitTabAndOpenProfile(String),
    SplitFocusedPaneAndOpenProfile(String),
    SplitSpecificPaneAndOpenProfile(String),
}

impl Serialize for ShortcutAction {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::CloseFocusedTab => serializer.serialize_str("closeFocusedTab"),
            Self::CloseWindow => serializer.serialize_str("closeWindow"),
            Self::CloseFocusedPane => serializer.serialize_str("closeFocusedPane"),
            Self::CloseSpecificPane => serializer.serialize_str("closeSpecificPane"),
            Self::OpenDefaultProfile => serializer.serialize_str("openDefaultProfile"),
            Self::SplitTabAndOpenDefaultProfile => {
                serializer.serialize_str("splitTabAndOpenDefaultProfile")
            }
            Self::SplitFocusedPaneAndOpenDefaultProfile => {
                serializer.serialize_str("splitFocusedPaneAndOpenDefaultProfile")
            }
            Self::SplitSpecificPaneAndOpenDefaultProfile => {
                serializer.serialize_str("splitSpecificPaneAndOpenDefaultProfile")
            }
            Self::Copy => serializer.serialize_str("copy"),
            Self::Paste => serializer.serialize_str("paste"),
            Self::FocusFirstTab => serializer.serialize_str("focusFirstTab"),
            Self::FocusLastTab => serializer.serialize_str("focusLastTab"),
            Self::FocusNextTab => serializer.serialize_str("focusNextTab"),
            Self::FocusPrevTab => serializer.serialize_str("focusPrevTab"),
            Self::FocusTab(value) => {
                let mut seq = serializer.serialize_seq(Some(2))?;
                seq.serialize_element("focusTab")?;
                seq.serialize_element(value)?;
                seq.end()
            }
            Self::ExecuteMacro(value) => {
                let mut seq = serializer.serialize_seq(Some(2))?;
                seq.serialize_element("executeMacro")?;
                seq.serialize_element(value)?;
                seq.end()
            }
            Self::OpenProfile(value) => {
                let mut seq = serializer.serialize_seq(Some(2))?;
                seq.serialize_element("openProfile")?;
                seq.serialize_element(value)?;
                seq.end()
            }
            Self::SplitTabAndOpenProfile(value) => {
                let mut seq = serializer.serialize_seq(Some(2))?;
                seq.serialize_element("splitTabAndOpenProfile")?;
                seq.serialize_element(value)?;
                seq.end()
            }
            Self::SplitFocusedPaneAndOpenProfile(value) => {
                let mut seq = serializer.serialize_seq(Some(2))?;
                seq.serialize_element("splitFocusedPaneAndOpenProfile")?;
                seq.serialize_element(value)?;
                seq.end()
            }
            Self::SplitSpecificPaneAndOpenProfile(value) => {
                let mut seq = serializer.serialize_seq(Some(2))?;
                seq.serialize_element("splitSpecificPaneAndOpenProfile")?;
                seq.serialize_element(value)?;
                seq.end()
            }
        }
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct Profile {
    pub name: String,
    pub terminal_options: TerminalOption,
    theme: TerminalTheme,
    background_transparency: RangedInt<0, 100, 100>,
    background: std::option::Option<BackgroundMedia>,
    pub id: String,
    pub command: String,
    #[serde(skip_serializing)]
    pub title_format: Formatter,
}

#[derive(Debug, Clone, Serialize)]
pub struct TerminalTheme {
    foreground: String,
    background: String,
    black: String,
    red: String,
    green: String,
    yellow: String,
    blue: String,
    magenta: String,
    cyan: String,
    white: String,
    bright_black: String,
    bright_red: String,
    bright_green: String,
    bright_yellow: String,
    bright_blue: String,
    bright_magenta: String,
    bright_cyan: String,
    bright_white: String,
    cursor: String,
    cursor_accent: String,
}

impl Default for TerminalTheme {
    fn default() -> Self {
        Self {
            foreground: String::from("#DEEAF8"),
            background: String::from("#141A29"),
            black: String::from("#22303F"),
            red: String::from("#Ef3134"),
            green: String::from("#2DF4B7"),
            yellow: String::from("#FFC738"),
            blue: String::from("#156CE6"),
            magenta: String::from("#FF5CB8"),
            cyan: String::from("#01DEFE"),
            white: String::from("#9AA5CE"),
            bright_black: String::from("#2B3D50"),
            bright_red: String::from("#F1494B"),
            bright_green: String::from("#76F8D0"),
            bright_yellow: String::from("#FFCE52"),
            bright_blue: String::from("#297AEB"),
            bright_magenta: String::from("#FF76C3"),
            bright_cyan: String::from("#4DE8FE"),
            bright_white: String::from("#ABB4D6"),
            cursor: String::from("#DEEAF8"),
            cursor_accent: String::from("#141A29"),
        }
    }
}

impl<'de> Deserialize<'de> for TerminalTheme {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize, Default)]
        struct PartialTerminalTheme {
            #[serde(default)]
            pub foreground: std::option::Option<String>,
            #[serde(default)]
            pub background: std::option::Option<String>,
            #[serde(default)]
            pub black: std::option::Option<String>,
            #[serde(default)]
            pub red: std::option::Option<String>,
            #[serde(default)]
            pub green: std::option::Option<String>,
            #[serde(default)]
            pub yellow: std::option::Option<String>,
            #[serde(default)]
            pub blue: std::option::Option<String>,
            #[serde(default)]
            pub magenta: std::option::Option<String>,
            #[serde(default)]
            pub cyan: std::option::Option<String>,
            #[serde(default)]
            pub white: std::option::Option<String>,
            #[serde(default)]
            pub bright_black: std::option::Option<String>,
            #[serde(default)]
            pub bright_red: std::option::Option<String>,
            #[serde(default)]
            pub bright_green: std::option::Option<String>,
            #[serde(default)]
            pub bright_yellow: std::option::Option<String>,
            #[serde(default)]
            pub bright_blue: std::option::Option<String>,
            #[serde(default)]
            pub bright_magenta: std::option::Option<String>,
            #[serde(default)]
            pub bright_cyan: std::option::Option<String>,
            #[serde(default)]
            pub bright_white: std::option::Option<String>,
            #[serde(default)]
            pub cursor: std::option::Option<String>,
            #[serde(default)]
            pub cursor_accent: std::option::Option<String>,
        }

        let partial_terminal_theme =
            PartialTerminalTheme::deserialize(deserializer).unwrap_or_default();
        let default_terminal_theme = Self::default();

        Ok(Self {
            foreground: partial_terminal_theme
                .foreground
                .unwrap_or(default_terminal_theme.foreground),
            background: partial_terminal_theme
                .background
                .unwrap_or(default_terminal_theme.background),
            black: partial_terminal_theme
                .black
                .unwrap_or(default_terminal_theme.black),
            red: partial_terminal_theme
                .red
                .unwrap_or(default_terminal_theme.red),
            green: partial_terminal_theme
                .green
                .unwrap_or(default_terminal_theme.green),
            yellow: partial_terminal_theme
                .yellow
                .unwrap_or(default_terminal_theme.yellow),
            blue: partial_terminal_theme
                .blue
                .unwrap_or(default_terminal_theme.blue),
            magenta: partial_terminal_theme
                .magenta
                .unwrap_or(default_terminal_theme.magenta),
            cyan: partial_terminal_theme
                .cyan
                .unwrap_or(default_terminal_theme.cyan),
            white: partial_terminal_theme
                .white
                .unwrap_or(default_terminal_theme.white),
            bright_black: partial_terminal_theme
                .bright_black
                .unwrap_or(default_terminal_theme.bright_black),
            bright_red: partial_terminal_theme
                .bright_red
                .unwrap_or(default_terminal_theme.bright_red),
            bright_green: partial_terminal_theme
                .bright_green
                .unwrap_or(default_terminal_theme.bright_green),
            bright_yellow: partial_terminal_theme
                .bright_yellow
                .unwrap_or(default_terminal_theme.bright_yellow),
            bright_blue: partial_terminal_theme
                .bright_blue
                .unwrap_or(default_terminal_theme.bright_blue),
            bright_magenta: partial_terminal_theme
                .bright_magenta
                .unwrap_or(default_terminal_theme.bright_magenta),
            bright_cyan: partial_terminal_theme
                .bright_cyan
                .unwrap_or(default_terminal_theme.bright_cyan),
            bright_white: partial_terminal_theme
                .bright_white
                .unwrap_or(default_terminal_theme.bright_white),
            cursor: partial_terminal_theme
                .cursor
                .unwrap_or(default_terminal_theme.cursor),
            cursor_accent: partial_terminal_theme
                .cursor_accent
                .unwrap_or(default_terminal_theme.cursor_accent),
        })
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct CloseConfirmation {
    pub tab: bool,
    pub group: bool,
    pub window: bool,
    pub app: bool,
    pub excluded_process: Vec<String>,
}

impl<'de> Deserialize<'de> for CloseConfirmation {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        struct PartialCloseConfirmation {
            tab: std::option::Option<bool>,
            group: std::option::Option<bool>,
            window: std::option::Option<bool>,
            app: std::option::Option<bool>,
            excluded_process: std::option::Option<Vec<String>>,
        }

        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Representation {
            Simple(bool),
            Complex(PartialCloseConfirmation),
        }

        match Representation::deserialize(deserializer)? {
            Representation::Simple(enable) => Ok(Self {
                tab: enable,
                group: enable,
                window: enable,
                app: enable,
                #[cfg(target_family = "unix")]
                excluded_process: vec![
                    "sh".to_owned(),
                    "bash".to_owned(),
                    "fish".to_owned(),
                    "zsh".to_owned(),
                ],
                #[cfg(target_os = "windows")]
                excluded_process: vec![
                    "cmd.exe".to_owned(),
                    "powershell.exe".to_owned(),
                    "pwsh.exe".to_owned(),
                ],
            }),
            Representation::Complex(partial_close_confirmation) => Ok(Self {
                tab: partial_close_confirmation.tab.unwrap_or(true),
                group: partial_close_confirmation.group.unwrap_or(true),
                window: partial_close_confirmation.window.unwrap_or(true),
                app: partial_close_confirmation.app.unwrap_or(true),
                #[cfg(target_family = "unix")]
                excluded_process: partial_close_confirmation.excluded_process.unwrap_or_else(
                    || {
                        vec![
                            "sh".to_owned(),
                            "bash".to_owned(),
                            "fish".to_owned(),
                            "zsh".to_owned(),
                        ]
                    },
                ),
                #[cfg(target_os = "windows")]
                excluded_process: partial_close_confirmation.excluded_process.unwrap_or_else(
                    || {
                        vec![
                            "cmd.exe".to_owned(),
                            "powershell.exe".to_owned(),
                            "pwsh.exe".to_owned(),
                        ]
                    },
                ),
            }),
        }
    }
}

impl Default for CloseConfirmation {
    fn default() -> Self {
        Self {
            tab: true,
            group: true,
            window: true,
            app: true,
            #[cfg(target_family = "unix")]
            excluded_process: vec![
                "sh".to_owned(),
                "bash".to_owned(),
                "fish".to_owned(),
                "zsh".to_owned(),
            ],
            #[cfg(target_os = "windows")]
            excluded_process: vec![
                "cmd.exe".to_owned(),
                "powershell.exe".to_owned(),
                "pwsh.exe".to_owned(),
            ],
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DesktopIntegration {
    pub custom_titlebar: bool,
    pub dynamic_title: bool,
}

impl Default for DesktopIntegration {
    fn default() -> Self {
        Self {
            #[cfg(target_family = "unix")]
            custom_titlebar: false,
            #[cfg(target_os = "windows")]
            custom_titlebar: true,
            dynamic_title: true,
        }
    }
}

impl<'de> Deserialize<'de> for DesktopIntegration {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct PartialDesktopIntegration {
            custom_titlebar: std::option::Option<bool>,
            dynamic_title: std::option::Option<bool>,
        }

        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Representation {
            Simple(bool),
            Complex(PartialDesktopIntegration),
        }

        let representation = Representation::deserialize(deserializer)?;

        Ok(match representation {
            Representation::Simple(enable) => Self {
                custom_titlebar: enable,
                dynamic_title: enable,
            },
            Representation::Complex(partial_desktop_integration) => Self {
                dynamic_title: partial_desktop_integration.dynamic_title.unwrap_or(true),
                #[cfg(target_family = "unix")]
                custom_titlebar: partial_desktop_integration.custom_titlebar.unwrap_or(false),
                #[cfg(target_os = "windows")]
                custom_titlebar: partial_desktop_integration.custom_titlebar.unwrap_or(true),
            },
        })
    }
}

const fn default_to_true() -> bool {
    true
}

fn default_profile(
    id: String,
    title_format: &str,
    background_transparency: RangedInt<0, 100, 100>,
    terminal_options: TerminalOption,
    theme: TerminalTheme,
) -> Profile {
    Profile {
        name: String::from("Default profile"),
        terminal_options,
        theme,
        background_transparency,
        id,
        #[cfg(target_family = "unix")]
        command: String::from("sh -c $SHELL"),
        #[cfg(target_os = "windows")]
        command: String::from("%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"),
        background: None,
        title_format: Formatter::new(title_format, "Default profile"),
    }
}

fn default_shortcuts() -> Vec<Shortcut> {
    vec![
        Shortcut {
            shortcut: String::from("CTRL+C"),
            action: ShortcutAction::Copy,
        },
        Shortcut {
            shortcut: String::from("CTRL+V"),
            action: ShortcutAction::Paste,
        },
        Shortcut {
            shortcut: String::from("CTRL+T"),
            action: ShortcutAction::OpenDefaultProfile,
        },
        Shortcut {
            shortcut: String::from("CTRL+MAJ+T"),
            action: ShortcutAction::SplitTabAndOpenDefaultProfile,
        },
        Shortcut {
            shortcut: String::from("CTRL+W"),
            action: ShortcutAction::CloseFocusedTab,
        },
        Shortcut {
            shortcut: String::from("CTRL+MAJ+W"),
            action: ShortcutAction::CloseWindow,
        },
        Shortcut {
            shortcut: String::from("CTRL+TAB"),
            action: ShortcutAction::FocusNextTab,
        },
        Shortcut {
            shortcut: String::from("CTRL+MAJ+TAB"),
            action: ShortcutAction::FocusPrevTab,
        },
    ]
}
