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
    if (m.room) li.dataset.room = String(m.room);
    if (m.status) li.dataset.status = String(m.status);
    const initialReserve = m.reserveRoom || m.reserve_room || null;
    if (initialReserve) li.dataset.reserveRoom = String(initialReserve);

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

    // === 리액션 바 (메타 라인에 inline 배치) ===
    const reacts = document.createElement("div");
    reacts.className = "reactions";
    reacts.dataset.id = String(m.id || "");
    function fillReactions(reactionMap) {
      reacts.innerHTML = "";
      const common = m.reactions || reactionMap || {};
      const entries = Object.entries(common);
      entries.sort((a, b) => (b[1]?.length || 0) - (a[1]?.length || 0));
      for (const [emoji, users] of entries) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "react";
        btn.dataset.action = "reaction";
        btn.dataset.emoji = emoji;
        btn.innerHTML = `<span class="emo">${emoji}</span><span class="cnt">${users?.length || 0}</span>`;
        // 내가 반응한 경우 강조
        if (Array.isArray(users) && users.includes(cfg.displayName)) btn.classList.add("active");
        reacts.appendChild(btn);
      }
      const add = document.createElement("button");
      add.type = "button";
      add.className = "react add";
      add.dataset.action = "reaction-add";
      add.textContent = "＋";
      reacts.appendChild(add);
    }
    fillReactions(m.reactions || {});

    card.appendChild(meta);
    card.appendChild(body);
    // 메타의 삭제 버튼 앞에 reactions 삽입
    const delBtn = meta.querySelector('.del-btn');
    delBtn ? meta.insertBefore(reacts, delBtn) : meta.appendChild(reacts);
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
  let isPopoverOpen = false;
  function closePopover() {
    if (popoverEl && popoverEl.parentNode)
      popoverEl.parentNode.removeChild(popoverEl);
    popoverEl = null;
    isPopoverOpen = false;
  }

  // 강제 상호작용 상태 초기화 (드래그/팝오버/포커스 등)
  function hardResetInteraction() {
    try { closePopover(); } catch {}
    try { document.body.classList.remove("no-select"); } catch {}
    try { setZonesActive(false); } catch {}
    try {
      if (dragState && dragState.ghost && dragState.ghost.parentNode) {
        dragState.ghost.parentNode.removeChild(dragState.ghost);
      }
      if (dragState) {
        dragState.active = false;
        dragState.started = false;
        dragState.curZone = null;
        dragState.li = null;
        dragState.id = null;
        dragState.ghost = null;
      }
    } catch {}
    try {
      // 혹시라도 비활성화/읽기전용 상태가 남았을 수 있으니 해제
      if (input) {
        input.disabled = false;
        input.readOnly = false;
      }
    } catch {}
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
    isPopoverOpen = true;

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

  // 삭제 확인 팝오버 (네이티브 confirm 대신 사용)
  let delConfirmEl = null;
  function closeDeleteConfirm() {
    if (delConfirmEl && delConfirmEl.parentNode) delConfirmEl.parentNode.removeChild(delConfirmEl);
    delConfirmEl = null;
  }
  function openDeleteConfirm(anchorEl, onYes, onNo) {
    closeDeleteConfirm();
    const rect = anchorEl.getBoundingClientRect();
    delConfirmEl = document.createElement("div");
    delConfirmEl.className = "popover"; // 기존 팝오버 스타일 재사용
    delConfirmEl.innerHTML = `
      <div style="font-size:11px; opacity:0.9; margin-bottom:6px;">메시지를 삭제할까요?</div>
      <div class="item" data-role="yes" style="color:#ff6666;">삭제</div>
      <div class="item" data-role="no">취소</div>
    `;
    document.body.appendChild(delConfirmEl);

    // 위치: 버튼 아래쪽
    const GAP = 6;
    let x = Math.round(rect.left);
    let y = Math.round(rect.bottom + GAP);
    // 뷰포트 클램프
    const vw = window.innerWidth;
    const pw = delConfirmEl.offsetWidth;
    if (x + pw > vw - 8) x = vw - pw - 8;
    if (x < 8) x = 8;
    delConfirmEl.style.left = `${x}px`;
    delConfirmEl.style.top = `${y}px`;

    const onClick = (e) => {
      const it = e.target.closest(".item");
      if (!it) return;
      const role = it.getAttribute("data-role");
      if (role === "yes") onYes?.();
      else onNo?.();
      closeDeleteConfirm();
    };
    delConfirmEl.addEventListener("click", onClick, { once: true });

    const onDoc = (e) => {
      if (!delConfirmEl || delConfirmEl.contains(e.target)) return;
      onNo?.();
      closeDeleteConfirm();
      document.removeEventListener("mousedown", onDoc, true);
    };
    setTimeout(() => document.addEventListener("mousedown", onDoc, true), 0);
  }

  // 메시지 삭제 처리 (이벤트 위임)
  msgs.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="delete"]');
    if (!btn) return;
    const li = btn.closest("li.msg");
    const idStr = li?.dataset?.id?.trim() || btn?.dataset?.id?.trim() || "";
    const id = Number(idStr);
    if (!id || Number.isNaN(id)) return;

    openDeleteConfirm(btn, () => {
      // Yes
      socket.emit("chat:delete", { id });
      li?.remove();
      hardResetInteraction();
      try { btn.blur(); } catch {}
      try { input.blur(); } catch {}
      try { input.focus(); } catch {}
      setTimeout(() => { try { input.focus(); } catch {} }, 0);
      setTimeout(() => { try { input.click(); input.focus(); } catch {} }, 25);
      setTimeout(() => { try { input.focus(); } catch {} }, 60);
    }, () => {
      // No/바깥 클릭: 상태 복구만
      hardResetInteraction();
      try { input.blur(); } catch {}
      try { input.focus(); } catch {}
      setTimeout(() => { try { input.focus(); } catch {} }, 0);
    });
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
    const delBtn = meta.querySelector('.del-btn');

    const cur = {
      room: typeof u.room !== 'undefined' ? u.room : (li.dataset.room || null),
      status: typeof u.status !== 'undefined' ? u.status : (li.dataset.status || null),
    };

    const hasRoom = Object.prototype.hasOwnProperty.call(u, 'room');
    const hasStatus = Object.prototype.hasOwnProperty.call(u, 'status');
    const hasReserve = Object.prototype.hasOwnProperty.call(u, 'reserveRoom');

    // 예약만 변경되는 경우: 기본 상태/룸 배지는 유지하고 예약 배지만 갱신
    if (hasReserve && !hasRoom && !hasStatus) {
      li.dataset.reserveRoom = u.reserveRoom || '';
      Array.from(meta.querySelectorAll('.badge.reserve')).forEach((n) => n.remove());
      const effReserveOnly = u.reserveRoom && (!cur.room || cur.room !== u.reserveRoom) ? u.reserveRoom : null;
      if (effReserveOnly) {
        const rb = document.createElement('span');
        rb.className = 'badge reserve';
        rb.textContent = `예약: ${effReserveOnly}촬영실`;
        rb.dataset.action = 'edit-status';
        rb.dataset.id = u.id;
        delBtn ? meta.insertBefore(rb, delBtn) : meta.appendChild(rb);
      }
      return li;
    }

    if (typeof u.room !== 'undefined') li.dataset.room = u.room || '';
    if (typeof u.status !== 'undefined') li.dataset.status = u.status || '';

    Array.from(meta.querySelectorAll('.badge')).forEach((n) => n.remove());
    const primary = document.createElement('span');
    primary.dataset.action = 'edit-status';
    primary.dataset.id = u.id;
    if (cur.status) {
      primary.className = `badge ${cur.status === '검사가능' ? 'ready' : 'status'}`;
      primary.textContent = cur.status;
    } else if (cur.room) {
      primary.className = `badge ${cur.room === '2' ? 'room room-2' : 'room room-1'}`;
      primary.textContent = `${cur.room}촬영실`;
    } else {
      primary.className = 'badge room';
      primary.textContent = '상태 설정';
    }
    delBtn ? meta.insertBefore(primary, delBtn) : meta.appendChild(primary);

    // 예약 배지 제거 (기능 폐기)
    Array.from(meta.querySelectorAll('.badge.reserve')).forEach((n) => n.remove());

    applyPlacementClass(li, { room: cur.room ?? null, status: cur.status ?? null });
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

  // ==== 리액션: 토글/추가 ====
  const REACT_CANDIDATES = ["✅", "👍", "👎", "❤️", "🔥", "❗", "👏", "🔔"];
  function openReactionPicker(anchorRect, onPick) {
    closePopover();
    popoverEl = document.createElement("div");
    popoverEl.className = "popover";
    popoverEl.innerHTML = REACT_CANDIDATES.map((e) => `<div class="item" data-emoji="${e}">${e}</div>`).join("");
    document.body.appendChild(popoverEl);
    isPopoverOpen = true;
    // 간단 포지셔닝 (아래쪽)
    const GAP = 6;
    let x = Math.round(anchorRect.left);
    let y = Math.round(anchorRect.bottom + GAP);
    popoverEl.style.left = `${x}px`;
    popoverEl.style.top = `${y}px`;
    const onClick = (e) => {
      const it = e.target.closest(".item");
      if (!it) return;
      onPick(it.dataset.emoji);
      closePopover();
      document.removeEventListener("click", onDocClick, true);
    };
    popoverEl.addEventListener("click", onClick, { once: true });
    const onDocClick = (e) => {
      if (!popoverEl || popoverEl.contains(e.target)) return;
      closePopover();
      document.removeEventListener("click", onDocClick, true);
    };
    setTimeout(() => document.addEventListener("click", onDocClick, true), 0);
  }

  // 이벤트 위임: 반응 토글/추가
  msgs.addEventListener("click", (e) => {
    const reactBtn = e.target.closest('[data-action="reaction"]');
    const addBtn = e.target.closest('[data-action="reaction-add"]');
    if (!reactBtn && !addBtn) return;
    const li = e.target.closest("li.msg");
    if (!li) return;
    const id = Number(li.dataset.id || "");
    if (!id || Number.isNaN(id)) return;
    // 현재 사용자명은 cfg.displayName 사용
    const user = cfg.displayName || "익명";

    if (reactBtn) {
      const emoji = reactBtn.dataset.emoji;
      // 옵티미스틱 UI 토글
      const cntEl = reactBtn.querySelector('.cnt');
      let c = parseInt(cntEl?.textContent || '0', 10);
      if (reactBtn.classList.contains('active')) {
        // 해제: 카운트 감소 후 0이면 버튼 제거
        const next = Number.isNaN(c) ? 0 : Math.max(0, c - 1);
        if (next <= 0) {
          reactBtn.remove();
        } else if (cntEl) {
          cntEl.textContent = String(next);
          reactBtn.classList.remove('active');
        }
      } else {
        // 추가: 카운트 증가 + 활성화
        if (!Number.isNaN(c) && cntEl) cntEl.textContent = String(c + 1);
        reactBtn.classList.add('active');
      }
      socket.emit("reaction:toggle", { id, emoji, user });
      return;
    }
    if (addBtn) {
      const rect = addBtn.getBoundingClientRect();
      openReactionPicker(rect, (emoji) => {
        // 이미 있는 버튼이 있으면 증가/활성, 없으면 새로 추가(옵티미스틱)
        const reacts = li.querySelector('.reactions');
        let btn = reacts?.querySelector(`.react[data-emoji="${emoji}"]`);
        if (btn) {
          const cntEl = btn.querySelector('.cnt');
          let c = parseInt(cntEl?.textContent || '0', 10);
          btn.classList.add('active');
          if (!Number.isNaN(c)) cntEl.textContent = String(c + 1);
        } else if (reacts) {
          btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'react active';
          btn.dataset.action = 'reaction';
          btn.dataset.emoji = emoji;
          btn.innerHTML = `<span class="emo">${emoji}</span><span class="cnt">1</span>`;
          reacts.insertBefore(btn, addBtn);
        }
        socket.emit("reaction:toggle", { id, emoji, user });
      });
    }
  });

  // 서버 브로드캐스트: 리액션 업데이트
  socket.on("reaction:update", ({ id, reactions }) => {
    const li = msgs.querySelector(`li[data-id="${id}"]`);
    if (!li) return;
    const meta = li.querySelector('.meta');
    if (!meta) return;
    let reacts = meta.querySelector('.reactions');
    if (!reacts) {
      reacts = document.createElement('div');
      reacts.className = 'reactions';
      const delBtn = meta.querySelector('.del-btn');
      delBtn ? meta.insertBefore(reacts, delBtn) : meta.appendChild(reacts);
    }
    // 재구성 (작은 칩, 한 줄 유지)
    reacts.innerHTML = "";
    const entries = Object.entries(reactions || {});
    entries.sort((a, b) => (b[1]?.length || 0) - (a[1]?.length || 0));
    for (const [emoji, users] of entries) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "react";
      btn.dataset.action = "reaction";
      btn.dataset.emoji = emoji;
      btn.innerHTML = `<span class="emo">${emoji}</span><span class="cnt">${users?.length || 0}</span>`;
      if (Array.isArray(users) && users.includes(cfg.displayName)) btn.classList.add("active");
      reacts.appendChild(btn);
    }
    const add = document.createElement("button");
    add.type = "button";
    add.className = "react add";
    add.dataset.action = "reaction-add";
    add.textContent = "＋";
    reacts.appendChild(add);
  });

  // ===== 드래그 앤 드롭으로 상태 변경 =====
  const dragZonesEl = document.getElementById("dragZones");
  const zoneLeft = dragZonesEl?.querySelector(".zone-left");
  const zoneCenter = dragZonesEl?.querySelector(".zone-center");
  const zoneRight = dragZonesEl?.querySelector(".zone-right");

  const dragState = {
    active: false,
    started: false,
    startX: 0,
    startY: 0,
    curZone: null,
    li: null,
    id: null,
    ghost: null,
  };

  function setZonesActive(on) {
    if (!dragZonesEl) return;
    dragZonesEl.classList.toggle("active", !!on);
    [zoneLeft, zoneCenter, zoneRight].filter(Boolean).forEach((z) => z.classList.remove("active"));
  }

  function pickZoneByX(x) {
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const third = vw / 3;
    if (x < third) return "left";
    if (x > 2 * third) return "right";
    return "center";
  }

  function highlightZone(kind) {
    [zoneLeft, zoneCenter, zoneRight].filter(Boolean).forEach((z) => z.classList.remove("active"));
    if (kind === "left") zoneLeft?.classList.add("active");
    else if (kind === "center") zoneCenter?.classList.add("active");
    else if (kind === "right") zoneRight?.classList.add("active");
  }

  function createGhostFrom(li, x, y) {
    const card = li.querySelector(".bubble") || li;
    const rect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.classList.add("drag-ghost");
    ghost.style.width = Math.round(rect.width) + "px";
    ghost.style.height = Math.round(rect.height) + "px";
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;
    document.body.appendChild(ghost);
    return ghost;
  }

  function endDrag(commit) {
    document.body.classList.remove("no-select");
    setZonesActive(false);
    dragState.li?.classList.remove("dragging");
    if (dragState.ghost && dragState.ghost.parentNode) {
      dragState.ghost.parentNode.removeChild(dragState.ghost);
    }
    const { id } = dragState;
    const z = dragState.curZone;
    dragState.active = dragState.started = false;
    dragState.li = dragState.ghost = dragState.curZone = null;
    dragState.id = null;

    if (!commit || !id || !z) return;
    // 드롭된 존에 따라 상태 결정
    let room = null;
    let status = null;
    if (z === "left") {
      // 현재 선택된 촬영실(라디오)이 있으면 우선, 없으면 config의 defaultRoom 사용
      const checked = roomRadios.find((r) => r.checked)?.value || String(cfg.defaultRoom || "1");
      room = checked === "2" ? "2" : "1";
      status = null;
    } else if (z === "center") {
      room = null;
      status = "검사가능";
    } else if (z === "right") {
      room = null;
      status = "부재중";
    }

    // 서버 업데이트 + 옵티미스틱 반영
    socket.emit("chat:update", { id, room, status });
    applyUpdateToDom({ id, room, status });
  }

  msgs.addEventListener("mousedown", (e) => {
    // 인터랙션 요소 클릭시(삭제/배지 등) 드래그 비활성화
    if (e.button !== 0) return; // 좌클릭만
    if (isPopoverOpen) return; // 팝오버 열려있으면 드래그 금지
    if (e.target.closest('[data-action]')) return;
    const li = e.target.closest("li.msg");
    if (!li) return;
    const id = Number(li.dataset.id || "");
    if (!id || Number.isNaN(id)) return;

    dragState.active = true;
    dragState.started = false;
    dragState.startX = e.clientX;
    dragState.startY = e.clientY;
    dragState.li = li;
    dragState.id = id;
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragState.active) return;
    if (isPopoverOpen) return; // 팝오버 열려있으면 드래그 무시
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    const threshold = 10; // 오동작 방지를 위해 임계값 상향

    if (!dragState.started) {
      if (Math.abs(dx) + Math.abs(dy) < threshold) return;
      dragState.started = true;
      document.body.classList.add("no-select");
      dragState.li?.classList.add("dragging");
      setZonesActive(true);
      dragState.ghost = createGhostFrom(dragState.li, e.clientX, e.clientY);
    }

    if (dragState.ghost) {
      dragState.ghost.style.left = `${e.clientX}px`;
      dragState.ghost.style.top = `${e.clientY}px`;
    }
    const zone = pickZoneByX(e.clientX);
    dragState.curZone = zone;
    highlightZone(zone);
  });

  document.addEventListener("mouseup", (e) => {
    if (!dragState.active) return;
    const doCommit = !!dragState.started; // 드래그가 실제 시작되었을 때만 커밋
    endDrag(doCommit);
  });

  // 삭제 브로드캐스트 수신 시 DOM에서 제거
  socket.on("chat:delete", ({ id }) => {
    const li = msgs.querySelector(`li[data-id="${id}"]`);
    if (li) li.remove();
    // 브로드캐스트로 삭제된 경우에도 입력창 포커스/상태 정리 + 하드 리셋
    hardResetInteraction();
    try { input.blur(); } catch {}
    try { input.focus(); } catch {}
    setTimeout(() => { try { input.focus(); } catch {} }, 0);
    setTimeout(() => { try { input.click(); input.focus(); } catch {} }, 25);
    setTimeout(() => { try { input.focus(); } catch {} }, 60);
  });

  // 비상 복구: ESC 키로 인터랙션 초기화 + 입력창 포커스
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hardResetInteraction();
      try { input.focus(); } catch {}
      setTimeout(() => { try { input.focus(); } catch {} }, 0);
    }
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
  
  // 폼 영역을 클릭하면 항상 입력창으로 포커스 전달(오버레이 잔존 대비)
  form.addEventListener("click", () => {
    hardResetInteraction();
    try { input.focus(); } catch {}
    setTimeout(() => { try { input.focus(); } catch {} }, 0);
  });

  // 창 포커스를 되찾을 때도 복구
  window.addEventListener("focus", () => {
    hardResetInteraction();
    try { input.focus(); } catch {}
    setTimeout(() => { try { input.focus(); } catch {} }, 0);
  });

  // 캡처 단계에서 폼 영역 클릭을 가로채 입력칸에 포커스(보이지 않는 오버레이 대비)
  document.addEventListener(
    "mousedown",
    (e) => {
      try {
        const rect = form.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;
        const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        if (inside) {
          hardResetInteraction();
          setTimeout(() => { try { input.focus(); } catch {} }, 0);
        }
      } catch {}
    },
    true,
  );

  // 초기 히스토리: 오래된 → 최신 순으로 받아서 "아래에 최신"
  fetch(`${cfg.serverUrl}/history?limit=500`)
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
