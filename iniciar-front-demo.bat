@echo off
chcp 65001 >nul
title SOEA - frontend em http://localhost:3000
cd /d "%~dp0frontend"
where node >nul 2>nul || (echo Node.js nao encontrado. Instale em https://nodejs.org e rode de novo. & pause & exit /b 1)
echo Conferindo dependencias (na primeira vez pode levar alguns minutos)...
call npm install --no-audit --no-fund || (pause & exit /b 1)
rem Modo demonstracao: dados ficticios, nao precisa do backend. Para usar a API real, rode "npm run dev".
set NEXT_PUBLIC_DEMO=1
echo.
echo  SOEA rodando em http://localhost:3000  (modo demonstracao)
echo  Para parar: feche esta janela.
echo.
call npx next dev -p 3000
pause
