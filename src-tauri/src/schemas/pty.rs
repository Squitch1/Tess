#[derive(serde::Serialize, Clone, Copy)]
pub struct SendData<'a> {
    pub id: &'a str,
    pub data: &'a str,
}

#[derive(serde::Serialize, Clone, Copy)]
pub struct TitleChanged<'a> {
    pub id: &'a str,
    pub title: &'a str,
}

#[derive(serde::Serialize, Clone, Copy)]
pub struct ProgressUpdated<'a> {
    pub id: &'a str,
    pub progress: u8,
}
