#!/bin/bash
set -e
cd /home/ubuntu/myapp/platform-solo
exec >> /var/log/platform-solo-deploy.log 2>&1
echo "=== $(date +%F_%T) start ==="

BEFORE=$(git rev-parse HEAD)
git pull origin main
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
    echo "no update"
    exit 0
fi

echo "deploying: $(echo $BEFORE | cut -c1-7) -> $(echo $AFTER | cut -c1-7)"

# 重新构建前端
npm install
npm run build

# 重建 Docker 容器
sudo docker compose up -d --build

# 健康检查
health_ok() {
    curl -sf --max-time 10 http://localhost:57282/ > /dev/null
}

sleep 3

if health_ok; then
    echo "health check passed"
    echo "=== done ==="
    exit 0
fi

# 回滚
echo "health check failed, rolling back to $(echo $BEFORE | cut -c1-7)"
git checkout "$BEFORE"
npm run build
sudo docker compose up -d --build
sleep 3

if health_ok; then
    echo "rollback success, service restored"
    echo "=== done (rolled back) ==="
    exit 0
fi

echo "FATAL: all attempts failed, manual intervention required"
exit 1
