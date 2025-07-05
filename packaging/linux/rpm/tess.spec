Name:           tess
Version:        0.7.0~alpha.15
Release:        1%{?dist}
Summary:        Modern and web-based terminal emulator

License:        MIT
URL:            https://tessapp.dev
Source0:        %{name}-%{version}.tar.gz

BuildRequires:  cargo-rpm-macros >= 24
BuildRequires:  desktop-file-utils
BuildRequires:  webkit2gtk4.1-devel


%description
A customizable, simple, and rapid terminal for the new era of technology. 
It includes emoji support, tabs, screen splitting, as well as support for themes
and fully customizable settings.


%prep
%setup -q
cd src-tauri
%cargo_prep -v vendor


%check
# No tests defined yet


%build
cd src-tauri
export GEN_RESOURCES=1
export SKIP_FRONTEND=1
%cargo_build
%{cargo_license} > THIRD-PARTY-LICENSES


%install
find . -type f -name '*.rs' -exec chmod -x {} +
install -Dm755 src-tauri/target/release/tess %{buildroot}%{_bindir}/tess
install -Dm644 src-tauri/gen/man/*.1 -t %{buildroot}%{_mandir}/man1/
desktop-file-install --dir=%{buildroot}%{_datadir}/applications resources/desktop/*.desktop
install -Dm644 resources/desktop/servicemenus/*.desktop -t %{buildroot}%{_datadir}/kio/servicemenus/
install -Dm644 icons/16x16/* -t %{buildroot}%{_datadir}/icons/hicolor/16x16/apps/
install -Dm644 icons/24x24/* -t %{buildroot}%{_datadir}/icons/hicolor/24x24/apps/
install -Dm644 icons/32x32/* -t %{buildroot}%{_datadir}/icons/hicolor/32x32/apps/
install -Dm644 icons/48x48/* -t %{buildroot}%{_datadir}/icons/hicolor/48x48/apps/
install -Dm644 icons/64x64/* -t %{buildroot}%{_datadir}/icons/hicolor/64x64/apps/
install -Dm644 icons/128x128/* -t %{buildroot}%{_datadir}/icons/hicolor/128x128/apps/
install -Dm644 icons/256x256/* -t %{buildroot}%{_datadir}/icons/hicolor/256x256/apps/
install -Dm644 icons/512x512/* -t %{buildroot}%{_datadir}/icons/hicolor/512x512/apps/


%post
touch --no-create %{_datadir}/icons/hicolor
if [ -x %{_bindir}/gtk-update-icon-cache ]; then
  %{_bindir}/gtk-update-icon-cache -q %{_datadir}/icons/hicolor;
fi
update-mime-database %{_datadir}/mime &> /dev/null || :
update-desktop-database &> /dev/null || :


%postun
touch --no-create %{_datadir}/icons/hicolor
if [ -x %{_bindir}/gtk-update-icon-cache ]; then
  %{_bindir}/gtk-update-icon-cache -q %{_datadir}/icons/hicolor;
fi
update-mime-database %{_datadir}/mime &> /dev/null || :
update-desktop-database &> /dev/null || :


%files
%license LICENSE
%license src-tauri/THIRD-PARTY-LICENSES
%{_bindir}/tess
%{_mandir}/man1/*.1*
%{_datadir}/applications/
%{_datadir}/kio/servicemenus/
%{_datadir}/icons/hicolor/16x16/apps/
%{_datadir}/icons/hicolor/24x24/apps/
%{_datadir}/icons/hicolor/32x32/apps/
%{_datadir}/icons/hicolor/48x48/apps/
%{_datadir}/icons/hicolor/64x64/apps/
%{_datadir}/icons/hicolor/128x128/apps/
%{_datadir}/icons/hicolor/256x256/apps/
%{_datadir}/icons/hicolor/512x512/apps/


%changelog
* Mon Jun 23 2025 Clément FOURÉ <clement.foure@proton.me> - 0.7.0~alpha.15-1
- Initial release
