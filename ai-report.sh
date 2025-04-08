#!/bin/bash

# AI日报服务控制脚本

# 启动服务器
start() {
  if pgrep -f "node server.js" > /dev/null; then
    echo "AI日报服务器已在运行中"
  else
    echo "正在启动AI日报服务器..."
    node server.js > server.log 2>&1 &
    echo "服务器已在后台启动，访问: http://localhost:3000/redirect.html"
  fi
}

# 停止服务器
stop() {
  echo "正在停止AI日报服务器..."
  pkill -f "node server.js"
  echo "服务器已停止"
}

# 重启服务器
restart() {
  stop
  sleep 2
  start
}

# 查看状态
status() {
  if pgrep -f "node server.js" > /dev/null; then
    echo "AI日报服务器运行中"
    ps aux | grep "node server.js" | grep -v grep
  else
    echo "AI日报服务器未运行"
  fi
}

# 生成日报
generate() {
  echo "正在生成新的AI日报..."
  curl -s -X POST http://localhost:3000/api/generate-report > /dev/null
  echo "日报生成完成"
}

# 帮助信息
usage() {
  echo "用法: $0 {start|stop|restart|status|generate}"
  echo "  start     - 启动AI日报服务器"
  echo "  stop      - 停止AI日报服务器"
  echo "  restart   - 重启AI日报服务器"
  echo "  status    - 查看服务器状态"
  echo "  generate  - 手动生成新的AI日报"
}

# 主逻辑
case "$1" in
  start)
    start
    ;;
  stop)
    stop
    ;;
  restart)
    restart
    ;;
  status)
    status
    ;;
  generate)
    generate
    ;;
  *)
    usage
    exit 1
esac

exit 0 