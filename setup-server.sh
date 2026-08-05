#!/usr/bin/env bash
# ============================================================
# AI 珠宝设计生成器 - 服务器一键初始化（Ubuntu / Debian）
# 自动完成：Node.js 20 + Git + PM2 + Nginx + 拉取代码 + 部署启动
# 用法（root）： bash setup-server.sh
# 用法（非 root）： sudo bash setup-server.sh
# ============================================================
set -euo pipefail

REPO_URL="https://github.com/caokelong8888-eng/12.git"
APP_DIR="/opt/ai-jewelry-design"

if [ "$(id -u)" -ne 0 ]; then
  echo "请使用 root 运行：sudo bash setup-server.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "==> [1/7] 安装系统依赖（git / curl / nginx）"
apt-get update -y
apt-get install -y git curl ca-certificates nginx

echo "==> [2/7] 安装 Node.js 20"
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q "^v20"; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "Node: $(node -v)  npm: $(npm -v)"

echo "==> [3/7] 安装 PM2"
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi
echo "PM2: $(pm2 -v)"

echo "==> [4/7] 拉取代码到 $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  echo "检测到已有代码，执行 git pull 更新"
  git -C "$APP_DIR" pull
else
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

echo "==> [5/7] 部署启动（deploy.sh：装依赖 / 生成 .env / PM2 启动）"
bash deploy.sh

echo "==> [6/7] 配置 Nginx 反向代理（http://IP 直接访问）"
cat > /etc/nginx/sites-available/ai-jewelry <<'EOF'
server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 30m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
ln -sf /etc/nginx/sites-available/ai-jewelry /etc/nginx/sites-enabled/ai-jewelry
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> [7/7] 配置开机自启"
pm2 save >/dev/null 2>&1 || true
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo ""
echo "=============================================="
echo " 部署完成！"
echo " 网站地址: http://${IP:-服务器IP}"
echo " 直连端口: http://${IP:-服务器IP}:3000"
echo ""
echo " 下一步："
echo "  1) 编辑配置:  vi $APP_DIR/.env"
echo "     填入 GEMINI_API_KEY=你的中转站Key"
echo "  2) 重启生效:  pm2 restart ai-jewelry-design"
echo "  3) 查看日志:  pm2 logs ai-jewelry-design"
echo "  4) 更新代码:  cd $APP_DIR && git pull && pm2 restart ai-jewelry-design"
echo ""
echo " 提示：请确认云控制台安全组已放行 22 / 80 / 443 端口"
echo "=============================================="
