use crate::common::errors::BadFileFormatError;

use serde::{de::Error, Deserialize, Serialize, Serializer};
use std::str::FromStr;

#[derive(Debug, Clone, Copy)]
pub struct RangedInt<const MIN: u32, const MAX: u32, const DEF: u32>(pub u32);

impl<const MIN: u32, const MAX: u32, const DEF: u32> Default for RangedInt<MIN, MAX, DEF> {
    fn default() -> Self {
        Self(DEF)
    }
}

impl<'de, const MIN: u32, const MAX: u32, const DEF: u32> serde::Deserialize<'de>
    for RangedInt<MIN, MAX, DEF>
{
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Ok(u32::deserialize(deserializer).map_or_else(
            |_| Self::default(),
            |deserialized_value| {
                if deserialized_value < MIN {
                    Self(MIN)
                } else if deserialized_value > MAX {
                    Self(MAX)
                } else {
                    Self(deserialized_value)
                }
            },
        ))
    }
}

impl<const MIN: u32, const MAX: u32, const DEF: u32> serde::Serialize for RangedInt<MIN, MAX, DEF> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_u32(self.0)
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all(serialize = "camelCase"))]
pub enum BackgroundType {
    Opaque,
    Media(BackgroundMedia),
    Transparent,
    #[cfg(target_family = "unix")]
    Blurred,
    #[cfg(target_os = "windows")]
    Acrylic,
    #[cfg(target_os = "windows")]
    Mica,
    #[cfg(target_os = "windows")]
    Tabbed,
    #[cfg(target_os = "macos")]
    Vibrancy,
}

impl FromStr for BackgroundType {
    type Err = Box<dyn std::error::Error>;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "opaque" => Ok(Self::Opaque),
            "transparent" => Ok(Self::Transparent),
            #[cfg(target_family = "unix")]
            "blurred" => Ok(Self::Blurred),
            #[cfg(target_os = "windows")]
            "acrylic" => Ok(Self::Acrylic),
            #[cfg(target_os = "windows")]
            "mica" => Ok(Self::Mica),
            #[cfg(target_os = "windows")]
            "tabbed" => Ok(Self::Tabbed),
            #[cfg(target_os = "macos")]
            "vibrancy" => Ok(Self::Vibrancy),
            _ => Ok(Self::Media(BackgroundMedia::from_str(s)?)),
        }
    }
}

impl Default for BackgroundType {
    fn default() -> Self {
        Self::Opaque
    }
}

impl<'de> serde::Deserialize<'de> for BackgroundType {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Debug, Deserialize)]
        #[serde(untagged)]
        enum Wrapper {
            Simple(String),
            Complex(BackgroundMedia),
        }

        Ok(match Wrapper::deserialize(deserializer)? {
            Wrapper::Simple(value) => Self::from_str(&value).unwrap_or_default(),
            Wrapper::Complex(media) => Self::Media(media),
        })
    }
}

#[derive(Debug, Deserialize, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CursorType {
    Block,
    Bar,
    Underline,
}

impl Default for CursorType {
    fn default() -> Self {
        Self::Block
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct BackgroundMedia {
    blur: RangedInt<0, 20, 0>,
    pub location: String,
}

impl std::str::FromStr for BackgroundMedia {
    type Err = Box<dyn std::error::Error>;

    fn from_str(path: &str) -> Result<Self, Self::Err> {
        if infer::is_image(&std::fs::read(path)?) {
            Ok(Self {
                location: path.to_owned(),
                blur: RangedInt::default(),
            })
        } else {
            Err(Box::new(BadFileFormatError::Image(path.to_owned())))
        }
    }
}

impl<'de> serde::Deserialize<'de> for BackgroundMedia {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Debug, Deserialize)]
        struct PartialBackgroundMedia {
            blur: Option<RangedInt<0, 20, 0>>,
            location: String,
        }

        let partial_background_media = PartialBackgroundMedia::deserialize(deserializer)?;
        Self::from_str(&partial_background_media.location)
            .map(|mut media| {
                media.blur = partial_background_media.blur.unwrap_or_default();
                media
            })
            .map_err(D::Error::custom)
    }
}
