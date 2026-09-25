const app = document.querySelector("#app");
const toastEl = document.querySelector("#toast");
const money = (n) => new Intl.NumberFormat("es-ES").format(Math.max(0, Math.round(n)));
const state = {
  screen: "welcome",
  setup: { count: 6, stack: 1000, sb: 5, bb: 10, names: [] },
  players: [],
  dealer: 0,
  sb: 0,
  bb: 0,
  turn: 0,
  street: "preflop",
  pot: 0,
  currentBet: 0,
  minRaise: 10,
  lastAggressor: null,
  acted: new Set(),
  lastActionBet: new Map(),
  board: 0,
  hand: 1,
  pendingNextHand: false,
  selectedWinners: new Set(),
  pots: [],
  currentPotIndex: 0,
  champion: null,
  undoState: null,
  menuOpen: false,
  blindMenu: false,
  blinds: {
    enabled: false,
    minutes: 15,
    nextSb: 10,
    nextBb: 20,
    remaining: 900,
    pending: false,
  },
  handLog: [],
};
let blindTimer = null;
const streets = ["preflop", "flop", "turn", "river"];
const streetName = {
  preflop: "Preflop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
};
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastEl.t);
  toastEl.t = setTimeout(() => toastEl.classList.remove("show"), 2200);
}
function clockText() {
  if (state.blinds.pending) return "Ciegas nuevas · próxima mano";
  const m = Math.floor(state.blinds.remaining / 60),
    s = state.blinds.remaining % 60;
  return state.blinds.enabled
    ? `${m}:${String(s).padStart(2, "0")} · ${money(state.setup.sb)}/${money(state.setup.bb)}`
    : `Ciegas ${money(state.setup.sb)}/${money(state.setup.bb)}`;
}
function startBlindTimer() {
  clearInterval(blindTimer);
  blindTimer = null;
  if (!state.blinds.enabled || state.blinds.pending) return;
  blindTimer = setInterval(() => {
    if (state.screen !== "game" || state.champion) return;
    state.blinds.remaining = Math.max(0, state.blinds.remaining - 1);
    const el = document.querySelector("#blindClock");
    if (el) el.textContent = clockText();
    if (state.blinds.remaining === 0) {
      state.blinds.enabled = false;
      state.blinds.pending = true;
      clearInterval(blindTimer);
      blindTimer = null;
      if (el) el.textContent = clockText();
      toast("Las ciegas subirán en la próxima mano");
    }
  }, 1000);
}
function render() {
  app.innerHTML =
    state.screen === "welcome" ? welcome() : state.screen === "setup" ? setup() : game();
  bind();
}
function welcome() {
  return `<main class="screen welcome"><div class="brand"><span class="brand-mark">♠</span> EASY POKER</div><div class="welcome-art"><div class="hero-chip"></div></div><section><div class="step">Tu mesa en el bolsillo</div><h1>Juega sin<br>fichas físicas.</h1><p class="lead">Controla turnos, apuestas, ciegas y botes desde un solo móvil. Vosotros ponéis las cartas.</p><button class="primary wide" data-go="setup">Jugar una partida</button></section></main>`;
}
function setup() {
  const names = Array.from({ length: state.setup.count }, (_, i) => state.setup.names[i] || "");
  return `<main class="screen setup"><header class="topbar"><button class="back" data-go="welcome" aria-label="Volver">←</button><div class="brand"><span class="brand-mark">♠</span> EASY POKER</div><span style="width:42px"></span></header><section><div class="step">Nueva partida</div><h2>Prepara la mesa</h2><p class="lead">Configura las fichas virtuales. Las cartas se reparten físicamente.</p></section><section class="form-card"><div class="control"><div class="label-row"><label for="count">Jugadores</label><span class="value-pill" id="countValue">${state.setup.count} / 9</span></div><input id="count" class="range" type="range" min="2" max="9" step="1" value="${state.setup.count}"></div><div class="two-col"><div class="control"><label for="stack">Stack inicial</label><input id="stack" class="input" inputmode="numeric" min="20" type="number" value="${state.setup.stack}"></div><div class="control"><label for="bb">Ciegas SB / BB</label><select id="blinds" class="select">${[
    [1, 2],
    [2, 5],
    [5, 10],
    [10, 20],
    [25, 50],
    [50, 100],
  ]
    .map(
      ([s, b]) =>
        `<option value="${s},${b}" ${state.setup.sb === s && state.setup.bb === b ? "selected" : ""}>${s} / ${b}</option>`,
    )
    .join(
      "",
    )}</select></div></div></section><section><div class="players-title"><div class="label">¿Quién juega?</div><div class="hint">1º D · 2º SB · 3º BB</div></div><div class="player-inputs">${names.map((n, i) => `<div class="player-field"><span>${i + 1}</span><input class="input name-input" data-index="${i}" value="${esc(n)}" maxlength="16" placeholder="Jugador ${i + 1}" aria-label="Nombre del jugador ${i + 1}">${i < 3 ? `<b class="position-tag">${["D", "SB", "BB"][i]}</b>` : ""}</div>`).join("")}</div></section><footer class="setup-footer"><button id="start" class="primary wide">Empezar partida</button></footer></main>`;
}
function esc(v = "") {
  return String(v).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}
function nextEligible(from, filter = (p) => !p.out) {
  for (let i = 1; i <= state.players.length; i++) {
    const x = (from + i) % state.players.length;
    if (filter(state.players[x])) return x;
  }
  return from;
}
function activePlayers() {
  return state.players.filter((p) => !p.out && !p.folded);
}
function canActPlayers() {
  return state.players.filter((p) => !p.out && !p.folded && !p.allin);
}
function assignPositions() {
  const live = state.players.filter((p) => !p.out);
  if (live.length < 2) return;
  state.dealer = nextEligible(state.dealer);
  if (live.length === 2) {
    state.sb = state.dealer;
    state.bb = nextEligible(state.dealer);
  } else {
    state.sb = nextEligible(state.dealer);
    state.bb = nextEligible(state.sb);
  }
}
function startGame() {
  const fields = [...document.querySelectorAll(".name-input")];
  const stack = Number(document.querySelector("#stack").value);
  if (!Number.isFinite(stack) || stack < state.setup.bb * 2)
    return toast("El stack debe ser al menos dos ciegas grandes");
  state.setup.stack = Math.round(stack);
  state.setup.names = fields.map((x, i) => x.value.trim() || `Jugador ${i + 1}`);
  state.players = state.setup.names.map((name, id) => ({
    id,
    name,
    chips: state.setup.stack,
    bet: 0,
    total: 0,
    folded: false,
    allin: false,
    out: false,
  }));
  state.dealer = state.players.length - 1;
  state.champion = null;
  state.undoState = null;
  state.screen = "game";
  newHand(true);
  startBlindTimer();
}
function postBlind(i, amount) {
  const p = state.players[i],
    paid = Math.min(p.chips, amount);
  p.chips -= paid;
  p.bet += paid;
  p.total += paid;
  state.pot += paid;
  if (p.chips === 0) p.allin = true;
}
function newHand(first = false) {
  state.pendingNextHand = false;
  state.undoState = null;
  state.players.forEach((p) => {
    p.out = p.chips <= 0;
    p.folded = p.out;
    p.allin = false;
    p.bet = 0;
    p.total = 0;
  });
  const live = state.players.filter((p) => !p.out);
  if (live.length < 2) {
    state.champion = live[0] || state.players.slice().sort((a, b) => b.chips - a.chips)[0];
    clearInterval(blindTimer);
    return render();
  }
  if (state.blinds.pending) {
    state.setup.sb = state.blinds.nextSb;
    state.setup.bb = state.blinds.nextBb;
    state.blinds.nextSb *= 2;
    state.blinds.nextBb *= 2;
    state.blinds.pending = false;
    state.blinds.enabled = true;
    state.blinds.remaining = state.blinds.minutes * 60;
    startBlindTimer();
    setTimeout(
      () => toast(`Nuevas ciegas: ${money(state.setup.sb)} / ${money(state.setup.bb)}`),
      0,
    );
  }
  if (!first) state.hand++;
  assignPositions();
  state.street = "preflop";
  state.board = 0;
  state.pot = 0;
  state.currentBet = state.setup.bb;
  state.minRaise = state.setup.bb;
  state.lastAggressor = null;
  state.acted = new Set();
  state.lastActionBet = new Map();
  state.selectedWinners = new Set();
  state.pots = [];
  state.currentPotIndex = 0;
  postBlind(state.sb, state.setup.sb);
  postBlind(state.bb, state.setup.bb);
  state.turn = nextEligible(state.bb, (p) => !p.out && !p.folded && !p.allin);
  render();
}
function saveUndo() {
  state.undoState = {
    players: state.players.map((p) => ({ ...p })),
    turn: state.turn,
    pot: state.pot,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    lastAggressor: state.lastAggressor,
    acted: [...state.acted],
    lastActionBet: [...state.lastActionBet],
  };
}
function undoLastAction() {
  const u = state.undoState;
  if (!u) return;
  state.players = u.players.map((p) => ({ ...p }));
  state.turn = u.turn;
  state.pot = u.pot;
  state.currentBet = u.currentBet;
  state.minRaise = u.minRaise;
  state.lastAggressor = u.lastAggressor;
  state.acted = new Set(u.acted);
  state.lastActionBet = new Map(u.lastActionBet);
  state.undoState = null;
  render();
  toast("Última acción deshecha");
}
function seatPosition(i, n) {
  const angle = ((-90 + (360 * i) / n) * Math.PI) / 180;
  const rx = n <= 4 ? 42 : 45,
    ry = n <= 4 ? 39 : 43;
  return {
    left: 50 + Math.cos(angle) * rx,
    top: 50 + Math.sin(angle) * ry,
    betX: Math.round(-Math.cos(angle) * 62),
    betY: Math.round(-Math.sin(angle) * 58),
  };
}
function boardCards() {
  return Array.from(
    { length: 5 },
    (_, i) =>
      `<div class="card ${i < state.board ? "" : "down"}">${i < state.board ? (i < 3 ? "F" + (i + 1) : i === 3 ? "T" : "R") : ""}</div>`,
  ).join("");
}
function potName(index) {
  const names = [
    "Principal",
    "Secundario",
    "Terciario",
    "Cuaternario",
    "Quinto",
    "Sexto",
    "Séptimo",
    "Octavo",
  ];
  return names[index] || `Bote ${index + 1}`;
}
function potBreakdown() {
  if (!state.pot) return "";
  const contributed = state.players.filter((p) => p.total > 0),
    max = Math.max(...contributed.map((p) => p.total)),
    allInLevels = new Set(contributed.filter((p) => p.allin && p.total < max).map((p) => p.total));
  if (!allInLevels.size)
    return `<div class="pot-breakdown"><span>Principal: <b>${money(state.pot)}</b></span></div>`;
  const levels = [...new Set(contributed.map((p) => p.total))].sort((a, b) => a - b),
    parts = [0];
  let previous = 0,
    side = 0,
    unmatched = 0;
  levels.forEach((level) => {
    if (previous && allInLevels.has(previous)) {
      side++;
      parts[side] = 0;
    }
    const contributors = contributed.filter((p) => p.total >= level),
      amount = (level - previous) * contributors.length;
    if (contributors.length === 1) unmatched += amount;
    else parts[side] = (parts[side] || 0) + amount;
    previous = level;
  });
  const labels = parts
    .filter(Boolean)
    .map((amount, i) => `<span>${potName(i)}: <b>${money(amount)}</b></span>`);
  if (unmatched) labels.push(`<span>Sin igualar: <b>${money(unmatched)}</b></span>`);
  return `<div class="pot-breakdown">${labels.join("")}</div>`;
}
function game() {
  const live = state.players.filter((p) => !p.out);
  const cur = state.players[state.turn];
  const toCall = cur ? Math.max(0, state.currentBet - cur.bet) : 0;
  const previousAction = cur ? state.lastActionBet.get(cur.id) : undefined;
  const canRaise =
    previousAction === undefined ||
    previousAction === 0 ||
    state.currentBet - previousAction >= state.minRaise;
  return `<main class="screen game-screen"><header class="game-head"><div class="hand-meta"><span class="round-label">Mano ${state.hand}</span><strong class="street-head">${streetName[state.street]}</strong><small id="blindClock">${clockText()}</small></div><div class="pot-card"><span>Bote</span><strong><i class="mini-chip" aria-hidden="true"></i>${money(state.pot)}</strong></div><button class="icon-btn" id="menu" aria-label="Opciones">•••</button></header><section class="table-wrap"><div class="poker-table"><div class="table-center"><div class="street">${streetName[state.street]}</div><div class="board">${boardCards()}</div><div class="instruction">${state.street === "preflop" ? "Reparte 2 cartas a cada jugador" : state.board < 5 ? "Revela las cartas físicas indicadas" : "Última ronda de apuestas"}</div>${potBreakdown()}</div>${state.players
    .map((p, i) => {
      const pos = seatPosition(i, state.players.length);
      const tags = `${i === state.dealer ? '<span class="badge">D</span>' : ""}${i === state.sb ? '<span class="badge sb">SB</span>' : ""}${i === state.bb ? '<span class="badge bb">BB</span>' : ""}`;
      return `<div class="seat ${i === state.turn ? "active" : ""} ${p.folded ? "folded" : ""} ${p.allin ? "allin" : ""}" style="left:${pos.left}%;top:${pos.top}%"><div class="badges">${tags}</div><div class="seat-box"><div class="seat-name">${esc(p.name)}</div><div class="seat-chips">${p.out ? "Eliminado" : p.allin ? "ALL-IN · " : ""}${money(p.chips)}</div></div>${p.bet ? `<div class="seat-bet" style="--bet-x:${pos.betX}px;--bet-y:${pos.betY}px"><i class="chip-token" aria-hidden="true"></i><strong>${money(p.bet)}</strong></div>` : ""}</div>`;
    })
    .join(
      "",
    )}</div></section><section class="action-dock">${activePlayers().length <= 1 || roundComplete() ? betweenPanel() : cur && !cur.out && !cur.folded && !cur.allin ? `<div class="turn-copy"><strong>Turno de ${esc(cur.name)}</strong><span>${toCall ? `Necesita ${money(toCall)} para igualar` : "Puede pasar sin apostar"}</span></div><div class="actions"><button class="action fold" data-action="fold">Retirarse</button><button class="action main" data-action="call">${toCall ? `Pagar ${money(Math.min(toCall, cur.chips))}` : "Pasar"}</button><button class="action" data-action="raise" ${canRaise ? "" : "disabled"}>${canRaise ? (state.currentBet ? "Subir" : "Apostar") : "Sin resubida"}</button></div><div class="raise-panel" id="raisePanel"><div class="quick-bets"><button data-quick="half">½ bote</button><button data-quick="pot">Bote</button><button data-quick="all">All-in</button></div><div class="raise-row"><input id="raiseAmount" class="input" type="number" inputmode="numeric" min="${Math.min(cur.bet + cur.chips, state.currentBet + state.minRaise)}" max="${cur.bet + cur.chips}" value="${Math.min(cur.bet + cur.chips, Math.max(state.currentBet + state.minRaise, state.setup.bb))}" aria-label="Apuesta total"><button class="primary" id="confirmRaise">Confirmar</button></div></div>` : betweenPanel()}<button class="undo-btn" id="undoAction" ${state.undoState ? "" : "disabled"}>↶ Deshacer última acción</button></section>${state.showdown ? showdown() : ""}${state.blindMenu ? blindSheet() : state.menuOpen ? menuSheet() : ""}${state.champion ? championModal() : ""}</main>`;
}
function betweenPanel() {
  if (state.pendingNextHand)
    return `<div class="between"><strong>Próxima mano</strong><span class="hint">El botón y las ciegas cambiarán de posición</span><button class="primary wide" id="continueStreet">Pulsa para continuar</button></div>`;
  if (activePlayers().length === 1)
    return `<div class="between"><strong>La mano ha terminado</strong><button class="primary wide" id="continueStreet">Entregar el bote</button></div>`;
  if (state.street === "river")
    return `<div class="between"><strong>Ronda final completada</strong><button class="primary wide" id="continueStreet">Terminar mano</button></div>`;
  const next = streetName[streets[streets.indexOf(state.street) + 1]];
  return `<div class="between"><strong>Turno del ${next}</strong><span class="hint">Prepara las cartas de la siguiente ronda</span><button class="primary wide" id="continueStreet">Pulsa para continuar</button></div>`;
}
function menuSheet() {
  return `<div class="showdown"><div class="sheet"><h2>Opciones de mesa</h2><p>La partida solo se mantiene mientras esta mesa está abierta.</p><button class="blind-option" id="openBlinds"><span><strong>Subir ciegas</strong><small>${state.blinds.enabled || state.blinds.pending ? clockText() : "Configurar subida automática"}</small></span><b>›</b></button><div class="summary">${state.players.map((p) => `<div class="summary-row"><span>${esc(p.name)}</span><strong>${money(p.chips)}</strong></div>`).join("")}</div><button class="secondary wide" id="closeMenu">Volver a la mesa</button><button class="danger wide" id="endGame" style="margin-top:9px">Terminar partida</button></div></div>`;
}
function blindSheet() {
  return `<div class="showdown"><div class="sheet"><button class="sheet-back" id="backMenu" aria-label="Volver">←</button><div class="step">Reloj de niveles</div><h2>Subida de ciegas</h2><p>Cuando termine el tiempo, las nuevas ciegas se aplicarán al comenzar la siguiente mano.</p><label class="toggle-row"><span><strong>Subida automática</strong><small>Continuará duplicando cada nivel</small></span><input id="blindEnabled" type="checkbox" ${state.blinds.enabled || state.blinds.pending ? "checked" : ""}></label><div class="blind-fields"><label>Intervalo (minutos)<input class="input" id="blindMinutes" type="number" inputmode="numeric" min="1" max="180" value="${state.blinds.minutes}"></label><label>Próxima SB<input class="input" id="nextSb" type="number" inputmode="numeric" min="1" value="${state.blinds.nextSb}"></label><label>Próxima BB<input class="input" id="nextBb" type="number" inputmode="numeric" min="2" value="${state.blinds.nextBb}"></label></div><button class="primary wide" id="saveBlinds">Guardar configuración</button></div></div>`;
}
function championModal() {
  const pieces = Array.from(
    { length: 42 },
    (_, i) =>
      `<i style="--x:${(i * 37) % 101}%;--delay:${(i % 9) * 0.08}s;--spin:${180 + (i % 7) * 70}deg;--hue:${(i * 47) % 360}"></i>`,
  ).join("");
  return `<div class="champion" role="dialog" aria-modal="true" aria-labelledby="championTitle"><div class="confetti" aria-hidden="true">${pieces}</div><div class="champion-card"><div class="champion-crown">♠</div><div class="step">Partida terminada</div><h2 id="championTitle">¡Enhorabuena, ${esc(state.champion.name)}!</h2><p>Has ganado la partida con <strong>${money(state.champion.chips)} fichas</strong>.</p><button class="primary wide" id="newGame">Jugar otra partida</button></div></div>`;
}
function showdown() {
  const pot = state.pots[state.currentPotIndex];
  if (!pot) return "";
  const eligible = pot.eligible.map((id) => state.players.find((p) => p.id === id)).filter(Boolean);
  const selected = [...state.selectedWinners];
  const label = `Bote ${potName(state.currentPotIndex).toLowerCase()}`;
  return `<div class="showdown"><div class="sheet"><div class="step">Showdown · Bote ${state.currentPotIndex + 1} de ${state.pots.length}</div><h2>${label}: ${money(pot.amount)} fichas</h2>${state.currentPotIndex === 0 ? `<p><strong>${esc(firstToShow().name)}</strong> enseña primero.</p>` : ""}<p>Solo estos jugadores pueden ganar este bote. Toca uno o varios si hay empate.</p><div class="winner-grid">${eligible.map((p) => `<button class="winner ${state.selectedWinners.has(p.id) ? "selected" : ""}" data-winner="${p.id}">${esc(p.name)}<br><small>${money(p.chips)} fichas</small></button>`).join("")}</div><button class="primary wide" id="awardPot" ${selected.length ? "" : "disabled"}>Entregar ${money(pot.amount)} fichas</button></div></div>`;
}
function firstToShow() {
  const contenders = activePlayers();
  if (!contenders.length) return state.players[0];
  if (state.lastAggressor !== null) {
    const aggressor = state.players[state.lastAggressor];
    if (aggressor && !aggressor.out && !aggressor.folded) return aggressor;
  }
  const first = nextEligible(state.dealer, (p) => !p.out && !p.folded);
  return state.players[first] || contenders[0];
}
function roundComplete() {
  const actors = canActPlayers();
  if (actors.length === 0) return true;
  return actors.every((p) => state.acted.has(p.id) && p.bet === state.currentBet);
}
function afterAction() {
  if (activePlayers().length <= 1) return render();
  if (roundComplete()) return render();
  state.turn = nextEligible(state.turn, (p) => !p.out && !p.folded && !p.allin);
  render();
}
function action(type) {
  if (!["fold", "call"].includes(type)) throw new Error("Acción no válida");
  saveUndo();
  const p = state.players[state.turn],
    toCall = Math.max(0, state.currentBet - p.bet);
  if (type === "fold") {
    p.folded = true;
    state.acted.add(p.id);
  } else if (type === "call") {
    const paid = Math.min(p.chips, toCall);
    p.chips -= paid;
    p.bet += paid;
    p.total += paid;
    state.pot += paid;
    if (p.chips === 0) p.allin = true;
    state.acted.add(p.id);
    state.lastActionBet.set(p.id, state.currentBet);
  }
  afterAction();
}
function doRaise() {
  const p = state.players[state.turn],
    previousAction = state.lastActionBet.get(p.id);
  if (
    previousAction !== undefined &&
    previousAction !== 0 &&
    state.currentBet - previousAction < state.minRaise
  )
    return toast("Ese all-in no reabre las apuestas");
  let target = Math.round(Number(document.querySelector("#raiseAmount").value));
  const max = p.bet + p.chips;
  target = Math.min(max, target);
  const minimum = state.currentBet + state.minRaise;
  if (target <= state.currentBet && target < max)
    return toast(`La subida mínima es a ${money(minimum)}`);
  if (target < minimum && target < max) return toast(`La subida mínima es a ${money(minimum)}`);
  const added = target - p.bet;
  if (added <= 0) return toast("Introduce una apuesta mayor");
  saveUndo();
  const raiseBy = target - state.currentBet;
  p.chips -= added;
  p.bet = target;
  p.total += added;
  state.pot += added;
  if (target > state.currentBet) {
    state.lastAggressor = state.turn;
    if (raiseBy >= state.minRaise) {
      state.minRaise = raiseBy;
      state.acted = new Set([p.id]);
    } else state.acted.add(p.id);
    state.currentBet = target;
  } else state.acted.add(p.id);
  state.lastActionBet.set(p.id, state.currentBet);
  if (p.chips === 0) p.allin = true;
  afterAction();
}
function continueStreet() {
  state.undoState = null;
  if (state.pendingNextHand) return newHand();
  if (activePlayers().length === 1) return awardUncontested(activePlayers()[0]);
  if (state.street === "river") return prepareShowdown();
  const idx = streets.indexOf(state.street);
  state.street = streets[idx + 1];
  state.board = state.street === "flop" ? 3 : state.street === "turn" ? 4 : 5;
  state.players.forEach((p) => (p.bet = 0));
  state.currentBet = 0;
  state.minRaise = state.setup.bb;
  state.lastAggressor = null;
  state.acted = new Set();
  state.lastActionBet = new Map();
  state.turn = nextEligible(state.dealer, (p) => !p.out && !p.folded && !p.allin);
  if (canActPlayers().length <= 1 && state.street !== "river") {
    state.acted = new Set(canActPlayers().map((p) => p.id));
  }
  render();
}
function buildSidePots() {
  const levels = [...new Set(state.players.filter((p) => p.total > 0).map((p) => p.total))].sort(
    (a, b) => a - b,
  );
  let previous = 0;
  const pots = [];
  levels.forEach((level) => {
    const contributors = state.players.filter((p) => p.total >= level);
    const eligible = contributors
      .filter((p) => !p.folded)
      .map((p) => p.id)
      .sort((a, b) => a - b);
    const amount = (level - previous) * contributors.length;
    const last = pots[pots.length - 1];
    const sameEligible = last && last.eligible.join(",") === eligible.join(",");
    if (sameEligible) {
      last.amount += amount;
    } else if (amount > 0) {
      pots.push({ amount, eligible });
    }
    previous = level;
  });
  return pots;
}
function prepareShowdown() {
  const pots = buildSidePots(),
    contested = [];
  pots.forEach((pot) => {
    if (pot.eligible.length === 1) {
      const winner = state.players.find((p) => p.id === pot.eligible[0]);
      winner.chips += pot.amount;
      state.pot -= pot.amount;
    } else if (pot.eligible.length > 1) contested.push(pot);
  });
  state.pots = contested;
  state.currentPotIndex = 0;
  state.selectedWinners = new Set();
  if (!contested.length) {
    state.showdown = false;
    state.pendingNextHand = true;
    return render();
  }
  state.showdown = true;
  render();
}
function awardUncontested(winner) {
  winner.chips += state.pot;
  state.pot = 0;
  state.showdown = false;
  state.pendingNextHand = true;
  state.selectedWinners = new Set();
  render();
}
function awardCurrentPot() {
  const pot = state.pots[state.currentPotIndex],
    eligible = new Set(pot?.eligible || []);
  const ids = [...state.selectedWinners].filter((id) => eligible.has(id));
  if (!pot || !ids.length) return toast("Selecciona al menos un ganador");
  ids.sort(
    (a, b) =>
      ((a - state.dealer + state.players.length) % state.players.length || state.players.length) -
      ((b - state.dealer + state.players.length) % state.players.length || state.players.length),
  );
  const share = Math.floor(pot.amount / ids.length),
    remainder = pot.amount % ids.length;
  ids.forEach((id, i) => {
    state.players.find((p) => p.id === id).chips += share + (i < remainder ? 1 : 0);
  });
  state.pot -= pot.amount;
  state.currentPotIndex++;
  state.selectedWinners = new Set();
  if (state.currentPotIndex < state.pots.length) return render();
  state.showdown = false;
  state.pendingNextHand = true;
  render();
}
function saveBlindConfig() {
  const enabled = document.querySelector("#blindEnabled").checked,
    minutes = Math.round(Number(document.querySelector("#blindMinutes").value)),
    nextSb = Math.round(Number(document.querySelector("#nextSb").value)),
    nextBb = Math.round(Number(document.querySelector("#nextBb").value));
  if (minutes < 1 || minutes > 180) return toast("El intervalo debe ser de 1 a 180 minutos");
  if (nextSb < 1 || nextBb <= nextSb) return toast("La ciega grande debe ser mayor que la pequeña");
  state.blinds = {
    enabled,
    minutes,
    nextSb,
    nextBb,
    remaining: minutes * 60,
    pending: false,
  };
  state.blindMenu = false;
  state.menuOpen = false;
  startBlindTimer();
  render();
  toast(enabled ? "Reloj de ciegas activado" : "Subida automática desactivada");
}
function bind() {
  document.querySelectorAll("[data-go]").forEach(
    (b) =>
      (b.onclick = () => {
        state.screen = b.dataset.go;
        render();
      }),
  );
  const count = document.querySelector("#count");
  if (count) {
    count.oninput = (e) => {
      state.setup.count = Number(e.target.value);
      document.querySelector("#countValue").textContent = state.setup.count + " / 9";
    };
    count.onchange = (e) => {
      saveSetupNames();
      state.setup.count = Number(e.target.value);
      render();
    };
  }
  const blinds = document.querySelector("#blinds");
  if (blinds)
    blinds.onchange = (e) => {
      [state.setup.sb, state.setup.bb] = e.target.value.split(",").map(Number);
    };
  document.querySelector("#start")?.addEventListener("click", startGame);
  document
    .querySelectorAll("[data-action]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          b.dataset.action === "raise"
            ? document.querySelector("#raisePanel").classList.toggle("open")
            : action(b.dataset.action)),
    );
  document.querySelector("#confirmRaise")?.addEventListener("click", doRaise);
  document.querySelectorAll("[data-quick]").forEach(
    (b) =>
      (b.onclick = () => {
        const p = state.players[state.turn],
          input = document.querySelector("#raiseAmount");
        const val =
          b.dataset.quick === "all"
            ? p.bet + p.chips
            : b.dataset.quick === "pot"
              ? state.currentBet + state.pot
              : state.currentBet + Math.ceil(state.pot / 2);
        input.value = Math.min(p.bet + p.chips, Math.max(val, state.currentBet + state.minRaise));
      }),
  );
  document.querySelector("#undoAction")?.addEventListener("click", undoLastAction);
  document.querySelector("#continueStreet")?.addEventListener("click", continueStreet);
  document.querySelector("#menu")?.addEventListener("click", () => {
    state.menuOpen = true;
    render();
  });
  document.querySelector("#closeMenu")?.addEventListener("click", () => {
    state.menuOpen = false;
    render();
  });
  document.querySelector("#openBlinds")?.addEventListener("click", () => {
    state.menuOpen = false;
    state.blindMenu = true;
    render();
  });
  document.querySelector("#backMenu")?.addEventListener("click", () => {
    state.blindMenu = false;
    state.menuOpen = true;
    render();
  });
  document.querySelector("#saveBlinds")?.addEventListener("click", saveBlindConfig);
  document.querySelector("#endGame")?.addEventListener("click", () => {
    state.menuOpen = false;
    state.blinds.enabled = false;
    clearInterval(blindTimer);
    state.screen = "welcome";
    render();
  });
  document.querySelectorAll("[data-winner]").forEach(
    (b) =>
      (b.onclick = () => {
        const id = Number(b.dataset.winner);
        state.selectedWinners.has(id)
          ? state.selectedWinners.delete(id)
          : state.selectedWinners.add(id);
        render();
      }),
  );
  document.querySelector("#awardPot")?.addEventListener("click", awardCurrentPot);
  document.querySelector("#newGame")?.addEventListener("click", () => {
    state.champion = null;
    state.screen = "setup";
    render();
  });
}
function saveSetupNames() {
  state.setup.names = [...document.querySelectorAll(".name-input")].map((x) => x.value);
}
function registerTools() {
  const mc = document.modelContext;
  if (!mc?.registerTool) return;
  const ac = new AbortController();
  const reg = (tool) =>
    Promise.resolve(mc.registerTool(tool, { signal: ac.signal })).catch(() => {});
  reg({
    name: "get_poker_table_state",
    title: "Ver estado de la mesa",
    description: "Devuelve la mano, calle, bote, turno y stacks actuales.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: () => ({
      hand: state.hand,
      street: state.street,
      pot: state.pot,
      turn: state.players[state.turn]?.name,
      players: state.players.map((p) => ({
        name: p.name,
        chips: p.chips,
        folded: p.folded,
      })),
    }),
  });
  reg({
    name: "record_poker_action",
    title: "Registrar acción",
    description: "Registra fold o call/check para el jugador que tiene el turno.",
    inputSchema: {
      type: "object",
      properties: { action: { type: "string", enum: ["fold", "call"] } },
      required: ["action"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: (input) => {
      if (state.screen !== "game") throw new Error("No hay una partida activa");
      if (!input || !["fold", "call"].includes(input.action)) throw new Error("Acción no válida");
      action(input.action);
      return {
        ok: true,
        nextPlayer: state.players[state.turn]?.name,
        pot: state.pot,
      };
    },
  });
}
render();
registerTools();
