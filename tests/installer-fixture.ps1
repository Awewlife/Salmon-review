param([string]$Scenario, [string]$Directory)
$ErrorActionPreference = 'Stop'
$indexId = 'sha256:' + ('a' * 64)
$configId = 'sha256:' + ('b' * 64)
$wrongId = 'sha256:' + ('c' * 64)
$global:fixtureLoaded = $false
$global:fixtureTrace = Join-Path $Directory 'trace.txt'
$release = @{version='0.3.4'; image='salmon-review:0.3.4'; imageId=$indexId; imageIds=@($indexId,$configId)}
if ($Scenario -eq 'legacy') { $release.Remove('imageIds') }
if ($Scenario -eq 'invalid') { $release.imageIds=@($indexId,'invalid') }
$release | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Directory 'release.json') -Encoding UTF8
'fixture image' | Set-Content -LiteralPath (Join-Path $Directory 'salmon-review-image.tar.gz')
'fixture compose' | Set-Content -LiteralPath (Join-Path $Directory 'compose.yaml')
$installer = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '../release/Start.ps1'), [Text.Encoding]::UTF8)
# Match the packaged script encoding, including Windows PowerShell 5.1's BOM.
[IO.File]::WriteAllText((Join-Path $Directory 'Start.ps1'), $installer, (New-Object Text.UTF8Encoding($true)))
$checks = foreach ($file in Get-ChildItem -LiteralPath $Directory -File) { '{0}  {1}' -f (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant(),$file.Name }
$checks | Set-Content -LiteralPath (Join-Path $Directory 'SHA256SUMS.txt') -Encoding ASCII

# Exercise the real installer with a fake Docker boundary: no daemon or user data.
function docker {
    $global:LASTEXITCODE = 0
    $values = @($args)
    if ($values[0] -eq 'info') { return 'linux/amd64' }
    if ($values[0] -eq 'compose') {
        if ($values -contains 'version') { return 'Docker Compose fixture' }
        if ($values -contains 'config') { return '{"services":{"app":{"image":"salmon-review:0.3.4","pull_policy":"never","ports":[{"host_ip":"127.0.0.1","published":"18787"}]}}}' }
        if ($values -contains 'up') { Add-Content -LiteralPath $global:fixtureTrace -Value 'up'; if ($Scenario -eq 'pinned' -and ($env:SALMON_IMAGE -ne ('sha256:'+('a'*64)) -or $env:SALMON_UPDATER_IMAGE -ne ('sha256:'+('a'*64)))) { throw 'Pinned image downgraded' }; if ($Scenario -eq 'updated' -and ($env:SALMON_IMAGE -ne 'salmon-review:0.3.6' -or $env:SALMON_UPDATER_IMAGE -ne 'salmon-review:0.3.6')) { throw 'Web update was downgraded' }; return }
        if ($values -contains 'ps') { return 'fixture-container' }
    }
    if ($values[0] -eq 'image') {
        if ($values[1] -eq 'ls') { if ($Scenario -ne 'missing') { return 'present' }; return }
        if ($values[1] -eq 'inspect') {
            if ($Scenario -eq 'wrong' -or ($Scenario -eq 'replace' -and !$global:fixtureLoaded)) { return $wrongId }
            if ($Scenario -in @('containerd','legacy')) { return $indexId }
            return $configId
        }
    }
    if ($values[0] -eq 'load') { $global:fixtureLoaded=$true; Add-Content -LiteralPath $global:fixtureTrace -Value 'load'; return }
    if ($values[0] -eq 'ps') { if ($values -contains 'label=com.docker.compose.service=update-helper') { return }; if ($Scenario -in @('updated','locked','pinned')) { return 'updated-container' }; return }
    if ($values[0] -eq 'run') { if ($Scenario -eq 'locked') { $global:LASTEXITCODE=42 }; return }
    if ($values[0] -eq 'inspect') { if ($values -notcontains '--format') { if ($Scenario -eq 'pinned') { return ('[{"Name":"/fixture-app-1","Mounts":[],"Config":{"Image":"sha256:' + ('a'*64) + '","Labels":{"org.opencontainers.image.version":"0.3.6"}}}]') }; return '[{"Name":"/fixture-app-1","Mounts":[{"Type":"volume","Name":"fixture_updates","Destination":"/updates"}],"Config":{"Image":"salmon-review:0.3.6"}}]' }; return 'running/healthy' }
    throw "Unexpected fake Docker call: $values"
}
& (Join-Path $Directory 'Start.ps1') -ProjectName fixture -NoBrowser
exit $LASTEXITCODE
