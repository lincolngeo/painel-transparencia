@echo off
REM Abre o Painel de Transparencia num servidor local e no navegador.
REM Duplo-clique. Feche a janela "Servidor Painel Transparencia" para parar.
cd /d "%~dp0"
set "PYEXE=C:\Program Files\QGIS 3.44.12\apps\Python312\python.exe"
set "PYTHONHOME=C:\Program Files\QGIS 3.44.12\apps\Python312"
if not exist "%PYEXE%" (
  echo Nao encontrei o Python do QGIS em:
  echo   %PYEXE%
  echo Ajuste o caminho no topo deste .bat se o QGIS estiver em outra versao/pasta.
  pause
  exit /b 1
)
start "Servidor Painel Transparencia" "%PYEXE%" -m http.server 8767 --bind 127.0.0.1
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8767/index.html?nc=%RANDOM%%RANDOM%"
echo.
echo Painel aberto em http://127.0.0.1:8767/
echo Para parar, feche a janela "Servidor Painel Transparencia".
timeout /t 4 /nobreak >nul
