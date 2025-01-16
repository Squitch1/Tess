#[derive(Debug, thiserror::Error)]
pub enum PtyError {
    #[error("There is no terminal corresponding to this ID.")]
    UnknownPty,
    #[error("{0}.")]
    Creation(String),
    #[error("{0}.")]
    Write(String),
    #[error("{0}.")]
    Resize(String),
    #[error("{0}.")]
    Kill(String),
    #[error("{0}.")]
    Property(String),
}

impl serde::Serialize for PtyError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
