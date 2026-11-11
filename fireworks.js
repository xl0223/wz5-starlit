/* 夜空 · 烟花引擎（纯 canvas，零依赖） */
(function (global) {
  'use strict';

  var canvas, ctx;
  var W = 0, H = 0, DPR = 1;
  var stars = [], rockets = [], sparks = [], glows = [];
  var last = 0, autoOn = false, nextAuto = 0, finaleQueue = [];
  var PALETTE = ['#ffd591', '#ffb27a', '#ff9bb0', '#e8a5ff', '#b48cff', '#cfe6ff', '#fff2cf'];

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildStars();
  }

  function buildStars() {
    stars = [];
    var n = Math.round(Math.min(300, (W * H) / 5200));
    for (var i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: rand(0.35, 1.5),
        a: rand(0.18, 0.8),
        tw: rand(0.0006, 0.0028),
        ph: Math.random() * 6.28,
        depth: Math.random()
      });
    }
  }

  function addGlow(x, y, color, radius, life) {
    glows.push({ x: x, y: y, color: color, r: radius, life: life || 1, decay: 0.035 });
  }

  function drawHeart(c, x, y, s, rot) {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.beginPath();
    c.moveTo(0, s * 0.42);
    c.bezierCurveTo(s * 0.98, -s * 0.16, s * 0.56, -s * 1.08, 0, -s * 0.44);
    c.bezierCurveTo(-s * 0.56, -s * 1.08, -s * 0.98, -s * 0.16, 0, s * 0.42);
    c.closePath();
    c.fill();
    c.restore();
  }

  function spawnSpark(x, y, o) {
    sparks.push({
      x: x, y: y,
      vx: o.vx, vy: o.vy,
      life: 1,
      decay: o.decay || 0.012,
      size: o.size || 1.6,
      color: o.color,
      gravity: o.gravity == null ? 0.028 : o.gravity,
      drag: o.drag == null ? 0.986 : o.drag,
      flick: Math.random() < 0.3,
      heart: !!o.heart,
      rot: o.rot || 0,
      vr: o.vr || 0
    });
  }

  function explode(x, y, opts) {
    opts = opts || {};
    var count = opts.count || 84;
    var power = opts.power || 5.4;
    var base = opts.color || pick(PALETTE);
    var second = opts.color2 || (Math.random() < 0.6 ? pick(PALETTE) : base);
    var ring = Math.random() < 0.35;
    for (var i = 0; i < count; i++) {
      var ang = (i / count) * Math.PI * 2 + rand(-0.06, 0.06);
      var spd = power * (ring ? rand(0.9, 1.05) : rand(0.35, 0.95));
      spawnSpark(x, y, {
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        color: Math.random() < 0.62 ? base : second,
        size: rand(1.1, 2.6),
        decay: rand(0.007, 0.014),
        gravity: opts.gravity == null ? 0.03 : opts.gravity
      });
    }
    // 中心闪光
    addGlow(x, y, base, power * 9, 1);
  }

  function launch(x, y, opts) {
    opts = opts || {};
    rockets.push({
      x: x == null ? rand(W * 0.15, W * 0.85) : x,
      y: H + 12,
      ty: y == null ? rand(H * 0.12, H * 0.45) : y,
      vy: 0,
      t: 0,
      dur: opts.dur || rand(58, 78),
      color: opts.color || pick(PALETTE),
      trail: opts.trail == null ? 1 : opts.trail
    });
  }

  function updateRockets(dt) {
    for (var i = rockets.length - 1; i >= 0; i--) {
      var r = rockets[i];
      r.t += dt;
      var p = Math.min(1, r.t / r.dur);
      var ease = 1 - Math.pow(1 - p, 2.2);
      var ny = (H + 12) + (r.ty - (H + 12)) * ease;
      r.vy = (ny - r.y) / Math.max(0.001, dt);
      r.y = ny;
      if (r.trail) {
        spawnSpark(r.x + rand(-1, 1), r.y, {
          vx: rand(-0.25, 0.25), vy: rand(0.4, 1.4),
          color: r.color, size: rand(0.8, 1.7), decay: 0.035, gravity: 0.01, drag: 0.96
        });
      }
      if (p >= 1) {
        explode(r.x, r.y, { color: r.color, count: 70 + Math.round(rand(0, 40)), power: rand(4.4, 6.6) });
        rockets.splice(i, 1);
      }
    }
  }

  function updateSparks(dt) {
    for (var i = sparks.length - 1; i >= 0; i--) {
      var s = sparks[i];
      s.vy += s.gravity * dt;
      s.vx *= Math.pow(s.drag, dt);
      s.vy *= Math.pow(s.drag, dt);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= s.decay * dt;
      if (s.life <= 0 || s.y > H + 60) { sparks.splice(i, 1); continue; }
      var a = Math.max(0, s.life);
      if (s.flick) a *= rand(0.55, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = s.color;
      if (s.heart) {
        s.rot += s.vr * dt;
        drawHeart(ctx, s.x, s.y, s.size * (0.5 + a * 0.6), s.rot);
      } else {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * (0.45 + a * 0.75), 0, 6.283);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function updateGlows(dt) {
    for (var i = glows.length - 1; i >= 0; i--) {
      var g = glows[i];
      g.life -= g.decay * dt;
      if (g.life <= 0) { glows.splice(i, 1); continue; }
      var a = g.life * g.life;
      var grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
      grad.addColorStop(0, g.color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawStars(t) {
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var a = s.a * (0.55 + 0.45 * Math.sin(t * s.tw + s.ph));
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = '#eaf1ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function frame(t) {
    requestAnimationFrame(frame);
    var dt = last ? Math.min(3.2, (t - last) / 16.667) : 1;
    last = t;

    // 用擦除做拖尾，保留页面背景
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    drawStars(t);
    updateGlows(dt);
    updateRockets(dt);
    updateSparks(dt);

    // 自动烟花
    if (autoOn && t > nextAuto) {
      launch(null, null, {});
      nextAuto = t + rand(1600, 4200);
    }
    // 结尾连发队列
    if (finaleQueue.length && t > finaleQueue[0].at) {
      var q = finaleQueue.shift();
      launch(q.x, q.y, { color: q.color, dur: q.dur });
    }
  }

  function settle() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  var api = {
    init: function (el) {
      canvas = el;
      ctx = canvas.getContext('2d');
      resize();
      window.addEventListener('resize', function () { resize(); settle(); });
      requestAnimationFrame(frame);
    },
    auto: function (on, delay) {
      autoOn = !!on;
      if (on) nextAuto = performance.now() + (delay == null ? 900 : delay);
    },
    launch: launch,
    burst: function (x, y) {
      explode(x, y, { count: 46, power: 3.8 });
    },
    heartBurst: function (x, y) {
      var cols = ['#ff9bb0', '#ffd591', '#ffc2d1', '#f7a8c4', '#ffe3b8'];
      for (var i = 0; i < 30; i++) {
        var ang = -Math.PI / 2 + rand(-0.95, 0.95);
        var spd = rand(2.4, 6.2);
        sparks.push({
          x: x, y: y,
          vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
          life: 1, decay: rand(0.007, 0.014),
          size: rand(3.4, 7.5),
          color: cols[(Math.random() * cols.length) | 0],
          gravity: 0.011, drag: 0.986,
          flick: false, heart: true,
          rot: rand(-0.6, 0.6), vr: rand(-0.05, 0.05)
        });
      }
      addGlow(x, y, '#ffb3c4', 90, 1);
    },
    // 结尾：从心形中心连续炸开
    finale: function (cx, cy) {
      var now = performance.now();
      finaleQueue = [];
      var rounds = 16;
      for (var i = 0; i < rounds; i++) {
        finaleQueue.push({
          at: now + 120 + i * 250 + Math.random() * 130,
          x: cx + rand(-W * 0.36, W * 0.36),
          y: cy + rand(-H * 0.32, H * 0.14),
          color: pick(PALETTE)
        });
      }
      // 中心大爆炸
      setTimeout(function () {
        explode(cx, cy, { count: 170, power: 9.2, color: '#fff2cf', color2: '#ffd591' });
      }, 60);
      autoOn = true;
    },
    clear: function () { rockets.length = 0; finaleQueue = []; }
  };

  global.Fireworks = api;
})(window);
