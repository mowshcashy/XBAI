@echo off
chcp 65001 >nul
echo ============================================
echo   Adding EBDAAI MCP server to Codex config
echo ============================================
echo.

>> "%USERPROFILE%\.codex\config.toml" echo.
type "%~dp0ebdaea-block.toml" >> "%USERPROFILE%\.codex\config.toml"

echo Verifying:
findstr /C:"ebdaea" "%USERPROFILE%\.codex\config.toml"

echo.
echo ============================================
echo   Done! Now restart Codex + open NEW chat.
echo ============================================
pause
