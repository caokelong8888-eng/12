#!/usr/bin/env bash
# ============================================================
# AI 珠宝设计生成器 - 服务器一键部署脚本（Ubuntu / Debian）
# 用法：git clone 后执行  bash deploy.sh
# 已装 Node.js 20 为前提；未安装请先执行：
#   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
#   sudo apt-get install -y nodejs
# ============================================================
set -euo pipefail

echo "==> [1/5] 安装依赖（跳过开发依赖）"
npm install --omit=dev

echo "==> [2/5] 准备 .env"
if [ ! -f .env ]; then
  cp .env.example .env
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$SECRET/" .env
  echo "已生成 .env，JWT_SECRET 已随机化。"
  echo "注意：请编辑 .env 填入 GEMINI_API_KEY（中转站 Key），然后执行 pm2 restart ai-jewelry-design 切换真实模式。"
fi

if grep -q "please-change-me" .env; then
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$SECRET/" .env
  echo "已自动更新 JWT_SECRET。"
fi

echo "==> [3/5] 检查 PM2"
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

echo "==> [4/5] 启动服务"
pm2 start ecosystem.config.js
pm2 save

echo "==> [5/5] 完成"
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo "服务地址: http://${IP:-服务器IP}:3000"
echo "查看日志: pm2 logs ai-jewelry-design"
echo "开机自启: 执行 pm2 startup 并按提示运行输出的命令"
