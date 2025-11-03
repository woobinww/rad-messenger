// Socket.IO 서버

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const db = require("./db");

const PORT = process.env.PORT || 3030; // LAN 내 고정 포트 사용 권장

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (_, res) => res.send("rad-messenger server ok"));

// 과거 메세지 페이징 조회 (선택)
app.get("/history", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "100", 10), 500);
  // 최신 N개를 가져온 다음 시간/ID 오름차순으로 되돌려서 전달
  const latest = db.listLatest(limit);
  latest.reverse();
  const withReacts = latest.map((m) => ({ ...m, reactions: db.listReactions(m.id) }));
  res.json(withReacts);
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  // 신규 접속 알림(옵션)
  io.emit("system", { ts: Date.now(), text: "사용자 접속" });

  socket.on("chat:send", (payload) => {
    //payload: { sender, text, room, status, ts? }
    const { sender, text } = payload || {};
    if (!sender || !text) return; // 필수 보호

    const msg = {
      ts: payload.ts || Date.now(),
      sender,
      text: String(text).trim(),
      room: payload.status ? null : payload.room || null, // 상태가 있으면 룸 해제
      status: payload.status || null,
    };

    const res = db.add(msg);
    const id = res.lastInsertRowid;
    io.emit("chat:new", { id, ...msg, reactions: {}, by: socket.id });
  });

  // 상태/촬영실 변경 (상호 배타 규칙 유지)
  socket.on("chat:update", ({ id, room, status }) => {
    if (!id) return;
    // 상태/룸 갱신
    const normalized = {
      id,
      room: status ? null : (room ?? null), // 상태 있으면 room 해제
      status: status ?? null,
    };
    db.update(normalized);
    io.emit("chat:update", { ...normalized, by: socket.id });
  });

  // 이모지 반응 토글
  socket.on("reaction:toggle", ({ id, emoji, user }) => {
    if (!id || !emoji || !user) return;
    // 간단한 이모지 길이 제한 (보안/성능): 최대 8자
    const e = String(emoji).slice(0, 8);
    const u = String(user).slice(0, 64);
    db.toggleReaction(id, e, u);
    const reactions = db.listReactions(id);
    io.emit("reaction:update", { id, reactions, by: socket.id });
  });

  // 메시지 삭제
  socket.on("chat:delete", ({ id }) => {
    if (!id) return;
    db.delete(id);
    io.emit("chat:delete", { id, by: socket.id });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] listening on ${PORT}`);
});
