# Builds dist\FPP-Template-Helpers.zip: the files a user needs, flat (no inner folder),
# so "Extract All" into Documents\FPP-Template-Helpers gives the layout the guide describes.
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File scripts\build-release.ps1
$ErrorActionPreference = 'Stop'
$root  = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $root 'dist\stage'
$zip   = Join-Path $root 'dist\FPP-Template-Helpers.zip'

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

Copy-Item (Join-Path $root 'docs\FPP-Template-Helpers-Guide.html') (Join-Path $stage 'Start here - FPP Template Helpers Guide.html')
Copy-Item (Join-Path $root 'src\illustrator\MakeFPPTemplates.jsx') $stage
Copy-Item (Join-Path $root 'src\word\AddTemplateSheets.bas') $stage
Copy-Item (Join-Path $root 'assets\1 Inch.ai') $stage

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip
Remove-Item $stage -Recurse -Force
Write-Host "Built $zip"
