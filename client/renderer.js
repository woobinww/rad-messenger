// 상호배타 로직 + 전송
window.addEventListener("DOMContentLoaded", async () => {
  // 디버그: 현재 파일이 맞는지, 어떤 HTML이 로딩됐는지 확인
  console.log("[init] href=", document.location.href);
  console.log("[init] has chatForm? ", !!document.getElementById("chatForm"));

  const cfg = await window.api.loadConfig().catch((e) => {
    console.error("[init] loadConfig failed:", e);
    return {
      serverUrl: "http://192.168.10.70:3030",
      displayName: "Unknown",
      defaultRoom: "1",
    };
  });

  // const socket = io(cfg.serverUrl); // 자동 협상(웹소켓/롱폴링)
  const ioObj = window.io;
  if (!ioObj) {
    console.error("[init] socket.io not loaded");
    return;
  }
  const socket = ioObj(cfg.serverUrl); // 자동 협상(웹소켓/롱폴링)

  const meEl = document.getElementById("me");
  const form = document.getElementById("chatForm");
  const input = document.getElementById("patient");
  const msgs = document.getElementById("messages");

  const roomRadios = Array.from(
    document.querySelectorAll('input[name="room"]'),
  );
  const r1 = roomRadios.find((r) => r.value === "1");
  const r2 = roomRadios.find((r) => r.value === "2");
  const stChanging = document.getElementById("statusChanging");
  const stAway = document.getElementById("statusAway");

  const pinBtn = document.getElementById("pinBtn");
  const soundBtn = document.getElementById("soundBtn");
  const soundVol = document.getElementById("soundVol");
  const testDingBtn = document.getElementById("testDing");

  // 내 소켓 id 추적 (내가 보낸 이벤트는 소리/반짝 생략하기 위함)
  let mySocketId = null;
  socket.on("connect", () => {
    mySocketId = socket.id;
  });

  // Lucide 아이콘 활성화
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons(); // <i data-lucide="pin"></i> 등을 SVG로 교체
  } else {
    console.warn("[lucide] not loaded");
  }

  // 항상위 토글
  pinBtn.addEventListener("click", async () => {
    const active = !pinBtn.classList.contains("active");
    pinBtn.classList.toggle("active", active);
    try {
      await window.api.setAlwaysOnTop(active);
    } catch (err) {
      console.error("[win] setAlwaysOnTop failed:", err);
    }
  });

  // ===== 사운드 준비 =====
  const audioCache = {
    new: new Audio("sounds/alert0.mp3"),
    update: new Audio("sounds/alert1.mp3"),
  };
  Object.values(audioCache).forEach((a) => {
    a.preload = "auto";
    a.volume = Number(soundVol?.value ?? 0.6);
  });

  function playSound(kind = "new") {
    if (!soundBtn.classList.contains("active")) return;
    const a = audioCache[kind] || audioCache.new;
    a.currentTime = 0;
    a.volume = Number(soundVol?.value ?? 0.6);
    a.play().catch(() => {
      /* Electron에선 보통 허용됨. 실패 시 무시 */
    });
  }
  // 미리듣기
  testDingBtn?.addEventListener("click", () => playSound("new"));
  soundVol?.addEventListener("change", () => {
    Object.values(audioCache).forEach(
      (a) => (a.volume = Number(soundVol.value)),
    );
  });

  // 알림음 토글
  soundBtn.addEventListener("click", () => {
    const active = !soundBtn.classList.contains("active");
    soundBtn.classList.toggle("active", active);
    if (active) console.log("[sound] enabled");
    else console.log("[sound] disabled");
  });

  // element 에러 처리
  if (!form || !input || !msgs || !r1 || !r2 || !stChanging || !stAway) {
    console.error("[init] Required elements not found:", {
      form,
      input,
      msgs,
      r1,
      r2,
      stAway,
      stChanging,
    });
    console.log(
      "[init] body html snapshot:",
      document.body.innerHTML.slice(0, 500),
    ); // 앞부분만 스냅샷
    return;
  }

  meEl.textContent = `${cfg.displayName} · 기본촬영실 ${cfg.defaultRoom}`;
  (cfg.defaultRoom === "2" ? r2 : r1).checked = true;

  // ==== 스크롤 보조 유틸 ====
  function scrollToBottom() {
    const el = msgs.parentElement; // main 요소
    el.scrollTop = el.scrollHeight;
  }
  function isNearBottom(th = 40) {
    const el = msgs.parentElement;
    return el.scrollHeight - el.scrollTop - el.clientHeight < th;
  }
  // 창 크기/레이아웃 변화 시 최근 메시지 보이도록 하단 정렬
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => scrollToBottom(), 50); // 살짝 디바운스
  });

  // 입력창 포커스 시 키보드/IME로 높이가 변하면 하단 유지
  document.getElementById("patient")?.addEventListener("focus", () => {
    setTimeout(scrollToBottom, 0);
  });

  function clearStatus() {
    stChanging.checked = false;
    stAway.checked = false;
  }
  function clearRooms() {
    roomRadios.forEach((r) => {
      r.checked = false;
    });
  }
  function setRoomsEnabled(enabled) {
    roomRadios.forEach((r) => (r.disabled = !enabled));
  }

  [stChanging, stAway].forEach((cb) => {
    cb.addEventListener("change", () => {
      const anyStatus = stChanging.checked || stAway.checked;
      if (anyStatus) {
        clearRooms();
        setRoomsEnabled(false);
      } else {
        setRoomsEnabled(true);
        (cfg.defaultRoom === "2" ? r2 : r1).checked = true;
      }
    });
  });

  roomRadios.forEach((r) =>
    r.addEventListener("change", () => {
      if (r.checked) {
        clearStatus();
        setRoomsEnabled(true);
      }
    }),
  );

  // ==== 상태에 따른 가로 배치 결정 ====
  function getPlacementByState({ room, status }) {
    if (status === "검사가능") return "pos-center";
    if (status === "환복중" || status === "부재중") return "pos-right";
    if (room === "1" || room === "2") return "pos-left";
    return "pos-center"; // 기본
  }
  function applyPlacementClass(li, state) {
    li.classList.remove("pos-left", "pos-center", "pos-right");
    li.classList.add(getPlacementByState(state));
    // 룸별 색상 구분을 위해 room-1/room-2 클래스도 관리
    li.classList.remove("room-1", "room-2");
    if (!state.status && (state.room === "1" || state.room === "2")) {
      li.classList.add(state.room === "2" ? "room-2" : "room-1");
    }
  }

  function renderMessage(m) {
    const li = document.createElement("li");
    li.className = "msg";
    li.dataset.id = String(m.id || ""); // DOM에 id 보관(업데이트 타겟팅). li에 data-id 저장

    const card = document.createElement("div");
    card.className = "bubble";

    const meta = document.createElement("div");
    meta.className = "meta";
    const ts = new Date(m.ts).toLocaleTimeString("ko-KR", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
    meta.textContent = `${m.sender} · ${ts}`;

    // ← 기존 배지 생성부를 "클릭 가능한 배지"로 변경
    const makeBadge = (text, cls) => {
      const b = document.createElement("span");
      b.className = `badge ${cls}`;
      b.textContent = text;
      b.dataset.action = "edit-status"; // ← 이벤트 위임 훅
      b.dataset.id = String(m.id || ""); // 배지에도 백업용으로 data-id 저장
      return b;
    };

    if (m.status) {
      const cls = m.status === "검사가능" ? "ready" : "status";
      meta.appendChild(makeBadge(m.status, cls));
    } else if (m.room) {
      const rcls = m.room === "2" ? "room room-2" : "room room-1";
      meta.appendChild(makeBadge(`${m.room}촬영실`, rcls));
    } else {
      // 아무 상태/룸도 없을 때도 누르면 메뉴 열리도록 placeholder 배지
      meta.appendChild(makeBadge("상태 설정", "room"));
    }
    // 삭제 버튼 (메타 우측)
    const del = document.createElement("span");
    del.className = "del-btn";
    del.dataset.action = "delete";
    del.dataset.id = String(m.id || "");
    del.title = "삭제";
    del.innerHTML = '<i data-lucide="trash-2"></i>';
    meta.appendChild(del);

    const body = document.createElement("div");
    body.className = "patient";
    body.textContent = m.text;

    card.appendChild(meta);
    card.appendChild(body);
    li.appendChild(card);

    // 정렬 클래스 적용
    applyPlacementClass(li, { room: m.room ?? null, status: m.status ?? null });
    return li;
  }

  // 2초 반짝 헬퍼
  function flashById(id) {
    const li = msgs.querySelector(`li[data-id="${id}"]`);
    if (!li) return;
    const card = li.querySelector(".bubble") || li;
    card.classList.remove("flash"); // 연속 트리거 대비 초기화
    // reflow 강제 후 다시 add (브라우저가 재인식하게)
    // eslint-disable-next-line no-unused-expressions
    card.offsetWidth;
    card.classList.add("flash");
    setTimeout(() => card.classList.remove("flash"), 2000);
  }

  // ==== 팝오버 메뉴 ====
  let popoverEl = null;
  function closePopover() {
    if (popoverEl && popoverEl.parentNode)
      popoverEl.parentNode.removeChild(popoverEl);
    popoverEl = null;
  }
  // 개선된 팝오버: 화면 밖 잘림 방지 (상단 플립 + 우측/좌측 클램프)
  function openPopover(anchorRect, onPick) {
    // 1) 팝오버 생성(먼저 body에 붙여 실제 크기 측정)
    closePopover();
    popoverEl = document.createElement("div");
    popoverEl.className = "popover";
    popoverEl.innerHTML = `
      <div class="item" data-room="1" data-status="">1촬영실</div>
      <div class="item" data-room="2" data-status="">2촬영실</div>
      <div class="sep"></div>
      <div class="item" data-room="" data-status="환복중">환복중</div>
      <div class="item" data-room="" data-status="부재중">부재중</div>
      <div class="sep"></div>
      <div class="item" data-room="" data-status="검사가능">검사가능</div>
    `;
    document.body.appendChild(popoverEl);

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const GAP = 8; // 앵커와의 간격

    // 2) 팝오버 자연 크기 측정
    // 처음엔 off-screen에 두고 사이즈 측정
    popoverEl.style.left = `-9999px`;
    popoverEl.style.top = `-9999px`;

    // 강제 reflow 후 실제 크기
    const ph = popoverEl.offsetHeight;
    const pw = popoverEl.offsetWidth;

    // 3) 기본 위치: 앵커 아래쪽-왼쪽 정렬
    let x = Math.round(anchorRect.left);
    let y = Math.round(anchorRect.bottom + GAP);
    let placement = "bottom";

    // 4) 하단이 가려지면 "위로 플립"
    if (y + ph > vh - GAP) {
      const tryY = Math.round(anchorRect.top - GAP - ph);
      if (tryY >= GAP) {
        y = tryY;
        placement = "top";
      } else {
        // 위/아래 모두 부족하면, 화면 안에 최대한 맞춤 (y 클램프)
        y = Math.max(GAP, Math.min(vh - ph - GAP, y));
      }
    }

    // 5) 오른쪽이 잘리면 왼쪽으로 당김, 왼쪽도 넘치면 좌우 중앙 기준으로 클램프
    if (x + pw > vw - GAP) x = vw - pw - GAP;
    if (x < GAP) x = GAP;

    // 6) 최종 위치/속성 반영
    popoverEl.style.left = `${x}px`;
    popoverEl.style.top = `${y}px`;
    popoverEl.setAttribute("data-placement", placement);

    // 7) 항목 선택 핸들러
    const onClick = (e) => {
      const it = e.target.closest(".item");
      if (!it) return;
      const room = it.dataset.room || null;
      const status = it.dataset.status || null;
      onPick({ room, status });
      closePopover();
      document.removeEventListener("click", onDocClick, true);
    };
    popoverEl.addEventListener("click", onClick, { once: true });

    // 8) 바깥 클릭 시 닫기
    const onDocClick = (e) => {
      if (!popoverEl || popoverEl.contains(e.target)) return;
      closePopover();
      document.removeEventListener("click", onDocClick, true);
    };
    setTimeout(() => document.addEventListener("click", onDocClick, true), 0);
  }

  // 메시지 삭제 처리 (이벤트 위임)
  msgs.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="delete"]');
    if (!btn) return;
    const li = btn.closest("li.msg");
    const idStr = li?.dataset?.id?.trim() || btn?.dataset?.id?.trim() || "";
    const id = Number(idStr);
    if (!id || Number.isNaN(id)) return;
    if (!window.confirm("이 메세지를 삭제할까요?")) return;
    socket.emit("chat:delete", { id });
    li?.remove();
  });

  // 메시지 리스트에서 "뱃지 클릭"을 이벤트 위임으로 처리
  msgs.addEventListener("click", (e) => {
    const badge = e.target.closest('.badge[data-action="edit-status"]');
    if (!badge) return;

    const li = badge.closest("li.msg");
    // ↓ li → badge 순으로 견고하게 추출
    const idStr = li?.dataset?.id?.trim() || badge?.dataset?.id?.trim() || "";
    const id = Number(idStr);
    if (!id || Number.isNaN(id)) {
      console.warn("[edit-status] missing id on element", {
        li,
        badge,
        idStr,
      });
      return; // id 없으면 서버에 업데이트 불가 → 팝오버 열지 않음
    }
    const rect = badge.getBoundingClientRect();

    openPopover(rect, ({ room, status }) => {
      // 서버에 업데이트 요청 (상호배타 규칙은 서버에서도 처리)
      socket.emit("chat:update", { id, room, status });

      // ⬇️ 옵티미스틱 업데이트: 브로드캐스트 오기 전 화면 반영(체감 즉시성↑)
      applyUpdateToDom({ id, room, status });
    });
  });

  // 실시간 수신
  // 최신 메시지는 아래쪽: appendChild
  socket.on("chat:new", (m) => {
    const stick = isNearBottom();
    msgs.appendChild(renderMessage(m));
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
    if (stick) scrollToBottom();
    // 소리/반짝 (내가 보낸 것이 아니면)
    if (!m.by || m.by !== mySocketId) {
      playSound("new");
      flashById(m.id);
    }
  });

  function applyUpdateToDom(u) {
    const li = msgs.querySelector(`li[data-id="${u.id}"]`);
    if (!li) return;
    const meta = li.querySelector(".meta");
    // 기존 배지 제거
    Array.from(meta.querySelectorAll(".badge")).forEach((n) => n.remove());
    // 새 배지 삽입
    const delBtn = meta.querySelector('.del-btn');
    if (u.status) {
      const b = document.createElement("span");
      b.className = `badge ${u.status === "검사가능" ? "ready" : "status"}`;
      b.textContent = u.status;
      b.dataset.action = "edit-status";
      b.dataset.id = u.id;
      delBtn ? meta.insertBefore(b, delBtn) : meta.appendChild(b);
    } else if (u.room) {
      const b = document.createElement("span");
      b.className = `badge ${u.room === "2" ? "room room-2" : "room room-1"}`;
      b.textContent = `${u.room}촬영실`;
      b.dataset.action = "edit-status";
      b.dataset.id = u.id;
      delBtn ? meta.insertBefore(b, delBtn) : meta.appendChild(b);
    } else {
      const b = document.createElement("span");
      b.className = "badge room";
      b.textContent = "상태 설정";
      b.dataset.action = "edit-status";
      b.dataset.id = u.id;
      delBtn ? meta.insertBefore(b, delBtn) : meta.appendChild(b);
    }

    // 상태 변경에 따른 정렬 재적용
    applyPlacementClass(li, { room: u.room ?? null, status: u.status ?? null });
    return li; // 필요 시 사용할 수 있도록 반환
  }
  // 서버 브로드캐스트로 온 업데이트를 DOM에 반영
  socket.on("chat:update", (u) => {
    applyUpdateToDom(u);
    if (!u.by || u.by !== mySocketId) {
      playSound("update");
      flashById(u.id);
    }
  });

  // 삭제 브로드캐스트 수신 시 DOM에서 제거
  socket.on("chat:delete", ({ id }) => {
    const li = msgs.querySelector(`li[data-id="${id}"]`);
    if (li) li.remove();
  });

  // 전송
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    const status = stChanging.checked
      ? "환복중"
      : stAway.checked
        ? "부재중"
        : null;
    const room = status ? null : r1.checked ? "1" : r2.checked ? "2" : null;

    socket.emit("chat:send", {
      ts: Date.now(),
      sender: cfg.displayName || "익명",
      text,
      room,
      status,
    });

    input.value = "";
    input.focus();
    scrollToBottom(); // 내가 보낸 후에도 하단 고정
  });

  // 초기 히스토리: 오래된 → 최신 순으로 받아서 "아래에 최신"
  fetch(`${cfg.serverUrl}/history?limit=200`)
    .then((r) => r.json())
    .then((rows) => {
      rows.forEach((m) => {
        if (!m.id) console.warn("[history] row without id", m);
        msgs.appendChild(renderMessage(m));
      });
      if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
      }
      scrollToBottom(); // 시작 시 맨 아래(최근)로
    })
    .catch(() => {});
});
