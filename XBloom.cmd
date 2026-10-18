@echo off
cd /d "%~dp0xbloom-app"
curl -s -o nul --max-time 1 http://127.0.0.1:8787/api/session
if errorlevel 1 (
  start "XBloom Server" /min "C:\Program Files\nodejs\node.exe" "server\index.js"
  ping -n 3 127.0.0.1 >nul
)
start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:8787/
