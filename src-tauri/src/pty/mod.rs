pub mod process;
pub mod title_formatter;

use crate::common::consts::{PTY_BUFFER_SIZE, RE_FRACTION, RE_PERCENTAGE, TESS_VERSION};
use crate::common::errors::PtyError;
use crate::pty::title_formatter::{Params, TitleFormatter};

use futures::future::join_all;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::ffi::{OsStr, OsString};
use std::io::{Read, Write};
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

#[cfg(target_os = "windows")]
use std::ffi::c_void;
#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStringExt;
#[cfg(target_os = "windows")]
use windows::core::PCWSTR;
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::LocalFree;
#[cfg(target_os = "windows")]
use windows::Win32::System::Environment::ExpandEnvironmentStringsW;
#[cfg(target_os = "windows")]
use windows::Win32::UI::Shell::CommandLineToArgvW;

pub struct Pty {
    writer: Mutex<Box<dyn Write + Send>>,
    child: Box<dyn Child + Send + Sync>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    paused: Arc<AtomicBool>,
    pre_parser: Arc<std::sync::Mutex<vt100::Parser>>,

    pub leader_name: Arc<Mutex<String>>,
    pub closed: Arc<AtomicBool>,
}

unsafe impl Send for Pty {}
unsafe impl Sync for Pty {}

impl Pty {
    #[allow(clippy::too_many_arguments, clippy::too_many_lines)]
    pub fn build_and_run(
        command: &str,
        workdir: Option<impl AsRef<OsStr>>,
        title: Option<String>,
        title_formatter: TitleFormatter,
        report_progress: bool,
        notify: bool,
        on_read: impl Fn(&str) + Send + 'static,
        on_title_update: impl Fn(&str) + Send + 'static,
        on_progress: impl Fn(u8) + Send + 'static,
        on_notify: impl Fn() + Send + 'static,
        once_exit: impl FnOnce() + Send + 'static,
    ) -> Result<Self, PtyError> {
        #[cfg(target_os = "windows")]
        let mut built_command = {
            let encoded_command = command
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect::<Vec<u16>>();

            let expanded_len = unsafe {
                ExpandEnvironmentStringsW(PCWSTR::from_raw(encoded_command.as_ptr()), None)
            } as usize;
            if expanded_len == 0 {
                return Err(PtyError::Creation("Cannot expand environment".to_owned()));
            }

            let mut command_expanded = vec![0; expanded_len];
            if unsafe {
                ExpandEnvironmentStringsW(
                    PCWSTR::from_raw(encoded_command.as_ptr()),
                    Some(command_expanded.as_mut_slice()),
                )
            } == 0
            {
                return Err(PtyError::Creation("Cannot expand environment".to_owned()));
            }

            let mut argc = 0;
            let argv = unsafe {
                CommandLineToArgvW(PCWSTR::from_raw(command_expanded.as_ptr()), &mut argc)
            };
            if argv.is_null() {
                return Err(PtyError::Creation("Cannot parse command".to_owned()));
            }

            let built_command = CommandBuilder::from_argv(
                unsafe { core::slice::from_raw_parts(argv, argc as usize) }
                    .iter()
                    .map(|s| OsString::from_wide(unsafe { s.as_wide() }))
                    .collect(),
            );
            unsafe {
                LocalFree(Some(windows::Win32::Foundation::HLOCAL(
                    argv as *mut c_void,
                )))
            };

            built_command
        };
        #[cfg(not(target_os = "windows"))]
        let mut built_command = CommandBuilder::from_argv(vec![
            OsString::from("sh"),
            OsString::from("-c"),
            OsString::from(command),
        ]);

        built_command.env("COLORTERM", "truecolor");
        built_command.env("TERM_PROGRAM", "Tess");
        built_command.env("TERM_PROGRAM_VERSION", TESS_VERSION);
        #[cfg(target_family = "unix")]
        built_command.env("TERM", "xterm-256color");

        if let Some(workdir) = workdir {
            built_command.cwd(workdir);
        }

        let pty_pair = native_pty_system()
            .openpty(PtySize::default())
            .map_err(|err| PtyError::Creation(err.to_string()))?;

        let writer = Mutex::new(
            pty_pair
                .master
                .take_writer()
                .map_err(|err| PtyError::Creation(err.to_string()))?,
        );
        let mut reader = pty_pair
            .master
            .try_clone_reader()
            .map_err(|err| PtyError::Creation(err.to_string()))?;
        let master = Arc::new(Mutex::new(pty_pair.master));

        #[cfg(target_family = "unix")]
        let child = pty_pair
            .slave
            .spawn_command(built_command)
            .map_err(|err| PtyError::Creation(err.to_string()))?;

        #[cfg(target_os = "windows")]
        let mut shell_pid = 0;
        #[cfg(target_os = "windows")]
        let child = pty_pair
            .slave
            .spawn_command(built_command)
            .and_then(|child| {
                shell_pid = child
                    .process_id()
                    .ok_or(PtyError::Creation("PID not found".to_owned()))?;
                Ok(child)
            })
            .map_err(|err| PtyError::Creation(err.to_string()))?;

        let leader_name = Arc::new(Mutex::new(String::new()));

        let closed = Arc::new(AtomicBool::new(false));
        let paused = Arc::new(AtomicBool::new(false));

        let progress_tracking = report_progress | title_formatter.options.progress;
        let current_progress = Arc::new(AtomicU8::new(0));

        let shell_title = Arc::new(std::sync::Mutex::new(None));
        let mut pre_parser = vt100::Parser::new(6, 144, 0);
        if let Some(title) = title {
            write!(pre_parser, "\x1b]2;{title}\x07").ok();
        }
        let pre_parser = Arc::new(std::sync::Mutex::new(pre_parser));

        {
            let closed = closed.clone();
            let paused = paused.clone();
            let shell_title = shell_title.clone();
            let pre_parser = pre_parser.clone();
            let current_progress = current_progress.clone();

            std::thread::spawn(move || {
                let mut buf = [0; PTY_BUFFER_SIZE];
                let mut remaining = 0;

                loop {
                    if paused.load(Ordering::Relaxed) {
                        std::thread::sleep(Duration::from_millis(10));
                        continue;
                    }

                    buf[remaining..].fill(0);
                    let read = match reader.read(&mut buf[remaining..]) {
                        Ok(0) => break,
                        Ok(n) => n,
                        Err(_) => continue,
                    };
                    let mut pre_parser = pre_parser.lock().unwrap();
                    let previous_cached_content = pre_parser.screen().contents();
                    let mut consummed = 0;
                    let mut processed_buf = std::io::Cursor::new([0; PTY_BUFFER_SIZE]);
                    let chunks = buf[..remaining + read].utf8_chunks();
                    for chunk in chunks {
                        pre_parser.process(chunk.valid().as_bytes());
                        processed_buf.write_all(chunk.valid().as_bytes()).ok();
                        consummed += chunk.valid().len();

                        if !chunk.invalid().is_empty() && (read + remaining) - consummed >= 4 {
                            consummed += chunk.invalid().len();
                            processed_buf.write_all("\u{FFFD}".as_bytes()).ok();
                        }
                    }
                    unsafe {
                        on_read(std::str::from_utf8_unchecked(processed_buf.get_ref()));
                    }
                    remaining = (remaining + read) - consummed;
                    buf.rotate_left(consummed);

                    let cached_content = pre_parser.screen().contents();
                    if cached_content != previous_cached_content {
                        if notify {
                            on_notify();
                        }

                        if progress_tracking && !pre_parser.screen().alternate_screen() {
                            let fetched_progress = RE_PERCENTAGE
                                .find_iter(&cached_content)
                                .map(|m| {
                                    m.as_str()
                                        .split('%')
                                        .next()
                                        .and_then(|number| number.parse::<f64>().ok())
                                        .filter(|progress| (0f64..100f64).contains(progress))
                                        .unwrap_or_default()
                                })
                                .last()
                                .map_or_else(
                                    || {
                                        RE_FRACTION
                                            .find_iter(&cached_content)
                                            .filter_map(|m| {
                                                let (numerator, denominator) = m
                                                    .as_str()
                                                    .split_once('/')
                                                    .map_or((0, 1), |(n, d)| {
                                                        (
                                                            n.parse().unwrap_or(0),
                                                            d.parse().unwrap_or(1),
                                                        )
                                                    });
                                                if numerator == 0 || numerator >= denominator {
                                                    None
                                                } else {
                                                    Some(
                                                        f64::from(numerator * 100)
                                                            / f64::from(denominator),
                                                    )
                                                }
                                            })
                                            .last()
                                    },
                                    Some,
                                )
                                .map(
                                    #[allow(
                                        clippy::cast_possible_truncation,
                                        clippy::cast_sign_loss
                                    )]
                                    |progress| progress as u8,
                                )
                                .unwrap_or_default();

                            if fetched_progress != current_progress.load(Ordering::Relaxed) {
                                current_progress.store(fetched_progress, Ordering::Relaxed);

                                if report_progress {
                                    on_progress(fetched_progress);
                                }
                            }
                        } else if current_progress.load(Ordering::Relaxed) != 0 && progress_tracking
                        {
                            current_progress.store(0, Ordering::Relaxed);

                            if report_progress {
                                on_progress(0);
                            }
                        }
                    }

                    if title_formatter.options.shell_title {
                        if let Ok(mut lock) = shell_title.lock() {
                            *lock = Some(pre_parser.screen().title().to_owned());
                        }
                    }
                }

                closed.store(true, Ordering::Relaxed);
                once_exit();
            });
        }

        {
            let closed = closed.clone();
            let leader_name = leader_name.clone();

            #[cfg(target_family = "unix")]
            let master = master.clone();

            tokio::spawn(async move {
                let mut interval = tokio::time::interval(Duration::from_millis(20));
                let mut current_title = String::new();

                on_title_update(&title_formatter.format(&Params::default()));

                loop {
                    interval.tick().await;

                    if closed.load(Ordering::Relaxed) {
                        break;
                    }

                    #[cfg(target_family = "unix")]
                    let leader_pid = master.lock().await.process_group_leader();
                    #[cfg(target_os = "windows")]
                    let leader_pid = Some(process::get_leader_pid(shell_pid));

                    if let Some(fetched_leader_pid) = leader_pid {
                        let mut fetched_leader_name = None;
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
                            vec![Box::pin(process::get_title(
                                fetched_leader_pid,
                                &mut fetched_leader_name,
                            ))];

                        if title_formatter.options.pwd {
                            fetchers.push(Box::pin(process::get_working_dir(
                                fetched_leader_pid,
                                &mut fetched_pwd,
                            )));
                        }
                        if title_formatter.options.short_pwd {
                            fetchers.push(Box::pin(process::get_short_working_dir(
                                fetched_leader_pid,
                                &mut fetched_short_pwd,
                            )));
                        }

                        let fetched_data_count = fetchers.len();
                        join_all(fetchers).await;

                        if fetched_data_count > 1
                            || title_formatter.options.progress
                            || title_formatter.options.shell_title
                            || title_formatter.options.leader_name
                        {
                            let generated_title = title_formatter.format(&Params {
                                pwd: fetched_pwd.as_deref(),
                                short_pwd: fetched_short_pwd.as_deref(),
                                leader_name: fetched_leader_name.as_deref(),
                                progress: fetched_progress,
                                shell_title: fetched_shell_title.as_deref(),
                            });

                            if generated_title != current_title {
                                on_title_update(&generated_title);
                                current_title = generated_title;
                            }
                        }

                        if let Some(fetched_leader_name) = fetched_leader_name {
                            *leader_name.lock().await = fetched_leader_name;
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
            leader_name,
            closed,
        })
    }

    pub async fn write(&self, content: &str) -> Result<(), PtyError> {
        self.writer
            .lock()
            .await
            .write(content.as_bytes())
            .map_err(|err| PtyError::Write(err.to_string()))
            .map(|_| ())
    }

    pub fn kill(&mut self) -> Result<(), PtyError> {
        if self.closed.load(Ordering::Relaxed) {
            Ok(())
        } else {
            self.child
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
