@echo off
REM ============================================================
REM  Atualiza os dados do Painel de Transparencia.
REM  Como usar: substitua os arquivos .xls originais do S2iD em
REM    dados\brutos\s2id\acoes_de_resposta\2026\
REM  (mantendo os MESMOS nomes) e de duplo-clique aqui.
REM  O script reprocessa tudo e regenera dados\dados.json.
REM  Depois, publique no GitHub Pages (ou use abrir_painel.bat).
REM ============================================================
cd /d "%~dp0"
set "PYEXE=C:\Program Files\QGIS 3.44.12\apps\Python312\python.exe"
set "PYTHONHOME=C:\Program Files\QGIS 3.44.12\apps\Python312"
set "ETL=..\..\..\scripts\etl\etl_transparencia.py"
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
if not exist "%PYEXE%" (
  echo Nao encontrei o Python do QGIS. Ajuste o caminho no topo deste .bat.
  pause & exit /b 1
)
echo Reprocessando tabelas do S2iD...
"%PYEXE%" "%ETL%"
if errorlevel 1 ( echo. & echo FALHA no processamento. & pause & exit /b 1 )
echo.
echo Concluido. dados\dados.json atualizado.
echo Para visualizar localmente, use abrir_painel.bat.
echo Para publicar, faca commit/push da pasta no GitHub Pages.
pause
