$ErrorActionPreference = 'Stop'
$testRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.test-output/update-helper'))
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$markerFile = Join-Path $testRoot 'started.txt'
$downloadFile = Join-Path $testRoot ('candidate-' + [Guid]::NewGuid().ToString('N') + '.exe')
$targetFile = Join-Path $testRoot 'target app.exe'
$sourceCode = 'public class AtlasUpdateFixture { public static void Main() { System.IO.File.WriteAllText(@"' + $markerFile.Replace('"','""') + '", "started"); } }'
Add-Type -TypeDefinition $sourceCode -OutputAssembly $downloadFile -OutputType WindowsApplication
Set-Content -LiteralPath $targetFile -Value 'old application fixture' -Encoding ASCII
$hash = (Get-FileHash -LiteralPath $downloadFile -Algorithm SHA256).Hash
$resultFile = Join-Path $testRoot 'update-result.json'
if(Test-Path -LiteralPath $markerFile){Remove-Item -LiteralPath $markerFile -Force}
if(Test-Path -LiteralPath $resultFile){Remove-Item -LiteralPath $resultFile -Force}
$driverConfig = @{target=$targetFile;downloaded=$downloadFile;sha256=$hash} | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $testRoot 'fixture-driver.json'),$driverConfig,(New-Object Text.UTF8Encoding $false))
& node (Join-Path $PSScriptRoot '../node_modules/electron/cli.js') (Join-Path $PSScriptRoot 'test-update-driver.cjs') $testRoot
if($LASTEXITCODE -ne 0){throw 'Electron update driver failed'}
$until = [DateTime]::UtcNow.AddSeconds(15)
while (-not (Test-Path -LiteralPath $markerFile)) { if ([DateTime]::UtcNow -gt $until) { throw 'Background updater did not replace and restart the fixture' }; Start-Sleep -Milliseconds 100 }
if ((Get-FileHash -LiteralPath $targetFile -Algorithm SHA256).Hash -ne $hash) { throw 'Target hash mismatch' }
if ((Get-Content -LiteralPath ($targetFile + '.previous') -Raw).Trim() -ne 'old application fixture') { throw 'Backup is missing' }
$until = [DateTime]::UtcNow.AddSeconds(5)
while (-not (Test-Path -LiteralPath $markerFile)) { if ([DateTime]::UtcNow -gt $until) { throw 'Updated fixture did not restart' }; Start-Sleep -Milliseconds 50 }
if ((Get-Content -LiteralPath $resultFile -Raw | ConvertFrom-Json).status -ne 'success') { throw 'Missing success result' }
Write-Output 'PASS: actual Electron Updater.install launcher survived parent exit, replaced fixture EXE, verified hash, preserved backup and restarted updated fixture.'
