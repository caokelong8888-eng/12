/**
 * JWT 认证：签发与校验
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function signToken(user) {
  return jwt.sign({ id: user.id, phone: user.phone }, JWT_SECRET, { expiresIn: '7d' });
}

/** Express 中间件：校验 Authorization: Bearer <token>，成功后挂载 req.userId */
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: '未登录', code: 'NOT_AUTHENTICATED' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: '登录状态已失效，请重新登录', code: 'TOKEN_INVALID' });
  }
}

module.exports = { signToken, authRequired };
