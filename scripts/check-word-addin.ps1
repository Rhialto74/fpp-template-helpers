# Checks that a built Word add-in really carries its macros. Exit 0 = good, 1 = broken.
#   powershell -ExecutionPolicy Bypass -File scripts\check-word-addin.ps1 <path to .dotm or release .zip>
# Word sometimes saves the .dotm with the code (word/vbaProject.bin) but without the part that links it
# to the template (word/_rels/vbaProject.bin.rels) and the macro list (word/vbaData.xml). Word then
# ignores the code and AddTemplateSheets is missing from View > Macros. That shipped in v1.1.0 and v1.4.1.
# Used by build-word-addin.ps1 (after saving) and release.ps1 (on the finished zip, before publishing);
# tests/word-addin.test.js runs it on a good and a broken add-in.
param([Parameter(Mandatory = $true)][string]$Path)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$AddinName = 'FPP Template Helpers.dotm'

function Get-Problems([IO.Stream]$dotmStream) {
    $z = New-Object IO.Compression.ZipArchive($dotmStream, [IO.Compression.ZipArchiveMode]::Read)
    try {
        $names = @($z.Entries | ForEach-Object { $_.FullName })
        $problems = @(@('word/vbaProject.bin', 'word/_rels/vbaProject.bin.rels', 'word/vbaData.xml') |
            Where-Object { $names -notcontains $_ } | ForEach-Object { "missing $_" })
        $d = $z.Entries | Where-Object { $_.FullName -eq 'word/vbaData.xml' } | Select-Object -First 1
        if ($d) {
            $r = New-Object IO.StreamReader($d.Open()); $t = $r.ReadToEnd(); $r.Close()
            if ($t -notmatch 'FPPSheets\.AddTemplateSheets') { $problems += 'AddTemplateSheets not listed in word/vbaData.xml' }
        }
        $rel = $z.Entries | Where-Object { $_.FullName -eq 'word/_rels/document.xml.rels' } | Select-Object -First 1
        if ($rel) {
            $r = New-Object IO.StreamReader($rel.Open()); $t = $r.ReadToEnd(); $r.Close()
            if ($t -notmatch 'vbaProject\.bin') { $problems += 'word/vbaProject.bin not linked from word/_rels/document.xml.rels' }
        }
        return ,$problems
    } finally { $z.Dispose() }
}

$full = (Resolve-Path -LiteralPath $Path).Path
$fs = [IO.File]::Open($full, 'Open', 'Read', 'ReadWrite')
try {
    if ($full -match '\.zip$') {
        # a release zip: check the add-in inside it
        $outer = New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Read)
        $e = $outer.Entries | Where-Object { $_.Name -eq $AddinName } | Select-Object -First 1
        if (-not $e) { Write-Host "BROKEN: $Path has no $AddinName"; exit 1 }
        $ms = New-Object IO.MemoryStream; $s = $e.Open(); $s.CopyTo($ms); $s.Close(); $outer.Dispose(); $ms.Position = 0
        $problems = Get-Problems $ms
    } else {
        $problems = Get-Problems $fs
    }
} finally { $fs.Dispose() }

if ($problems.Count -gt 0) { Write-Host ("BROKEN: $Path - " + ($problems -join '; ')); exit 1 }
Write-Host "OK: $Path has its macros"
exit 0
