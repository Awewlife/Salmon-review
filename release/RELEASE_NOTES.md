首次提供预构建镜像安装包，适用于 **Windows Intel/AMD 64 位电脑 + Docker Desktop 的 Linux 容器模式**。

## 下载哪个文件？

- **普通玩家：下载 `SalmonReview-v0.3.2-windows-x64.zip`**，全部解压，打开 Docker Desktop，双击 `Start.cmd`。脚本校验并导入镜像，启动后打开本机网页。
- `SalmonReview-v0.3.2-source.zip`：与镜像对应的项目源码，供开发者使用。
- `SalmonReview-v0.3.2-third-party.zip`：第三方声明、nxapi 对应源码及组件清单。
- `SHA256SUMS.txt`：附件校验值。GitHub 自动显示的 “Source code” 压缩包没有预构建镜像，普通玩家无需下载。

安装和启动不访问 Docker Hub / npm；任天堂账号登录、战绩同步及远程图片加载仍然需要联网。ARM 电脑不在本安装包支持范围。

## 从旧版本升级

先在网页下载战绩备份。解压新版包后，沿用原来的项目名和端口。默认项目名是 `salmon-review`；用过其他项目名的玩家，在解压目录打开终端，运行 `./Start.cmd -ProjectName 原项目名`。如使用自定义端口，把旧 `.env` 复制过来，或使用 `-Port 8788`，以后继续使用同一端口。

数据卷保持不变；不要删除 Volumes，也不要运行 `docker compose down -v`。安装包不包含维护者的账号、战绩、登录缓存或数据卷。

## 版本边界

这是预发布版；仓库维持 Private，仅有仓库访问权限的人能下载。没有 AI 分析，暂不支持公网多人使用。其他玩家的全新机器安装和真实过期凭据续期仍待验证。

项目采用 AGPL-3.0-or-later。依赖的授权与声明缺口仍按 THIRD_PARTY_NOTICES.md 披露，本次提供私有试用附件不代表这些问题已经解决；不要据此认定可以无条件二次公开分发。仓库可见性未改变。
