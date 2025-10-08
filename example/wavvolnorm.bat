@echo off
cd /d "%~dp0"

REM Set backup root folder name
set "backupRoot=normbackup"

REM Normalize all WAV files recursively
for /R %%f in (*.wav) do (
    echo Processing "%%~f"

    REM Build backup path based on original location
    set "relPath=%%~dpf"
    setlocal enabledelayedexpansion
    set "relPath=!relPath:%~dp0=!"
    endlocal

    REM Create matching folder inside backupRoot
    set "backupPath=%backupRoot%\!relPath!"
    if not exist "!backupPath!" mkdir "!backupPath!"

    REM Move original to backup
    move "%%~f" "!backupPath!\%%~nxf"

    REM Normalize from backup back into original location
    ffmpeg -i "!backupPath!\%%~nxf" -af loudnorm=I=-16:TP=-1.5:LRA=11 "%%~f"
)

pause