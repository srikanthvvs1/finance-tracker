@echo off
title FinTrack Server
echo.
echo   FinTrack - Personal Finance Tracker
echo   ====================================
echo.

:: Change to the script's directory (handles spaces in path)
cd /d "%~dp0"

:: Auto-detect Python
set "PYTHON="
where python >nul 2>&1 && set "PYTHON=python"
if not defined PYTHON where py >nul 2>&1 && set "PYTHON=py"
if not defined PYTHON (
    echo   [ERROR] Python not found. Please install Python 3.10+ from python.org
    echo          and make sure "Add Python to PATH" is checked during install.
    echo.
    pause
    exit /b 1
)

:: Verify Flask is installed
"%PYTHON%" -c "import flask" >nul 2>&1
if errorlevel 1 (
    echo   [INFO] Installing required packages...
    "%PYTHON%" -m pip install -r requirements.txt
    echo.
)

:: Create desktop shortcut if it doesn't exist yet
set "SHORTCUT=%USERPROFILE%\Desktop\FinTrack.lnk"
if not exist "%SHORTCUT%" (
    echo   [INFO] Creating desktop shortcut...
    powershell -ExecutionPolicy Bypass -Command ^
        "$s=(New-Object -COM WScript.Shell).CreateShortcut('%SHORTCUT%');" ^
        "$s.TargetPath='cmd.exe';" ^
        "$s.Arguments='/c \"%~dp0start.bat\"';" ^
        "$s.WorkingDirectory='%~dp0';" ^
        "$s.Description='FinTrack - Personal Finance Tracker';" ^
        "$s.IconLocation='shell32.dll,44';" ^
        "$s.Save()"
    if exist "%SHORTCUT%" (
        echo   [OK] Desktop shortcut created! Right-click it ^> Pin to taskbar
    )
    echo.
)

:: Store data in the same folder as the app
set "FINTRACK_DATA_DIR=%~dp0"

echo   Data folder : %FINTRACK_DATA_DIR%
echo   Server      : http://localhost:5000
echo.

:: Open browser after a short delay (runs in background)
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:5000"

:: Start the server (this blocks until you press Ctrl+C)
"%PYTHON%" server.py

echo.
echo   Server stopped. Press any key to close.
pause >nul
