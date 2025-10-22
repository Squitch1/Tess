# This script must be run before any attempt at building a package by using 
#   .\build.ps1. It bootstraps the system (ideally a fresh virtual machine)
#   by installing required dependencies.

winget install JRSoftware.InnoSetup --accept-source-agreements