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
  const offset = parseInt(req.query.offset || "0", 10);
  const rows = db.list(limit, offset).map((r) => ({
    ...r,
    reserveRoom: r.reserve_room ?? null,
  }));
  res.json(rows);
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
    io.emit("chat:new", { id, ...msg, reserveRoom: null, by: socket.id }); // 예약 없음으로 초기화
  });

  // 상태/촬영실 변경 (상호 배타 규칙 유지)
  socket.on("chat:update", ({ id, room, status, reserveRoom }) => {
    if (!id) return;

    // 예약만 갱신하는 경우
    if (typeof reserveRoom !== "undefined") {
      db.updateReserve(id, reserveRoom || null);
      io.emit("chat:update", { id, reserveRoom: reserveRoom || null, by: socket.id });
      return;
    }

    // 상태/룸 갱신
    const normalized = {
      id,
      room: status ? null : (room ?? null), // 상태 있으면 room 해제
      status: status ?? null,
    };
    db.update(normalized);
    // 룸으로 전환될 때, 동일 룸 예약이 있었다면 해제
    if (normalized.room) {
      db.clearReserveIfMatches(id, normalized.room);
    }
    // 현재 값 조회하여 클라이언트에 일관 반영
    const after = db.getById(id) || {};
    io.emit("chat:update", {
      id,
      room: after.room ?? normalized.room ?? null,
      status: after.status ?? normalized.status ?? null,
      reserveRoom: after.reserve_room ?? null,
      by: socket.id,
    });
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
