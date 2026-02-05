@echo off
echo Opening port 3000 in Windows Firewall...
echo This requires administrator privileges.
echo.

netsh advfirewall firewall add rule name="Beta Tester Server" dir=in action=allow protocol=TCP localport=3000

if %errorlevel% == 0 (
    echo.
    echo SUCCESS! Port 3000 is now open.
    echo Your server can now be accessed from other devices on your network.
) else (
    echo.
    echo ERROR: Failed to open port. Right-click this file and select "Run as administrator"
)

echo.
pause
