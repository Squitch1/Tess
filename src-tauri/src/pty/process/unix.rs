pub async fn get_title(pid: i32, fetched_title: &mut Option<String>) {
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

pub async fn get_working_dir(pid: i32, fetched_pwd: &mut Option<String>) {
    *fetched_pwd = tokio::task::spawn_blocking(move || {
        std::fs::read_link(format!("/proc/{pid}/cwd"))
            .map_or(None, |path| path.into_os_string().into_string().ok())
    })
    .await
    .unwrap();
}

pub async fn get_short_working_dir(pid: i32, fetched_short_pwd: &mut Option<String>) {
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
