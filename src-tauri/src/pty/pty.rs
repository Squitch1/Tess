use std::ffi::OsString;
use std::io::{Read, Write};
use std::sync::{mpsc, Arc};
use std::time::Duration;

use std::pin::Pin;

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};

use tokio::sync::Mutex;

use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};

use crate::utils::errors::PtyError;
use crate::utils::formatter::{Formatter, FormatterParams};

use futures::future::join_all;

use regex_lite::Regex;

#[cfg(target_os = "windows")]
use regex_lite::Captures;

pub struct Pty {
    writer: Box<dyn Write + Send>,
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    paused: Arc<AtomicBool>,
    pre_parser: Arc<std::sync::Mutex<vt100::Parser>>,

    pub leader_name: Arc<Mutex<String>>,
    pub closed: Arc<AtomicBool>,
}

unsafe impl Send for Pty {}
unsafe impl Sync for Pty {}

impl Pty {
    pub fn build_and_run(
        command: &str,
        title_formatter: Formatter,
        progress_report: bool,
        displayed_content_update_report: bool,
        on_read: impl Fn(&str) + std::marker::Send + 'static,
        on_tab_title_update: impl Fn(&str) + std::marker::Send + 'static,
        on_action_progress: impl Fn(u8) + Send + 'static,
        on_displayed_content_updated: impl Fn() + Send + 'static,
        once_exit: impl FnOnce() + std::marker::Send + 'static,
    ) -> Result<Self, PtyError> {
        #[cfg(target_os = "windows")]
        lazy_static::lazy_static! {
            static ref PROGRAMM_PARSING_REGEX: Regex = Regex::new("%([[:word:]]*)%").unwrap();
        }

        #[cfg(target_os = "windows")]
        let builded_command = CommandBuilder::from_argv(
            PROGRAMM_PARSING_REGEX
                .replace_all(command, |env_variable: &Captures| {
                    std::env::var(&env_variable[1]).unwrap_or_default()
                })
                .split(' ')
                .map(std::ffi::OsString::from)
                .collect::<Vec<OsString>>(),
        );

        #[cfg(target_family = "unix")]
        #[allow(unused_mut)]
        let mut builded_command = CommandBuilder::from_argv(
            command
                .split(' ')
                .map(std::ffi::OsString::from)
                .collect::<Vec<OsString>>(),
        );

        #[cfg(target_family = "unix")]
        builded_command.env("TERM", "xterm-256color");

        let pty_pair = native_pty_system()
            .openpty(PtySize::default())
            .map_err(|err| PtyError::Creation(err.to_string()))?;

        let writer = pty_pair
            .master
            .take_writer()
            .map_err(|err| PtyError::Creation(err.to_string()))?;
        let mut reader = pty_pair
            .master
            .try_clone_reader()
            .map_err(|err| PtyError::Creation(err.to_string()))?;
        let master = Arc::new(Mutex::from(pty_pair.master));

        #[cfg(target_family = "unix")]
        let child = Arc::from(Mutex::new(
            pty_pair
                .slave
                .spawn_command(builded_command)
                .map_err(|err| PtyError::Creation(err.to_string()))?,
        ));

        #[cfg(target_os = "windows")]
        let mut shell_pid = 0;
        #[cfg(target_os = "windows")]
        let child = Arc::from(Mutex::new(
            pty_pair
                .slave
                .spawn_command(builded_command)
                .and_then(|child| {
                    shell_pid = child
                        .process_id()
                        .ok_or(PtyError::Creation("PID not found".to_owned()))?;
                    Ok(child)
                })
                .map_err(|err| PtyError::Creation(err.to_string()))?,
        ));

        let leader_process = Arc::new(Mutex::from(String::new()));

        let closed = Arc::new(AtomicBool::new(false));

        let (exit_sender, exit_receiver) = mpsc::channel::<()>();
        let paused = Arc::from(AtomicBool::new(false));

        let progress_tracking = progress_report | title_formatter.options.action_progress;
        let current_progress = Arc::new(AtomicU8::new(0));

        let shell_title = Arc::new(std::sync::Mutex::from(None));
        let pre_parser = Arc::new(std::sync::Mutex::from(vt100::Parser::new(6, 144, 0)));

        {
            let shell_title = shell_title.clone();
            let pre_parser = pre_parser.clone();
            let current_progress = current_progress.clone();
            let paused = paused.clone();

            std::thread::spawn(move || {
                let mut buf = [0; 16384];
                let mut remaining = 0;

                lazy_static::lazy_static! {
                    static ref PROGRESS_PARSING_PERCENT_REGEX: Regex = Regex::new(r"(([0-9]*[.])?[0-9]+%)").unwrap();
                    static ref PROGRESS_PARSING_FRAC_REGEX: Regex = Regex::new(r"(\d+/\d+)").unwrap();
                }

                loop {
                    if !paused.load(Ordering::Relaxed) {
                        buf[remaining..].fill(0);

                        if reader
                            .read(&mut buf[remaining..])
                            .is_ok_and(|bytes| bytes > 0)
                        {
                            let mut pre_parser = pre_parser.lock().unwrap();
                            let previous_cached_content = pre_parser.screen().contents();
                            match std::str::from_utf8(&buf) {
                                Ok(parsed_buf) => {
                                    pre_parser.process(parsed_buf.as_bytes());
                                    on_read(parsed_buf);
                                    remaining = 0;
                                }
                                Err(utf8) => {
                                    pre_parser.process(&buf[..utf8.valid_up_to()]);
                                    on_read(unsafe {
                                        std::str::from_utf8_unchecked(&buf[..utf8.valid_up_to()])
                                    });
                                    remaining = buf[utf8.valid_up_to()..].len()
                                        - (buf.len()
                                            - utf8.valid_up_to()
                                            - utf8
                                                .error_len()
                                                .unwrap_or_else(|| buf.len() - utf8.valid_up_to()));
                                    buf.rotate_left(utf8.valid_up_to());
                                }
                            }

                            if pre_parser.screen().contents() != previous_cached_content {
                                if displayed_content_update_report {
                                    on_displayed_content_updated();
                                }

                                if progress_tracking && !pre_parser.screen().alternate_screen() {
                                    let fetched_progress = PROGRESS_PARSING_PERCENT_REGEX
                                        .find_iter(&pre_parser.screen().contents())
                                        .map(|m| {
                                            m.as_str()
                                                .split_once('%')
                                                .and_then(|(number, _)| number.parse::<f64>().ok())
                                                .map(|progress| (progress.ceil() as u64))
                                                .unwrap_or_default()
                                        })
                                        .filter(|progress| *progress > 0)
                                        .filter(|progress| *progress < 100)
                                        .last()
                                        .map_or_else(
                                            || {
                                                PROGRESS_PARSING_FRAC_REGEX
                                                    .find_iter(&pre_parser.screen().contents())
                                                    .map(|m| {
                                                        let parts = m
                                                            .as_str()
                                                            .split_once('/')
                                                            .unwrap_or_default();
                                                        let numerator =
                                                            parts.0.parse::<u64>().unwrap_or(0);
                                                        let denominator =
                                                            parts.1.parse::<u64>().unwrap_or(1);
                                                        if numerator == 0
                                                            || numerator >= denominator
                                                        {
                                                            0
                                                        } else {
                                                            (numerator * 100 / denominator).max(1)
                                                        }
                                                    })
                                                    .filter(|progress| *progress > 0)
                                                    .last()
                                            },
                                            Some,
                                        )
                                        .filter(|progress| *progress <= 100)
                                        .map(|progress| (progress % 100) as u8)
                                        .unwrap_or_default();

                                    if fetched_progress != current_progress.load(Ordering::Relaxed)
                                    {
                                        current_progress.store(fetched_progress, Ordering::Relaxed);

                                        if progress_report {
                                            on_action_progress(fetched_progress);
                                        }
                                    }
                                } else if current_progress.load(Ordering::Relaxed) != 0
                                    && progress_tracking
                                {
                                    current_progress.store(0, Ordering::Relaxed);

                                    if progress_report {
                                        on_action_progress(0);
                                    }
                                }
                            }

                            if title_formatter.options.shell_title {
                                if let Ok(mut lock) = shell_title.lock() {
                                    *lock = Some(pre_parser.screen().title().to_owned());
                                }
                            }
                        }
                    }

                    if exit_receiver.try_recv().is_ok() {
                        break;
                    }
                }
            });
        }

        {
            let closed = closed.clone();
            let child = child.clone();
            let leader_process = leader_process.clone();

            #[cfg(target_family = "unix")]
            let master = master.clone();

            tokio::spawn(async move {
                let mut interval = tokio::time::interval(Duration::from_millis(20));
                let mut current_title = String::new();

                on_tab_title_update(&title_formatter.format(&FormatterParams::default()));

                loop {
                    interval.tick().await;

                    if matches!(child.lock().await.try_wait(), Ok(Some(_))) {
                        exit_sender.send(()).ok();

                        closed.store(true, Ordering::Relaxed);
                        once_exit();

                        break;
                    }

                    #[cfg(target_family = "unix")]
                    let process_leader_pid = master.lock().await.process_group_leader();
                    #[cfg(target_os = "windows")]
                    let process_leader_pid = Some(crate::utils::pty::get_leader_pid(shell_pid));

                    if let Some(fetched_leader_pid) = process_leader_pid {
                        let mut fetched_leader_process = None;
                        let mut fetched_pwd = None;
                        let mut fetched_short_pwd = None;
                        let fetched_progress = match current_progress.load(Ordering::Relaxed) {
                            0 => None,
                            value => Some(value),
                        };
                        let fetched_shell_title = if title_formatter.options.shell_title {
                            let sync_fetched_shell_title = shell_title.clone();
                            tokio::task::spawn_blocking(move || {
                                sync_fetched_shell_title.lock().unwrap().clone()
                            })
                            .await
                            .unwrap()
                        } else {
                            None
                        };

                        let mut fetchers: Vec<Pin<Box<dyn futures::Future<Output = ()> + Send>>> =
                            vec![Box::pin(crate::utils::pty::get_process_title(
                                fetched_leader_pid,
                                &mut fetched_leader_process,
                            ))];

                        if title_formatter.options.pwd {
                            fetchers.push(Box::pin(crate::utils::pty::get_process_working_dir(
                                fetched_leader_pid,
                                &mut fetched_pwd,
                            )));
                        }
                        if title_formatter.options.short_pwd {
                            fetchers.push(Box::pin(
                                crate::utils::pty::get_process_short_working_dir(
                                    fetched_leader_pid,
                                    &mut fetched_short_pwd,
                                ),
                            ));
                        }

                        let fetched_data_count = fetchers.len();
                        join_all(fetchers).await;

                        if fetched_data_count > 1
                            || title_formatter.options.action_progress
                            || title_formatter.options.shell_title
                            || title_formatter.options.leader_process
                        {
                            let generated_title = title_formatter.format(&FormatterParams {
                                pwd: fetched_pwd,
                                short_pwd: fetched_short_pwd,
                                leader_process: fetched_leader_process.clone(),
                                progress: fetched_progress,
                                shell_title: fetched_shell_title,
                            });

                            if generated_title != current_title {
                                on_tab_title_update(&generated_title);
                                current_title = generated_title;
                            }
                        }

                        if let Some(fetched_leader_process) = fetched_leader_process {
                            *leader_process.lock().await = fetched_leader_process;
                        }
                    }
                }
            });
        }

        Ok(Self {
            writer,
            child,
            master,
            paused,
            pre_parser,
            leader_name: leader_process,
            closed,
        })
    }

    pub fn write(&mut self, content: &str) -> Result<(), PtyError> {
        self.writer
            .write(content.as_bytes())
            .map_err(|err| PtyError::Write(err.to_string()))
            .map(|_| ())
    }

    pub async fn kill(&self) -> Result<(), PtyError> {
        if self.closed.load(Ordering::Relaxed) {
            Ok(())
        } else {
            self.child
                .lock()
                .await
                .kill()
                .map_err(|err| PtyError::Kill(err.to_string()))
                .map(|()| self.closed.store(true, Ordering::Relaxed))
        }
    }

    pub async fn resize(&self, cols: u16, rows: u16) -> Result<(), PtyError> {
        let pre_parser = self.pre_parser.clone();
        tokio::task::spawn_blocking(move || pre_parser.lock().unwrap().set_size(6, cols.max(144)))
            .await
            .ok();

        self.master
            .lock()
            .await
            .resize(PtySize {
                rows,
                cols,
                ..Default::default()
            })
            .map_err(|err| PtyError::Resize(err.to_string()))
    }

    pub fn pause(&self) {
        self.paused.store(true, Ordering::Relaxed);
    }

    pub fn resume(&self) {
        self.paused.store(false, Ordering::Relaxed);
    }
}
