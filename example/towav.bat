@echo off
setlocal

cd /d "%~dp0"

REM ————————————————————————————————
REM If no arguments: scan current folder & subfolders
REM ————————————————————————————————
if "%~1"=="" (
    for /R %%f in (*.mp3 *.ogg) do (
        if not exist "%%~dpf%%~nf.wav" (
            echo Converting "%%~f" → "%%~dpf%%~nf.wav"
            ffmpeg -i "%%~f" "%%~dpf%%~nf.wav"
        ) else (
            echo Skipping   "%%~dpf%%~nf.wav"  (already exists)
        )
    )
) else (
    REM ————————————————————————————————
    REM If you passed files (drag & drop)
    REM ————————————————————————————————
    for %%f in (%*) do (
        if /I "%%~xf"==".mp3" (
            if not exist "%%~dpf%%~nf.wav" (
                echo Converting "%%~f" → "%%~dpf%%~nf.wav"
                ffmpeg -i "%%~f" "%%~dpf%%~nf.wav"
            ) else (
                echo Skipping   "%%~dpf%%~nf.wav"  (already exists)
            )
        ) else if /I "%%~xf"==".ogg" (
            if not exist "%%~dpf%%~nf.wav" (
                echo Converting "%%~f" → "%%~dpf%%~nf.wav"
                ffmpeg -i "%%~f" "%%~dpf%%~nf.wav"
            ) else (
                echo Skipping   "%%~dpf%%~nf.wav"  (already exists)
            )
        ) else (
            echo Ignoring   "%%~f"  (not .mp3 or .ogg)
        )
    )
)

echo.
echo Done.
pause