param([ValidateSet('amd64','arm64')][string]$Architecture='amd64')
$ErrorActionPreference='Stop'
$project='salmon-bundle-test'
if (@(docker ps -a --filter "label=com.docker.compose.project=$project" --format '{{.ID}}').Count -or @(docker volume ls --filter "label=com.docker.compose.project=$project" --format '{{.Name}}').Count) { throw 'Disposable bundle test project already exists.' }
$scratch=Join-Path ([IO.Path]::GetTempPath()) ('salmon-bundle-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $scratch | Out-Null
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$compose=Join-Path $root 'compose.yaml'
$currentVersion=(Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$parts=$currentVersion.Split('.')
$nextVersion=$parts[0]+'.'+$parts[1]+'.'+([int]$parts[2]+1)
$override=Join-Path $scratch 'test.yaml'
$tests=$PSScriptRoot.Replace('\','/')
@"
services:
  app:
    platform: linux/$Architecture
    image: salmon-review:bundle-old-test
    ports: !override
      - '127.0.0.1:19879:8787'
  updater:
    platform: linux/$Architecture
    image: salmon-review:bundle-old-test
  driver:
    platform: linux/$Architecture
    image: salmon-review:bundle-target-test
    user: root
    command: ['node','tests/bundle-docker.mjs']
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - salmon-data:/data
      - salmon-updates:/updates
      - '${tests}:/app/tests:ro'
"@ | Set-Content $override -Encoding utf8
try {
    # Fixture-only shorter retries and no cross-project image retention.
    @'
import {Updater} from './service.js';
import {access,writeFile} from 'node:fs/promises';
const finish=Updater.prototype.finishCleanup;
Updater.prototype.finishCleanup=async function(journal){
  let pause=false;try{await access('/updates/pause-after-commit');pause=true}catch{}
  if(pause){await writeFile('/updates/commit-paused','1');await new Promise(r=>setTimeout(r,60000))}
  return finish.call(this,journal);
};
'@ | Set-Content (Join-Path $scratch 'fixture-hooks.mjs') -Encoding utf8
    @'
FROM salmon-review:bundle-test
USER root
COPY fixture-hooks.mjs /app/server/updater/fixture-hooks.mjs
RUN sed -i "1i import './fixture-hooks.mjs';" server/updater/helper.js && sed -i "s/new Updater({helper:true})/new Updater({helper:true,attempts:3})/" server/updater/helper.js && sed -i "s/async images(state){/async images(state){return 0;/" server/updater/retention.js
USER node
'@ | Set-Content (Join-Path $scratch 'Dockerfile') -Encoding utf8
    docker build --platform "linux/$Architecture" -t salmon-review:bundle-target-test $scratch
    if($LASTEXITCODE){throw 'Target fixture build failed'}
    foreach($variant in @('old','bad','next')){
        $version=if($variant -eq 'old'){'0.0.0'}else{$nextVersion}
        $break=if($variant -eq 'bad'){'RUN echo "throw new Error(''fixture failed updater'');" >> server/updater/service.js'}else{''}
        @"
FROM salmon-review:bundle-target-test
USER root
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json'));p.version='$version';fs.writeFileSync('package.json',JSON.stringify(p))"
LABEL org.opencontainers.image.version="$version"
$break
USER node
"@ | Set-Content (Join-Path $scratch 'Dockerfile') -Encoding utf8
        docker build --platform "linux/$Architecture" -t "salmon-review:bundle-$variant-test" $scratch
        if($LASTEXITCODE){throw 'Fixture build failed'}
    }
    docker compose -p $project -f $compose -f $override up -d --no-build --pull never --wait app updater
    if($LASTEXITCODE){throw 'Fixture startup failed'}
    docker compose -p $project -f $compose -f $override run --rm driver
    if($LASTEXITCODE){throw 'Bundle integration failed'}
} finally {
    docker compose -p $project -f $compose -f $override logs --tail 10 updater
    docker compose -p $project -f $compose -f $override down --volumes --remove-orphans
    $resolved=[IO.Path]::GetFullPath($scratch)
    if(!$resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notlike 'salmon-bundle-*'){throw 'Unsafe cleanup path'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
