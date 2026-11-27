# Update FPP Helpers
# Downloads the newest release of the FPP Template Helpers from GitHub and installs it:
#   - helper files, guide and updater  -> Documents\FPP-Template-Helpers
#   - Word add-in (.dotm)               -> Word's Startup folder (Word loads it by itself)
# Run with -Install once (from "Set up updates (run once).cmd") to put an
# "Update FPP Helpers" icon on the desktop. The icon runs this file without -Install.
# Must stay compatible with Windows PowerShell 5.1 (the one built into Windows).
param([switch]$Install)

$ErrorActionPreference = 'Stop'
$Repo       = 'Rhialto74/fpp-template-helpers'
$AssetName  = 'FPP-Template-Helpers.zip'
$AddinName  = 'FPP Template Helpers.dotm'
$Title      = 'Update FPP Helpers'
$KeepIfPresent = @('1 Inch.ai')   # never overwrite the designer's own copy

Add-Type -AssemblyName System.Windows.Forms
function Show-Msg([string]$text, [string]$icon = 'Information', [string]$buttons = 'OK') {
    [System.Windows.Forms.MessageBox]::Show($text, $Title,
        [System.Windows.Forms.MessageBoxButtons]::$buttons,
        [System.Windows.Forms.MessageBoxIcon]::$icon)
}

function Get-WordStartupFolder {
    foreach ($ver in @('16.0', '15.0')) {
        $key = "HKCU:\Software\Microsoft\Office\$ver\Word\Options"
        $p = (Get-ItemProperty -Path $key -Name 'STARTUP-PATH' -ErrorAction SilentlyContinue).'STARTUP-PATH'
        if ($p) { return $p }
    }
    return (Join-Path $env:APPDATA 'Microsoft\Word\STARTUP')
}

function New-DesktopIcon([string]$scriptPath) {
    $desktop = [Environment]::GetFolderPath('Desktop')
    $shell = New-Object -ComObject WScript.Shell
    $lnk = $shell.CreateShortcut((Join-Path $desktop "$Title.lnk"))
    $lnk.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
    $lnk.WorkingDirectory = Split-Path -Parent $scriptPath
    $lnk.IconLocation = (Join-Path $env:SystemRoot 'System32\shell32.dll') + ',238'
    $lnk.Description = 'Get the newest FPP Template Helpers'
    $lnk.Save()
}

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $target = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'FPP-Template-Helpers'
    if (-not (Test-Path $target)) { New-Item -ItemType Directory -Path $target | Out-Null }
    $versionFile = Join-Path $target 'version.txt'
    $installed = ''
    if (Test-Path $versionFile) { $installed = (Get-Content $versionFile -TotalCount 1).Trim() }

    # Which version is newest?
    $headers = @{ 'User-Agent' = 'FPP-Helpers-Updater'; 'Accept' = 'application/vnd.github+json' }
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers $headers -UseBasicParsing
    $latest = $release.tag_name
    $asset = $release.assets | Where-Object { $_.name -eq $AssetName } | Select-Object -First 1
    if (-not $asset) { throw "The newest version ($latest) has no $AssetName attached." }

    if ($Install) {
        # Put the updater in its permanent place and make the desktop icon.
        $selfTarget = Join-Path $target 'Update FPP Helpers.ps1'
        if ($PSCommandPath -ne $selfTarget) { Copy-Item -LiteralPath $PSCommandPath -Destination $selfTarget -Force }
        New-DesktopIcon $selfTarget
    }

    if ((-not $Install) -and ($installed -eq $latest) -and (Test-Path (Join-Path (Get-WordStartupFolder) $AddinName))) {
        Show-Msg "You already have the newest version ($latest). Nothing to do." | Out-Null
        exit 0
    }

    # Word keeps the add-in file locked while it's open.
    while (Get-Process -Name WINWORD -ErrorAction SilentlyContinue) {
        $answer = Show-Msg "Please save your work and close Word, then click OK.`n`n(Click Cancel to update another time.)" 'Warning' 'OKCancel'
        if ($answer -ne 'OK') { exit 0 }
    }

    $tmp = Join-Path $env:TEMP ('FPPHelpers-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp | Out-Null
    try {
        $zip = Join-Path $tmp $AssetName
        Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip -Headers $headers -UseBasicParsing
        Unblock-File -LiteralPath $zip
        $unz = Join-Path $tmp 'files'
        Expand-Archive -LiteralPath $zip -DestinationPath $unz -Force
        Get-ChildItem -LiteralPath $unz -Recurse -File | Unblock-File

        $addin = Join-Path $unz $AddinName
        if (-not (Test-Path $addin)) { throw "The download is missing $AddinName." }
        $startup = Get-WordStartupFolder
        if (-not (Test-Path $startup)) { New-Item -ItemType Directory -Path $startup | Out-Null }
        Copy-Item -LiteralPath $addin -Destination (Join-Path $startup $AddinName) -Force

        foreach ($f in Get-ChildItem -LiteralPath $unz -File) {
            if ($f.Name -eq $AddinName) { continue }
            $dest = Join-Path $target $f.Name
            if (($KeepIfPresent -contains $f.Name) -and (Test-Path $dest)) { continue }
            Copy-Item -LiteralPath $f.FullName -Destination $dest -Force
        }
        Set-Content -LiteralPath $versionFile -Value $latest -Encoding ASCII
    } finally {
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }

    $msg = "FPP Template Helpers $latest is installed."
    if ($installed -and $installed -ne $latest) { $msg = "Updated from $installed to $latest." }
    if ($Install) { $msg += "`n`nFrom now on, double-click 'Update FPP Helpers' on your desktop to get newer versions." }
    $msg += "`n`nThe Word helper is ready the next time you open Word."
    Show-Msg $msg | Out-Null
} catch {
    Show-Msg ("The update didn't finish. Your patterns and section files are not affected; you can try again later.`n`n" +
              "Please send a screenshot of this message to whoever looks after these helpers.`n`n" +
              $_.Exception.Message) 'Error' | Out-Null
    exit 1
}
