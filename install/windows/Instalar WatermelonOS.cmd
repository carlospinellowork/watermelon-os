@echo off
rem Abre o instalador do WatermelonOS (pede permissão de administrador)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0WatermelonOS-Installer.ps1" %*
