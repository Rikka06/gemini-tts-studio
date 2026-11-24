@echo off
chcp 936 >nul 2>&1
setlocal EnableExtensions
title TTS Studio Local Server
cd /d "%~dp0"

echo.
echo  ============================================================
echo               TTS Studio 本地服务启动器
echo  ============================================================
echo   工作目录: %CD%
echo.

if not exist "server.py" goto NO_SERVER
if exist "dist\desktop\index.html" goto HAS_DIST
echo  [提示] 未找到 dist 构建产物，尝试自动执行 npm run build...
where npm >nul 2>&1
if not errorlevel 1 (
  call npm run build
)
:HAS_DIST

set "PY_CMD="
where python >nul 2>&1
if not errorlevel 1 (
  python -c "import sys;sys.exit(0 if sys.version_info>=(3,6) else 1)" >nul 2>&1
  if not errorlevel 1 set "PY_CMD=python"
)
if not defined PY_CMD (
  where py >nul 2>&1
  if not errorlevel 1 (
    py -3 -c "import sys;sys.exit(0 if sys.version_info>=(3,6) else 1)" >nul 2>&1
    if not errorlevel 1 set "PY_CMD=py -3"
  )
)
if not defined PY_CMD goto NO_PYTHON

echo   Python 检测通过: %PY_CMD%
echo   网页地址: http://127.0.0.1:8080/
echo.
%PY_CMD% "server.py"
pause
exit /b %ERRORLEVEL%

:NO_PYTHON
echo  [错误] 未检测到可用的 Python 3.6+
pause
exit /b 1

:NO_SERVER
echo  [错误] 当前目录下找不到 server.py
pause
exit /b 1
