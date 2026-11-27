@echo off
rem Installs the FPP Template Helpers and puts an "Update FPP Helpers" icon on the desktop.
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0Update FPP Helpers.ps1" -Install
