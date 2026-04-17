use super::TransmissionPayload;

use crate::common::Logger;

use std::{
    ffi::{OsStr, OsString},
    io::Error,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::windows::named_pipe::{ClientOptions, NamedPipeClient, NamedPipeServer, ServerOptions},
};

#[derive(Debug)]
pub struct Client {
    sender: NamedPipeClient,
}

impl Client {
    #[allow(clippy::unused_async)]
    pub async fn new(addr: impl AsRef<OsStr>) -> Result<Self, Error> {
        Ok(Self {
            sender: ClientOptions::new().open(addr)?,
        })
    }

    pub async fn send(&mut self, src: &[u8]) -> Result<usize, Error> {
        self.sender.write(src).await
    }
}

#[derive(Debug)]
pub struct Server {
    listener: NamedPipeServer,
    addr: OsString,
}

impl Server {
    pub fn new(addr: impl AsRef<OsStr> + 'static) -> Result<Self, Error> {
        Ok(Self {
            listener: ServerOptions::new()
                .first_pipe_instance(true)
                .access_inbound(true)
                .create(addr.as_ref())?,
            addr: addr.as_ref().into(),
        })
    }

    pub fn listen(
        mut self,
        callback: impl Fn(Result<TransmissionPayload, Box<dyn std::error::Error>>)
            + Send
            + Sync
            + 'static,
    ) {
        tokio::spawn(async move {
            let mut buf = Vec::new();
            loop {
                buf.clear();
                match self.listener.connect().await {
                    Err(e) => callback(Err(Box::from(e))),
                    Ok(()) => callback(
                        self.listener
                            .read_to_end(&mut buf)
                            .await
                            .map_err(Box::from)
                            .and_then(|_| bitcode::decode(&buf).map_err(Box::from)),
                    ),
                }
                drop(self.listener);
                self.listener = match ServerOptions::new()
                    .first_pipe_instance(true)
                    .access_inbound(true)
                    .create(&self.addr)
                {
                    Ok(listener) => listener,
                    Err(e) => {
                        Logger {}.warn(&format!(
                            "IPC server stopped: {e}; an external connection is impossible."
                        ));
                        break;
                    }
                };
            }
        });
    }
}
