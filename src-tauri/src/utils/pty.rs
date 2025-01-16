#[cfg(target_os = "windows")]
pub fn get_leader_pid(shell_pid: u32) -> u32 {
    use std::mem::size_of;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
    };

    use windows::Win32::System::Diagnostics::ToolHelp::TH32CS_SNAPPROCESS;

    let mut leader_pid = shell_pid;

    let handle = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).unwrap() };
    let mut process_entry = PROCESSENTRY32W {
        dwSize: size_of::<PROCESSENTRY32W>().try_into().unwrap_or_default(),
        ..Default::default()
    };

    let mut next_entry_result: windows::core::Result<()> =
        unsafe { Process32FirstW(handle, &mut process_entry) };
    while next_entry_result.is_ok() {
        if process_entry.th32ParentProcessID == leader_pid {
            leader_pid = process_entry.th32ProcessID;
        }

        next_entry_result = unsafe { Process32NextW(handle, &mut process_entry) };
    }

    leader_pid
}

#[cfg(target_os = "windows")]
pub async fn get_process_title(pid: u32, fetched_title: &mut Option<String>) {
    use std::{ffi::OsString, os::windows::ffi::OsStringExt};
    use windows::Win32::{
        Foundation::CloseHandle,
        System::Threading::{PROCESS_QUERY_INFORMATION, PROCESS_VM_READ},
    };

    *fetched_title = tokio::task::spawn_blocking(move || {
        unsafe {
            windows::Win32::System::Threading::OpenProcess(
                PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
                false,
                pid,
            )
        }
        .map_or(None, |handle| {
            let mut path = [0; 4096];
            let path_len = unsafe {
                windows::Win32::System::ProcessStatus::GetModuleFileNameExW(handle, None, &mut path)
            };

            unsafe { CloseHandle(handle).ok() };

            std::path::PathBuf::from(OsString::from_wide(&path[..path_len as usize]))
                .file_name()
                .and_then(|filename| filename.to_os_string().into_string().ok())
        })
    })
    .await
    .unwrap_or(None);
}

#[cfg(target_family = "unix")]
pub async fn get_process_title(pid: i32, fetched_title: &mut Option<String>) {
    *fetched_title = tokio::task::spawn_blocking(move || {
        std::fs::read_to_string(format!("/proc/{pid}/comm")).map_or(
            None,
            |mut process_leader_title| {
                process_leader_title.pop();

                if process_leader_title == "tokio-runtime-w" {
                    None
                } else if process_leader_title == "sudo" {
                    std::fs::read_to_string(format!("/proc/{pid}/cmdline")).map_or(
                        Some(process_leader_title),
                        |cmdline| {
                            Some(cmdline.split('\0').take(2).collect::<Vec<&str>>().join(" "))
                        },
                    )
                } else {
                    Some(process_leader_title)
                }
            },
        )
    })
    .await
    .unwrap();
}

#[cfg(target_family = "unix")]
pub async fn get_process_working_dir(pid: i32, fetched_pwd: &mut Option<String>) {
    *fetched_pwd = tokio::task::spawn_blocking(move || {
        std::fs::read_link(format!("/proc/{pid}/cwd"))
            .map_or(None, |path| path.into_os_string().into_string().ok())
    })
    .await
    .unwrap();
}

#[cfg(target_os = "windows")]
pub async fn get_process_working_dir(pid: u32, fetched_pwd: &mut Option<String>) {
    use std::mem::size_of;
    use std::{os::raw::c_void, ptr};

    use windows::Win32::System::Diagnostics::Debug::ReadProcessMemory;
    use windows::Win32::System::Threading::PEB;
    use windows::{
        Wdk::System::Threading::{NtQueryInformationProcess, ProcessBasicInformation},
        Win32::{
            Foundation::CloseHandle,
            System::Threading::{
                PROCESS_BASIC_INFORMATION, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
            },
        },
    };
    use windows_native::ntrtl::RTL_USER_PROCESS_PARAMETERS;

    if let Ok(handle) = unsafe {
        windows::Win32::System::Threading::OpenProcess(
            PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
            false,
            pid,
        )
    } {
        let pbi = PROCESS_BASIC_INFORMATION::default();

        *fetched_pwd = unsafe {
            NtQueryInformationProcess(
                handle,
                ProcessBasicInformation,
                &pbi as *const _ as *mut c_void,
                size_of::<PROCESS_BASIC_INFORMATION>() as u32,
                ptr::null_mut(),
            )
            .map(|()| (handle, pbi))
        }
        .and_then(|(handle, pbi)| {
            let peb = PEB::default();

            unsafe {
                ReadProcessMemory(
                    handle,
                    pbi.PebBaseAddress as *const c_void,
                    &peb as *const _ as *mut c_void,
                    size_of::<PEB>(),
                    None,
                )
                .map(|()| (handle, peb))
            }
        })
        .and_then(|(handle, peb)| {
            let upp = RTL_USER_PROCESS_PARAMETERS::default();

            unsafe {
                ReadProcessMemory(
                    handle,
                    peb.ProcessParameters as *const c_void,
                    &upp as *const _ as *mut c_void,
                    size_of::<RTL_USER_PROCESS_PARAMETERS>(),
                    None,
                )
                .map(|()| (handle, upp))
            }
        })
        .and_then(|(handle, upp)| {
            let mut path: Vec<u16> = vec![0; (upp.CurrentDirectory.DosPath.Length / 2) as usize];

            unsafe {
                ReadProcessMemory(
                    handle,
                    upp.CurrentDirectory.DosPath.Buffer.as_ptr() as *mut c_void,
                    path.as_mut_ptr() as *mut c_void,
                    upp.CurrentDirectory.DosPath.Length as usize,
                    None,
                )
                .map(|()| String::from_utf16_lossy(&path[..path.len() - 1]))
            }
        })
        .ok();

        unsafe { CloseHandle(handle).ok() };
    }
}

#[cfg(target_family = "unix")]
pub async fn get_process_short_working_dir(pid: i32, fetched_short_pwd: &mut Option<String>) {
    *fetched_short_pwd = tokio::task::spawn_blocking(move || {
        std::fs::read_link(format!("/proc/{pid}/cwd")).map_or(None, |path| {
            Some(if dirs_next::home_dir().is_some_and(|home| home == path) {
                String::from("~")
            } else {
                path.file_name().map_or_else(
                    || String::from("/"),
                    |dir| dir.to_os_string().to_string_lossy().to_string(),
                )
            })
        })
    })
    .await
    .unwrap();
}

#[cfg(target_os = "windows")]
pub async fn get_process_short_working_dir(pid: u32, fetched_short_pwd: &mut Option<String>) {
    let mut fetched_pwd = None;
    get_process_working_dir(pid, &mut fetched_pwd).await;

    *fetched_short_pwd = fetched_pwd.map(|path| {
        let path = std::path::PathBuf::from(&path);
        if dirs_next::home_dir().is_some_and(|home| path == home) {
            String::from("~")
        } else {
            path.file_name().map_or_else(
                || path.to_str().unwrap_or("\\").to_owned(),
                |dir| dir.to_os_string().to_string_lossy().to_string(),
            )
        }
    });
}
