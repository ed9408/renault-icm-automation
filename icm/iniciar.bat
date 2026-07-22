@echo off
echo Deteniendo el icm
call detener.bat
echo Iniciando el icm (TypeScript + Bun)
bun src\ui\main.ts