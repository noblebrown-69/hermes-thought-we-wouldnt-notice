/**
 * Thought We Wouldn't Notice — dashboard cabinet.
 * Hand-written IIFE. No build step and no network imports.
 * The dashboard loads this file from dashboard/manifest.json.
 *
 * In-game title: Top Sails. Original geometric bugs, original tones.
 */
(function () {
  "use strict";

  var W = 240;
  var H = 320;
  var PLUGIN = "thought-we-wouldnt-notice";
  var API = "/api/plugins/" + PLUGIN;

  var coinListeners = [];
  var pendingAuto = false;
  var pollStarted = false;
  var seenId = 0;
  var overlayMounted = false;
  var sharedBest = 0;

  function noteBest(score) {
    score = Number(score) || 0;
    if (score > sharedBest) sharedBest = score;
  }

  function onCoin(fn) {
    coinListeners.push(fn);
    return function () {
      coinListeners = coinListeners.filter(function (item) { return item !== fn; });
    };
  }

  function emitCoin() {
    pendingAuto = true;
    coinListeners.slice().forEach(function (fn) {
      try { fn(); } catch (err) { /* a listener must not stall the rest */ }
    });
  }

  function ensurePoll() {
    if (pollStarted) return;
    var SDK = window.__HERMES_PLUGIN_SDK__;
    if (!SDK || typeof SDK.fetchJSON !== "function") return;
    pollStarted = true;
    var primed = false;

    function arm(data, fireFresh) {
      var drops = (data && data.drops) || [];
      var latest = data && typeof data.latest === "number" ? data.latest : seenId;
      if (data && typeof data.high_score === "number") noteBest(data.high_score);
      if (fireFresh) {
        var now = Date.now() / 1000;
        var fresh = drops.some(function (drop) {
          return now - Number(drop.created_at || 0) < 20;
        });
        if (fresh) emitCoin();
      } else {
        var newer = drops.some(function (drop) { return drop.id > seenId; });
        if (newer) emitCoin();
      }
      if (latest > seenId) seenId = latest;
    }

    function tick() {
      SDK.fetchJSON(API + "/drops?since=" + (primed ? seenId : 0))
        .then(function (data) {
          arm(data, !primed);
          primed = true;
          setTimeout(tick, 800);
        })
        .catch(function () {
          setTimeout(tick, 2500);
        });
    }

    tick();
  }

  function pad(n) {
    n = Math.max(0, Math.floor(Number(n) || 0));
    var s = String(n);
    while (s.length < 4) s = "0" + s;
    return s;
  }

  function readBest() {
    var local = 0;
    try { local = Number(localStorage.getItem("twwwn-best") || 0); } catch (err) { local = 0; }
    return Math.max(local, sharedBest);
  }

  function publishScore(score) {
    noteBest(score);
    try {
      var best = Number(localStorage.getItem("twwwn-best") || 0);
      if (score > best) localStorage.setItem("twwwn-best", String(score));
    } catch (err) { /* private mode */ }
    var SDK = window.__HERMES_PLUGIN_SDK__;
    if (!SDK || typeof SDK.fetchJSON !== "function") return;
    SDK.fetchJSON(API + "/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: score }),
    }).then(function (data) {
      if (data && typeof data.high_score === "number") noteBest(data.high_score);
    }).catch(function () {});
  }

  function mountCabinet(mount, options) {
    options = options || {};
    mount.textContent = "";

    var cabinet = document.createElement("div");
    cabinet.className = "twwwn-cabinet";
    cabinet.tabIndex = 0;
    cabinet.setAttribute("role", "application");
    cabinet.setAttribute("aria-label", "Top Sails cabinet");

    var marquee = document.createElement("div");
    marquee.className = "twwwn-marquee";
    var marqueeText = document.createElement("span");
    marqueeText.className = "twwwn-marquee-text";
    marqueeText.textContent = "TOP SAILS";
    marquee.appendChild(marqueeText);
    cabinet.appendChild(marquee);

    var bezel = document.createElement("div");
    bezel.className = "twwwn-bezel";
    var canvas = document.createElement("canvas");
    canvas.className = "twwwn-canvas";
    canvas.width = W;
    canvas.height = H;
    var scan = document.createElement("div");
    scan.className = "twwwn-scan";
    bezel.appendChild(canvas);
    bezel.appendChild(scan);
    cabinet.appendChild(bezel);

    var panel = document.createElement("div");
    panel.className = "twwwn-panel";
    var scoreEl = document.createElement("span");
    scoreEl.className = "twwwn-readout";
    var bestEl = document.createElement("span");
    bestEl.className = "twwwn-readout";
    var muteBtn = document.createElement("button");
    muteBtn.type = "button";
    muteBtn.className = "twwwn-btn";
    panel.appendChild(scoreEl);
    panel.appendChild(bestEl);
    panel.appendChild(muteBtn);
    if (options.popup) {
      var closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "twwwn-btn";
      closeBtn.textContent = "BACK";
      closeBtn.addEventListener("click", function () {
        if (typeof options.onClose === "function") options.onClose();
      });
      panel.appendChild(closeBtn);
    }
    cabinet.appendChild(panel);

    var controls = document.createElement("div");
    controls.className = "twwwn-controls";
    cabinet.appendChild(controls);

    var coinBtn = document.createElement("button");
    coinBtn.type = "button";
    coinBtn.className = "twwwn-coin";
    coinBtn.textContent = "INSERT QUARTER";
    cabinet.appendChild(coinBtn);

    var hint = document.createElement("p");
    hint.className = "twwwn-hint";
    hint.textContent = options.popup
      ? "Arrows or WASD move. Space, click, or FIRE shoots. M mutes. Esc closes."
      : "Arrows or WASD move. Space, click, or FIRE shoots. M mutes.";
    cabinet.appendChild(hint);

    var slot = null;
    var inner = null;
    if (options.popup) {
      slot = document.createElement("div");
      slot.className = "twwwn-fit-slot";
      inner = document.createElement("div");
      inner.className = "twwwn-fit-inner";
      inner.appendChild(cabinet);
      slot.appendChild(inner);
      mount.appendChild(slot);
    } else {
      mount.appendChild(cabinet);
    }

    var ctx = canvas.getContext("2d");
    var keys = { left: false, right: false, up: false, down: false, fire: false };
    var muted = false;
    try { muted = localStorage.getItem("twwwn-muted") === "1"; } catch (err) { muted = false; }
    var audio = null;
    var alive = true;
    var timers = [];
    var lastTs = 0;

    var stars = [];
    var i;
    for (i = 0; i < 36; i += 1) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        s: Math.random() * 1.3 + 0.4,
        v: 12 + Math.random() * 28,
      });
    }

    var player = { x: W / 2, y: H - 36 };
    var state = {
      mode: "attract",
      t: 0,
      score: 0,
      best: readBest(),
      lives: 3,
      wave: 1,
      formX: 0,
      formDir: 1,
      enemies: [],
      pbullets: [],
      ebullets: [],
      cool: 0,
      shotIn: 1.2,
      diveIn: 2.4,
      creditT: 0,
      breakT: 0,
      hurt: 0,
      mercy: 0,
      shotEvery: 1.3,
      published: false,
    };

    function syncMute() {
      muteBtn.textContent = muted ? "SOUND OFF" : "SOUND ON";
      muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    }
    syncMute();

    function toggleMute() {
      muted = !muted;
      try { localStorage.setItem("twwwn-muted", muted ? "1" : "0"); } catch (err) { /* ignore */ }
      syncMute();
    }
    muteBtn.addEventListener("click", toggleMute);

    function ensureAudio() {
      if (muted) return null;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!audio) {
        try { audio = new AC(); } catch (err) { return null; }
      }
      if (audio.state === "suspended") {
        audio.resume().catch(function () {});
      }
      return audio;
    }

    function beep(freq, dur, type, gain) {
      if (!alive || muted) return;
      var ac = ensureAudio();
      if (!ac) return;
      try {
        var osc = ac.createOscillator();
        var amp = ac.createGain();
        osc.type = type || "square";
        osc.frequency.value = freq;
        osc.connect(amp);
        amp.connect(ac.destination);
        var now = ac.currentTime;
        var volume = gain || 0.03;
        amp.gain.setValueAtTime(volume, now);
        amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.start(now);
        osc.stop(now + dur);
      } catch (err) { /* a missing audio device stays silent */ }
    }

    function coinSound() {
      beep(880, 0.06, "square", 0.035);
      var id = setTimeout(function () { beep(1320, 0.08, "square", 0.035); }, 80);
      timers.push(id);
    }

    function wavePlan(n) {
      if (n <= 1) {
        return { cols: 5, rows: 3, kinds: ["mite"], queen: false, shot: 1.35, speed: 28 };
      }
      if (n === 2) {
        return { cols: 5, rows: 3, kinds: ["wasp", "mite", "mite"], queen: false, shot: 0.95, speed: 40 };
      }
      return { cols: 4, rows: 2, kinds: ["wasp", "mite"], queen: true, shot: 0.85, speed: 34 };
    }

    function spawn(plan) {
      var enemies = [];
      var margin = 44;
      var gap = plan.cols > 1 ? (W - margin * 2) / (plan.cols - 1) : 0;
      var top = plan.queen ? 78 : 48;
      var r;
      var c;
      for (r = 0; r < plan.rows; r += 1) {
        for (c = 0; c < plan.cols; c += 1) {
          enemies.push({
            kind: plan.kinds[r % plan.kinds.length],
            hp: 1,
            maxHp: 1,
            baseX: margin + c * gap,
            baseY: top + r * 28,
            x: margin + c * gap,
            y: top + r * 28,
            diving: false,
            alive: true,
            w: 16,
            h: 14,
            boss: false,
          });
        }
      }
      if (plan.queen) {
        enemies.push({
          kind: "queen",
          hp: 8,
          maxHp: 8,
          baseX: W / 2,
          baseY: 34,
          x: W / 2,
          y: 34,
          diving: false,
          alive: true,
          w: 30,
          h: 30,
          boss: true,
        });
      }
      state.enemies = enemies;
    }

    function placeFormation() {
      state.enemies.forEach(function (enemy) {
        if (!enemy.alive || enemy.diving) return;
        enemy.x = enemy.baseX + state.formX;
        enemy.y = enemy.baseY + Math.sin(state.t * 1.5 + enemy.baseX * 0.05) * 2;
      });
    }

    function pointsFor(kind) {
      if (kind === "queen") return 800;
      if (kind === "wasp") return 150;
      return 100;
    }

    function bumpScore(amount) {
      state.score += amount;
      if (state.score > state.best) {
        state.best = state.score;
        noteBest(state.score);
        try { localStorage.setItem("twwwn-best", String(state.best)); } catch (err) { /* ignore */ }
      }
    }

    function finishIfNeeded() {
      if (state.published) return;
      if (state.mode !== "win" && state.mode !== "over") return;
      state.published = true;
      publishScore(state.score);
    }

    function beginWave(n) {
      var plan = wavePlan(n);
      state.wave = n;
      state.mode = "playing";
      state.formX = 0;
      state.formDir = 1;
      state.pbullets = [];
      state.ebullets = [];
      state.shotEvery = plan.shot;
      state.shotIn = 1.1;
      state.diveIn = 2.2;
      state.mercy = 0.45;
      state.speed = plan.speed;
      spawn(plan);
      syncCoin();
    }

    function maybeStart() {
      if (!alive) return;
      if (state.mode === "playing" || state.mode === "wavebreak" || state.mode === "credit") return;
      state.mode = "credit";
      state.creditT = 0.7;
      state.score = 0;
      state.lives = 3;
      state.wave = 1;
      state.pbullets = [];
      state.ebullets = [];
      state.enemies = [];
      state.hurt = 0;
      state.mercy = 0;
      state.published = false;
      player.x = W / 2;
      player.y = H - 36;
      coinSound();
      syncCoin();
    }

    function syncCoin() {
      if (state.mode === "playing" || state.mode === "wavebreak" || state.mode === "credit") {
        coinBtn.textContent = "CREDIT IN";
      } else {
        coinBtn.textContent = "INSERT QUARTER";
      }
    }

    coinBtn.addEventListener("click", function () {
      cabinet.focus();
      maybeStart();
    });

    function tryFire() {
      if (state.mode !== "playing" || state.cool > 0) return;
      state.cool = 0.2;
      state.pbullets.push({ x: player.x, y: player.y - 14, vy: -260 });
      beep(740, 0.04, "square", 0.028);
    }

    function hurtPlayer() {
      if (state.mercy > 0 || state.hurt > 0) return;
      state.lives -= 1;
      state.hurt = 1.05;
      state.ebullets = [];
      beep(96, 0.18, "sawtooth", 0.04);
      if (state.lives <= 0) {
        state.mode = "over";
        syncCoin();
        finishIfNeeded();
      }
    }

    function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
      return Math.abs(ax - bx) * 2 < (aw + bw) && Math.abs(ay - by) * 2 < (ah + bh);
    }

    function update(dt) {
      state.t += dt;
      stars.forEach(function (star) {
        star.y += star.v * dt;
        if (star.y > H) {
          star.y = 0;
          star.x = Math.random() * W;
        }
      });
      if (state.cool > 0) state.cool -= dt;
      if (state.hurt > 0) state.hurt -= dt;
      if (state.mercy > 0) state.mercy -= dt;

      if (state.mode === "attract") {
        if (!state.enemies.length) spawn(wavePlan(1));
        state.formX = Math.sin(state.t * 0.9) * 18;
        placeFormation();
        return;
      }
      if (state.mode === "credit") {
        state.creditT -= dt;
        if (state.creditT <= 0) beginWave(1);
        return;
      }
      if (state.mode === "wavebreak") {
        state.breakT -= dt;
        if (state.breakT <= 0) beginWave(state.wave + 1);
        return;
      }
      if (state.mode === "win" || state.mode === "over") return;

      var speed = 120;
      if (keys.left) player.x -= speed * dt;
      if (keys.right) player.x += speed * dt;
      if (keys.up) player.y -= speed * dt;
      if (keys.down) player.y += speed * dt;
      if (player.x < 14) player.x = 14;
      if (player.x > W - 14) player.x = W - 14;
      if (player.y < H * 0.62) player.y = H * 0.62;
      if (player.y > H - 16) player.y = H - 16;
      if (keys.fire) tryFire();

      var span = 16 + state.wave * 4;
      state.formX += state.formDir * (state.speed || 28) * dt;
      if (state.formX > span || state.formX < -span) state.formDir *= -1;
      placeFormation();

      state.diveIn -= dt;
      if (state.wave >= 2 && state.diveIn <= 0) {
        state.diveIn = 2.5;
        var divers = state.enemies.filter(function (enemy) {
          return enemy.alive && !enemy.diving && !enemy.boss;
        });
        if (divers.length) {
          divers[Math.floor(Math.random() * divers.length)].diving = true;
        }
      }

      state.enemies.forEach(function (enemy) {
        if (!enemy.alive || !enemy.diving) return;
        enemy.y += (78 + state.wave * 16) * dt;
        enemy.x += (player.x - enemy.x) * 0.9 * dt;
        if (enemy.y > H + 18) {
          enemy.diving = false;
        }
      });

      state.shotIn -= dt;
      if (state.shotIn <= 0) {
        state.shotIn = state.shotEvery;
        var shooters = state.enemies.filter(function (enemy) { return enemy.alive; });
        shooters.sort(function (a, b) { return b.y - a.y; });
        var shooter = shooters[Math.floor(Math.random() * Math.min(3, shooters.length))];
        if (shooter) {
          if (shooter.boss) {
            [-0.55, 0, 0.55].forEach(function (spread) {
              state.ebullets.push({
                x: shooter.x,
                y: shooter.y + 16,
                vx: spread * 46,
                vy: 78,
              });
            });
          } else {
            state.ebullets.push({
              x: shooter.x,
              y: shooter.y + 8,
              vx: 0,
              vy: 76 + state.wave * 10,
            });
          }
          beep(180, 0.04, "square", 0.02);
        }
      }

      state.pbullets.forEach(function (bullet) { bullet.y += bullet.vy * dt; });
      state.ebullets.forEach(function (bullet) {
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
      });
      state.pbullets = state.pbullets.filter(function (bullet) { return bullet.y > -8; });
      state.ebullets = state.ebullets.filter(function (bullet) {
        return bullet.y < H + 8 && bullet.x > -8 && bullet.x < W + 8;
      });

      state.pbullets = state.pbullets.filter(function (bullet) {
        var kept = true;
        state.enemies.forEach(function (enemy) {
          if (!kept || !enemy.alive) return;
          if (!overlaps(bullet.x, bullet.y, 18, 14, enemy.x, enemy.y, enemy.w, enemy.h)) return;
          kept = false;
          enemy.hp -= 1;
          if (enemy.hp <= 0) {
            enemy.alive = false;
            bumpScore(pointsFor(enemy.kind));
            beep(enemy.boss ? 220 : 520, 0.07, "triangle", 0.04);
          } else {
            beep(340, 0.04, "square", 0.025);
          }
        });
        return kept;
      });

      var aliveCount = state.enemies.filter(function (enemy) { return enemy.alive; }).length;
      if (aliveCount === 0) {
        bumpScore(250);
        if (state.wave >= 3) {
          state.mode = "win";
          beep(523, 0.08, "square", 0.04);
          var cheer = setTimeout(function () { beep(784, 0.12, "square", 0.04); }, 90);
          timers.push(cheer);
          syncCoin();
          finishIfNeeded();
        } else {
          state.mode = "wavebreak";
          state.breakT = 1.15;
          beep(523, 0.06, "square", 0.03);
          var nextTone = setTimeout(function () { beep(659, 0.08, "square", 0.03); }, 70);
          timers.push(nextTone);
          syncCoin();
        }
        return;
      }

      var vulnerable = state.mercy <= 0 && state.hurt <= 0;
      if (vulnerable) {
        state.ebullets = state.ebullets.filter(function (bullet) {
          if (overlaps(bullet.x, bullet.y, 4, 4, player.x, player.y, 10, 12)) {
            hurtPlayer();
            return false;
          }
          return true;
        });
      }
      if (state.mode === "playing" && vulnerable) {
        state.enemies.forEach(function (enemy) {
          if (!enemy.alive || state.mode !== "playing") return;
          if (overlaps(enemy.x, enemy.y, enemy.w, enemy.h, player.x, player.y, 12, 12)) {
            enemy.alive = false;
            bumpScore(pointsFor(enemy.kind));
            hurtPlayer();
          }
        });
      }
    }

    function drawBug(enemy) {
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      var flap = Math.sin(state.t * 8 + enemy.baseX) * 3;
      if (enemy.kind === "queen") {
        ctx.fillStyle = "#e85d75";
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffd6a5";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#1b1020";
        ctx.beginPath();
        ctx.arc(-4, -1, 2, 0, Math.PI * 2);
        ctx.arc(4, -1, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffd6a5";
        ctx.beginPath();
        ctx.moveTo(-6, -10);
        ctx.lineTo(-12, -18);
        ctx.moveTo(6, -10);
        ctx.lineTo(12, -18);
        ctx.stroke();
        ctx.fillStyle = "#ffd6a5";
        ctx.beginPath();
        ctx.arc(-12, -18, 1.6, 0, Math.PI * 2);
        ctx.arc(12, -18, 1.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = enemy.kind === "wasp" ? "#ffb703" : "#3ddecb";
        ctx.beginPath();
        ctx.ellipse(0, 1, 7, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        if (enemy.kind === "wasp") {
          ctx.strokeStyle = "#1b1020";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-5, 0);
          ctx.lineTo(5, 0);
          ctx.moveTo(-4, 3);
          ctx.lineTo(4, 3);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(255,255,255,0.88)";
        ctx.beginPath();
        ctx.ellipse(-5, flap - 3, 5, 2.2, -0.5, 0, Math.PI * 2);
        ctx.ellipse(5, flap - 3, 5, 2.2, 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1b1020";
        ctx.fillRect(-3, -1, 2, 2);
        ctx.fillRect(1, -1, 2, 2);
        ctx.strokeStyle = enemy.kind === "wasp" ? "#ffb703" : "#3ddecb";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-3, -5);
        ctx.lineTo(-7, -12);
        ctx.moveTo(3, -5);
        ctx.lineTo(7, -12);
        ctx.stroke();
      }
      ctx.restore();
      if (enemy.boss) {
        var width = 28;
        ctx.fillStyle = "#3a2030";
        ctx.fillRect(enemy.x - width / 2, enemy.y + 18, width, 3);
        ctx.fillStyle = "#ffd36a";
        ctx.fillRect(enemy.x - width / 2, enemy.y + 18, width * (enemy.hp / enemy.maxHp), 3);
      }
    }

    function drawPlayer() {
      if (state.hurt > 0 && Math.floor(state.t * 14) % 2 === 0) return;
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.fillStyle = "#f4f1de";
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(9, 8);
      ctx.lineTo(0, 3);
      ctx.lineTo(-9, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#5ee0c5";
      ctx.fillRect(-2, -2, 4, 4);
      ctx.fillStyle = "#ff5d8f";
      ctx.fillRect(-7, 6, 3, 4);
      ctx.fillRect(4, 6, 3, 4);
      ctx.restore();
    }

    function drawLife(x, y) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = "#f4f1de";
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(4, 4);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function centerText(text, y, size, color) {
      ctx.fillStyle = color || "#ffe7a3";
      ctx.font = size + "px Courier New, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, W / 2, y);
    }

    function draw() {
      ctx.fillStyle = "#07060f";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#9aa0b4";
      stars.forEach(function (star) {
        ctx.fillRect(star.x, star.y, star.s, star.s);
      });

      state.enemies.forEach(function (enemy) {
        if (enemy.alive) drawBug(enemy);
      });

      ctx.fillStyle = "#ffe66d";
      state.pbullets.forEach(function (bullet) {
        ctx.fillRect(bullet.x - 1, bullet.y - 4, 2, 8);
      });
      state.ebullets.forEach(function (bullet) {
        ctx.save();
        ctx.translate(bullet.x, bullet.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = "#ff6b9a";
        ctx.fillRect(-2, -2, 4, 4);
        ctx.restore();
      });

      drawPlayer();

      ctx.textBaseline = "alphabetic";
      ctx.font = "10px Courier New, monospace";
      ctx.fillStyle = "#d7ecff";
      ctx.textAlign = "left";
      ctx.fillText((state.mode === "attract" ? "BEST " : "SCORE ") + pad(state.mode === "attract" ? state.best : state.score), 8, 14);
      if (state.mode !== "attract") {
        ctx.textAlign = "right";
        ctx.fillText("W" + state.wave, W - 8, 14);
        var life;
        for (life = 0; life < state.lives; life += 1) {
          drawLife(W - 14 - life * 12, 26);
        }
      }

      var blink = Math.floor(state.t * 2) % 2 === 0;
      if (state.mode === "attract") {
        centerText("TOP SAILS", 132, 16, "#9ad7ff");
        if (blink) centerText("INSERT QUARTER", 168, 15, "#ffe7a3");
        centerText("THOUGHT WE WOULDN'T NOTICE", 198, 8, "#d7ecff");
      } else if (state.mode === "credit") {
        centerText("CREDIT 1", 160, 18, "#ffe7a3");
      } else if (state.mode === "wavebreak") {
        centerText("WAVE " + (state.wave + 1), 160, 18, "#9ad7ff");
      } else if (state.mode === "win") {
        centerText("ALL CLEAR", 140, 18, "#9ad7ff");
        centerText("SCORE " + pad(state.score), 166, 12, "#ffe7a3");
        if (blink) centerText("INSERT QUARTER", 196, 12, "#ffe7a3");
        centerText("THOUGHT WE WOULDN'T NOTICE", 220, 8, "#d7ecff");
      } else if (state.mode === "over") {
        centerText("OUT OF CREDITS", 140, 14, "#ff8fab");
        centerText("SCORE " + pad(state.score), 166, 12, "#ffe7a3");
        if (blink) centerText("INSERT QUARTER", 196, 12, "#ffe7a3");
      }

      scoreEl.textContent = "SCORE " + pad(state.score);
      bestEl.textContent = "BEST " + pad(state.best);
    }

    function frame(ts) {
      if (!alive) return;
      if (!lastTs) lastTs = ts;
      var dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      update(dt);
      draw();
      requestAnimationFrame(frame);
    }

    function isActive() {
      var active = document.activeElement;
      return active === cabinet || cabinet.contains(active);
    }

    var KEYS = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
      a: "left",
      d: "right",
      w: "up",
      s: "down",
      A: "left",
      D: "right",
      W: "up",
      S: "down",
      " ": "fire",
    };

    function onKeyDown(event) {
      if (!alive || !isActive()) return;
      if (event.key === "Escape" && options.popup) {
        event.preventDefault();
        if (typeof options.onClose === "function") options.onClose();
        return;
      }
      if ((event.key === "m" || event.key === "M") && !event.repeat) {
        event.preventDefault();
        toggleMute();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        maybeStart();
        return;
      }
      var move = KEYS[event.key];
      if (!move) return;
      if (event.target && event.target.tagName === "BUTTON" && event.key === " ") {
        if (String(event.target.className).indexOf("twwwn-pad") === -1) return;
      }
      keys[move] = true;
      if (move === "fire") maybeStart();
      event.preventDefault();
    }

    function onKeyUp(event) {
      var move = KEYS[event.key];
      if (move) keys[move] = false;
    }

    function releaseMoves() {
      keys.left = false;
      keys.right = false;
      keys.up = false;
      keys.down = false;
      keys.fire = false;
    }

    function holdButton(label, key) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "twwwn-pad";
      button.textContent = label;
      function down(event) {
        event.preventDefault();
        cabinet.focus();
        keys[key] = true;
        if (key === "fire") maybeStart();
      }
      function up() { keys[key] = false; }
      button.addEventListener("pointerdown", down);
      button.addEventListener("pointerup", up);
      button.addEventListener("pointerleave", up);
      button.addEventListener("pointercancel", up);
      return button;
    }

    controls.appendChild(holdButton("LEFT", "left"));
    controls.appendChild(holdButton("FIRE", "fire"));
    controls.appendChild(holdButton("RIGHT", "right"));

    canvas.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      cabinet.focus();
      if (state.mode === "playing") keys.fire = true;
      else maybeStart();
    });
    canvas.addEventListener("pointerup", function () { keys.fire = false; });
    canvas.addEventListener("pointerleave", function () { keys.fire = false; });

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseMoves);

    function fitCabinet() {
      if (!options.popup || !alive || !slot || !inner) return;
      var viewport = mount.closest(".twwwn-popup") || mount;
      inner.style.transform = "none";
      slot.style.width = "";
      slot.style.height = "";
      var cab = inner.querySelector(".twwwn-cabinet");
      var natW = Math.max(inner.offsetWidth, inner.scrollWidth, cab ? cab.offsetWidth : 0);
      var natH = Math.max(inner.offsetHeight, inner.scrollHeight, cab ? cab.offsetHeight : 0);
      var cs = window.getComputedStyle(viewport);
      var availW = viewport.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      var availH = viewport.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
      // Use a percentage of the frame so rounding and borders never clip on any monitor.
      availW *= 0.98;
      availH *= 0.98;
      if (!natW || !natH || !availW || !availH) return;
      var scale = Math.min(availW / natW, availH / natH);
      if (!isFinite(scale) || scale <= 0) scale = 1;
      inner.style.transform = "scale(" + scale + ")";
      slot.style.width = Math.round(natW * scale) + "px";
      slot.style.height = Math.round(natH * scale) + "px";
    }

    if (options.popup) {
      window.addEventListener("resize", fitCabinet);
      if (window.visualViewport) window.visualViewport.addEventListener("resize", fitCabinet);
      requestAnimationFrame(function () {
        fitCabinet();
        requestAnimationFrame(fitCabinet);
      });
      setTimeout(fitCabinet, 50);
    }

    if (options.autoStart) maybeStart();
    else syncCoin();

    if (options.focus !== false) {
      var focusId = setTimeout(function () {
        if (alive) cabinet.focus();
      }, 40);
      timers.push(focusId);
    }

    requestAnimationFrame(frame);

    return {
      start: function () {
        maybeStart();
        cabinet.focus();
      },
      destroy: function () {
        alive = false;
        timers.forEach(function (id) { clearTimeout(id); });
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("blur", releaseMoves);
        if (options.popup) {
          window.removeEventListener("resize", fitCabinet);
          if (window.visualViewport) window.visualViewport.removeEventListener("resize", fitCabinet);
        }
        mount.textContent = "";
      },
    };
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function mountHero(parent) {
    var figure = el("figure", "twwwn-hero");
    figure.id = "twwwn-hero";
    var img = document.createElement("img");
    img.className = "twwwn-hero-img";
    img.alt = "Thought We Wouldn't Notice";
    var fallback = el("div", "twwwn-hero-fallback");
    fallback.hidden = true;
    var sign = el("div", "twwwn-hero-sign", "TOP SAILS");
    var caption = el("p", "twwwn-hero-caption", "Cabinet art loads from assets/banner.jpg");
    fallback.appendChild(sign);
    fallback.appendChild(caption);
    figure.appendChild(img);
    figure.appendChild(fallback);
    parent.appendChild(figure);

    function showFallback() {
      img.hidden = true;
      fallback.hidden = false;
    }

    function showBlob(blob) {
      if (!blob || !String(blob.type || "").startsWith("image/")) {
        showFallback();
        return;
      }
      var url = URL.createObjectURL(blob);
      img.onload = function () {
        URL.revokeObjectURL(url);
      };
      img.onerror = showFallback;
      img.src = url;
    }

    // Raw <img src="/api/plugins/.../banner"> skips the session token and
    // ?profile= for the selected bot, so the hero 401s on loopback and
    // misses a profile-local install. authedFetch is the dashboard SDK path
    // for binary downloads.
    var SDK = window.__HERMES_PLUGIN_SDK__;
    if (SDK && typeof SDK.authedFetch === "function") {
      SDK.authedFetch(API + "/banner")
        .then(function (res) {
          if (!res || !res.ok) throw new Error("banner");
          return res.blob();
        })
        .then(showBlob)
        .catch(showFallback);
      return;
    }
    img.addEventListener("error", showFallback);
    img.src = API + "/banner";
  }

  function mountAboutPage(root, options) {
    options = options || {};
    root.textContent = "";
    var page = el("div", "twwwn-page");
    var story = el("section", "twwwn-story");
    mountHero(story);
    story.appendChild(el("p", "twwwn-kicker", "Thought We Wouldn't Notice"));
    story.appendChild(el("h1", "twwwn-title", "Top Sails"));
    story.appendChild(el("p", "twwwn-copy", "Drop a quarter in chat. 25c, $0.25, or just the word quarter, on its own. The cabinet pops over the dashboard, and the only reply is: Thought we wouldn't notice. But we did."));
    story.appendChild(el("p", "twwwn-copy", "Or skip the coin slot and play Top Sails on this page. Three short waves, one ship, a handful of geometric bugs."));
    var play = el("button", "twwwn-play", "Play Top Sails");
    play.type = "button";
    play.id = "twwwn-play";
    story.appendChild(play);
    var host = el("div", "twwwn-host");
    host.id = "top-sails";
    page.appendChild(story);
    page.appendChild(host);
    root.appendChild(page);
    var game = mountCabinet(host, {
      autoStart: !!options.autoStart,
      popup: false,
      focus: false,
    });
    play.addEventListener("click", function () {
      game.start();
      host.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return {
      start: function () { game.start(); },
      destroy: function () { game.destroy(); root.textContent = ""; },
    };
  }

  function bootHermes() {
    var plugins = window.__HERMES_PLUGINS__;
    var SDK = window.__HERMES_PLUGIN_SDK__;
    if (!plugins || !SDK || !SDK.React || typeof plugins.register !== "function") return;
    var React = SDK.React;
    var hooks = SDK.hooks || {};
    var useState = hooks.useState || React.useState;
    var useEffect = hooks.useEffect || React.useEffect;
    var useRef = hooks.useRef || React.useRef;
    var h = React.createElement;

    function CabinetView(props) {
      var hostRef = useRef(null);
      var closeRef = useRef(props.onClose);
      closeRef.current = props.onClose;
      useEffect(function () {
        var node = hostRef.current;
        if (!node) return undefined;
        var game = mountCabinet(node, {
          autoStart: !!props.autoStart,
          popup: !!props.popup,
          onClose: function () {
            if (typeof closeRef.current === "function") closeRef.current();
          },
        });
        return function () { game.destroy(); };
      }, [props.autoStart, props.popup]);
      return h("div", { ref: hostRef, className: "twwwn-host" });
    }

    function CabinetPage() {
      var hostRef = useRef(null);
      useEffect(function () {
        var node = hostRef.current;
        if (!node) return undefined;
        ensurePoll();
        var page = mountAboutPage(node, { autoStart: false });
        function claim() {
          if (overlayMounted || !pendingAuto) return;
          pendingAuto = false;
          page.start();
        }
        var unsub = onCoin(claim);
        claim();
        return function () {
          unsub();
          page.destroy();
        };
      }, []);
      return h("div", { ref: hostRef });
    }

    function CabinetOverlay() {
      overlayMounted = true;
      var openState = useState(false);
      var open = openState[0];
      var setOpen = openState[1];
      var tokenState = useState(0);
      var token = tokenState[0];
      var setToken = tokenState[1];
      useEffect(function () {
        overlayMounted = true;
        ensurePoll();
        function claim() {
          if (!pendingAuto) return;
          pendingAuto = false;
          setToken(function (n) { return n + 1; });
          setOpen(true);
        }
        var unsub = onCoin(claim);
        claim();
        return function () {
          overlayMounted = false;
          unsub();
        };
      }, []);
      if (!open) return null;
      return h("div", {
        className: "twwwn-popup",
        onClick: function () { setOpen(false); },
      }, h("div", {
        className: "twwwn-popup-card",
        onClick: function (event) { event.stopPropagation(); },
      }, h(CabinetView, {
        key: token,
        autoStart: true,
        popup: true,
        onClose: function () { setOpen(false); },
      })));
    }

    plugins.register(PLUGIN, CabinetPage);
    if (typeof plugins.registerSlot === "function") {
      plugins.registerSlot(PLUGIN, "overlay", CabinetOverlay);
    }
  }

  function bootStandalone() {
    var node = document.getElementById("twwwn-standalone");
    if (!node) return;
    if (node.getAttribute("data-popup") === "1") {
      mountCabinet(node, {
        autoStart: true,
        popup: true,
        focus: true,
        onClose: function () {
          try { parent.postMessage({ type: "twwwn-close" }, "*"); } catch (err) { /* not framed */ }
        },
      });
      window.addEventListener("keydown", function (event) {
        if (event.key !== "Escape" && event.key !== "Esc") return;
        event.preventDefault();
        event.stopPropagation();
        try { parent.postMessage({ type: "twwwn-close" }, "*"); } catch (err) { /* not framed */ }
      }, true);
      return;
    }
    mountAboutPage(node, { autoStart: false });
  }

  bootHermes();
  bootStandalone();
})();
