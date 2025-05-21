use std::process::Command;

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
    if !tauri_build::is_dev() {
        Command::new("npm").args(["run", "build"]).output()?;
    }

    Ok(tauri_build::build())
}
