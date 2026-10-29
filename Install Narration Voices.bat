@echo off
rem Install the approved local voice system. No keys or paid providers are needed.
cd /d "%~dp0"
python -m venv .venv-voice
if errorlevel 1 goto failed
".venv-voice\Scripts\python.exe" -m pip install -r scripts\pocket_tts\requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu
if errorlevel 1 goto failed
set "DIAJEM_VOICE_PACK=%USERPROFILE%\Downloads\diajem-narration-voices.zip"
if not exist "%DIAJEM_VOICE_PACK%" set /p "DIAJEM_VOICE_PACK=Full path to diajem-narration-voices.zip: "
".venv-voice\Scripts\python.exe" scripts\pocket_tts\setup.py --pack "%DIAJEM_VOICE_PACK%"
if errorlevel 1 goto failed
echo.
echo Three narration voices are installed. Restart Video Studio when current work is finished.
pause
exit /b 0
:failed
echo.
echo Setup is incomplete. See the message above. No existing narration or provider keys were changed.
pause
exit /b 1
