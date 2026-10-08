$ErrorActionPreference = 'Stop'
$project = 'salmon-update-test'
if (@(docker ps -a --filter "label=com.docker.compose.project=$project" --format '{{.ID}}').Count -or @(docker volume ls --filter "label=com.docker.compose.project=$project" --format '{{.Name}}').Count) { throw 'Disposable test project already exists; inspect it before running this test.' }
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('salmon-updater-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $scratch | Out-Null
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$compose = Join-Path $root 'compose.yaml'
$override = Join-Path $scratch 'test.yaml'
$mountTests = $PSScriptRoot.Replace('\','/')
@"
services:
  app:
    image: salmon-review:update-old-test
    ports: !override
      - '127.0.0.1:19878:8787'
  updater:
    image: salmon-review:local
    environment:
      SALMON_UPDATE_AUTO_CHECK: '0'
    volumes:
      - '${mountTests}:/app/tests:ro'
"@ | Set-Content -LiteralPath $override -Encoding utf8
@'
FROM salmon-review:local
LABEL org.opencontainers.image.version="0.3.5"
'@ | Set-Content -LiteralPath (Join-Path $scratch 'Dockerfile') -Encoding utf8
try {
    docker build -t salmon-review:update-old-test $scratch
    if ($LASTEXITCODE) { throw 'Fixture build failed' }
    docker compose -p $project -f $compose -f $override up -d --no-build --pull never --wait
    if ($LASTEXITCODE) { throw 'Fixture startup failed' }
    docker compose -p $project -f $compose -f $override exec -T updater node tests/updater-docker.mjs
    if ($LASTEXITCODE) { throw 'Updater integration failed' }
} finally {
    # This exact project was verified absent before creation. Never use the user's project.
    docker compose -p $project -f $compose -f $override down --volumes
    $resolved = [IO.Path]::GetFullPath($scratch)
    if (!$resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notlike 'salmon-updater-*') { throw 'Unsafe test cleanup path' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
