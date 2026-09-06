# 工具脚本：本地版权素材像素提取 —— documents/local/（.gitignore 已整体忽略，不入库不分发）
# 用途：把本地导入的 JPEG/PNG 缩至 192 长边输出 RGBA .bin，供「最优切块规格」离线分析；
#       游戏内「自动最优」按钮与同一评分器（pickBestSpec），本脚本只服务于本机离线核对与建档参数预生成。
# 产物：documents/local/.analysis/<名称>.bin + meta.json（同样仅本地保留）
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File scripts/extract-local-pixels.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Join-Path $PSScriptRoot '..\documents\local'
if (-not (Test-Path $root)) {
  Write-Output "skip: documents/local 不存在（本机无本地素材，正常退出）"
  exit 0
}
$outDir = Join-Path $root '.analysis'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$meta = @()
Get-ChildItem -Path $root -File | Where-Object { $_.Extension -match '^\.(jpe?g|png)$' } | Sort-Object Name | ForEach-Object {
  $img = [System.Drawing.Image]::FromFile($_.FullName)
  try {
    $maxEdge = [Math]::Max($img.Width, $img.Height)
    $scale = [Math]::Min(1.0, 192.0 / $maxEdge) # 显式浮点除：PowerShell 整数相除会取整得 0
    $w = [Math]::Max(1, [int][Math]::Round($img.Width * $scale))
    $h = [Math]::Max(1, [int][Math]::Round($img.Height * $scale))

    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $w, $h)
    $g.Dispose()

    $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
    $mode = [System.Drawing.Imaging.ImageLockMode]::ReadOnly
    $fmt = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    $bd = $bmp.LockBits($rect, $mode, $fmt)
    $bytes = New-Object byte[] ($w * $h * 4)
    [System.Runtime.InteropServices.Marshal]::Copy($bd.Scan0, $bytes, 0, $bytes.Length)
    $bmp.UnlockBits($bd)
    $bmp.Dispose()

    # Format32bppArgb 为 BGRA 序，交换每像素 [0]/[2] 转为 RGBA（与引擎 ImageDataLike 口径一致）
    for ($i = 0; $i -lt $bytes.Length; $i += 4) {
      $t = $bytes[$i]
      $bytes[$i] = $bytes[$i + 2]
      $bytes[$i + 2] = $t
    }

    $bin = Join-Path $outDir ($_.BaseName + '.bin')
    [System.IO.File]::WriteAllBytes($bin, $bytes)
    $meta += [ordered]@{ name = $_.BaseName; file = $_.Name; srcW = $img.Width; srcH = $img.Height; w = $w; h = $h }
    Write-Output ("extracted {0}: {1}x{2} -> {3}x{4}" -f $_.Name, $img.Width, $img.Height, $w, $h)
  } finally {
    $img.Dispose()
  }
}

# 注意：PS 5.1 的 -Encoding UTF8 实际带 BOM，消费方读 meta.json 需剥离（\uFEFF）
$meta | ConvertTo-Json | Set-Content -Path (Join-Path $outDir 'meta.json') -Encoding UTF8
Write-Output ("done: {0} images -> {1}" -f $meta.Count, $outDir)
