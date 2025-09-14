use std::{path::PathBuf, process::Command, time::Duration};

#[cfg(target_family = "unix")]
use clap::CommandFactory;

#[cfg(windows)]
use std::io::Write;

#[cfg(windows)]
const NPM: &str = "npm.cmd";
#[cfg(not(windows))]
const NPM: &str = "npm";

include!("src/cli/mod.rs");

fn main() -> Result<(), Box<dyn std::error::Error>> {
    #[allow(unused)]
    let build_date = if let Some((commit_date, commit_hash)) = Command::new("git")
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
        }) {
        println!("cargo:rustc-env=GIT_COMMIT_INFO={commit_hash} {commit_date}");
        commit_date
    } else {
        chrono::Utc::now().format("%F").to_string()
    };

    println!("cargo::rerun-if-changed=dist");
    println!("cargo::rerun-if-changed=../src");

    if !tauri_build::is_dev() && std::env::var_os("SKIP_FRONTEND").is_none() {
        let duration = std::fs::metadata("dist/index.html")
            .and_then(|m| m.modified())
            .map(|time| time.elapsed().unwrap_or(Duration::MAX));
        if duration.is_err()
            || duration
                .as_ref()
                .is_ok_and(|duration| duration > &Duration::from_secs(30))
        {
            let output = Command::new(NPM).args(["run", "build"]).output()?;
            if !output.status.success() {
                return Err(String::from_utf8_lossy(&output.stderr).into());
            }
        }
    }

    #[cfg(target_family = "unix")]
    {
        println!("cargo::rerun-if-changed=gen/man");
        println!("cargo::rerun-if-env-changed=SKIP_FRONTEND");

        if std::env::var_os("GEN_RESOURCES").is_some() {
            let man_out_dir = PathBuf::from(".").join("gen").join("man");
            std::fs::create_dir_all(&man_out_dir)?;

            fn generate(
                cmd: clap::Command,
                out_dir: &PathBuf,
                build_date: &str,
            ) -> Result<PathBuf, std::io::Error> {
                for mut cmd in cmd
                    .get_subcommands()
                    .filter(|cmd| !cmd.is_hide_set())
                    .cloned()
                {
                    if let Some(about) = cmd.get_about() {
                        let mut start = about.to_string();
                        let end = start.split_off(1);
                        start.make_ascii_lowercase();
                        cmd = cmd.about(format!("{start}{end}"))
                    }
                    generate(cmd, out_dir, build_date)?;
                }

                let cmd_name = cmd.get_display_name().unwrap_or_else(|| cmd.get_name());
                clap_mangen::Man::new(cmd.clone())
                    .title(cmd_name.to_ascii_uppercase())
                    .date(build_date)
                    .source(env!("CARGO_PKG_VERSION"))
                    .manual("Tess Manual")
                    .generate_to(out_dir)
            }

            let mut cmd = Cli::command()
                .about("modern and web-based terminal emulator")
                .disable_help_subcommand(true);
            cmd.build();
            generate(cmd, &man_out_dir, &build_date)?;
        }
    }

    tauri_build::build();

    #[cfg(windows)]
    {
        println!("cargo::rerun-if-changed=../packaging/windows/resources/rc");

        let out_dir = std::env::var_os("OUT_DIR").unwrap();
        let mut includes = vec![];

        for include in std::fs::read_dir(
            std::fs::read_dir(
                PathBuf::from("/")
                    .join("Program Files (x86)")
                    .join("Windows Kits")
                    .join("10")
                    .join("Include")
                    .canonicalize()?,
            )?
            .take(1)
            .next()
            .unwrap()
            .unwrap()
            .path(),
        )? {
            includes.extend(["/I".into(), include?.path().into_os_string()]);
        }

        for resource in std::fs::read_dir(
            PathBuf::from("..")
                .join("packaging")
                .join("windows")
                .join("resources")
                .join("rc")
                .canonicalize()?,
        )? {
            let resource = resource?;

            if resource.file_type()?.is_file() {
                let mut out_file = PathBuf::from(&out_dir).join(resource.file_name());
                out_file.set_extension("res");

                let mut args = includes.clone();
                args.extend(["/fo".into(), out_file.clone().into_os_string()]);
                args.push(resource.path().into_os_string());
                Command::new("rc")
                    .args(args)
                    .current_dir(PathBuf::from("..").canonicalize()?)
                    .output()?;

                println!("cargo::rustc-link-arg={}", out_file.display());
            }
        }

        std::fs::File::options()
            .append(true)
            .open(PathBuf::from(&out_dir).join("resource.rc"))?
            .write_all(
                format!(
                    "32513 ICON {:?}\n",
                    PathBuf::from("..")
                        .join("icons")
                        .join("system")
                        .join("tess-alt.ico")
                        .canonicalize()?
                )
                .as_bytes(),
            )?;
        includes.extend([
            "/fo".into(),
            PathBuf::from(&out_dir)
                .join("resource.lib")
                .into_os_string(),
        ]);
        includes.push(PathBuf::from(&out_dir).join("resource.rc").into_os_string());
        Command::new("rc").args(includes).output()?;
    }

    Ok(())
}
