@echo off
rem Publishes the next version of the FPP Template Helpers (see scripts\release.ps1).
rem Double-click it, or run .\release in a terminal. Close Word first.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\release.ps1" %*
if errorlevel 1 echo. & echo The release did not finish - see the message above.
rem Keep the window open so the result can be read when started by double-click.
echo.
pause
