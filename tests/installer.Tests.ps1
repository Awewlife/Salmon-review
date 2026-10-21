$ErrorActionPreference = 'Stop'
$shell = (Get-Process -Id $PID).Path
foreach ($scenario in @('classic','containerd','missing','replace','legacy','wrong','invalid','updated','locked','pinned','nested','nested-tampered','unsafe-path')) {
    $directory = Join-Path ([IO.Path]::GetTempPath()) ('salmon-installer-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $directory | Out-Null
    try {
        $output = & $shell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'installer-fixture.ps1') -Scenario $scenario -Directory $directory
        $code = $LASTEXITCODE
        $traceFile = Join-Path $directory 'trace.txt'
        $trace = if (Test-Path -LiteralPath $traceFile) { @(Get-Content -LiteralPath $traceFile) } else { @() }
        $reject = $scenario -in @('wrong','invalid','locked','nested-tampered','unsafe-path')
        if (($reject -and ($code -ne 1 -or $trace -contains 'up')) -or (!$reject -and ($code -ne 0 -or $trace -notcontains 'up'))) { throw "Scenario $scenario failed: $output" }
        $expectLoad = $scenario -in @('missing','replace','wrong')
        if (($trace -contains 'load') -ne $expectLoad) { throw "Unexpected load behavior: $scenario" }
        Write-Host "PASS: $scenario"
    } finally {
        $resolved = [IO.Path]::GetFullPath($directory)
        $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
        if (!$resolved.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notlike 'salmon-installer-*') { throw 'Unsafe temporary directory' }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
# Expected rejection cases leave LASTEXITCODE=1; do not leak it to CI's wrapper.
$global:LASTEXITCODE = 0
