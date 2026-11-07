@echo off
chcp 65001 >nul
cd /d "%~dp0game"
echo מרוץ החבילות: מפעיל את המשחק במחשב שלך...
echo (אל תסגור את החלון הזה כל עוד אתה משחק)
echo.
where py >nul 2>nul && (start "" http://localhost:8080/ & py -m http.server 8080 & goto :eof)
where python >nul 2>nul && (start "" http://localhost:8080/ & python -m http.server 8080 & goto :eof)
where npx >nul 2>nul && (start "" http://localhost:8080/ & npx --yes http-server -p 8080 -c-1 . & goto :eof)
echo לא נמצא Python או Node במחשב.
echo אפשר לשחק ישירות באתר: https://tikshuvccna.github.io/packet-run/
pause
