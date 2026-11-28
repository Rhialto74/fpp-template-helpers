# Builds dist\FPP-Template-Helpers.zip: the files a user needs, flat (no inner folder).
# The updater on the designer's computer downloads this zip from the GitHub release and
# copies its files into Documents\FPP-Template-Helpers (and the .dotm into Word's Startup folder).
# Needs Word on this computer to build the add-in (see build-word-addin.ps1).
# Run from the repo root:
#   powershell -ExecutionPolicy Bypass -File scripts\build-release.ps1 -Version v1.2.0 [-TemporarilyTrustVba]
# Normally called by scripts\release.ps1.
param(
    [string]$Version = 'dev',
    [switch]$TemporarilyTrustVba
)
$ErrorActionPreference = 'Stop'
$root  = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $root 'dist\stage'
$zip   = Join-Path $root 'dist\FPP-Template-Helpers.zip'

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

Copy-Item (Join-Path $root 'docs\FPP-Template-Helpers-Guide.html') (Join-Path $stage 'Start here - FPP Template Helpers Guide.html')
Copy-Item (Join-Path $root 'src\illustrator\MakeFPPTemplates.jsx') $stage
Copy-Item (Join-Path $root 'src\illustrator\AddFabricSwatches.jsx') $stage
Copy-Item (Join-Path $root 'assets\1 Inch.ai') $stage
Copy-Item (Join-Path $root 'src\updater\Update-FPPHelpers.ps1') (Join-Path $stage 'Update FPP Helpers.ps1')
Copy-Item -LiteralPath (Join-Path $root 'src\updater\Set up updates (run once).cmd') $stage
Set-Content -LiteralPath (Join-Path $stage 'version.txt') -Value $Version -Encoding ASCII

& (Join-Path $PSScriptRoot 'build-word-addin.ps1') -OutFile (Join-Path $stage 'FPP Template Helpers.dotm') -TemporarilyTrustVba:$TemporarilyTrustVba

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip
Remove-Item $stage -Recurse -Force
Write-Host "Built $zip ($Version)"
