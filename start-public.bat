@echo off
echo Choose your tunneling method:
echo.
echo 1. Localtunnel (may require password on first visit)
echo 2. Cloudflared (NO password, recommended)
echo.
set /p choice="Enter 1 or 2: "

if "%choice%"=="1" (
    echo Starting with localtunnel...
    start cmd /k "node server.js"
    timeout /t 3
    start cmd /k "lt --port 3000"
) else (
    echo Starting with cloudflared...
    start cmd /k "node server.js"
    timeout /t 3
    start cmd /k "npx cloudflared tunnel --url http://localhost:3000"
)
