use uuid::Uuid;

#[derive(serde::Serialize, Clone, Copy)]
pub struct SendData<'a> {
    pub uuid: Uuid,
    pub data: &'a str,
}

#[derive(serde::Serialize, Clone, Copy)]
pub struct TitleChanged<'a> {
    pub uuid: Uuid,
    pub title: &'a str,
}

#[derive(serde::Serialize, Clone, Copy)]
pub struct ProgressUpdated {
    pub uuid: Uuid,
    pub progress: u8,
}
