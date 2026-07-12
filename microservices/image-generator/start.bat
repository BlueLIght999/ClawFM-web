@echo off
REM ============================================================
REM  Qclaudio Image Generator - Windows startup script
REM  Starts the FastAPI microservice on port 8288.
REM  Requires ComfyUI running on http://127.0.0.1:8188
REM ============================================================
setlocal

cd /d "%~dp0"

REM Create venv if it doesn't exist
if not exist ".venv" (
    echo [setup] Creating virtual environment...
    python -m venv .venv
)

REM Activate venv
call .venv\Scripts\activate.bat

REM Install dependencies if needed
pip show fastapi >nul 2>&1
if errorlevel 1 (
    echo [setup] Installing dependencies...
    pip install -r requirements.txt
)

echo.
echo ========================================
echo  Image Generator Microservice
echo  Port: 8288
echo  ComfyUI: %COMFYUI_URL%
echo  Docs: http://localhost:8288/docs
echo ========================================
echo.

python main.py

endlocal
