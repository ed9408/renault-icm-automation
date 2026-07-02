@echo off
echo Deteniendo todos los procesos de Node.js...

:: Encuentra todos los procesos de node.exe y guarda los PIDs en un archivo temporal
tasklist /FI "IMAGENAME eq node.exe" /FO CSV > node_processes.txt

:: Lee el archivo temporal y termina cada proceso de Node.js
for /F "skip=1 tokens=2 delims=," %%i in (node_processes.txt) do (
    set "pid=%%~i"
    setlocal enabledelayedexpansion
    :: Quitar el primer carácter si es un espacio
    if "!pid:~0,1!"==" " (
        set "pid=!pid:~1!"
    )
    echo Terminando proceso con PID: !pid!
    taskkill /PID !pid! /F
    endlocal
)

:: Elimina el archivo temporal
del node_processes.txt

echo Todos los procesos de Node.js han sido detenidos.