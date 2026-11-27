# Builds the Word add-in (a macro-enabled template) from src\word\AddTemplateSheets.bas.
# Word loads any template in its Startup folder automatically, so the updater only has to
# replace this one file - no importing into Normal.
#
# Needs Word on this computer. Word only lets a script add code to a template when
# "Trust access to the VBA project object model" is on. With -TemporarilyTrustVba this script
# turns it on just for the build and puts it back the way it was afterwards.
#
#   powershell -ExecutionPolicy Bypass -File scripts\build-word-addin.ps1 -OutFile dist\x.dotm [-TemporarilyTrustVba]
param(
    [Parameter(Mandatory = $true)][string]$OutFile,
    [switch]$TemporarilyTrustVba
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$bas  = Join-Path $root 'src\word\AddTemplateSheets.bas'
$OutFile = [IO.Path]::GetFullPath($OutFile)

if (Get-Process -Name WINWORD -ErrorAction SilentlyContinue) {
    throw 'Close Word first (it reads the VBA trust setting only when it starts).'
}

$secKey = 'HKCU:\Software\Microsoft\Office\16.0\Word\Security'
$hadKey = Test-Path $secKey
$old = $null
if ($hadKey) { $old = (Get-ItemProperty -Path $secKey -Name AccessVBOM -ErrorAction SilentlyContinue).AccessVBOM }
$changed = $false
if ($old -ne 1) {
    if (-not $TemporarilyTrustVba) {
        throw "Word's 'Trust access to the VBA project object model' is off. Re-run with -TemporarilyTrustVba to switch it on only for this build."
    }
    if (-not $hadKey) { New-Item -Path $secKey -Force | Out-Null }
    Set-ItemProperty -Path $secKey -Name AccessVBOM -Value 1 -Type DWord
    $changed = $true
}

# Word sometimes saves the .dotm with the code (word/vbaProject.bin) but without the part that links it
# to the template (word/_rels/vbaProject.bin.rels) and the macro list (word/vbaData.xml). Word then
# ignores the code: no AddTemplateSheets in View > Macros. That shipped in v1.1.0 and v1.4.1.
# So check the saved file (scripts\check-word-addin.ps1) and build again if needed.
$checker = Join-Path $PSScriptRoot 'check-word-addin.ps1'
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

$word = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $dir = Split-Path -Parent $OutFile
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    $ok = $false
    for ($attempt = 1; $attempt -le 3 -and -not $ok; $attempt++) {
        $doc = $word.Documents.Add()
        $null = $doc.VBProject.VBComponents.Import($bas)
        # Name the project so View > Macros shows "FPPHelpers.FPPSheets.AddTemplateSheets", not the default "Project".
        $doc.VBProject.Name = 'FPPHelpers'
        Start-Sleep -Milliseconds 500
        if (Test-Path $OutFile) { Remove-Item $OutFile -Force }
        $doc.SaveAs2($OutFile, 15)   # 15 = wdFormatXMLTemplateMacroEnabled (.dotm)
        $names = @($doc.VBProject.VBComponents | ForEach-Object { $_.Name })
        $doc.Close(0)
        if ($names -notcontains 'FPPSheets') { throw "Add-in was built without the FPPSheets module (found: $($names -join ', '))." }
        $result = & $ps -NoProfile -ExecutionPolicy Bypass -File $checker -Path $OutFile
        if ($LASTEXITCODE -eq 0) { $ok = $true }
        else { Write-Warning "Attempt ${attempt}: $result Building again." }
    }
    if (-not $ok) {
        Remove-Item $OutFile -Force -ErrorAction SilentlyContinue
        throw 'Word kept saving the add-in without its macros. Nothing was released; try again.'
    }
    Write-Host "Built $OutFile (macros checked)"
} finally {
    if ($word) {
        # Quit() with no arguments: passing wdDoNotSaveChanges fails in Windows PowerShell (ref params).
        try { $word.Quit() } catch { Write-Warning "Could not close the hidden Word: $_" }
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
        $word = $null
        [GC]::Collect(); [GC]::WaitForPendingFinalizers()
    }
    # Word writes its Trust Center settings back when it exits, so restore only once it has gone.
    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Process -Name WINWORD -ErrorAction SilentlyContinue) -and ((Get-Date) -lt $deadline)) { Start-Sleep -Milliseconds 500 }
    if (Get-Process -Name WINWORD -ErrorAction SilentlyContinue) { Write-Warning 'The hidden Word is still running; close it in Task Manager.' }
    if ($changed) {
        if ($null -eq $old) { Remove-ItemProperty -Path $secKey -Name AccessVBOM -ErrorAction SilentlyContinue }
        else { Set-ItemProperty -Path $secKey -Name AccessVBOM -Value $old -Type DWord }
        $now = (Get-ItemProperty -Path $secKey -Name AccessVBOM -ErrorAction SilentlyContinue).AccessVBOM
        if ($now -ne $old) { Write-Warning "Could not switch 'Trust access to the VBA project object model' back. Turn it off in Word: File > Options > Trust Center > Trust Center Settings > Macro Settings." }
        else { Write-Host "Restored Word's VBA trust setting." }
    }
}
