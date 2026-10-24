param([Parameter(Mandatory=$true)][string]$ConfigFile)
$ErrorActionPreference = 'Stop'
$updateSettings = Get-Content -LiteralPath $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json
if ($updateSettings.appId -ne 'local.tokenatlas.desktop') { throw 'Unexpected application' }
$targetFile = [IO.Path]::GetFullPath($updateSettings.target)
$downloadFile = [IO.Path]::GetFullPath($updateSettings.downloaded)
$updateDirectory = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($ConfigFile))
$targetDirectory = [IO.Path]::GetDirectoryName($targetFile)
if ([IO.Path]::GetDirectoryName($downloadFile) -ne $updateDirectory -or [IO.Path]::GetExtension($targetFile) -ne '.exe') { throw 'Unexpected update path' }
$backupFile = $targetFile + '.previous'
$replacedFile = $false
$backupMade = $false
try {
  if ((Get-FileHash -LiteralPath $downloadFile -Algorithm SHA256).Hash -ne $updateSettings.sha256) { throw 'SHA256 mismatch' }
  $waitUntil = [DateTime]::UtcNow.AddSeconds(60)
  while (Get-Process -Id $updateSettings.processToWait -ErrorAction SilentlyContinue) {
    if ([DateTime]::UtcNow -gt $waitUntil) { throw 'Application did not exit' }
    Start-Sleep -Milliseconds 250
  }
  Copy-Item -LiteralPath $targetFile -Destination $backupFile -Force
  $backupMade = $true
  $copyUntil = [DateTime]::UtcNow.AddSeconds(30)
  while ($true) {
    try { Copy-Item -LiteralPath $downloadFile -Destination $targetFile -Force; $replacedFile = $true; break }
    catch { if ([DateTime]::UtcNow -gt $copyUntil) { throw }; Start-Sleep -Milliseconds 400 }
  }
  if ((Get-FileHash -LiteralPath $targetFile -Algorithm SHA256).Hash -ne $updateSettings.sha256) { throw 'Installed file hash mismatch' }
  @{status='success';version=$updateSettings.version} | ConvertTo-Json | Set-Content -LiteralPath $updateSettings.result -Encoding UTF8
  Start-Process -FilePath $targetFile -WorkingDirectory $targetDirectory
} catch {
  $updateError = $_.Exception.Message
  if ($backupMade -and (Test-Path -LiteralPath $backupFile)) { Copy-Item -LiteralPath $backupFile -Destination $targetFile -Force }
  @{status='error';message=$updateError} | ConvertTo-Json | Set-Content -LiteralPath $updateSettings.result -Encoding UTF8
  if ((Test-Path -LiteralPath $targetFile) -and -not (Get-Process -Id $updateSettings.processToWait -ErrorAction SilentlyContinue)) { Start-Process -FilePath $targetFile -WorkingDirectory $targetDirectory }
  exit 1
}
