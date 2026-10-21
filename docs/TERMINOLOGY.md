# 统计术语对照

界面短标签优先简洁；说明文字写明实际统计对象。下表中的统计标签是本项目用语，不意味着所有标签都逐字来自 NSO。

| 指标 | 英文标签 | 日文标签 | 统计含义 |
| --- | --- | --- | --- |
| 搬蛋 | Golden Eggs | 金イクラ | 实际纳品数（Golden Eggs deposited / 金イクラ納品数），不含纳品协助 |
| 击杀 | Boss defeats | オオモノ討伐数 | 巨大鲑鱼的击倒数；英文全称 Boss Salmonids defeated，日文对象为オオモノシャケ。不是所有小怪，也不含头目鲑鱼 |
| 红蛋 | Power Eggs | イクラ | 结算中的鲑鱼卵数量；不直译为 Red Eggs。「赤イクラ」属于玩家常用的区分说法 |
| 救援 | Rescues | 救助数 | 救起队友的次数 |
| 被救援 | Times rescued | 被救助数 | 被队友救起的次数；不等于包含未获救倒地在内的全部死亡次数 |

繁体中文保留「搬蛋／擊殺／紅蛋／救援／被救援」等简短标签；正式对象名称使用「金鮭魚卵／鮭魚卵／巨大鮭魚」。巨大鮭魚与頭目鮭魚是不同类别，不能混用。

所有语言的成功场次徽标固定为 `clear!!`。这只影响结果徽标，不改动通过率、筛选条件或头目击倒状态。

鱿鱼语使用完整英文文案配合 Inkling 字体，属于装饰显示模式，不是逐字翻译中文。必须先补齐整句英文，再应用字体，避免关键词替换产生中英混排。玩家昵称、名片文字和输入值保留原文；字体缺少的字符会使用回退字体。

## 核对依据

核对日期：2026-10-21。

- [任天堂香港：鲑鱼跑介绍](https://www.nintendo.com/hk/switch/av5ja/coop/index.html)：金鮭魚卵、巨大鮭魚、頭目鮭魚。
- [任天堂日本：サーモンラン](https://www.nintendo.com/jp/switch/av5ja/coop/index.html)：金イクラ、納品、オオモノシャケ、オカシラシャケ。
- [任天堂英文更新说明](https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257/~/splatoon-3-update-history)：Golden Eggs deposited、Power Eggs、Boss Salmonids 等术语。
- 游戏地图、敌人、武器等专名的版本与来源见 [LOCALIZATION.md](LOCALIZATION.md)。救助数／被救助数是本项目的简洁统计标签；未将其宣称为官方界面的逐字复刻。

运行时统一由 `dist/i18n-catalog.js` 提供文案。修改统计名称时同时核对组合标题、说明、悬停提示、无障碍标签和图片导出；不要修改保存的原始战绩字段。
