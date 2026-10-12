param(
    [ValidatePattern('^[a-z0-9][a-z0-9_-]*$')][string]$ProjectName = 'salmon-review',
    [ValidateRange(1,65535)][int]$Port,
    [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$oldPort = $env:SALMON_PORT
$oldImage = $env:SALMON_IMAGE
$oldUpdaterImage = $env:SALMON_UPDATER_IMAGE
$env:SALMON_IMAGE = $null
$env:SALMON_UPDATER_IMAGE = $null
Push-Location -LiteralPath $PSScriptRoot
try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw '请先安装 Docker Desktop，然后重新打开本窗口。' }
    $engine = & docker info --format '{{.OSType}}/{{.Architecture}}' 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Docker 引擎未启动。请打开 Docker Desktop，等待 Engine running 后重试。' }
    if ($engine -notmatch '^linux/(x86_64|amd64)$') { throw '此安装包需要 Intel/AMD 64 位电脑和 Docker 的 Linux 容器模式。ARM 电脑暂不支持此安装包。' }
    & docker compose version
    if ($LASTEXITCODE -ne 0) { throw '需要 Docker Compose 插件；请更新 Docker Desktop。' }

    Write-Host '正在校验安装包，请稍候……'
    $checks = @(Get-Content -LiteralPath './SHA256SUMS.txt')
    $verified = @()
    foreach ($line in $checks) {
        if ($line -notmatch '^([a-fA-F0-9]{64})  ([a-zA-Z0-9][a-zA-Z0-9_.-]*)$') { throw '校验清单格式错误，请重新下载完整安装包。' }
        $expected = $Matches[1]; $name = $Matches[2]
        if ((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $name) -Algorithm SHA256).Hash -ne $expected) { throw "文件校验失败：$name。请重新下载并完整解压安装包。" }
        $verified += $name
    }
    foreach ($required in @('compose.yaml','release.json','salmon-review-image.tar.gz')) {
        if ($verified -notcontains $required) { throw "校验清单缺少文件：$required。请重新下载完整安装包。" }
    }
    $release = Get-Content -LiteralPath './release.json' -Raw | ConvertFrom-Json
    if ($release.image -notmatch '^salmon-review:[0-9]+\.[0-9]+\.[0-9]+$' -or $release.imageId -notmatch '^sha256:[a-f0-9]{64}$') { throw '镜像版本信息无效。' }
    $acceptedImageIds = @($release.imageId)
    if ($release.PSObject.Properties.Name -contains 'imageIds') {
        $acceptedImageIds = @($release.imageIds)
        if ($acceptedImageIds.Count -eq 0 -or $acceptedImageIds -notcontains $release.imageId) { throw '镜像校验标识列表无效。' }
        foreach ($imageId in $acceptedImageIds) {
            if ($imageId -isnot [string] -or $imageId -cnotmatch '^sha256:[a-f0-9]{64}$') { throw '镜像校验标识列表无效。' }
        }
    }

    # Prevent old custom project names from silently becoming a fresh empty database.
    if (-not $PSBoundParameters.ContainsKey('ProjectName')) {
        $volumes = @(& docker volume ls --format '{{.Name}}')
        if ($LASTEXITCODE -ne 0) { throw '无法读取 Docker 数据卷信息。' }
        $previous = @($volumes | Where-Object { $_ -match '_salmon-data$' })
        if ($previous.Count -gt 0 -and $previous -notcontains 'salmon-review_salmon-data') {
            $names = ($previous | ForEach-Object { $_ -replace '_salmon-data$','' }) -join ', '
            throw "检测到已有项目：$names。为保留旧记录，请按 README 使用 Start.cmd -ProjectName 原项目名。"
        }
    }
    if ($PSBoundParameters.ContainsKey('Port')) { $env:SALMON_PORT = [string]$Port }
    $composeArgs = @('compose','-p',$ProjectName,'-f',(Join-Path $PSScriptRoot 'compose.yaml'))
    $configText = & docker @composeArgs config --format json
    if ($LASTEXITCODE -ne 0) { throw '无法读取运行配置，请检查 .env 中的端口设置。' }
    $config = ($configText -join "`n") | ConvertFrom-Json
    if ($config.services.app.image -ne $release.image -or $config.services.app.pull_policy -ne 'never') { throw '运行配置与安装包版本不符。' }
    $listen = $config.services.app.ports[0]
    if ($listen.host_ip -ne '127.0.0.1') { throw '本地运行版本只能监听 127.0.0.1。' }

    # Only inspect an existing tag after checking it is present; PS 5.1 treats native stderr as errors.
    $present = @(& docker image ls --quiet $release.image)
    if ($LASTEXITCODE -ne 0) { throw '无法读取本机镜像。' }
    $actualId = ''
    if ($present.Count -gt 0) { $actualId = & docker image inspect --format '{{.Id}}' $release.image }
    if ($acceptedImageIds -notcontains $actualId) {
        Write-Host '正在导入随包提供的镜像，不需要联网下载依赖……'
        & docker load --input (Join-Path $PSScriptRoot 'salmon-review-image.tar.gz')
        if ($LASTEXITCODE -ne 0) { throw '镜像导入失败，请检查 Docker 状态及磁盘剩余空间。' }
        $actualId = & docker image inspect --format '{{.Id}}' $release.image
        if ($LASTEXITCODE -ne 0 -or $acceptedImageIds -notcontains $actualId) { throw '导入的镜像与发布版本不符，已停止启动。请下载最新安装包；若仍失败，请反馈 docker image inspect 返回的镜像 Id。' }
    }
    # Protect a transaction before Compose can replace any service. A helper
    # exists throughout both component swaps, including the rename window.
    $helpers = @(& docker ps -a --filter "label=com.docker.compose.project=$ProjectName" --filter 'label=com.docker.compose.service=update-helper' --format '{{.ID}}')
    if ($LASTEXITCODE -ne 0) { throw '无法检查更新助手状态。' }
    foreach ($id in $helpers) {
        $details = (& docker inspect $id | ConvertFrom-Json)[0]
        if ($details.State.Status -ne 'exited') { throw '网页更新或恢复正在进行，请保持 Docker 运行，稍后再启动。' }
        # Even a cleanly exited helper may have retained a blocked journal.
        $volume = @($details.Mounts | Where-Object { $_.Destination -eq '/updates' -and $_.Type -eq 'volume' })
        if ($volume.Count -ne 1) { throw '无法确认更新卷，请勿删除数据卷。' }
        & docker run --rm --network none --read-only --user root --mount "type=volume,source=$($volume[0].Name),target=/updates,readonly" $release.image node -e "process.exit(require('fs').existsSync('/updates/bundle.json')?42:0)"
        if ($LASTEXITCODE -ne 0) { throw '更新恢复尚未完成，请勿覆盖组件或删除数据卷。' }
    }
    foreach ($service in @('app','updater')) {
        $existing = @(& docker ps -a --filter "label=com.docker.compose.project=$ProjectName" --filter "label=com.docker.compose.service=$service" --format '{{.ID}}')
        if ($LASTEXITCODE -ne 0) { throw '无法读取已安装版本。' }
        foreach ($id in $existing) {
            $details = (& docker inspect $id | ConvertFrom-Json)[0]
            if ($details.Name -like '*-rollback-*') { throw '检测到未完成的更新恢复，请勿覆盖组件或删除数据卷。' }
            # Check the durable lock even if power failed before helper creation.
            $updateVolumes = @($details.Mounts | Where-Object { $_.Destination -eq '/updates' -and $_.Type -eq 'volume' })
            if ($updateVolumes.Count -eq 1) {
                & docker run --rm --network none --read-only --user root --mount "type=volume,source=$($updateVolumes[0].Name),target=/updates,readonly" $release.image node -e "const fs=require('fs');process.exit(fs.existsSync('/updates/bundle.json')||fs.existsSync('/updates/transaction.json')?42:0)"
                if ($LASTEXITCODE -ne 0) { throw '网页更新或恢复尚未完成，请稍后再启动。' }
            }
            $installedImage = $details.Config.Image
            $installedVersion = ''
            if ($installedImage -match '^salmon-review:([0-9]+\.[0-9]+\.[0-9]+)$') { $installedVersion=$Matches[1] }
            elseif ($installedImage -match '^sha256:[a-f0-9]{64}$' -and $details.Config.Labels.'org.opencontainers.image.version' -match '^([0-9]+\.[0-9]+\.[0-9]+)$') { $installedVersion=$Matches[1] }
            if ($installedVersion -and [version]$installedVersion -gt [version]$release.version) {
                if ($service -eq 'app') { $env:SALMON_IMAGE=$installedImage } else { $env:SALMON_UPDATER_IMAGE=$installedImage }
                Write-Host "保留网页已更新的 $service 版本 $installedVersion，不降回安装包版本。"
            }
        }
    }
    Write-Host "正在启动项目 $ProjectName；数据卷名称会沿用此项目名。"
    & docker @composeArgs up -d --no-build --pull never
    if ($LASTEXITCODE -ne 0) { throw '启动失败。若端口被占用，请按 README 设置端口；不要删除数据卷。' }
    Write-Host '正在等待主程序和更新组件就绪……'
    foreach ($service in @('app','updater')) {
        $container = & docker @composeArgs ps --quiet $service
        if ($LASTEXITCODE -ne 0 -or -not $container) { throw "未找到 $service 运行容器。" }
        $ready = $false
        for ($attempt=0; $attempt -lt 60; $attempt++) {
            $health = & docker inspect --format '{{.State.Status}}/{{.State.Health.Status}}' $container
            if ($LASTEXITCODE -ne 0) { break }
            if ($health -eq 'running/healthy') { $ready=$true; break }
            if ($health -match '^(exited|dead)/' -or $health -match '/unhealthy$') { break }
            Start-Sleep -Seconds 2
        }
        if (-not $ready) { throw "$service 尚未就绪。请运行 docker compose -p $ProjectName ps 查看状态，再按 README 排查。" }
    }
    $url = 'http://127.0.0.1:' + $listen.published + '/'
    Write-Host "启动成功：$url" -ForegroundColor Green
    Write-Host '首次使用请在网页连接自己的任天堂账号。安装已完成，登录与同步仍需联网。'
    if (-not $NoBrowser) { Start-Process $url }
} catch {
    Write-Host ("启动未完成：" + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    $env:SALMON_PORT = $oldPort
    $env:SALMON_IMAGE = $oldImage
    $env:SALMON_UPDATER_IMAGE = $oldUpdaterImage
    Pop-Location
}
