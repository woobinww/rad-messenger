const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

// Use a persistent, system-wide path by default on Windows to avoid
// accidental resets when the app folder is updated/replaced.
function resolveDbPath() {
  // 1) Explicit env override (useful for testing)
  const envPath = process.env.RAD_DB_PATH;
  if (envPath && envPath.trim()) return envPath.trim();

  // 2) Windows ProgramData location
  if (process.platform === "win32") {
    const base = process.env.PROGRAMDATA || "C:\\ProgramData";
    const dir = path.join(base, "RadMessenger", "server");
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (_) {
      // Fallback to local dir if creation fails
      return path.join(__dirname, "messages.db");
    }
    return path.join(dir, "messages.db");
  }

  // 3) Fallback to local server folder
  return path.join(__dirname, "messages.db");
}

const db = new Database(resolveDbPath());
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  sender text NOT NULL,
  text TEXT NOT NULL,
  room TEXT,
  status TEXT
);
`);

// 이모지 반응 테이블 (메시지별/이모지별/사용자별 유니크)
db.exec(`
CREATE TABLE IF NOT EXISTS reactions (
  msg_id INTEGER NOT NULL,
  emoji  TEXT    NOT NULL,
  user   TEXT    NOT NULL,
  PRIMARY KEY (msg_id, emoji, user)
);
`);

const insertStmt = db.prepare(`
  INSERT INTO messages (ts, sender, text, room, status)
  VALUES (@ts, @sender, @text, @room, @status)
`);

const listStmt = db.prepare(`
  SELECT
    COALESCE(id, rowid) AS id,
    ts, sender, text, room, status
  FROM messages
  ORDER BY COALESCE(id, rowid) ASC
  LIMIT ? OFFSET ?
`);

const updateStmt = db.prepare(`
  UPDATE messages
  SET room = @room,
      status = @status
  WHERE (id = @id OR rowid = @id)
`);

// 예약 관련 스테이트는 제거

const deleteStmt = db.prepare(`
  DELETE FROM messages
  WHERE (id = ? OR rowid = ?)
`);

// === reactions ===
const reactExistsStmt = db.prepare(`
  SELECT 1 FROM reactions WHERE msg_id = ? AND emoji = ? AND user = ?
`);
const reactInsertStmt = db.prepare(`
  INSERT INTO reactions (msg_id, emoji, user) VALUES (?, ?, ?)
`);
const reactDeleteStmt = db.prepare(`
  DELETE FROM reactions WHERE msg_id = ? AND emoji = ? AND user = ?
`);
const reactListByMsgStmt = db.prepare(`
  SELECT emoji, user FROM reactions WHERE msg_id = ?
`);

module.exports = {
  add(msg) {
    return insertStmt.run(msg);
  },
  list(limit = 100, offset = 0) {
    return listStmt.all(limit, offset);
  },
  update(partial) {
    return updateStmt.run(partial);
  },
  delete(id) {
    return deleteStmt.run(id, id);
  },
  // reactions API
  toggleReaction(msgId, emoji, user) {
    const has = reactExistsStmt.get(msgId, emoji, user);
    if (has) {
      reactDeleteStmt.run(msgId, emoji, user);
      return { action: "removed" };
    } else {
      reactInsertStmt.run(msgId, emoji, user);
      return { action: "added" };
    }
  },
  listReactions(msgId) {
    // 반환 형태: { emoji1: [user,...], emoji2: [user,...] }
    const rows = reactListByMsgStmt.all(msgId);
    const map = {};
    for (const r of rows) {
      if (!map[r.emoji]) map[r.emoji] = [];
      map[r.emoji].push(r.user);
    }
    return map;
  },
};
