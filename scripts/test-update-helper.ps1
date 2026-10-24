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
$settingsFile = Join-Path $testRoot 'apply-update.json'
$resultFile = Join-Path $testRoot 'result.json'
@{appId='local.tokenatlas.desktop';processToWait=999999999;target=$targetFile;downloaded=$downloadFile;sha256=$hash;version='9.9.9';result=$resultFile} | ConvertTo-Json | Set-Content -LiteralPath $settingsFile -Encoding UTF8
& (Join-Path $PSScriptRoot '../desktop/apply-update.ps1') -ConfigFile $settingsFile
if ((Get-FileHash -LiteralPath $targetFile -Algorithm SHA256).Hash -ne $hash) { throw 'Target hash mismatch' }
if ((Get-Content -LiteralPath ($targetFile + '.previous') -Raw).Trim() -ne 'old application fixture') { throw 'Backup is missing' }
$until = [DateTime]::UtcNow.AddSeconds(5)
while (-not (Test-Path -LiteralPath $markerFile)) { if ([DateTime]::UtcNow -gt $until) { throw 'Updated fixture did not restart' }; Start-Sleep -Milliseconds 50 }
if ((Get-Content -LiteralPath $resultFile -Raw | ConvertFrom-Json).status -ne 'success') { throw 'Missing success result' }
Write-Output 'PASS: Windows update helper replaced fixture EXE, verified hash, preserved previous file and restarted updated fixture.'
