use std::process::Command;

fn main() {
    if let Some((commit_date, commit_hash)) = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map(|s| s.trim().to_owned())
        .and_then(|commit_hash| {
            Command::new("git")
                .args(["show", "--no-patch", "--format=%ci", &commit_hash])
                .output()
                .ok()
                .and_then(|out| String::from_utf8(out.stdout).ok())
                .and_then(|commit_date| {
                    commit_date.split_once(' ').map(|(date, _)| date.to_owned())
                })
                .zip(Some(commit_hash))
        })
    {
        println!("cargo:rustc-env=GIT_COMMIT_INFO={commit_hash} {commit_date}");
    }

    tauri_build::build();
}
