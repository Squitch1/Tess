use super::TransmissionPayload;

use crate::common::Logger;

use std::io::Error;
use std::path::{Path, PathBuf};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{UnixListener, UnixStream};

pub struct Client {
    sender: UnixStream,
}

impl Client {
    pub async fn new(addr: impl AsRef<Path>) -> Result<Self, Error> {
        Ok(Self {
            sender: UnixStream::connect(addr).await?,
        })
    }

    pub async fn send(&mut self, src: &[u8]) -> Result<usize, Error> {
        self.sender.write(src).await
    }
}

pub struct Server {
    addr: PathBuf,
    listener: UnixListener,
}

impl Server {
    pub fn new(addr: impl AsRef<Path>) -> Result<Self, Error> {
        Ok(Self {
            listener: UnixListener::bind(addr.as_ref())?,
            addr: addr.as_ref().into(),
        })
    }

    pub fn listen(
        self,
        callback: impl Fn(Result<TransmissionPayload, Box<dyn std::error::Error>>)
            + Send
            + Sync
            + 'static,
    ) {
        tokio::spawn(async move {
            let mut buf = Vec::new();
            loop {
                let mut stream = match self.listener.accept().await {
                    Ok((stream, _)) => stream,
                    Err(e) => {
                        Logger {}.warn(&format!(
                            "IPC server stopped: {e}; an external connection is impossible."
                        ));
                        break;
                    }
                };
                buf.clear();
                callback(
                    stream
                        .read_to_end(&mut buf)
                        .await
                        .map_err(Box::from)
                        .and_then(|_| bitcode::decode(&buf).map_err(Box::from)),
                );
            }
        });
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        std::fs::remove_file(&self.addr).ok();
    }
}
