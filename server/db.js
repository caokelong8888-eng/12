/**
 * 数据持久化层
 * 基于 sql.js（SQLite 的 WebAssembly 版本），无需原生编译，
 * 数据库文件持久化到 server/data/app.db。
 */
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'app.db');

let db = null;
let saveTimer = null;

function now() {
  return new Date().toISOString();
}

function persist() {
  if (!db) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const data = db.export();
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmpFile = DB_FILE + '.tmp';
      fs.writeFileSync(tmpFile, Buffer.from(data));
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('[db] 持久化失败:', err.message);
    }
  }, 50);
}

function run(sql, params = []) {
  db.run(sql, params);
  persist();
}

/** 执行 INSERT 并返回自增主键 */
function insert(sql, params = []) {
  db.run(sql, params);
  const row = queryOne('SELECT last_insert_rowid() AS id');
  persist();
  return row ? Number(row.id) : NaN;
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

function queryOne(sql, params = []) {
  return query(sql, params)[0] || null;
}

async function init() {
  const SQL = await initSqlJs();
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (fs.existsSync(DB_FILE)) {
    db = new SQL.Database(fs.readFileSync(DB_FILE));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nickname TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      credits INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generation_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      prompt TEXT NOT NULL,
      negative_prompt TEXT DEFAULT '',
      tags_json TEXT DEFAULT '[]',
      denoising_strength REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tx_user ON credit_transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_gen_user ON generation_records(user_id);
  `);

  // 迁移：为 generation_records 补充 model 列（多模型支持）
  const hasModel = db.exec(
    "SELECT name FROM pragma_table_info('generation_records') WHERE name = 'model'"
  );
  if (hasModel.length === 0) {
    db.run("ALTER TABLE generation_records ADD COLUMN model TEXT DEFAULT ''");
  }

  persist();
  console.log('[db] SQLite 已就绪:', DB_FILE);
}

/* ============ 用户 ============ */

function registerUser({ phone, passwordHash, nickname }) {
  const exists = queryOne('SELECT id FROM users WHERE phone = ?', [phone]);
  if (exists) throw new Error('该手机号已注册');
  const id = insert(
    'INSERT INTO users (phone, password_hash, nickname, avatar, credits, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [phone, passwordHash, nickname || '', '', 0, now()]
  );
  return getUserById(Number(id));
}

function getUserByPhone(phone) {
  return queryOne('SELECT * FROM users WHERE phone = ?', [phone]);
}

function getUserById(id) {
  return queryOne('SELECT * FROM users WHERE id = ?', [id]);
}

/* ============ 积分 ============ */

function addCredits(userId, amount, type, note = '') {
  db.run('BEGIN');
  try {
    db.run('UPDATE users SET credits = credits + ? WHERE id = ?', [amount, userId]);
    db.run(
      'INSERT INTO credit_transactions (user_id, amount, type, note, created_at) VALUES (?, ?, ?, ?, ?)',
      [userId, amount, type, note, now()]
    );
    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
  persist();
  return getUserById(userId);
}

function deductCredits(userId, amount) {
  const user = getUserById(userId);
  if (!user) throw new Error('用户不存在');
  if (user.credits < amount) {
    const err = new Error('积分不足');
    err.code = 'INSUFFICIENT_CREDITS';
    throw err;
  }
  db.run('BEGIN');
  try {
    db.run('UPDATE users SET credits = credits - ? WHERE id = ?', [amount, userId]);
    db.run(
      'INSERT INTO credit_transactions (user_id, amount, type, note, created_at) VALUES (?, ?, ?, ?, ?)',
      [userId, -amount, 'generate', 'AI 生成消耗', now()]
    );
    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
  persist();
  return getUserById(userId);
}

function getCreditTransactions(userId, limit = 50) {
  return query(
    'SELECT * FROM credit_transactions WHERE user_id = ? ORDER BY id DESC LIMIT ?',
    [userId, limit]
  );
}

/* ============ 生成记录 ============ */

function addGenerationRecord({ userId, type, prompt, negativePrompt, tags, denoisingStrength, model }) {
  const id = insert(
    `INSERT INTO generation_records
      (user_id, type, prompt, negative_prompt, tags_json, denoising_strength, model, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, type, prompt, negativePrompt || '', JSON.stringify(tags || []), denoisingStrength, model || '', now()]
  );
  persist();
  return Number(id);
}

function getGenerationRecords(userId, limit = 50) {
  return query(
    'SELECT * FROM generation_records WHERE user_id = ? ORDER BY id DESC LIMIT ?',
    [userId, limit]
  );
}

module.exports = {
  init,
  insert,
  registerUser,
  getUserByPhone,
  getUserById,
  addCredits,
  deductCredits,
  getCreditTransactions,
  addGenerationRecord,
  getGenerationRecords,
};
