# This script is intended to be run after a successful completion of
#   .\boostrap.ps1. The resulting installer is moved to 
#   packaging\out\windows\ (based on the root of the repository).
# Env variables:
#   * $env:Arch (required):
#   represent the package architecture and must be any item of this list:
#       * x64
#   * $env:UsePrebuilt (required):
#   Point to the prebuilt binary going to be packaged, It's the user
#       responsibility to ensure that the binary and $env:Arch match

if (-not $env:Arch ) {
   throw 'error: $env:Arch must be set'  
}
if (-not $env:UsePrebuilt ) {
   throw 'error: $env:UsePrebuilt must be set'  
}


$BuildDir = Join-Path $env:TEMP "build"
$Iscc = Join-Path $env:LocalAppData "Programs" "Inno Setup 6" "ISCC.exe"


if (-Not (Test-Path $BuildDir)) {
    New-Item -ItemType Directory -Path $BuildDir
}
Copy-Item $env:UsePrebuilt -Destination $BuildDir\tess.exe
Copy-Item $PSScriptRoot\..\..\..\icons\system\tess.ico -Destination $BuildDir
Copy-Item $PSScriptRoot\*.iss -Destination $BuildDir

& $Iscc /O"$PSScriptRoot\..\..\out\windows" /DARCH=$env:Arch $BuildDir\setup.iss