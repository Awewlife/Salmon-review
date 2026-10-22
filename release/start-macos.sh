#!/bin/bash
# macOS ships Bash 3.2; do not require Homebrew, host Node.js or Python.
set -euo pipefail
export PATH="$PATH:$HOME/.docker/bin:/usr/local/bin:/opt/homebrew/bin"
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
fail() { printf '启动未完成：%s\n' "$*" >&2; exit 1; }
project=salmon-review
explicit_project=false
port=''
no_browser=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --project-name) [ "$#" -ge 2 ] || fail '--project-name 缺少项目名。'; project=$2; explicit_project=true; shift 2 ;;
    --port) [ "$#" -ge 2 ] || fail '--port 缺少端口。'; port=$2; shift 2 ;;
    --no-browser) no_browser=true; shift ;;
    *) fail "未知参数：$1。可用参数：--project-name、--port、--no-browser。" ;;
  esac
done
[[ "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail '项目名只能包含小写字母、数字、下划线和连字符。'
if [ -n "$port" ]; then
  [[ "$port" =~ ^[0-9]{1,5}$ ]] || fail '端口必须为 1–65535。'
  ((10#$port >= 1 && 10#$port <= 65535)) || fail '端口必须为 1–65535。'
  export SALMON_PORT=$((10#$port))
fi
# A caller's image override must not replace the checked release. Subprocess only.
unset SALMON_IMAGE SALMON_UPDATER_IMAGE
command -v docker >/dev/null 2>&1 || fail '请先安装 Docker Desktop，然后重新打开本窗口。'
engine=$(docker info --format '{{.OSType}}/{{.Architecture}}' 2>/dev/null) || fail '请打开 Docker Desktop，等待引擎启动后重试。'
docker compose version >/dev/null || fail '需要 Docker Compose 插件；请更新 Docker Desktop。'

printf '正在校验安装包，请稍候……\n'
[ -f SHA256SUMS.txt ] && [ ! -L SHA256SUMS.txt ] || fail '缺少文件校验清单，请重新下载完整安装包。'
checked='|'
checksum_pattern='^([a-fA-F0-9]{64})  ([a-zA-Z0-9][a-zA-Z0-9_.-]*(/[a-zA-Z0-9][a-zA-Z0-9_.-]*)*)$'
while IFS= read -r line || [ -n "$line" ]; do
  [[ "$line" =~ $checksum_pattern ]] || fail '校验清单格式错误。'
  expected=${BASH_REMATCH[1]}
  name=${BASH_REMATCH[2]}
  # Reject links in every path component, including nested documentation folders.
  component=$name
  while :; do
    [ ! -L "$component" ] || fail "校验文件不能是符号链接：$name。"
    case "$component" in */*) component=${component%/*} ;; *) break ;; esac
  done
  [ -f "$name" ] || fail "安装包缺少文件：$name。"
  actual=$(shasum -a 256 -- "$name") || fail "无法校验文件：$name。"
  [ "${actual%% *}" = "$expected" ] || fail "文件校验失败：$name。请重新下载并完整解压安装包。"
  checked="$checked$name|"
done < SHA256SUMS.txt
for name in compose.yaml release.json release.env salmon-review-image.tar.gz Start.command start-macos.sh; do
  case "$checked" in *"|$name|"*) ;; *) fail "校验清单缺少文件：$name。" ;; esac
done
version='' platform='' commit='' image_ids=''
seen='|'
while IFS='=' read -r key value || [ -n "$key" ]; do
  case "$seen" in *"|$key|"*) fail '镜像元数据包含重复字段。' ;; esac
  seen="$seen$key|"
  case "$key" in
    VERSION) version=$value ;;
    PLATFORM) platform=$value ;;
    COMMIT) commit=$value ;;
    IMAGE_IDS) image_ids=$value ;;
    *) fail '镜像元数据格式无效。' ;;
  esac
done < release.env
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] && [[ "$commit" =~ ^[a-f0-9]{40}$ ]] || fail '镜像版本信息无效。'
[[ "$image_ids" =~ ^sha256:[a-f0-9]{64}(,sha256:[a-f0-9]{64})*$ ]] || fail '镜像校验标识列表无效。'
case "$platform/$engine" in
  linux/amd64/linux/amd64|linux/amd64/linux/x86_64|linux/arm64/linux/arm64|linux/arm64/linux/aarch64) ;;
  *) fail '安装包与 Docker 架构不匹配：Intel Mac 请下载 macos-x64，M 系列请下载 macos-arm64。' ;;
esac
image="salmon-review:$version"
compose=(docker compose -p "$project" -f "$PWD/compose.yaml")
if [ "$explicit_project" = false ]; then
  volumes=$(docker volume ls --format '{{.Name}}') || fail '无法读取 Docker 数据卷信息。'
  previous='' default_found=false
  while IFS= read -r volume; do
    case "$volume" in
      salmon-review_salmon-data) default_found=true ;;
      *_salmon-data) previous="$previous ${volume%_salmon-data}" ;;
    esac
  done <<< "$volumes"
  if [ -n "$previous" ] && [ "$default_found" = false ]; then
    fail "检测到已有项目：$previous。请使用 bash Start.command --project-name 原项目名，沿用原数据。"
  fi
fi
image_matches() {
  local details actual_id actual_platform actual_commit actual_version
  details=$(docker image inspect --format '{{.Id}}|{{.Os}}/{{.Architecture}}|{{index .Config.Labels "org.opencontainers.image.revision"}}|{{index .Config.Labels "org.opencontainers.image.version"}}' "$image" 2>/dev/null) || return 1
  IFS='|' read -r actual_id actual_platform actual_commit actual_version <<< "$details"
  case ",$image_ids," in *",$actual_id,"*) ;; *) return 1 ;; esac
  [ "$actual_platform" = "$platform" ] && [ "$actual_commit" = "$commit" ] && [ "$actual_version" = "$version" ]
}
if ! image_matches; then
  printf '正在导入随包提供的镜像，不需要联网下载依赖……\n'
  docker load --input "$PWD/salmon-review-image.tar.gz" || fail '镜像导入失败，请检查 Docker 状态及剩余空间。'
  image_matches || fail '导入的镜像与发布版本不符，已停止启动。'
fi
# Parse Compose's JSON using the verified container runtime, with no Docker socket,
# host files or network. No host JSON interpreter is required.
config=$("${compose[@]}" config --format json) || fail '无法读取运行配置，请检查 .env 中的端口设置。'
listen_port=$(printf '%s' "$config" | docker run --rm -i --network none --read-only --entrypoint node "$image" -e '
  let text="";process.stdin.setEncoding("utf8");process.stdin.on("data",s=>text+=s);
  process.stdin.on("end",()=>{try{
    const [image,platform]=process.argv.slice(1),c=JSON.parse(text),a=c.services.app,u=c.services.updater;
    for(const s of [a,u])if(s.image!==image||s.platform!==platform||s.pull_policy!=="never")throw Error("配置与安装包不符");
    if(a.ports.length!==1||a.ports[0].host_ip!=="127.0.0.1"||Number(a.ports[0].target)!==8787||u.ports?.length)throw Error("只能本地访问");
    const port=Number(a.ports[0].published);if(!Number.isInteger(port)||port<1||port>65535)throw Error("端口无效");
    console.log(port);
  }catch(e){console.error(e.message);process.exitCode=1}});
' "$image" "$platform") || fail '运行配置与安装包不符，已停止启动。'
[[ "$listen_port" =~ ^[0-9]{1,5}$ ]] || fail '无法确认本地访问端口。'

check_lock() {
  local id=$1 volume
  volume=$(docker inspect --format '{{range .Mounts}}{{if and (eq .Destination "/updates") (eq .Type "volume")}}{{.Name}}{{"\n"}}{{end}}{{end}}' "$id") || fail '无法确认更新卷。'
  [[ "$volume" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || fail '无法确认更新卷，请勿删除数据卷。'
  docker run --rm --network none --read-only --user root --mount "type=volume,source=$volume,target=/updates,readonly" "$image" node -e 'const fs=require("fs");process.exit(fs.existsSync("/updates/bundle.json")||fs.existsSync("/updates/transaction.json")?42:0)' || fail '网页更新或恢复尚未完成，请保持 Docker 运行，稍后再启动。'
}
helpers=$(docker ps -a --filter "label=com.docker.compose.project=$project" --filter 'label=com.docker.compose.service=update-helper' --format '{{.ID}}') || fail '无法检查更新助手状态。'
while IFS= read -r id; do
  [ -n "$id" ] || continue
  state=$(docker inspect --format '{{.State.Status}}' "$id") || fail '无法检查更新助手状态。'
  [ "$state" = exited ] || fail '网页更新或恢复正在进行，请保持 Docker 运行，稍后再启动。'
  check_lock "$id"
done <<< "$helpers"
version_gt() {
  local a b i
  local -a aa bb
  IFS=. read -r -a aa <<< "$1"
  IFS=. read -r -a bb <<< "$2"
  for i in 0 1 2; do
    a=${aa[$i]} b=${bb[$i]}
    if ((10#$a > 10#$b)); then return 0; fi
    if ((10#$a < 10#$b)); then return 1; fi
  done
  return 1
}
for service in app updater; do
  existing=$(docker ps -a --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=$service" --format '{{.ID}}') || fail '无法读取已安装版本。'
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    name=$(docker inspect --format '{{.Name}}' "$id") || fail '无法读取已安装版本。'
    case "$name" in *-rollback-*) fail '检测到未完成的更新恢复，请勿覆盖组件或删除数据卷。' ;; esac
    check_lock "$id"
    installed=$(docker inspect --format '{{.Config.Image}}' "$id") || fail '无法读取已安装镜像。'
    installed_version=''
    if [[ "$installed" =~ ^salmon-review:([0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
      installed_version=${BASH_REMATCH[1]}
    elif [[ "$installed" =~ ^sha256:[a-f0-9]{64}$ ]]; then
      installed_version=$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.version"}}' "$id") || fail '无法读取已安装版本。'
    fi
    if [[ "$installed_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] && version_gt "$installed_version" "$version"; then
      if [ "$service" = app ]; then export SALMON_IMAGE=$installed; else export SALMON_UPDATER_IMAGE=$installed; fi
      printf '保留网页已更新的 %s 版本 %s，不降回安装包版本。\n' "$service" "$installed_version"
    fi
  done <<< "$existing"
done
printf '正在启动项目 %s；数据卷会沿用此项目名。\n' "$project"
"${compose[@]}" up -d --no-build --pull never || fail '启动失败。请检查端口占用；不要删除数据卷。'
for service in app updater; do
  container=$("${compose[@]}" ps --quiet "$service") || fail "无法读取 $service 运行容器。"
  [ -n "$container" ] || fail "未找到 $service 运行容器。"
  ready=false
  for ((attempt=0; attempt<60; attempt++)); do
    health=$(docker inspect --format '{{.State.Status}}/{{.State.Health.Status}}' "$container") || break
    if [ "$health" = running/healthy ]; then ready=true; break; fi
    case "$health" in exited/*|dead/*|*/unhealthy) break ;; esac
    sleep 2
  done
  [ "$ready" = true ] || fail "$service 尚未就绪。请运行 docker compose -p $project ps 查看状态。"
done
url="http://127.0.0.1:$listen_port/"
printf '启动成功：%s\n首次使用请在网页连接自己的任天堂账号，登录与同步仍需联网。\n' "$url"
if [ "$no_browser" = false ]; then open "$url" || printf '请在浏览器手动打开以上地址。\n'; fi
