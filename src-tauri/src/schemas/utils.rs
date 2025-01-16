#[derive(serde::Serialize, Clone, Copy)]
pub struct Toast<'a> {
    pub title: &'a str,
    pub message: Option<&'a str>,
    pub r#type: ToastType,
}

#[derive(serde::Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum ToastType {
    Error,
    Warn,
    Info,
}
