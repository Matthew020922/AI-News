#!/bin/bash

# 设置工作目录
cd "$(dirname "$0")"

# 关闭旧服务器进程（如果有）
pkill -f "node server.js" || true

# 等待片刻确保端口释放
sleep 2

# 启动服务器，将日志输出到server.log
echo "正在启动AI日报服务器..."
nohup node server.js > server.log 2>&1 &

# 获取PID并显示状态
PID=$!
echo "服务器已启动，PID: $PID"
echo "服务器日志保存在: $(pwd)/server.log"
echo "服务器地址：http://localhost:3000"
