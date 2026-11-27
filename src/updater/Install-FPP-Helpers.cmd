@echo off
rem Install FPP Helpers - the one file to download for a first-time setup.
rem Downloads the newest FPP-Template-Helpers.zip from GitHub, unpacks it to a temporary folder
rem and runs the setup inside it ("Update FPP Helpers.ps1" -Install). Attached to every release;
rem the guide links to releases/latest/download/Install-FPP-Helpers.cmd. ASCII only.
setlocal
title Install FPP Helpers
set "FPP_ZIPURL=https://github.com/Rhialto74/fpp-template-helpers/releases/latest/download/FPP-Template-Helpers.zip"
set "FPP_WORK=%TEMP%\FPPHelpers-setup-%RANDOM%%RANDOM%"

echo Downloading the FPP Template Helpers. This takes a few seconds...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Add-Type -AssemblyName System.IO.Compression.FileSystem; New-Item -ItemType Directory -Path $env:FPP_WORK | Out-Null; $zip = Join-Path $env:FPP_WORK 'FPP-Template-Helpers.zip'; Invoke-WebRequest -Uri $env:FPP_ZIPURL -OutFile $zip -UseBasicParsing -Headers @{ 'User-Agent' = 'FPP-Helpers-Installer' }; [IO.Compression.ZipFile]::ExtractToDirectory($zip, (Join-Path $env:FPP_WORK 'files')); Get-ChildItem -LiteralPath $env:FPP_WORK -Recurse -File | Unblock-File"
if errorlevel 1 goto failed
if not exist "%FPP_WORK%\files\Update FPP Helpers.ps1" goto failed

echo Setting up. Follow the messages that appear.
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%FPP_WORK%\files\Update FPP Helpers.ps1" -Install
rmdir /s /q "%FPP_WORK%" 2>nul
exit /b 0

:failed
rmdir /s /q "%FPP_WORK%" 2>nul
echo.
echo The download didn't work. Check that the computer is online, then double-click
echo Install-FPP-Helpers again. If it still fails, send a photo or screenshot of this
echo window to whoever looks after these helpers.
echo.
pause
exit /b 1
