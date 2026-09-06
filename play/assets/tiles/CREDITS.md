# 迷宫瓦片与角色素材许可标注

全部素材由本项目脚本 `scripts/gen-maze-assets.mjs` 确定性程序化生成（像素图案硬边绘制，无随机维度），
非第三方素材，无版权与许可限制，随本项目 LICENSE（见仓库根目录）一同发布：

- `<castle|garden>/{wall,floor,goal,start}.png`：1024×1024 瓦片（v1.0 验收返工高清化：32×32 像素画逻辑网格 ×32 整数放大，硬边无插值；城堡=石砖/石板，花园=树篱/草地）
- `../sprites/hero.png`：768×1024 像素小人条带（4 行方向 down/left/right/up × 3 列帧 stand/walk1/walk2，帧 256×256 = 32×32 逻辑 ×8）
- 重新生成：`node scripts/gen-maze-assets.mjs`（输出恒定，可复现）
