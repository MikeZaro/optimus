@echo off
echo ============================================
echo Starting Claude Chat Development Environment
echo ============================================
echo.
echo This will start both the backend and frontend servers.
echo.
echo Backend: http://localhost:3001
echo Frontend: http://localhost:5173
echo Chat: http://localhost:5173/chat
echo.
echo Press Ctrl+C to stop all servers
echo ============================================
echo.

start "Backend Server" cmd /k "npm run server"
timeout /t 2 /nobreak > nul
start "Frontend Dev Server" cmd /k "npm run dev"

echo.
echo Servers are starting in separate windows...
echo.
pause
