@echo off
chcp 65001 >nul
cd /d D:\AAAcjr\Projects\oracle-council-test
echo.
echo  ==========================================
echo   🔮 预言者议会 - 启动中...
echo  ==========================================
echo.
echo  访问地址: http://localhost:3000
echo  监控面板: http://localhost:3000/monitor.html
echo  关闭窗口即可停止服务
echo.

:: 先结束占用 3000 端口的进程
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000 "') do (
  taskkill /f /pid %%a >nul 2>&1
)

:: 用 --env-file 在模块导入前加载环境变量（Node.js 20.6+ 支持）
"C:\Program Files\nodejs\node.exe" --env-file=.env server.mjs

pause
