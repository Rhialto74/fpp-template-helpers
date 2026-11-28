# Update FPP Helpers
# Downloads the newest release of the FPP Template Helpers from GitHub and installs it:
#   - helper files, guide and updater  -> Documents\FPP-Template-Helpers
#   - Word add-in (.dotm)               -> Word's Startup folder (Word loads it by itself)
#   - a small launcher per Illustrator helper ("Make FPP Templates.jsx", "Add Fabric Swatches.jsx")
#     -> each Illustrator's Presets\<locale>\Scripts folder, so the helpers are under File > Scripts.
#     That folder is in Program Files, so this asks first and then needs one Windows admin prompt.
#     A launcher only runs its helper from Documents, so it is written once (again only if missing or changed, e.g. after an Illustrator upgrade).
# Run with -Install once (from "Set up updates (run once).cmd") to put an
# "Update FPP Helpers" icon on the desktop. The icon runs this file without -Install.
# If an update brings a changed updater, this one starts the new copy with -Finish to do the
# after-install steps (Complete-Install), so new steps work on the first click.
# Must stay compatible with Windows PowerShell 5.1 (the one built into Windows).
# -ChooseOutputFolder (the "Update Output Folder" desktop icon) only asks for the sheets folder.
param([switch]$Install, [switch]$Finish, [string]$PreviousVersion = '', [switch]$ChooseOutputFolder)

$ErrorActionPreference = 'Stop'
$Repo       = 'Rhialto74/fpp-template-helpers'
$AssetName  = 'FPP-Template-Helpers.zip'
$AddinName  = 'FPP Template Helpers.dotm'
$Title      = 'Update FPP Helpers'
$KeepIfPresent = @('1 Inch.ai')   # never overwrite the designer's own copy
# Illustrator helpers and their File > Scripts menu entries (launcher file name = menu text + .jsx).
$MenuEntries = @(
    @{ Helper = 'MakeFPPTemplates.jsx';  Menu = 'Make FPP Templates' },
    @{ Helper = 'AddFabricSwatches.jsx'; Menu = 'Add Fabric Swatches' }
)
# Settings shared with the Illustrator and Word helpers: one-line UTF-8 files (no BOM).
$SettingsDir   = Join-Path $env:APPDATA 'FPP-Template-Helpers'
$OutputSetting = Join-Path $SettingsDir 'output-folder.txt'
$OutputIcon    = 'Update Output Folder'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
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

function New-DesktopIcon([string]$name, [string]$scriptPath, [string]$extraArgs, [string]$description, [int]$iconIndex) {
    $desktop = [Environment]::GetFolderPath('Desktop')
    $shell = New-Object -ComObject WScript.Shell
    $lnk = $shell.CreateShortcut((Join-Path $desktop "$name.lnk"))
    $lnk.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $lnk.Arguments = ("-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`" " + $extraArgs).Trim()
    $lnk.WorkingDirectory = Split-Path -Parent $scriptPath
    $lnk.IconLocation = (Join-Path $env:SystemRoot 'System32\shell32.dll') + ",$iconIndex"
    $lnk.Description = $description
    $lnk.Save()
}

# ---------- output folder (where Illustrator saves sheets and Word looks first) ----------
function Get-OutputFolder {
    if (-not (Test-Path -LiteralPath $OutputSetting)) { return '' }
    return ([IO.File]::ReadAllText($OutputSetting)).Trim()
}

# Asks for the folder (starting at the current one, else Documents\FPP-Template-Helpers\Pattern-Sheets),
# saves it and returns it. Cancel keeps the current folder, or uses the starting one if there is none.
function Select-OutputFolder([string]$helperFolder) {
    $current = Get-OutputFolder
    $start = $current
    if (-not $start -or -not (Test-Path -LiteralPath $start)) {
        $start = Join-Path $helperFolder 'Pattern-Sheets'
        if (-not (Test-Path -LiteralPath $start)) { New-Item -ItemType Directory -Path $start | Out-Null }
    }
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = 'Choose the folder for your template sheets. The Illustrator helper saves the sheets here, and the Word helper opens this folder first.'
    $dlg.SelectedPath = $start
    $dlg.ShowNewFolderButton = $true
    # An invisible top-most owner, so the dialog doesn't open behind other windows.
    $owner = New-Object System.Windows.Forms.Form
    $owner.TopMost = $true; $owner.ShowInTaskbar = $false; $owner.Opacity = 0
    $owner.StartPosition = 'CenterScreen'; $owner.Size = New-Object System.Drawing.Size(1, 1)
    try {
        $owner.Show(); $owner.Activate()
        $ok = ($dlg.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK)
    } finally { $owner.Dispose() }

    if ($ok -and $dlg.SelectedPath) { $chosen = $dlg.SelectedPath }
    elseif ($current -and (Test-Path -LiteralPath $current)) { return $current }
    else { $chosen = $start }
    if (-not (Test-Path -LiteralPath $SettingsDir)) { New-Item -ItemType Directory -Path $SettingsDir | Out-Null }
    [IO.File]::WriteAllText($OutputSetting, $chosen, (New-Object Text.UTF8Encoding($false)))
    return $chosen
}

function New-OutputFolderIcon([string]$helperFolder) {
    New-DesktopIcon $OutputIcon (Join-Path $helperFolder 'Update FPP Helpers.ps1') '-ChooseOutputFolder' `
        'Choose where the FPP helpers save template sheets' 314   # gear (settings), not a folder
}

# Asks for the output folder once (again only if the saved folder is gone) and makes the
# "Update Output Folder" icon then. Returns a sentence for the closing message, or ''.
function Initialize-OutputFolder([string]$helperFolder, [bool]$firstInstall) {
    $cur = Get-OutputFolder
    if ($cur -and (Test-Path -LiteralPath $cur)) {
        # Make it on first install; otherwise only refresh one that's there (keeps icon changes current,
        # never brings back an icon she deleted).
        $lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) "$OutputIcon.lnk"
        if ($firstInstall -or (Test-Path -LiteralPath $lnk)) { New-OutputFolderIcon $helperFolder }
        return ''
    }
    $cur = Select-OutputFolder $helperFolder
    New-OutputFolderIcon $helperFolder
    return "Template sheets will be saved in:`n$cur`nTo change this later, double-click '$OutputIcon' on your desktop."
}

# ---------- Illustrator File > Scripts menu entry ----------
function Get-IllustratorScriptFolders {
    $pattern = Join-Path $env:ProgramFiles 'Adobe\Adobe Illustrator*\Presets\*\Scripts'
    return @(Get-Item -Path $pattern -ErrorAction SilentlyContinue |
        Where-Object { $_.PSIsContainer } | ForEach-Object { $_.FullName })
}

function Get-MenuLauncherText([string]$helperPath) {
    $p = ($helperPath -replace '\\', '/') -replace '"', '\"'
    return (@(
        '#target illustrator',
        '// Menu entry for the FPP Template Helpers, put here by Update FPP Helpers.',
        '// It runs the helper in your Documents folder, so updates need no change here.',
        '(function () {',
        ('    var f = new File("' + $p + '");'),
        '    if (!f.exists) {',
        '        alert("Couldn''t find the FPP helper:\n" + f.fsName + "\n\nDouble-click ''Update FPP Helpers'' on your desktop, then try again.");',
        '        return;',
        '    }',
        '    $.evalFile(f);',
        '})();'
    ) -join "`r`n") + "`r`n"
}

function Test-MenuLauncher([string]$file, [string]$text) {
    if (-not (Test-Path -LiteralPath $file)) { return $false }
    return ([IO.File]::ReadAllText($file) -eq $text)
}

# Every launcher that is missing or out of date: @{ File = full path; Text = launcher text }.
function Get-MissingLaunchers([string]$helperFolder, [string[]]$folders) {
    $need = @()
    foreach ($folder in $folders) {
        foreach ($m in $MenuEntries) {
            $file = Join-Path $folder ($m.Menu + '.jsx')
            $text = Get-MenuLauncherText (Join-Path $helperFolder $m.Helper)
            if (-not (Test-MenuLauncher $file $text)) { $need += @{ File = $file; Text = $text } }
        }
    }
    return ,$need
}

# Returns a sentence for the closing message ('' when nothing was needed or Illustrator isn't installed).
function Update-IllustratorMenu([string]$helperFolder) {
    $folders = Get-IllustratorScriptFolders
    if ($folders.Count -eq 0) { return '' }
    $need = Get-MissingLaunchers $helperFolder $folders
    if ($need.Count -eq 0) { return '' }
    $names = (@($MenuEntries | ForEach-Object { "'" + $_.Menu + "'" }) -join ' and ')

    $answer = Show-Msg ("Put $names in Illustrator's File > Scripts menu?`n`n" +
        "Windows will then ask for permission, because Illustrator keeps that menu in Program Files. " +
        "This is needed only once, and again when a new helper is added.") 'Question' 'YesNo'
    if ($answer -ne 'Yes') { return "The Illustrator helpers are under File > Scripts > Other Script... (in Documents\FPP-Template-Helpers)." }

    $tmpFiles = @()
    try {
        $cmds = @()
        foreach ($n in $need) {
            $tmp = Join-Path $env:TEMP ('FPPMenu-' + [guid]::NewGuid().ToString('N') + '.jsx')
            [IO.File]::WriteAllText($tmp, $n.Text, (New-Object Text.UTF8Encoding($true)))
            $tmpFiles += $tmp
            $cmds += "Copy-Item -LiteralPath '{0}' -Destination '{1}' -Force" -f ($tmp -replace "'", "''"), ($n.File -replace "'", "''")
        }
        $enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($cmds -join '; '))
        $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        try {
            Start-Process -FilePath $ps -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList @('-NoProfile', '-EncodedCommand', $enc)
        } catch { }   # the permission prompt was declined
    } finally {
        foreach ($t in $tmpFiles) { Remove-Item -LiteralPath $t -Force -ErrorAction SilentlyContinue }
    }

    $missing = Get-MissingLaunchers $helperFolder $folders
    if ($missing.Count -eq 0) {
        return "Illustrator: restart it, then use File > Scripts > " + (@($MenuEntries | ForEach-Object { $_.Menu }) -join ' or ') + "."
    }
    return "The helpers could not be added to Illustrator's menu. Use File > Scripts > Other Script... (in Documents\FPP-Template-Helpers), or run the update again."
}

# ---------- old Word macros in Normal.dotm ----------
# Before the add-in, the Word helper was imported by hand into Normal.dotm. Those copies make it show
# twice in View > Macros ("Normal.FPPSheets..."). Only our own module names are ever removed.
$OldWordModules = @('FPPSheets', 'TileDocBuilder')

function Get-NormalTemplatePath {
    $dir = (Get-ItemProperty 'HKCU:\Software\Microsoft\Office\16.0\Common\General' -Name UserTemplates -ErrorAction SilentlyContinue).UserTemplates
    if (-not $dir) { $dir = Join-Path $env:APPDATA 'Microsoft\Templates' }
    return (Join-Path ([Environment]::ExpandEnvironmentVariables($dir)) 'Normal.dotm')
}

# Names of our old modules found in Normal.dotm, read straight from the file (no Word needed).
function Find-OldWordModules([string]$normal) {
    if (-not (Test-Path -LiteralPath $normal)) { return @() }
    $fs = $null; $zip = $null
    try {
        $fs = [IO.File]::Open($normal, 'Open', 'Read', 'ReadWrite')
        $zip = New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Read)
        $entry = $zip.Entries | Where-Object { $_.FullName -eq 'word/vbaProject.bin' } | Select-Object -First 1
        if (-not $entry) { return @() }
        $s = $entry.Open(); $ms = New-Object IO.MemoryStream; $s.CopyTo($ms); $s.Close()
        $text = [Text.Encoding]::ASCII.GetString($ms.ToArray())   # the PROJECT stream lists "Module=Name"
        return @($OldWordModules | Where-Object { $text -match ('Module=' + $_ + '\r?\n') })
    } catch { return @() } finally {
        if ($zip) { $zip.Dispose() }
        if ($fs) { $fs.Dispose() }
    }
}

# True if the installed add-in really carries its macros. Some builds (v1.1.0, v1.4.1) were saved
# without the parts that link the code in, and Word then ignores it.
function Test-AddinHasMacros {
    $p = Join-Path (Get-WordStartupFolder) $AddinName
    if (-not (Test-Path -LiteralPath $p)) { return $false }
    $fs = $null; $zip = $null
    try {
        $fs = [IO.File]::Open($p, 'Open', 'Read', 'ReadWrite')
        $zip = New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Read)
        $names = @($zip.Entries | ForEach-Object { $_.FullName })
        if (($names -notcontains 'word/_rels/vbaProject.bin.rels') -or ($names -notcontains 'word/vbaData.xml')) { return $false }
        $d = $zip.Entries | Where-Object { $_.FullName -eq 'word/vbaData.xml' } | Select-Object -First 1
        $r = New-Object IO.StreamReader($d.Open()); $t = $r.ReadToEnd(); $r.Close()
        return ($t -match 'FPPSheets\.AddTemplateSheets')
    } catch { return $false } finally {
        if ($zip) { $zip.Dispose() }
        if ($fs) { $fs.Dispose() }
    }
}

# The Word processes with these ids that are still running.
function Get-OurWord([int[]]$ids) {
    if (-not $ids -or $ids.Count -eq 0) { return ,@() }
    return ,@(Get-Process -Name WINWORD -ErrorAction SilentlyContinue | Where-Object { $ids -contains $_.Id })
}

# True when Word is running but none of it has a window: a Word left behind in the background
# (e.g. by an older updater). There is nothing she could close, and no document is open in it.
function Test-OnlyHiddenWord([object[]]$procs) {
    $procs = @($procs | Where-Object { $_ })
    if ($procs.Count -eq 0) { return $false }
    foreach ($p in $procs) { if ($p.MainWindowHandle -ne [IntPtr]::Zero) { return $false } }
    return $true
}

# Returns a sentence for the closing message, or ''. Needs Word closed (the caller makes sure).
function Remove-OldWordMacros([string]$helperFolder) {
    $normal = Get-NormalTemplatePath
    $found = Find-OldWordModules $normal
    if ($found.Count -eq 0) { return '' }
    if (Get-Process -Name WINWORD -ErrorAction SilentlyContinue) { return '' }   # try again next time
    # Never remove the old copy while the add-in has no working macros: it would leave none at all.
    if (-not (Test-AddinHasMacros)) {
        return "The Word helper add-in didn't install properly, so Word may be using an older copy. Please run Update FPP Helpers again later, and tell whoever looks after these helpers."
    }

    $answer = Show-Msg ("Word has an old copy of the Word helper in its Normal template, so the helper shows up twice in View > Macros.`n`n" +
        "Remove the old copy? A backup of the Normal template is saved first.") 'Question' 'YesNo'
    if ($answer -ne 'Yes') { return '' }

    $backupDir = Join-Path $helperFolder 'Backups'
    if (-not (Test-Path -LiteralPath $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }
    $backup = Join-Path $backupDir ('Normal-' + (Get-Date -Format 'yyyy-MM-dd-HHmmss') + '.dotm')
    Copy-Item -LiteralPath $normal -Destination $backup -Force

    # Word lets a program edit macros only while "Trust access to the VBA project object model" is on.
    # Switch it on just for this, and put it back once Word has closed (Word saves it on exit).
    $secKey = 'HKCU:\Software\Microsoft\Office\16.0\Word\Security'
    $hadKey = Test-Path $secKey
    $old = $null
    if ($hadKey) { $old = (Get-ItemProperty -Path $secKey -Name AccessVBOM -ErrorAction SilentlyContinue).AccessVBOM }
    $word = $null; $err = ''
    # Note which Word this starts, so it can be ended if it won't quit (v1.5.0 and earlier could leave
    # a hidden Word running for hours, and the next update then waited for a Word nobody could see).
    $before = @(Get-Process -Name WINWORD -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
    $ours = @()
    try {
        if (-not $hadKey) { New-Item -Path $secKey -Force | Out-Null }
        Set-ItemProperty -Path $secKey -Name AccessVBOM -Value 1 -Type DWord
        $word = New-Object -ComObject Word.Application
        $ours = @(Get-Process -Name WINWORD -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.Id } | ForEach-Object { $_.Id })
        $word.Visible = $false
        $word.DisplayAlerts = 0
        # Open Normal.dotm itself: a Word started from a script doesn't load Normal's macros, so
        # $word.NormalTemplate.VBProject looks empty there (that silently removed nothing in v1.4.x).
        $t = $word.Documents.Open($normal, $false, $false)
        $comps = $t.VBProject.VBComponents
        for ($i = $comps.Count; $i -ge 1; $i--) {
            $c = $comps.Item($i)
            if ($OldWordModules -contains $c.Name) { $comps.Remove($c) }
        }
        $t.Save()
        $left = @()
        for ($i = 1; $i -le $comps.Count; $i++) { if ($OldWordModules -contains $comps.Item($i).Name) { $left += $comps.Item($i).Name } }
        $t.Close(0)
        if ($left.Count -gt 0) { $err = 'still there: ' + ($left -join ', ') }
    } catch { $err = $_.Exception.Message } finally {
        if ($word) {
            # Normal.dotm was opened as a document; tell Word it's saved so Quit can't stop on a hidden question.
            try { $word.NormalTemplate.Saved = $true } catch { }
            try { $word.Quit() } catch { }
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
            $word = $null
            [GC]::Collect(); [GC]::WaitForPendingFinalizers()
        }
        $deadline = (Get-Date).AddSeconds(30)
        while ((Get-OurWord $ours).Count -gt 0 -and ((Get-Date) -lt $deadline)) { Start-Sleep -Milliseconds 500 }
        # Still there: it's stuck. End only the Word this started; its work was saved above.
        foreach ($p in (Get-OurWord $ours)) { try { Stop-Process -Id $p.Id -Force } catch { } }
        if ($null -eq $old) { Remove-ItemProperty -Path $secKey -Name AccessVBOM -ErrorAction SilentlyContinue }
        else { Set-ItemProperty -Path $secKey -Name AccessVBOM -Value $old -Type DWord }
    }

    # Trust Word's own list (checked above): the raw file can keep old text in unused space.
    if (-not $err) {
        return "Removed the old copy of the Word helper from Word's Normal template (backup: $backup)."
    }
    return "The old copy of the Word helper couldn't be removed from Word's Normal template, so it may still show up twice. The guide (Part 2) shows how to remove it by hand."
}

# Steps after the files are in place, and the closing message. Done by the NEW updater
# (via -Finish when an older one did the download), so add new install steps here.
function Complete-Install([string]$target, [string]$latest, [string]$previous, [bool]$firstInstall) {
    $outNote = Initialize-OutputFolder $target $firstInstall
    $menuNote = Update-IllustratorMenu $target
    $wordNote = Remove-OldWordMacros $target
    if ($wordNote) { $menuNote = ($menuNote + "`n`n" + $wordNote).Trim() }
    $msg = "FPP Template Helpers $latest is installed."
    if ($previous -and $previous -ne $latest) { $msg = "Updated from $previous to $latest." }
    if ($firstInstall) { $msg += "`n`nFrom now on, double-click 'Update FPP Helpers' on your desktop to get newer versions." }
    $msg += "`n`nThe Word helper is ready the next time you open Word."
    if ($menuNote) { $msg += "`n`n$menuNote" }
    if ($outNote) { $msg += "`n`n$outNote" }
    Show-Msg $msg | Out-Null
}

# This file's text as it was when it started; the update may overwrite the file while it runs.
$SelfText = [IO.File]::ReadAllText($PSCommandPath)

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $target = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'FPP-Template-Helpers'
    if (-not (Test-Path $target)) { New-Item -ItemType Directory -Path $target | Out-Null }
    $versionFile = Join-Path $target 'version.txt'
    $installed = ''
    if (Test-Path $versionFile) { $installed = (Get-Content $versionFile -TotalCount 1).Trim() }

    if ($ChooseOutputFolder) {
        $p = Select-OutputFolder $target
        Show-Msg "Template sheets will be saved in:`n$p`n`nThe Illustrator helper uses this folder from its next run, and the Word helper opens it first." | Out-Null
        exit 0
    }

    if ($Finish) {
        # Started by the previous updater right after it installed this version (see below).
        Complete-Install $target $installed $PreviousVersion $Install
        exit 0
    }

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
        New-DesktopIcon $Title $selfTarget '' 'Get the newest FPP Template Helpers' 238
    }

    if ((-not $Install) -and ($installed -eq $latest) -and (Test-Path (Join-Path (Get-WordStartupFolder) $AddinName))) {
        # Still check the output folder and the menu entry, e.g. after an Illustrator upgrade.
        $outNote = Initialize-OutputFolder $target $false
        $menuNote = Update-IllustratorMenu $target
        $msg = "You already have the newest version ($latest)."
        if ($menuNote -or $outNote) {
            if ($menuNote) { $msg += "`n`n$menuNote" }
            if ($outNote) { $msg += "`n`n$outNote" }
        } else { $msg += " Nothing to do." }
        Show-Msg $msg | Out-Null
        exit 0
    }

    # Word keeps the add-in file locked while it's open.
    while ($procs = @(Get-Process -Name WINWORD -ErrorAction SilentlyContinue)) {
        if (Test-OnlyHiddenWord $procs) {
            $answer = Show-Msg ("Word is running in the background with no window open, so there's nothing to save.`n`n" +
                "Click OK to close it and carry on with the update.`n(Click Cancel to update another time.)") 'Information' 'OKCancel'
            if ($answer -ne 'OK') { exit 0 }
            foreach ($p in $procs) { try { Stop-Process -Id $p.Id -Force } catch { } }
            Start-Sleep -Seconds 2
            continue
        }
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
        # Not Expand-Archive: started from PowerShell 7, Windows PowerShell can load PS7's Archive
        # module, which calls a .NET overload that doesn't exist here ("ExtractToDirectory ... 3").
        [IO.Compression.ZipFile]::ExtractToDirectory($zip, $unz)
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

    # The download may have brought a newer updater (it just replaced this file on disk, but the
    # old code is what's running). Let the new copy do the after-install steps, so steps added in
    # a new version happen on the first click.
    $selfTarget = Join-Path $target 'Update FPP Helpers.ps1'
    if ((Test-Path -LiteralPath $selfTarget) -and ([IO.File]::ReadAllText($selfTarget) -ne $SelfText)) {
        $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
                     '-File', "`"$selfTarget`"", '-Finish')
        if ($installed) { $argList += @('-PreviousVersion', $installed) }
        if ($Install) { $argList += '-Install' }
        Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList $argList
        exit 0
    }

    Complete-Install $target $latest $installed $Install
} catch {
    Show-Msg ("The update didn't finish. Your patterns and section files are not affected; you can try again later.`n`n" +
              "Please send a screenshot of this message to whoever looks after these helpers.`n`n" +
              $_.Exception.Message) 'Error' | Out-Null
    exit 1
}
