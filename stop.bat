@echo off
title Studio Stopper
cd /d "%~dp0"

echo ===================================================
echo               STOPPING STUDIO
echo ===================================================
echo.

echo Stopping processes listening on port 3001 (Backend)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo Stopping processes listening on port 5173 (Frontend)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo All Studio servers have been stopped.
ping -n 3 127.0.0.1 >nul

