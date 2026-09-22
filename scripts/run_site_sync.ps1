# 성광감리교회 홈페이지 콘텐츠 동기화 — 새벽묵상/이주의 말씀/앨범을 최신 설교·사진 파일 기준으로 갱신하고
# 변경이 있으면 자동 커밋·푸시한다. Windows 작업 스케줄러("성광홈페이지_콘텐츠동기화")가 매일 실행한다.
# 각 sync-*.js 스크립트 자체가 변경분이 없으면 커밋하지 않으므로, 매번 셋 다 그냥 실행해도 안전하다.
# 수동 실행도 가능: powershell -ExecutionPolicy Bypass -File "scripts\run_site_sync.ps1"

$ErrorActionPreference = "Continue"

$repoDir = "C:\Users\ygk12\Documents\성광감리교회-홈페이지"
$logDir  = Join-Path $repoDir "scripts\task_logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$logFile = Join-Path $logDir "$timestamp.log"

Set-Location $repoDir

# node 스크립트의 한글 로그 출력이 로그 파일에서 깨지지 않도록 콘솔 인코딩을 UTF-8로 맞춘다.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

foreach ($script in @("sync-verses.js", "sync-sunday-word.js", "sync-album.js")) {
    "---- $script 시작 $(Get-Date -Format o) ----" | Out-File -Append -Encoding UTF8 $logFile
    & node "scripts\$script" *>> $logFile
    "---- $script 종료 (exit $LASTEXITCODE) ----" | Out-File -Append -Encoding UTF8 $logFile
}

# 오래된 작업 로그는 30일 지나면 정리 (scripts/sync.log 자체는 각 sync-*.js가 알아서 관리)
Get-ChildItem -Path $logDir -Filter "*.log" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item -Force -ErrorAction SilentlyContinue
