@echo off
rem Melóstippek.hu — backend + frontend indítás
start "Melostippek Backend" cmd /k "cd /d %~dp0backend && E:\programozas\melostippek-target\x86_64-pc-windows-gnu\release\server.exe"
start "Melostippek Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
echo Backend: http://localhost:8080  -  Frontend: http://localhost:3000
