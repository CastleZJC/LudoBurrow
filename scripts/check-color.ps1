# 内置选图彩色校验（fetch-gallery.mjs 调用；WIC 解码零第三方依赖）
# 规则（内置选图规范：彩色、色彩鲜明、引起孩子兴趣）：
#   饱和度均值 ≥ 0.12 且 彩色像素占比（S>0.22 且 V>0.12）≥ 0.15 → colorful=true
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-color.ps1 <图片路径>
# 输出（stdout 单行 JSON）：{"satMean":0.34,"colorRatio":0.45,"colorful":true}
param([Parameter(Mandatory = $true)][string]$Path)

Add-Type -AssemblyName PresentationCore

$uri = [Uri]::new((Resolve-Path -LiteralPath $Path).Path)
$decoder = [Windows.Media.Imaging.BitmapDecoder]::Create(
  $uri,
  [Windows.Media.Imaging.BitmapCreateOptions]::None,
  [Windows.Media.Imaging.BitmapCacheOption]::OnLoad)
$frame = $decoder.Frames[0]
$w = $frame.PixelWidth
$h = $frame.PixelHeight
$bpp = if ($frame.Format -eq [Windows.Media.PixelFormats]::Bgr24) { 3 } else { 4 }
$buf = New-Object byte[] ($w * $h * $bpp)
$frame.CopyPixels($buf, $w * $bpp, 0)

$n = 0
$sumS = 0.0
$colorfulPx = 0
$step = [Math]::Max(1, [int]([Math]::Sqrt($w * $h) / 64))
for ($y = 0; $y -lt $h; $y += $step) {
  for ($x = 0; $x -lt $w; $x += $step) {
    $i = ($y * $w + $x) * $bpp
    # WIC 行序 B G R (A)
    $b = $buf[$i] / 255.0
    $g = $buf[$i + 1] / 255.0
    $r = $buf[$i + 2] / 255.0
    $max = [Math]::Max($r, [Math]::Max($g, $b))
    $min = [Math]::Min($r, [Math]::Min($g, $b))
    $v = $max
    $s = if ($max -gt 0) { ($max - $min) / $max } else { 0 }
    $n++
    $sumS += $s
    if ($s -gt 0.22 -and $v -gt 0.12) { $colorfulPx++ }
  }
}

$satMean = [Math]::Round($sumS / $n, 4)
$colorRatio = [Math]::Round($colorfulPx / $n, 4)
$colorful = ($satMean -ge 0.12) -and ($colorRatio -ge 0.15)
[Console]::Out.WriteLine(('{"satMean":' + $satMean + ',"colorRatio":' + $colorRatio + ',"colorful":' + $(if ($colorful) { 'true' } else { 'false' }) + '}'))
