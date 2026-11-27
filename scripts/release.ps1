# Publishes a new version for the designer's computer to pick up with "Update FPP Helpers".
# Normally started with release.cmd in the repo root (double-click, or .\release in a terminal):
#   powershell -ExecutionPolicy Bypass -File scripts\release.ps1 [-Version 1.4.0] [-Notes "..."] [-Yes] [-DryRun]
# Steps: checks main is committed, pushes it if it is ahead of origin, works out the next version
# (last release + 0.1.0 unless -Version is given) and the notes (commit subjects since the last
# release unless -Notes is given), asks to confirm, runs npm test, builds the zip (needs Word,
# switches VBA trust on only for the build), tags v<Version>, pushes the tag and creates a
# GitHub release with the zip and Install-FPP-Helpers.cmd attached.
# -DryRun stops after the checks, the tests and showing what would be released.
param(
    [string]$Version = '',
    [string]$Notes = '',
    [switch]$Yes,
    [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Invoke-Checked([string]$exe, [string[]]$argList) {
    & $exe @argList
    if ($LASTEXITCODE -ne 0) { throw "$exe $($argList -join ' ') failed (exit $LASTEXITCODE)." }
}

# ---------- checks ----------
if ((git branch --show-current) -ne 'main') { throw 'Switch to the main branch first.' }
if (git status --porcelain) { throw 'Commit or discard your changes first.' }
if ((-not $DryRun) -and (Get-Process -Name WINWORD -ErrorAction SilentlyContinue)) {
    throw 'Close Word first (building the Word add-in needs it closed).'
}
Invoke-Checked git @('fetch', '--quiet', '--tags', 'origin')
$behind = [int](git rev-list --count 'HEAD..origin/main')
$ahead  = [int](git rev-list --count 'origin/main..HEAD')
if ($behind -gt 0) { throw "main is $behind commit(s) behind origin/main: pull first." }

# ---------- version and notes ----------
$lastTag = (git tag --list 'v*' --sort=-v:refname | Where-Object { $_ -match '^v\d+\.\d+\.\d+$' } | Select-Object -First 1)
if (-not $Version) {
    if ($lastTag) {
        $p = $lastTag.Substring(1).Split('.')
        $Version = '{0}.{1}.0' -f $p[0], ([int]$p[1] + 1)
    } else { $Version = '1.0.0' }
}
$range = 'HEAD'
if ($lastTag) { $range = "$lastTag..HEAD" }
$subjects = @(git log --no-merges --format=%s $range)
if ($subjects.Count -eq 0) { throw "Nothing new since $lastTag." }
if (-not $Notes) { $Notes = ($subjects | ForEach-Object { "- $_" }) -join "`n" }

while ($true) {
    if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Version must look like 1.2.0 (got '$Version')." }
    if (git tag --list "v$Version") { throw "v$Version already exists." }
    Write-Host ''
    Write-Host "Last release: $(if ($lastTag) { $lastTag } else { 'none' })"
    Write-Host "New release:  v$Version" -ForegroundColor Cyan
    if ($ahead -gt 0) { Write-Host "($ahead unpushed commit(s) on main will be pushed first)" }
    Write-Host 'Notes:'
    Write-Host $Notes
    Write-Host ''
    if ($Yes -or $DryRun) { break }
    $answer = Read-Host "Press Enter to release v$Version, type another version (e.g. 1.2.1 for a small fix), or N to stop"
    if (-not $answer) { break }
    if ($answer -match '^[nN]') { Write-Host 'Stopped. Nothing was released.'; exit 0 }
    $Version = $answer.Trim().TrimStart('v')
}
$tag = "v$Version"

# ---------- test, build, publish ----------
Invoke-Checked npm @('test')
if ($DryRun) { Write-Host "Dry run: checks and tests passed. Would release $tag. Nothing was pushed or published."; exit 0 }

if ($ahead -gt 0) { Invoke-Checked git @('push', 'origin', 'main') }
& (Join-Path $PSScriptRoot 'build-release.ps1') -Version $tag -TemporarilyTrustVba
# Last check on exactly what will be published (v1.1.0 and v1.4.1 shipped an add-in without its macros).
Invoke-Checked powershell.exe @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    (Join-Path $PSScriptRoot 'check-word-addin.ps1'), '-Path', 'dist\FPP-Template-Helpers.zip')

Invoke-Checked git @('tag', '-a', $tag, '-m', "Release $tag")
Invoke-Checked git @('push', 'origin', $tag)
# The installer is attached on its own too: the guide links to releases/latest/download/Install-FPP-Helpers.cmd.
# Keep its name space-free (GitHub turns spaces in asset names into dots).
Invoke-Checked gh @('release', 'create', $tag, 'dist\FPP-Template-Helpers.zip', 'src\updater\Install-FPP-Helpers.cmd',
    '--title', $tag, '--notes', $Notes)
Write-Host ''
Write-Host "Released $tag. On the designer's computer: double-click 'Update FPP Helpers'." -ForegroundColor Green
