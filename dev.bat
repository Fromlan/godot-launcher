@echo off
REM ============================================================
REM  Godot Launcher - one-click dev script (Windows)
REM  Usage:
REM    dev.bat                    show interactive menu
REM    dev.bat dev                default dev
REM    dev.bat clean              clean dist before launch
REM    dev.bat reset              reset userData before launch
REM    dev.bat debug              debug mode (verbose logging)
REM    dev.bat inspect            enable Node inspector on 9229
REM    dev.bat reset-debug        reset + debug
REM    dev.bat port 5174          custom vite port
REM    dev.bat -h / --help / /?   show this help
REM ============================================================

setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

set "TASK="
set "EXTRA="
set "PORT="

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="dev"          set "TASK=dev"              && goto :shift_args
if /i "%~1"=="clean"        set "TASK=dev:clean"        && goto :shift_args
if /i "%~1"=="reset"        set "TASK=dev:reset"        && goto :shift_args
if /i "%~1"=="debug"        set "TASK=dev:debug"        && goto :shift_args
if /i "%~1"=="inspect"      set "TASK=dev:inspect"      && goto :shift_args
if /i "%~1"=="reset-debug"  set "TASK=dev:reset-debug"  && goto :shift_args
if /i "%~1"=="port"         set "TASK=dev:port" && set "PORT=%~2" && shift && goto :shift_args
if /i "%~1"=="-h"           goto :show_help
if /i "%~1"=="--help"       goto :show_help
if /i "%~1"=="/?"           goto :show_help
set "EXTRA=%EXTRA% %~1"
:shift_args
shift
goto :parse_args

:args_done
if not "%TASK%"=="" goto :run_task
goto :show_menu

:run_task
if /i "%TASK%"=="dev:port" goto :run_with_port
echo.
echo ============================================================
echo  Running task: %TASK%
echo ============================================================
echo.
call npm run %TASK% --silent
set "RC=%ERRORLEVEL%"
echo.
echo ============================================================
echo  Task exited with code %RC%
echo ============================================================
pause
exit /b %RC%

:run_with_port
if "%PORT%"=="" set "PORT=5174"
echo.
echo ============================================================
echo  Running dev with custom port: %PORT%
echo ============================================================
echo.
call npm run dev -- --port %PORT% --silent
set "RC=%ERRORLEVEL%"
echo.
echo ============================================================
echo  Task exited with code %RC%
echo ============================================================
pause
exit /b %RC%

REM ============================================================
REM  Interactive menu
REM ============================================================

:show_menu
cls
echo.
echo   ================================================================
echo     Godot Launcher  --  Dev Console
echo   ================================================================
echo.
echo     [1]  dev                default dev
echo     [2]  clean              clean dist before launch
echo     [3]  reset              reset userData before launch
echo     [4]  debug              debug mode (verbose logs)
echo     [5]  inspect            enable Node inspector on 9229
echo     [6]  reset-debug        reset + debug
echo     [7]  port               custom vite port
echo     [0]  exit
echo.
echo   ================================================================
echo.

:menu_ask
set "CHOICE="
set /p CHOICE="  Select [0-7]: "
if "%CHOICE%"=="0" exit /b
if "%CHOICE%"=="1" call :do_task dev               && goto :menu_end
if "%CHOICE%"=="2" call :do_task dev:clean        && goto :menu_end
if "%CHOICE%"=="3" call :do_task dev:reset        && goto :menu_end
if "%CHOICE%"=="4" call :do_task dev:debug        && goto :menu_end
if "%CHOICE%"=="5" call :do_task dev:inspect      && goto :menu_end
if "%CHOICE%"=="6" call :do_task dev:reset-debug  && goto :menu_end
if "%CHOICE%"=="7" goto :menu_port
echo   Invalid choice, try again.
goto :menu_ask

:menu_port
set "PORT="
set /p PORT="  Enter port (default 5174): "
if "%PORT%"=="" set "PORT=5174"
call :do_task_port %PORT%
goto :menu_end

:menu_end
echo.
pause
goto :show_menu

REM ============================================================
REM  Task runners (used by menu)
REM ============================================================

:do_task
call npm run %~1 --silent
exit /b %ERRORLEVEL%

:do_task_port
call npm run dev -- --port %~1 --silent
exit /b %ERRORLEVEL%

REM ============================================================
REM  Help
REM ============================================================

:show_help
echo.
echo   Godot Launcher Dev Script
echo.
echo   Usage:
echo     dev.bat              open interactive menu
echo     dev.bat TASK         run a specific task
echo.
echo   Available TASK:
echo     dev           default dev
echo     clean         clean dist before launch
echo     reset         reset userData before launch
echo     debug         debug mode
echo     inspect       remote debug on 9229
echo     reset-debug   reset + debug
echo     port PORT     custom vite port (default 5174)
echo.
echo   Examples:
echo     dev.bat            open menu
echo     dev.bat reset      directly reset and dev
echo     dev.bat port 3000  start vite on port 3000
echo.
pause
exit /b
