use super::deserialized::{CloseConfirmation, DesktopIntegration, Shortcut, TerminalSettings};
use super::types::{BackgroundMedia, BackgroundType, CursorType, RangedFloat, RangedInt};

use crate::common::consts;
use crate::settings::deserialized::AppBehavior;

use serde::{Deserialize, Deserializer};
use std::str::FromStr;
use uuid::Uuid;

#[derive(Deserialize, Debug)]
pub struct PartialSettings {
    #[serde(default)]
    pub theme: String,
    #[serde(default)]
    pub background: BackgroundType,
    #[serde(default)]
    pub profiles: Vec<PartialProfile>,
    #[serde(default, flatten)]
    pub terminal: TerminalSettings,
    #[serde(default)]
    pub background_transparency: RangedInt<0, 100, 100>,
    #[serde(default = "default_title_format")]
    pub title_format: String,

    #[serde(default)]
    pub shortcuts: Option<Vec<Shortcut>>,
    #[serde(default)]
    pub macros: Option<Vec<PartialMacro>>,

    #[serde(default)]
    pub close_confirmation: CloseConfirmation,
    #[serde(default)]
    pub desktop_integration: DesktopIntegration,
    #[serde(default)]
    pub app_behavior: AppBehavior,

    #[serde(default)]
    pub default_profile: Uuid,

    #[cfg(target_family = "unix")]
    #[serde(default)]
    pub webkit_compositing_mode: bool,
}

#[derive(Deserialize, Debug, Default)]
pub struct PartialProfile {
    pub id: Option<Uuid>,
    pub name: String,
    pub command: String,
    pub title: Option<String>,
    pub title_format: Option<String>,
    pub buffer_size: Option<RangedInt<500, 20000, 3000>>,
    pub cursor: Option<CursorType>,
    pub font_size: Option<RangedInt<10, 30, 15>>,
    pub font_ligature: Option<bool>,
    pub show_picture: Option<bool>,
    pub bell: Option<bool>,
    pub cursor_blink: Option<bool>,
    pub draw_bold_in_bright: Option<bool>,
    pub notify_change: Option<bool>,
    pub line_height: Option<RangedInt<100, 200, 100>>,
    pub letter_spacing: Option<RangedInt<0, 8, 0>>,
    pub font_weight: Option<RangedInt<1, 9, 4>>,
    pub font_weight_bold: Option<RangedInt<1, 9, 6>>,
    pub minimum_contrast_ratio: Option<RangedFloat<1, 21, 1>>,
    pub progress_tracking: Option<bool>,
    pub bracketed_paste: Option<bool>,
    pub hyperlink_modifier: Option<String>,
    pub theme: Option<String>,
    #[serde(deserialize_with = "deserialize_profile_background")]
    #[serde(default)]
    pub background: Option<BackgroundMedia>,
    pub background_transparency: Option<RangedInt<0, 100, 100>>,
}

#[derive(Deserialize, Debug)]
pub struct PartialMacro {
    pub content: String,
    pub id: Option<Uuid>,
}

#[allow(clippy::unnecessary_wraps)]
fn deserialize_profile_background<'de, D>(data: D) -> Result<Option<BackgroundMedia>, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize, Debug)]
    #[serde(untagged)]
    enum Wrapper {
        Simple(String),
        Complex(BackgroundMedia),
    }

    Ok(
        Wrapper::deserialize(data).map_or(None, |representation| match representation {
            Wrapper::Simple(path) => BackgroundMedia::from_str(&path).ok(),
            Wrapper::Complex(background) => Some(background),
        }),
    )
}

pub fn default_title_format() -> String {
    String::from(consts::DEFAULT_PROFILE_TITLE)
}
