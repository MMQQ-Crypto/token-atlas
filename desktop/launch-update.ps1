param([Parameter(Mandatory=$true)][string]$ConfigFile)
$ErrorActionPreference='Stop'
$configPath=[IO.Path]::GetFullPath($ConfigFile)
$updateDirectory=[IO.Path]::GetDirectoryName($configPath)
$helperPath=Join-Path $updateDirectory 'apply-update.ps1'
$arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}" -ConfigFile "{1}"' -f $helperPath,$configPath
# A hidden, separate console keeps PowerShell alive when Electron exits.
$helper=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $updateDirectory 'helper.stdout.log') -RedirectStandardError (Join-Path $updateDirectory 'helper.stderr.log')
@{pid=$helper.Id} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $updateDirectory 'helper-launched.json') -Encoding UTF8
