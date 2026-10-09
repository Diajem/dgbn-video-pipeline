@echo off
rem Starts the Video Studio with phone access ON and opens it in the browser
cd /d "%~dp0"
set STUDIO_PORT=4177
set STUDIO_REMOTE=1
netstat -ano | findstr /R /C:":4177 .*LISTENING" >nul
if %errorlevel%==0 (
  echo The Video Studio is already running, possibly WITHOUT phone access.
  echo Restarting it will stop anything it is rendering right now.
  choice /C YN /M "Restart it with phone access"
  if errorlevel 2 (
    start "" http://127.0.0.1:4177
    exit /b
  )
  for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":4177 .*LISTENING"') do taskkill /F /PID %%p >nul 2>&1
  timeout /t 2 /nobreak >nul
)
start "Video Studio - close this window to stop" cmd /k "node studio\server.mjs"
timeout /t 3 /nobreak >nul
start "" http://127.0.0.1:4177
