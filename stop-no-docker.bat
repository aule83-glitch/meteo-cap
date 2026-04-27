@echo off
echo Zatrzymywanie MeteoCAP...
taskkill /F /IM python.exe /T 2>nul
taskkill /F /IM node.exe /T 2>nul
echo Zatrzymano.
