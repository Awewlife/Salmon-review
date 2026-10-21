# 游戏资料与字体的使用边界

核对日期：2026-10-21。本文记录资料来源、公开使用说明和本项目的处理方式，不将第三方内容重新授权为 AGPL。

## 游戏专名与名牌称号

**Data provided by Lean** · [Leanny/splat3](https://github.com/Leanny/splat3)

本项目使用固定版本 `7280ff9cde8bb1c5dcef46c700c326471584d2e6` 的四语言游戏专名，以及 1,037 个称号前缀、1,059 个称号后缀。提取范围和输入哈希见 [LOCALIZATION.md](LOCALIZATION.md) 与 `scripts/build-byname-catalog.mjs`。不复制完整资料库、网页程序或图片集。

### 找到的使用说明

维护者 Leanny 于 2026-09-07 在 [issue #7 的回复](https://github.com/Leanny/splat3/issues/7#issuecomment-5566028905)中表示：

> in general you are free to use the data as you like

回复还明确允许在构建时生成数据或将数据提交进仓库，要求保留上面的署名短句并链接至原仓库。本项目在网页页脚、README 和本文件中保留该署名。

该回复针对另一个项目的参数使用咨询，但使用了面向数据的一般性表述。本项目将它作为资料维护者允许选取、整理及分发数据的依据，而不是声称获得了单独签发给 Salmon Review、明确列举称号表的许可证。2026-10-19 该 issue 又有关于更广范围数据和图片的追问；核对时尚无新的维护者回复，不把提问者的文字视为授权。

### 不应扩大解释的部分

- 仓库没有覆盖全部内容的标准开源许可证。`js/LICENSE.md` 是 Chart.js 的 MIT 声明，不能套用于 `data/language`。
- 上述许可说明只涉及维护者能够许可的贡献，不证明其可以替 Nintendo 授权原始游戏文本、商标或图片。
- 原始游戏名称与称号仍保留 Nintendo 等权利人的权利；本项目不主张所有权，也不把这些文本标记为 MIT 或 AGPL。
- Nintendo 的[视频及图片分享指南](https://www.nintendo.co.jp/networkservice_guideline/en/index.html)针对游戏画面和截图分享，不能直接当作语言表或字体文件的分发授权。
- 不由“非商业”“公开可下载”或“只复制数据”推导无限制使用许可。这里记录的是具体的维护者公开说明及尚存的上游权利边界。

因此，上一轮仅凭根目录没有 LICENSE 得出的“未找到维护者使用许可”结论需要更新；维护者层面的依据现已找到。它不构成 Nintendo 对所有游戏资源的通用授权。本次仅更新私有发行草稿，不将这次核对描述为已完成公开发布的法律审查。

## Inkling v2

作者为 eli / frozenpandaman。[作者页面](https://frozenpandaman.github.io/inkling.html)要求非商业使用和署名。本项目按需远程加载固定版本，保留可见署名和 [INKLING-NOTICE.txt](../dist/fonts/INKLING-NOTICE.txt)，不把字体文件放入仓库、镜像或安装包。

鱿鱼语导出仅提供 PNG。字体在浏览器内存中用于栅格化，最终 PNG 只含像素及可见署名，不携带可提取的字体二进制。不提供鱿鱼语 SVG；其他语言仍可导出 SVG。禁用字体嵌入并不取消作者的非商用和署名条件，也不解决字体涉及的全部底层游戏素材权利问题。

## 其他字体、图片和协议常量

- M PLUS Rounded 1c 的原始字体、作者声明和 SIL OFL 1.1 随包保留，见 [字体说明](../dist/fonts/README.md)。
- 名牌使用的可选远程 Splatfont 沿用既有行为，没有新增打包或分发；它与作者自制 Inkling v2 是不同资源，不能互相套用条件。
- NSO 头像、名牌、工服、地图和敌人图片依据用户自己的上游记录按需缓存，不新增游戏图片集到发行包。缓存不改变图片权利归属。
- 查询哈希和兼容模块的枚举有独立的逐项来源记录，见 [兼容模块说明](../packages/splatnet3-compat/README.md)；本文件不替代其许可材料。

本轮没有向维护者或 Nintendo 发消息，也没有将本项目的私人资料提交到上游 issue。
