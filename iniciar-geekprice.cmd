@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-geekprice.ps1"
set "GEEKPRICE_EXIT=%ERRORLEVEL%"
if not "%GEEKPRICE_EXIT%"=="0" pause
exit /b %GEEKPRICE_EXIT%
