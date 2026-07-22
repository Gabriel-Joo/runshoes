#!/bin/bash
cd "$(dirname "$0")"
if [ -f server.pid ] && kill -0 "$(cat server.pid)" 2>/dev/null && [ -f server.port ]; then
  echo "이미 실행 중 (포트 $(cat server.port))"; exit 0
fi
rm -f server.pid
PORT=$(python3 -c "import socket,random
def free(p):
 s=socket.socket();r=s.connect_ex(('127.0.0.1',p));s.close();return r!=0
for p in random.sample(range(10000,20000),100):
 if free(p): print(p); break")
PORT=$PORT setsid node server.cjs > server.log 2>&1 &
echo $! > server.pid; echo "$PORT" > server.port; sleep 1
echo "서버 실행됨 (포트 $PORT)."