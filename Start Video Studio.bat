@echo off
rem Starts the Video Studio on this PC and opens it in the browser
cd /d "%~dp0"
set STUDIO_PORT=4177
rem (this PC only)
netstat -ano | findstr /R /C:":4177 .*LISTENING" >nul
if %errorlevel%==0 (
  start "" http://127.0.0.1:4177
  exit /b
)
start "Video Studio - close this window to stop" cmd /k "node studio\server.mjs"
timeout /t 3 /nobreak >nul
start "" http://127.0.0.1:4177
