const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "messages.db"));

const info = db.prepare(`PRAGMA table_info(messages)`).all();
console.log(
  "[db] columns=",
  info.map((c) => c.name),
);

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

const deleteStmt = db.prepare(`
  DELETE FROM messages
  WHERE (id = ? OR rowid = ?)
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
};
