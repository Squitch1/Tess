#[derive(Clone, Debug)]
enum TitlePart {
    Static(String),
    Dynamic([String; 3]),
}
#[allow(clippy::struct_excessive_bools)]
#[derive(Default, Clone, Copy, Debug)]
pub struct Options {
    pub pwd: bool,
    pub short_pwd: bool,
    pub leader_name: bool,
    pub progress: bool,
    pub shell_title: bool,
}
#[derive(Default)]
pub struct Params<'a> {
    pub pwd: Option<&'a str>,
    pub short_pwd: Option<&'a str>,
    pub leader_name: Option<&'a str>,
    pub progress: Option<u8>,
    pub shell_title: Option<&'a str>,
}

#[derive(Debug, Clone)]
pub struct TitleFormatter {
    parts: Vec<TitlePart>,
    pub options: Options,
}

impl TitleFormatter {
    pub fn new(title: &str, profile_name: &str) -> Self {
        let mut parts = Vec::new();
        let mut current_static_part = String::new();
        let mut current_placeholder_parts: [String; 3] = Default::default();
        let mut current_placeholder_part = 0;
        let mut in_placeholder = false;
        let mut escaped = false;
        let mut format_option = Options::default();

        for char in title.chars() {
            if escaped {
                escaped = false;
                if in_placeholder {
                    current_placeholder_parts[current_placeholder_part].push(char);
                } else {
                    current_static_part.push(char);
                }
            } else {
                match char {
                    '\\' => {
                        escaped = true;
                    }
                    '%' => {
                        if in_placeholder {
                            match current_placeholder_parts[1].clone().as_str() {
                                "profile_name" => {
                                    current_static_part.push_str(&current_placeholder_parts[0]);
                                    current_static_part.push_str(profile_name);
                                    current_static_part.push_str(&current_placeholder_parts[2]);

                                    parts.push(TitlePart::Static(std::mem::take(
                                        &mut current_static_part,
                                    )));

                                    current_placeholder_parts = Default::default();
                                }
                                placeholder @ ("pwd" | "short_pwd" | "leader_name" | "progress"
                                | "shell_title") => {
                                    parts.push(TitlePart::Static(std::mem::take(
                                        &mut current_static_part,
                                    )));
                                    parts.push(TitlePart::Dynamic(std::mem::take(
                                        &mut current_placeholder_parts,
                                    )));

                                    match placeholder {
                                        "pwd" => format_option.pwd = true,
                                        "short_pwd" => format_option.short_pwd = true,
                                        "leader_name" => format_option.leader_name = true,
                                        "progress" => format_option.progress = true,
                                        "shell_title" => format_option.shell_title = true,
                                        _ => unreachable!(),
                                    }
                                }
                                _ => {
                                    current_static_part.push('%');
                                    current_static_part
                                        .push_str(&current_placeholder_parts.join("|"));
                                    current_static_part.push('%');

                                    parts.push(TitlePart::Static(std::mem::take(
                                        &mut current_static_part,
                                    )));

                                    current_placeholder_parts = Default::default();
                                }
                            }

                            current_placeholder_part = 0;
                        }

                        in_placeholder = !in_placeholder;
                    }
                    '|' if in_placeholder && current_placeholder_part < 2 => {
                        current_placeholder_part += 1;
                    }
                    char => {
                        if in_placeholder {
                            current_placeholder_parts[current_placeholder_part].push(char);
                        } else {
                            current_static_part.push(char);
                        }
                    }
                }
            }
        }

        if in_placeholder {
            parts.push(TitlePart::Static(format!(
                "{}%{}",
                current_static_part,
                current_placeholder_parts[0..=current_placeholder_part].join("|")
            )));
        } else if !current_static_part.is_empty() {
            parts.push(TitlePart::Static(current_static_part));
        }

        Self {
            parts,
            options: format_option,
        }
    }

    pub fn format(&self, params: &Params) -> String {
        self.parts
            .iter()
            .map(|part| match part {
                TitlePart::Static(content) => content.to_owned(),
                TitlePart::Dynamic(content) => {
                    let mut output = String::new();
                    match (content[1].as_str(), params) {
                        (
                            "pwd",
                            Params {
                                pwd: Some(value), ..
                            },
                        )
                        | (
                            "short_pwd",
                            Params {
                                short_pwd: Some(value),
                                ..
                            },
                        )
                        | (
                            "leader_name",
                            Params {
                                leader_name: Some(value),
                                ..
                            },
                        )
                        | (
                            "shell_title",
                            Params {
                                shell_title: Some(value),
                                ..
                            },
                        ) => {
                            output.push_str(&content[0]);
                            output.push_str(value);
                            output.push_str(&content[2]);

                            output
                        }
                        (
                            "progress",
                            Params {
                                progress: Some(value),
                                ..
                            },
                        ) => {
                            output.push_str(&content[0]);
                            output.push_str(&value.to_string());
                            output.push_str(&content[2]);

                            output
                        }
                        _ => output,
                    }
                }
            })
            .collect::<String>()
    }
}
