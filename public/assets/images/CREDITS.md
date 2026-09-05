# 内置图库许可标注

全部 24 张图片（animals / space / scenery / cartoon 各 6 张）由本项目脚本
`scripts/gen-gallery.mjs` 确定性程序化生成（种子化几何图形 + 渐变），非第三方素材，
无版权与许可限制，随本项目 LICENSE（见仓库根目录）一同发布。

- 源图：`<topic>/<id>.png`（1024×1024，仅绘制用）
- 分析缩略：内嵌于 `src/games/jigsaw/thumbs.ts`（192 长边 data URI，切块引擎输入）
- 重新生成：`node scripts/gen-gallery.mjs`（输出恒定，可复现）
