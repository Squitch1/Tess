# This script must be run before any attempt at building a package by using 
#   .\build.ps1. It bootstraps the system (ideally a fresh virtual machine)
#   by installing required dependencies.

winget install JRSoftware.InnoSetup --accept-source-agreements --accept-package-agreements

if ($LASTEXITCODE -eq 0x8A15002B) {
    exit 0
}
exit $LASTEXITCODE