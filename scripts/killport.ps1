# 杀掉占用指定端口的所有进程(Windows)
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File killport.ps1 <port>

param([int]$Port)

$conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $conn) { exit 0 }
foreach ($c in $conn) {
  $pid_ = $c.OwningProcess
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$pid_"
  if (-not $proc) { continue }
  $name = $proc.Name
  $cl = $proc.CommandLine
  # 保护 dev.mjs 自身 / killport.ps1 / 当前 PowerShell
  if ($cl -match 'dev\.mjs|killport\.ps1|kill-stale\.ps1') { continue }
  Write-Host "killing pid=$pid_ $name (port $Port)"
  Stop-Process -Id $pid_ -Force -ErrorAction SilentlyContinue
}