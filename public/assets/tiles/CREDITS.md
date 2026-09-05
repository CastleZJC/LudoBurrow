# 迷宫瓦片与角色素材许可标注

全部素材由本项目脚本 `scripts/gen-maze-assets.mjs` 确定性程序化生成（像素图案硬边绘制，无随机维度），
非第三方素材，无版权与许可限制，随本项目 LICENSE（见仓库根目录）一同发布：

- `<castle|garden>/{wall,floor,goal,start}.png`：32×32 瓦片（城堡=石砖/石板，花园=树篱/草地）
- `../sprites/hero.png`：96×128 像素小人条带（4 行方向 down/left/right/up × 3 列帧 stand/walk1/walk2，帧 32×32）
- 重新生成：`node scripts/gen-maze-assets.mjs`（输出恒定，可复现）
