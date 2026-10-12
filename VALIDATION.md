# 验证记录 — 0.3.1 / 2026-09-20

## v0.3.5 战绩读取性能修复 — 2026-10-01

- 另一台电脑用户实测：状态接口在重启后能正常返回，199 条归档的 `/api/data` 读取耗时 47.83 秒；此前浏览器和容器内部状态请求均曾超时。
- 确认旧版 `snapshot()` 每次引用图片都执行一次同步数据库写入。199 场、共享单一图片的模拟记录，每次读取产生 2787 次改动；修复后首次 1 次，后续 0 次。
- 同机模拟样本修复前约 1.1 秒，修复后首次 31 毫秒、重复 22 毫秒；不将模拟样本耗时当作用户电脑的实测结果。
- 新增回归验证原始战绩不变、重启后读取仍不写图片索引、图片查询参数更新保持本地路径稳定，以及批量失败全部回滚。
- 数据库结构与版本不变；另一台电脑升级后的耗时仍待验收。

## v0.3.4 镜像标识兼容修复

- 用户反馈的 v0.3.3 镜像 ID 与发布归档内配置文件的 SHA-256 一致；旧启动器只接受打包机器返回的索引 ID，造成误报。
- 打包元数据现包含归档配置摘要和构建机器的镜像 ID；归档的标签、平台和源码提交必须一致，启动器继续检查文件校验和并拒绝未知镜像。
- Python 归档测试 2 项通过；Windows PowerShell 5.1 与 PowerShell 7 各通过 7 个启动器场景，包括两种 ID、缺失镜像导入、错误镜像替换、旧元数据兼容、错误镜像拒绝及无效元数据拒绝。
- 启动器回归测试调用真实脚本，模拟 Docker 命令边界；这不等同于已在另一台使用经典存储的 Docker 引擎上完成安装。测试与正式安装包均使用带 BOM 的 UTF-8 脚本。

## 本轮已验证

- Docker Desktop 的 Linux 容器使用 Node.js 22.23.2，按锁文件构建成功；容器以 `node` 用户运行。
- 新镜像内 26 项自动化测试全部通过。覆盖存储和去重、导入与备份、账号状态与登录子进程、失败重试、同步锁、敏感输出屏蔽、请求来源及 CSRF 保护，以及许可证下载。
- 新增兼容性测试实际调用 undici 的本地 HTTP 请求、sharp 原生图片编码/解码，以及 node-notifier 所需的 CommonJS / uuid 接口；测试不会发送桌面通知。
- 新镜像中 `npm audit --omit=dev --audit-level=low` 返回 0 个已知漏洞。此结果只针对当时 npm 审计数据库和依赖树，不包含完整操作系统扫描或应用安全审计。
- 保留此前已验证可用的 nxapi 1.6.1-next.257，定向更新 undici、sharp 和 node-notifier 使用的 uuid。sharp 的原生加载与通知依赖的兼容性已验证，未把它们视作登录功能的替代测试。
- 项目采用 AGPL-3.0-or-later；锁文件内 170 个包已生成可校验清单，新 Linux 镜像为实际安装的 149 个包收集了许可证据。部分材料仍不完整，见第三方声明。

- 本机运行服务已升级至 0.3.1，账号连接与 50 场记录保留。18:37:07（UTC+8）通过网页“立即同步”完成 50/50，新增 0 场、无错误；网页同步完成提示及许可证入口正常。此次使用现有账号缓存，不等同于过期凭据续期测试。

## 此前版本已有的验证证据

- 空数据首次启动、网页导入及数据管理流程已在本机浏览器验证；外部 Edge 的样式加载和请求来源兼容问题已修复并增加回归测试。
- 50 场真实记录的个人搬蛋、协助、巨大鲑鱼击杀、红蛋、救援、被救援及团队巨大鲑鱼击杀，均与原始 JSON 逐场核对。两期排班覆盖分别为 22/22 和 28/45。
- 重启、重建容器后 50 场记录保留；51 份文档的备份重新导入没有重复场次。
- CLI 同步曾在隔离的现有登录缓存副本中取得 50 场详情，场地名称与简体中文导出一致。这项测试本身不代表过期凭据续期已验证。
- 用户已完成网页引导的 Nintendo 账号连接；随后在运行中的应用观察到成功同步。此前文档中“交互登录尚未完成”的描述已过时；真实过期凭据续期仍需另测。
- Git 历史与 CI 日志曾做有限规则扫描，未发现匹配的令牌、私钥或已知真实玩家资料。规则扫描不能证明所有敏感信息都不存在。

## 仍需验证或补齐

- 另一位玩家在干净电脑上从零安装并连接自己的账号。
- 真实凭据自然过期后的续期；不通过主动注销现有账号来冒充续期验证。
- 更多特殊模式的实际数据。这些模式目前不计入普通打工统计。
- splatnet3-types 的授权信息，以及 tr46 旧发布包缺失的许可证正文。不要把本项目的 AGPL 许可套用到这些依赖；公开镜像前还需整理对应源码和原生组件、系统包的分发材料。
- 大型历史归档的性能。目前单次网页导入上限为 60 MB，尚未实现流式导入及历史分页。

真实记录、登录缓存、验证备份不在 Git 仓库中；不将它们作为反馈附件或镜像内容发布。仓库保持 Private，本轮不发布公共镜像。


## 2026-09-30 开发过程验证（历史记录）

- 早期容器测试 36 项通过，包含当时的三合一实验；该实验随后移除，v0.3.3 最终保留三张同步细节图，最终测试共 46 项。
- 实际本地样本：正常结算 10 场，汇总 playCount=10，原始列表另有 1 条 resultWave=-1 且无波次的记录。修正为正常场次 10/10，另行显示中断记录；中断前后仍不连接连续同队。
- 原地替换容器后，归档的原始 documents 逐项一致，账号连接状态保持；未执行导入恢复或数据库结构迁移。
- 浏览器验证选定范围、起止自动纠正、四图渲染、队友选择、PNG 编码后的实际图片、单场 SVG 及隐藏人名。内置浏览器下载事件未返回，Edge 自动化访问被客户端拦截；已验证生成的图片字节和可见下载链接，外部浏览器保存到下载目录仍需人工验收。


### 2026-09-30 后台读取与显示保留

- 容器内 40 项测试通过；新增慢请求、重复轮询、读取失败后恢复、无变化不重绘、排班与滚动保留、缓存损坏/禁用及首次加载测试。
- 隔离浏览器测试服务将同步状态延迟 20 秒：刷新后仍显示缓存战绩；状态返回 503 时仍可切换排班，恢复后自动读取且保留已选排班。
- 快照仅存于当前来源的 sessionStorage，用于当前标签页刷新期间展示，不写入授权状态或凭据；没有缓存时显示明确的首次加载提示。浏览器禁用存储或缓存超出容量时继续正常读取实时数据。


### 2026-09-30 手动重试与自动退避分离

- 容器内 46 项测试通过。覆盖网络失败后 4999/5000 毫秒边界、自动退避递增、重启保留、旧版等待兼容、限流两条路径及重连后仍生效、认证失效阻止重试和成功重连立即同步。
- 前端验证 5 秒倒计时结束后无需等待下一次状态轮询即可恢复按钮；保留状态读取失败提示，不被倒计时更新覆盖。
- 隔离浏览器页面模拟网络失败，确认显示“5 秒后可重试”并恢复为“立即同步”；没有调用真实账号同步或重新登录。
# 0.3.6 development validation — 2026-10-08

- Added score-trend switching, automatic/full-range axes and missing-data tests.
- 59 Node container tests passed, including update signature/compatibility checks, download hash and length rejection, CSRF/internal endpoint isolation, maintenance write lock, backup content hashing and failed replacement recovery.
- Windows launcher regression passed all 8 cases under both Windows PowerShell 5.1 and PowerShell 7; the added case prevents downgrading a version previously installed through the webpage.
- Two Python release identity tests and JavaScript syntax checks passed.
- Disposable `salmon-update-test` Compose integration verified actual container replacement, retained records/local fixture secret, writable app after restart, and recovery after simulated interruption and damaged fixture data. It did not use the player's volume. The image was locally supplied in this test, not downloaded from a public release.
- Local `salmon-review-dev` preview uses the same original data volume. Hash of all 189 backup documents remained unchanged (179 archived records; 178 supported jobs).
- Earlier browser verification covered the previous public-source prototype; this has been superseded by private collaborator authorization.
- Earlier public release repository was deleted on 2026-10-08 at the user's request; original development repository remains private. No public image or installer was uploaded. Public image distribution remains blocked by the unresolved upstream license grant documented in THIRD_PARTY_NOTICES.md; a complete public-download-to-install acceptance test remains pending.


## Private collaborator updates — 2026-10-08

- Deleted the separate public release repository at the user's request; GitHub returned 404 afterwards. Original `Awewlife/Salmon-review` remains PRIVATE. No collaborators were added automatically.
- Replaced public downloads with authenticated private Release API requests and per-user local credentials. The UI and documentation explain collaborator write access and classic token scope limitations.
- 64 Node tests passed in the Node 22 container. New tests cover missing/invalid/revoked credentials, rate limits, repository restrictions, credential stripping across CDN redirects, numeric asset-ID resolution, octet-stream negotiation, local secret file permissions, no token in status, disconnect, CSRF checks, and refusing cached updates after access revocation. After the final source cleanup the 12 updater tests passed again.
- Real GitHub access verified using the maintainer's existing CLI login in process memory only: private repository access succeeded and the v0.3.5 SHA256SUMS.txt asset downloaded with the expected 304 bytes. That credential was not stored in the app, an image, a source file, or a package.
- No signed update is published yet (`release_missing`); successful private collaborator authorization through the full installed browser flow and a real signed-release download-to-install remain to be tested with a consenting collaborator. Simulated revoked-access tests do not replace that acceptance test.
- Disposable Compose integration passed real container replacement, record/fixture-secret retention, restart after activation and interrupted update recovery. Only the isolated test project and its test volumes were removed.
- Updated the existing local preview using its original data volume. All backup document hashes remained unchanged. Browser verified the private authorization form, disabled unauthenticated update controls and empty-token error; no real credential was entered or persisted in this UI test.
- JavaScript syntax checks and two Python release packaging tests passed. This change does not publish a new release or install package.


## Score chart, update settings and CI dependency fix — 2026-10-08

- CI run 37752906367 failed at `npm audit`, before `npm test`: sharp <0.35.5 was flagged for GHSA-wq5f-xc86-pv6w, published 2026-10-06. Windows installer checks passed. The prior local functional test result did not cover this new dependency advisory.
- Updated only the sharp override to 0.35.5 and its lockfile/platform dependencies; retained nxapi 1.6.1-next.257. Regenerated dependency notices. Both host lockfile and built Linux container audits reported zero vulnerabilities at this check.
- 67 tests passed in the Node 22 container, including native sharp compatibility, score labels at hundred bands/jump destinations, startup-only update checking, notification dismissal, unauthenticated startup and manual checking. No invited-player acceptance run was attempted, per user request.
- Score charts now always auto-scale. Labels show the initial score, first recorded score in each new hundred band, final point and rank-change/large-jump destinations. Same-score plateaus and ordinary +20/-10/-20 changes do not add repetitive labels. Missing scores/continuity gaps remain disconnected.
- Browser verified SALMON REVIEW title, removal of the full-range and sidebar update buttons, real score labels 420/500/600/610, and the update dialog opened from Data & Sync settings. No browser console errors were observed.
- Local preview reused the original Compose project and data volume; all archived backup document hashes were unchanged.


## v0.3.8 release preparation — 2026-10-08

- 77 Node 22 container tests passed, covering interrupted-record timelines, zero-position hollow markers and solid chart lines, teammate continuity across confirmed interruptions, missing-record/absent-player breaks, export coordinates, match navigation, and pending GitHub authorization feedback.
- Syntax checks, license inventory verification (170 packages), two Python packaging tests and the Windows PowerShell 5.1 installer regression passed. Dependency audit reported zero vulnerabilities.
- Browser checks confirmed four loaded weapon images in the narrow shift card, normal/interrupted chart nodes opening their corresponding records, the concise interruption legend, and solid lines passing through interruption markers in the overview and three detail charts.
- Existing local preview continued to use the original data volume. No user records, credentials or signing keys are included in release assets; packaging exports a newly built image and committed source.


## v0.3.9 release preparation — 2026-10-12

- 121 Node 22 container tests passed, including contribution-share semantics, zero totals, chart scales and exports, cross-chart focus, mixed-rank coordinates, shared horizontal plot bounds, diagnostic privacy/cancellation/timeouts, and updater cancellation/retention rules.
- JavaScript syntax checks, the 170-package license inventory check, two Python package tests, and all eight installer scenarios under both Windows PowerShell 5.1 and PowerShell 7 passed. Dependency audit reported zero vulnerabilities.
- Disposable Compose integration passed real app replacement, record/fixture-secret preservation, restart after activation, and interrupted replacement recovery. The test disables production image cleanup and removes only its own test project and volumes.
- Browser checks verified diagnosis and JSON export, retry reading, 309 saved records, bounded mixed-rank height, aligned match positions across overview modes, equal wide-screen margins, and no narrow-screen horizontal overflow. Direct Edge automation was client-blocked; browser layout checks used the embedded Chromium browser.
- Release assets are built from committed source in GitHub's existing private draft workflow. The update manifest is signed locally with the existing external key; user data, login credentials and the private signing key are not packaged.
