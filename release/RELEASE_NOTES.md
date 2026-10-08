# Salmon Review v0.3.7

私有预发布：新增分数变化图和网页一键更新，更新入口放在“数据与同步”设置中。适用于 Windows Intel/AMD 64 位电脑和 Docker Desktop 的 Linux 容器模式。

## 本次变化

- “个人表现趋势”可切换到分数变化图，纵轴自动缩放，标注百分段及分数跳变后的实际分数。
- 浏览器标签标题统一为 SALMON REVIEW。
- 网页使用玩家自己的 GitHub 凭据访问原私有仓库。打开网页时检查一次新版，有新版提示，手动点击安装。
- 更新前备份本机数据，保留原项目和数据卷；安装失败尝试恢复旧版。不会自动安装。
- 升级 sharp 至 0.35.5，修复 GHSA-wq5f-xc86-pv6w 依赖安全告警；保留现有 nxapi 版本。

## 已有 0.3.6 私有更新开发版：验证网页升级

不必先安装这个完整包。在旧版打开“数据与同步 → 版本与更新”，连接你自己的 GitHub 更新权限，然后“检查更新 → 更新到 0.3.7”。保持 Docker Desktop 和网页打开，下载完成后程序会短暂重启。

仓库所有者可以创建仅选择 Salmon-review、Contents: Read-only 的细粒度令牌。受邀协作者请按 UPDATING.md 的经典令牌说明配置；协作者具备源码读写权限，经典令牌的权限范围也较宽，不能当作仅下载令牌。不要共享维护者凭据。

## 首次安装，或从 v0.3.5 及更早版本升级

1. 下载 **SalmonReview-v0.3.7-windows-x64.zip**，完整解压到新文件夹。GitHub 自动生成的 Source code 包不含镜像。
2. 启动 Docker Desktop，关闭旧版网页，复制原 `.env`（如果有）。
3. 使用原项目名和端口运行新版 **Start.cmd**。自定义项目名示例：`./Start.cmd -ProjectName 原项目名`。
4. 启动成功后重新打开网页；正常升级无需导出再导入战绩。

不要删除数据卷或执行 `docker compose down -v`。完整安装包包含预构建镜像，不需要自行 build 或访问 npm / Docker Hub。任天堂凭据到期仍需重新连接。

## 附件

- `SalmonReview-v0.3.7-windows-x64.zip`：完整 Windows 离线安装包。
- `salmon-review-0.3.7-linux-amd64.tar.gz` 与 `update.json`：网页更新使用的镜像和 Ed25519 签名清单，普通玩家无需手动操作。
- `SalmonReview-v0.3.7-source.zip`：对应源码。
- `SalmonReview-v0.3.7-third-party.zip`：第三方源码与许可材料。
- `SHA256SUMS.txt`：附件校验值。

本地功能、依赖扫描及 CI 已通过；真实玩家的私有授权到升级验收仍在进行中，不将模拟测试称为已完成该验收。仓库和发行版保持私有，无 AI 分析，不适用于公网多人服务。项目采用 AGPL-3.0-or-later；第三方授权材料的已知缺口按 THIRD_PARTY_NOTICES.md 披露。
