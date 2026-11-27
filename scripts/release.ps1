# Publishes a new version for the designer's computer to pick up with "Update FPP Helpers".
#   powershell -ExecutionPolicy Bypass -File scripts\release.ps1 -Version 1.2.0 [-Notes "What changed"] [-TemporarilyTrustVba]
# Steps: checks main is committed and pushed, runs npm test, builds the zip (needs Word),
# tags v<Version>, pushes the tag and creates a GitHub release with the zip attached.
param(
    [Parameter(Mandatory = $true)][string]$Version,
    [string]$Notes = '',
    [switch]$TemporarilyTrustVba
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Version must look like 1.2.0 (got '$Version')." }
$tag = "v$Version"

function Invoke-Checked([string]$exe, [string[]]$argList) {
    & $exe @argList
    if ($LASTEXITCODE -ne 0) { throw "$exe $($argList -join ' ') failed (exit $LASTEXITCODE)." }
}

if ((git branch --show-current) -ne 'main') { throw 'Switch to the main branch first.' }
if (git status --porcelain) { throw 'Commit or discard your changes first.' }
Invoke-Checked git @('fetch', '--quiet', 'origin')
if ((git rev-parse HEAD) -ne (git rev-parse origin/main)) { throw 'main is not the same as origin/main: push (or pull) first.' }
if (git tag --list $tag) { throw "$tag already exists." }

Invoke-Checked npm @('test')
& (Join-Path $PSScriptRoot 'build-release.ps1') -Version $tag -TemporarilyTrustVba:$TemporarilyTrustVba

Invoke-Checked git @('tag', '-a', $tag, '-m', "Release $tag")
Invoke-Checked git @('push', 'origin', $tag)
if (-not $Notes) { $Notes = "FPP Template Helpers $tag" }
# The installer is attached on its own too: the guide links to releases/latest/download/Install-FPP-Helpers.cmd.
# Keep its name space-free (GitHub turns spaces in asset names into dots).
Invoke-Checked gh @('release', 'create', $tag, 'dist\FPP-Template-Helpers.zip', 'src\updater\Install-FPP-Helpers.cmd',
    '--title', $tag, '--notes', $Notes)
Write-Host "Released $tag. On the designer's computer: double-click 'Update FPP Helpers'."
