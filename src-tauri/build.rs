use std::{process::Command, time::Duration};

#[cfg(windows)]
pub const NPM: &str = "npm.cmd";
#[cfg(not(windows))]
pub const NPM: &str = "npm";

fn main() -> Result<(), Box<dyn std::error::Error>> {
    if let Some((commit_date, commit_hash)) = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .as_ref()
        .and_then(|out| str::from_utf8(&out.stdout).ok().map(str::trim))
        .and_then(|commit_hash| {
            Command::new("git")
                .args(["show", "--no-patch", "--format=%ci", commit_hash])
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

    println!("cargo::rerun-if-changed=dist");
    println!("cargo::rerun-if-changed=../src");

    if !tauri_build::is_dev() {
        let duration = std::fs::metadata("dist/index.html")
            .and_then(|m| m.modified())
            .map(|time| time.elapsed().unwrap_or(Duration::MAX));
        if duration.is_err()
            || duration
                .as_ref()
                .is_ok_and(|duration| duration > &Duration::from_secs(30))
        {
            Command::new(NPM).args(["run", "build"]).output()?;
        }
    }

    tauri_build::build();
    Ok(())
}
