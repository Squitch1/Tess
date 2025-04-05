use std::io::Error;
use std::path::PathBuf;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{UnixListener, UnixStream};

use super::TransmissionPayload;

pub struct Client {
    sender: UnixStream,
}

impl Client {
    pub async fn new(addr: PathBuf) -> Result<Self, Error> {
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
    pub fn new(addr: PathBuf) -> Result<Self, Error> {
        Ok(Self {
            listener: UnixListener::bind(addr.clone())?,
            addr,
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
            loop {
                let (mut stream, _) = self.listener.accept().await.unwrap();

                let mut buf = Vec::new();
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
        std::fs::remove_file(self.addr.clone()).ok();
    }
}
