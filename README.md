![tessapp.dev](https://tessapp.dev/static/assets/website_thumbnail.png)

# Why another terminal?

Tess was mainly built in order to offer you a new, intuitive, fully customizable, and blazing fast terminal app by using the power of web technologies.

Why should you not test it? We've worked on this for more than 2 years, and we've been relied on by thousands of users.

Tess is currently officially tested on Windows and Linux, but it should also work on other platforms.
If you do not have access to Tess yet, fill out an issue, and we'll try to provide you with the best cross-platform experience by making new packages or helping you manually install Tess.

<br>
<br>

# Installation | Linux

## Requirements

-   Have an OS with `x86` arch type
-   `webkit2gtk` & `gtk3` installed

<br>

## Installation from the archive

We provide packages for most major distributions; simply select the one that matches your distro and install it.

<br>

## Installation with PPA

If you prefer using apt over downloading and installing the `deb` archive, you could set up the PPA and download Tess with these

```bash
apt install curl apt-transport-https gnupg2

curl -s https://apt.tessapp.dev/key.gpg | gpg --dearmor | tee /usr/share/keyrings/tess.gpg > /dev/null

echo 'deb [signed-by=/usr/share/keyrings/tess.gpg] https://apt.tessapp.dev stable main' >> /etc/apt/sources.list.d/tess-packages.list

apt update && apt install tess
```

<br>

## Installation with AUR

On Arch Linux, the recommended way to install Tess is to use an AUR package manager like [yay](https://github.com/Jguer/yay)

```sh
yay -S tess-git
```

<br>

## Installation with RPM repository

If you are on RHEL-derived distros, you may also want to add our RPM repository to install Tess and receive updates automatically with your package manager.

```bash
yum install curl

curl https://rpm.tessapp.dev/tess.repo > /etc/yum.repos.d/tess.repo

yum check-update && yum install tess
```

<br>

# Installation | Windows

## Requirements

-   `Windows 10 64 bits` or superior

<br>

## Installation from Installer

Simply download and execute the installer, available on the [releases](https://github.com/SquitchYT/Tess/releases) page.

<br>

## Installation using Winget

<br>

If you are running on `Windows 10 1709 (build 16299)` or superior, you could download [Winget](https://github.com/microsoft/winget-cli). It may also already be installed on your system.<br>
Next, execute the following command.

```sh
winget install Squitch.Tess
```

<br>

## Installation using Chocolatey

Firstly, download [Chocolatey](https://chocolatey.org/install).<br>
Next, you will be allowed to run this.

```sh
choco install tess
```

You can also find the package [here](https://community.chocolatey.org/packages/tess).

<br>
<br>

# Contributing

## Getting started

If you want to contribute to Tess, find a simple task to help us with this project.

-   If you've found a mistake in documentation, sources, or the wiki, let us know by opening an [issue](https://github.com/SquitchYT/Tess/issues).
-   You've got an amazing feature idea; simply post your suggestion by creating an issue too.
-   You want to help us close an issue, implement a feature, or do something else related to code, follow the guide below.

_Please, search for a similar issue before creating a new one._

<br>

## Developing with Tess

First and foremost, you need to ensure that you have installed the necessary tools:

-   [Rust & Cargo](https://rustup.rs/)
-   [Node.js](https://nodejs.org/en)
-   Tauri CLI `cargo install tauri-cli`

<br>

Next, start by downloading the source code.

```sh
git clone -b dev https://github.com/SquitchYT/Tess
```

Next, set up the project.

```sh
npm i
```

To ensure that everything is set up properly, run Tess with this command; it should launch Tess.

```sh
cargo tauri dev
```

You are now ready!

<br>

Important notice:

-   As Tess is cross-platform, when you implement a new feature, try to make it available everywhere. If, despite all your efforts, you are unable to make it cross-platform, let us know the supported platforms when submitting your changes.
-   If you update the code, explain why you think this change is important and what you've done.

Simply open a [pull request](https://github.com/SquitchYT/Tess/pulls) to submit your changes.

<br>
<br>

# Roadmap

As long as Tess is in beta, many bugs may occur, and some of them have not yet been fixed.<br>
Many features are not yet available; here's a quick recap of the major features that we'll integrate in Tess.

| Features                  | Electron | Tauri |
| ------------------------- | -------- | ----- |
| Translation               | ❌       | ⌛    |
| Tabs                      | ✔️       | ✔️    |
| Move tabs between windows | ❌       | ⌛    |
| Administrator tabs        | ❌       | ⌛    |
| Tabs split                | ❌       | ✔️    |
| Command line interface    | ✔️       | ⌛    |
| Notifications             | ❌       | 🟠    |
| Macros                    | ❌       | ✔️    |
| Plugins                   | 🟠       | ⌛    |
| Themes                    | 🟠       | 🟠    |
| Config page               | ✔️       | ⌛    |
| Config watching           | 🟠       | ⌛    |
| Image display             | ❌       | ⌛    |
| Font ligature             | 🟠       | ⌛    |
| Animated background       | ❌       | ✔️    |
| URI scheme API            | ❌       | ⌛    |
| Search in a shell         | ❌       | ⌛    |
| Marketplace               | ❌       | ⌛    |

_❌ **Not available**<br>_
_🟠 **Partially integrated**<br>_
_⌛ **Planned / In progress**<br>_
_✔️ **Integrated**<br>_
