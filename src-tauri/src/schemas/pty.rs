use uuid::Uuid;

#[derive(serde::Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct SendData<'a> {
    pub pty_id: Uuid,
    pub data: &'a str,
}

#[derive(serde::Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct TitleChanged<'a> {
    pub pty_id: Uuid,
    pub title: &'a str,
}

#[derive(serde::Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct ProgressUpdated {
    pub pty_id: Uuid,
    pub progress: u8,
}
