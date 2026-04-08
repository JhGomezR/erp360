@echo off
:: reverb-keepalive.bat
:: Lanza el script PowerShell de keep-alive con política de ejecución abierta.
:: Doble-clic para arrancar Reverb en segundo plano con auto-restart.

cd /d "%~dp0.."
powershell -ExecutionPolicy Bypass -File "%~dp0reverb-keepalive.ps1"
