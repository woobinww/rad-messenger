const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "messages.db"));

function ensureMigrations() {
  const info = db.prepare(`PRAGMA table_info(messages)`).all();
  const cols = new Set(info.map((c) => c.name));
  console.log("[db] columns=", Array.from(cols));

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

  if (!cols.has("reserve_room")) {
    db.exec(`ALTER TABLE messages ADD COLUMN reserve_room TEXT`);
    console.log("[db] migrated: add reserve_room column");
  }
}

ensureMigrations();

const insertStmt = db.prepare(`
  INSERT INTO messages (ts, sender, text, room, status)
  VALUES (@ts, @sender, @text, @room, @status)
`);

const listStmt = db.prepare(`
  SELECT
    COALESCE(id, rowid) AS id,
    ts, sender, text, room, status, reserve_room
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

const updateReserveStmt = db.prepare(`
  UPDATE messages
  SET reserve_room = @reserve_room
  WHERE (id = @id OR rowid = @id)
`);

const clearReserveIfMatchesStmt = db.prepare(`
  UPDATE messages
  SET reserve_room = NULL
  WHERE (id = @id OR rowid = @id)
    AND reserve_room = @room
`);

const getByIdStmt = db.prepare(`
  SELECT COALESCE(id, rowid) AS id, ts, sender, text, room, status, reserve_room
  FROM messages
  WHERE (id = ? OR rowid = ?)
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
  updateReserve(id, reserveRoom) {
    return updateReserveStmt.run({ id, reserve_room: reserveRoom });
  },
  clearReserveIfMatches(id, room) {
    return clearReserveIfMatchesStmt.run({ id, room });
  },
  getById(id) {
    return getByIdStmt.get(id, id);
  },
  delete(id) {
    return deleteStmt.run(id, id);
  },
};
