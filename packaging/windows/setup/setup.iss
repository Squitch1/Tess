#define APP_VERSION "0.7.0-alpha.14"

#if ARCH == "x64"
    #define ALLOWED_ARCH "x64compatible"
#else
    #error "Unsupported architecture"
#endif


[Setup]
AppName=Tess
AppVersion={#APP_VERSION}
AppPublisher=TessApp
AppPublisherURL=https://tessapp.dev

ArchitecturesAllowed={#ALLOWED_ARCH}
ArchitecturesInstallIn64BitMode={#ALLOWED_ARCH}
SetupIconFile=tess.ico
WizardStyle=modern
UninstallDisplayName=Tess
UninstallDisplayIcon={app}\tess.exe

DefaultDirName={autopf}\Tess
DefaultGroupName=Tess
DisableProgramGroupPage=yes

OutputBaseFilename=tess-setup-{#APP_VERSION}-{#ARCH}


[Tasks]
Name: desktopicon; Description: Create a desktop icon
Name: startmenu; Description: Add Tess to the start menu


[Files]
Source: "tess.exe"; DestDir: "{app}"


[Icons]
Name: "{autodesktop}\Tess"; Filename: "{app}\tess.exe"; Tasks: desktopicon
Name: "{group}\Tess"; Filename: "{app}\tess.exe"; Tasks: startmenu


[Code]
#include "edit_path.iss";

procedure CurStepChanged(CurrentStep: TSetupStep);
begin
    if CurrentStep = ssPostInstall then
        AppendToPath();
end;
procedure CurUninstallStepChanged(CurrentStep: TUninstallStep);
begin
    if CurrentStep = usPostUninstall then
        RemoveFromPath();
end;