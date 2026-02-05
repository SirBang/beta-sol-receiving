@echo off
echo Finding your local IP address...
echo.
ipconfig | findstr /i "IPv4"
echo.
echo Use the IP address shown above to access from other devices on your network
echo Example: http://192.168.1.100:3000
pause
