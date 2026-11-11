/* 五周年 · 暗夜烟花心形照片墙 */
(function () {
  'use strict';

  var DATA = (window.__PHOTOS__ && window.__PHOTOS__.items) || [];
  var COUNT = DATA.length;

  var stage = document.getElementById('stage');
  var world = document.getElementById('world');
  var intro = document.getElementById('intro');
  var finaleEl = document.getElementById('finale');
  var flashEl = document.getElementById('flash');
  var coreEl = document.getElementById('core');
  var toolbar = document.getElementById('toolbar');
  var hint = document.getElementById('hint');
  var introCount = document.getElementById('intro-count');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var QS = new URLSearchParams(location.search);
  if (QS.get('snap') === '1') document.documentElement.classList.add('snap');

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rnd = mulberry32(20260109 + (parseInt(QS.get('seed') || '0', 10) || 0) * 7919);

  /* ---------- 心形几何 ---------- */
  var TAU = Math.PI * 2;
  var UNIT = 56;

  function heartPt(t) {
    var x = 16 * Math.pow(Math.sin(t), 3);
    var y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return [x * UNIT, (-y - 2.7) * UNIT];
  }

  var CURVE = (function () {
    var N = 2400, pts = [], cum = [0], i, p, dx, dy;
    for (i = 0; i <= N; i++) {
      p = heartPt((i / N) * TAU);
      pts.push(p);
      if (i) {
        dx = p[0] - pts[i - 1][0];
        dy = p[1] - pts[i - 1][1];
        cum.push(cum[i - 1] + Math.hypot(dx, dy));
      }
    }
    return { pts: pts, cum: cum, total: cum[N] };
  })();

  function atU(u) {
    u = ((u % 1) + 1) % 1;
    var target = u * CURVE.total;
    var lo = 0, hi = CURVE.cum.length - 1, mid;
    while (lo < hi - 1) {
      mid = (lo + hi) >> 1;
      if (CURVE.cum[mid] <= target) lo = mid; else hi = mid;
    }
    var span = (CURVE.cum[hi] - CURVE.cum[lo]) || 1;
    var f = (target - CURVE.cum[lo]) / span;
    var a = CURVE.pts[lo], b = CURVE.pts[hi];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }

  var POLY = (function () {
    var out = [], step = Math.max(1, Math.round(CURVE.pts.length / 240));
    for (var i = 0; i < CURVE.pts.length - 1; i += step) out.push(CURVE.pts[i]);
    return out;
  })();

  var ANGLE_BINS = 720;
  var R_BY_ANGLE = (function () {
    var arr = new Float64Array(ANGLE_BINS), i, x, y, ang, bin, r;
    for (i = 0; i < CURVE.pts.length; i++) {
      x = CURVE.pts[i][0]; y = CURVE.pts[i][1];
      ang = Math.atan2(y, x);
      bin = Math.floor(((ang + Math.PI) / TAU) * ANGLE_BINS) % ANGLE_BINS;
      r = Math.hypot(x, y);
      if (r > arr[bin]) arr[bin] = r;
    }
    for (var pass = 0; pass < 2; pass++) {
      for (var b = 0; b < ANGLE_BINS; b++) {
        if (!arr[b]) arr[b] = arr[(b + ANGLE_BINS - 1) % ANGLE_BINS] || arr[(b + 1) % ANGLE_BINS] || 1;
      }
    }
    return arr;
  })();

  function depthOf(x, y) {
    var ang = Math.atan2(y, x);
    var bin = Math.floor(((ang + Math.PI) / TAU) * ANGLE_BINS) % ANGLE_BINS;
    return Math.hypot(x, y) / (R_BY_ANGLE[bin] || 1);
  }

  function inside(x, y) {
    var c = false;
    for (var i = 0, j = POLY.length - 1; i < POLY.length; j = i++) {
      var xi = POLY[i][0], yi = POLY[i][1], xj = POLY[j][0], yj = POLY[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  function pullInside(x, y) {
    if (inside(x, y)) return [x, y];
    var lo = 0, hi = 1, m;
    for (var k = 0; k < 22; k++) {
      m = (lo + hi) / 2;
      if (inside(x * m, y * m)) lo = m; else hi = m;
    }
    return [x * lo, y * lo];
  }

  /* ---------- 泊松填充 ---------- */
  function poissonInHeart(count, minDist, maxDepth) {
    var pts = [], cell = minDist / Math.SQRT2, grid = new Map(), guard = 0;
    function hasNeighbor(x, y) {
      var gx = Math.floor(x / cell), gy = Math.floor(y / cell);
      for (var i = gx - 2; i <= gx + 2; i++) {
        for (var j = gy - 2; j <= gy + 2; j++) {
          var bucket = grid.get(i + ':' + j);
          if (!bucket) continue;
          for (var k = 0; k < bucket.length; k++) {
            var dx = bucket[k][0] - x, dy = bucket[k][1] - y;
            if (dx * dx + dy * dy < minDist * minDist) return true;
          }
        }
      }
      return false;
    }
    while (pts.length < count && guard < 120000) {
      guard++;
      var x = (rnd() * 2 - 1) * 980;
      var y = (rnd() * 2 - 1) * 900;
      if (!inside(x, y) || depthOf(x, y) > maxDepth || hasNeighbor(x, y)) continue;
      pts.push([x, y]);
      var key = Math.floor(x / cell) + ':' + Math.floor(y / cell);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push([x, y]);
    }
    return pts;
  }

  /* ---------- 布局 ---------- */
  var layout = [];
  var MAX_W = 430, MIN_H = 96;
  var figures = [];
  var maxDist = 1;

  function buildLayout() {
    var n = COUNT;
    var nEdge = Math.round(n * 0.5);
    var nInner = n - nEdge;
    var items = [];
    var mobileBoost = window.innerWidth < 760 ? 1.4 : 1;
    var areaPer = 1600000 / Math.max(1, nInner);
    var innerPts = poissonInHeart(nInner, Math.sqrt(areaPer) * 1.02, 0.9);

    for (var i = 0; i < n; i++) {
      var edge = i < nEdge;
      var x, y, k, seq;
      if (edge) {
        var u = (i + 0.4) / nEdge + (rnd() - 0.5) * 0.006;
        var p = atU(u);
        k = 1.0 + rnd() * 0.045;
        x = p[0] * k;
        y = p[1] * k;
        seq = i;
      } else {
        var sp = innerPts[i - nEdge] || [0, 0];
        x = sp[0]; y = sp[1];
        seq = nEdge + (i - nEdge);
      }

      var ar = DATA[i].ar || (DATA[i].w / DATA[i].h) || 0.75;
      var baseH = (edge ? 168 + rnd() * 82 : 116 + rnd() * 64) * mobileBoost;
      var h = baseH, w = h * ar;
      if (w > MAX_W) { w = MAX_W; h = w / ar; }
      if (h < MIN_H) { h = MIN_H; w = h * ar; }
      if (w < 72) { w = 72; h = w / ar; }

      items.push({
        index: i, edge: edge, seq: seq,
        x: x, y: y,
        w: Math.round(w), h: Math.round(h),
        r: (rnd() - 0.5) * (edge ? 15 : 11),
        z: edge ? (60 + rnd() * 210) : (-400 + rnd() * 250),
        rad: Math.max(w, h) * (edge ? 0.32 : 0.36)
      });
    }

    // 推开重叠
    for (var iter = 0; iter < 80; iter++) {
      var moved = 0;
      for (var a = 0; a < items.length; a++) {
        for (var b = a + 1; b < items.length; b++) {
          var A = items[a], B = items[b];
          if (A.edge && B.edge) continue;
          var dx = B.x - A.x, dy = B.y - A.y;
          var d2 = dx * dx + dy * dy;
          var minD = (A.rad + B.rad) * 0.94;
          if (d2 < minD * minD && d2 > 1) {
            var d = Math.sqrt(d2);
            var push = (minD - d) * 0.34;
            var ux = dx / d, uy = dy / d;
            var wa = A.edge ? 0.12 : 1, wb = B.edge ? 0.12 : 1;
            var tot = wa + wb;
            A.x -= ux * push * (wa / tot) * 2;
            A.y -= uy * push * (wa / tot) * 2;
            B.x += ux * push * (wb / tot) * 2;
            B.y += uy * push * (wb / tot) * 2;
            moved += push;
          }
        }
      }
      for (var c = 0; c < items.length; c++) {
        var it = items[c];
        if (!inside(it.x, it.y)) {
          var q = pullInside(it.x, it.y);
          it.x = q[0]; it.y = q[1];
        }
      }
      if (moved < 0.3) break;
    }

    layout = items;
    maxDist = 1;
    for (var m = 0; m < items.length; m++) {
      maxDist = Math.max(maxDist, Math.hypot(items[m].x, items[m].y));
    }
  }

  /* ---------- 渲染 ---------- */
  var failedImages = 0;

  function showAssetWarning() {
    if (document.getElementById('asset-warning')) return;
    var box = document.createElement('div');
    box.id = 'asset-warning';
    box.innerHTML =
      '<b>照片没有加载出来</b>' +
      '<span>请确认整个文件夹是完整解压的：<code>index.html</code> 要与 <code>assets</code> 文件夹在同一目录。' +
      '直接从压缩包里双击打开是看不到图的。</span>';
    document.body.appendChild(box);
  }

  function hexDate(d) {
    if (!d) return '';
    var m = String(d).match(/(\d{4})[:\-](\d{2})[:\-](\d{2})/);
    return m ? m[1] + '.' + m[2] + '.' + m[3] : '';
  }

  function render() {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < layout.length; i++) {
      var it = layout[i];
      var p = DATA[it.index];

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'photo' + (it.z < -230 ? ' far' : it.z > 210 ? ' near' : '');
      btn.style.width = it.w + 'px';
      btn.style.height = it.h + 'px';
      btn.style.marginLeft = (-it.w / 2) + 'px';
      btn.style.marginTop = (-it.h / 2) + 'px';
      btn.style.zIndex = String(600 + Math.round(it.z));
      btn.style.setProperty('--dur', (9 + rnd() * 6).toFixed(2) + 's');
      btn.style.setProperty('--delay', (-rnd() * 10).toFixed(2) + 's');
      btn.dataset.i = String(it.index);
      btn.setAttribute('aria-label', '查看第 ' + (it.index + 1) + ' 张照片' + (hexDate(p.date) ? '，' + hexDate(p.date) : ''));

      var target = 'translate3d(' + it.x.toFixed(2) + 'px,' + it.y.toFixed(2) + 'px,' + it.z.toFixed(0) + 'px) rotate(' + it.r.toFixed(2) + 'deg)';
      btn._target = target;
      btn._seq = it.seq;
      btn._dist = Math.hypot(it.x, it.y);
      btn._tx = it.x; btn._ty = it.y; btn._tz = it.z; btn._tr = it.r;
      btn.style.transform = target;

      var drift = document.createElement('span');
      drift.className = 'drift';
      var frame = document.createElement('span');
      frame.className = 'frame';
      var img = document.createElement('img');
      img.src = p.thumb;
      img.width = it.w;
      img.height = it.h;
      img.alt = '我们的第 ' + (it.index + 1) + ' 张回忆';
      img.loading = i < 30 ? 'eager' : 'lazy';
      img.decoding = 'async';
      img.draggable = false;
      (function (imgEl, src) {
        imgEl.addEventListener('error', function () {
          if (!imgEl.dataset.retried) {
            imgEl.dataset.retried = '1';
            setTimeout(function () { imgEl.src = src + '?retry=1'; }, 700);
            return;
          }
          failedImages++;
          if (failedImages === 5) showAssetWarning();
        });
      })(img, p.thumb);

      frame.appendChild(img);
      drift.appendChild(frame);
      btn.appendChild(drift);
      frag.appendChild(btn);
      figures.push(btn);
    }
    world.appendChild(frag);
  }

  function drawHeartOutline() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'heart-line');
    svg.setAttribute('width', '2000');
    svg.setAttribute('height', '1880');
    svg.setAttribute('viewBox', '-1000 -940 2000 1880');
    svg.setAttribute('aria-hidden', 'true');
    var d = '';
    for (var i = 0; i < 220; i++) {
      var pt = atU(i / 220);
      d += (i ? 'L' : 'M') + pt[0].toFixed(1) + ' ' + pt[1].toFixed(1);
    }
    d += 'Z';
    var fill = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    fill.setAttribute('d', d);
    fill.setAttribute('class', 'fill');
    var stroke = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    stroke.setAttribute('d', d);
    stroke.setAttribute('class', 'stroke');
    svg.appendChild(fill);
    svg.appendChild(stroke);
    world.appendChild(svg);
    return svg;
  }

  /* ---------- 视图 ---------- */
  var view = { zoom: 1, px: 0, py: 0, rx: 0, ry: 0 };
  var cur = { zoom: 1, px: 0, py: 0, rx: 0, ry: 0 };
  var MIN_ZOOM = 0.1, MAX_ZOOM = 3.2;
  var lastTransform = '';
  var FIT_W = 2480, FIT_H = 2540;

  function fitZoom() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var z = Math.min(vw / FIT_W, vh / FIT_H);
    if (vw < 760) z = Math.max(z, 0.225);
    return clamp(z, MIN_ZOOM, MAX_ZOOM);
  }

  function apply() {
    var t = 'translate3d(' + cur.px.toFixed(2) + 'px,' + cur.py.toFixed(2) + 'px,0) scale(' + cur.zoom.toFixed(4) + ') rotateX(' + cur.rx.toFixed(3) + 'deg) rotateY(' + cur.ry.toFixed(3) + 'deg)';
    if (t !== lastTransform) { world.style.transform = t; lastTransform = t; }
  }

  var rafId = 0;
  function tick() {
    var k = 0.15, done = true;
    ['zoom', 'px', 'py', 'rx', 'ry'].forEach(function (key) {
      var d = view[key] - cur[key];
      if (Math.abs(d) > 0.0008) { cur[key] += d * k; done = false; }
      else cur[key] = view[key];
    });
    apply();
    rafId = done ? 0 : requestAnimationFrame(tick);
  }
  function kick() { if (!rafId) rafId = requestAnimationFrame(tick); }

  function zoomAt(clientX, clientY, factor) {
    var rect = stage.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var ox = clientX - cx - view.px;
    var oy = clientY - cy - view.py;
    var nz = clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    var ratio = nz / view.zoom;
    view.px = clientX - cx - ox * ratio;
    view.py = clientY - cy - oy * ratio;
    view.zoom = nz;
    kick();
  }

  /* ---------- 手势 ---------- */
  var pointers = new Map();
  var dragMoved = 0, pinchStart = null, downTarget = null;
  var vel = { x: 0, y: 0 }, lastMove = 0;

  stage.addEventListener('pointerdown', function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      downTarget = e.target;
      dragMoved = 0; vel.x = 0; vel.y = 0;
      stage.classList.add('dragging');
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    } else if (pointers.size === 2) {
      var pts = Array.from(pointers.values());
      pinchStart = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        zoom: view.zoom
      };
    }
  });

  stage.addEventListener('pointermove', function (e) {
    var prev = pointers.get(e.pointerId);
    if (!prev) return;
    var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    var now = performance.now();
    var dtm = Math.max(1, now - lastMove);
    lastMove = now;
    prev.x = e.clientX; prev.y = e.clientY;
    dragMoved += Math.abs(dx) + Math.abs(dy);
    vel.x = dx / dtm; vel.y = dy / dtm;

    if (pointers.size === 2 && pinchStart) {
      var pts = Array.from(pointers.values());
      var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchStart.dist > 10) {
        view.zoom = clamp(pinchStart.zoom * (dist / pinchStart.dist), MIN_ZOOM, MAX_ZOOM);
        kick();
      }
      return;
    }
    view.px += dx;
    view.py += dy;
    kick();
  });

  function endPointer(e) {
    var wasDrag = dragMoved;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size === 0) {
      stage.classList.remove('dragging');
      if (wasDrag < 9 && downTarget) {
        var hit = downTarget.closest ? downTarget.closest('.photo') : null;
        if (hit) openLightbox(parseInt(hit.dataset.i, 10) || 0);
      }
      downTarget = null;
      if (wasDrag > 9) fling();
    }
    try { stage.releasePointerCapture(e.pointerId); } catch (err) {}
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  stage.addEventListener('lostpointercapture', endPointer);

  function fling() {
    var mx = Math.abs(vel.x), my = Math.abs(vel.y);
    if (mx < 0.02 && my < 0.02) return;
    view.px += vel.x * 14;
    view.py += vel.y * 14;
    vel.x *= 0.86; vel.y *= 0.86;
    kick();
    setTimeout(function () { if (Math.abs(vel.x) > 0.004 || Math.abs(vel.y) > 0.004) fling(); }, 16);
  }

  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  stage.addEventListener('mousemove', function (e) {
    if (reduceMotion) return;
    var nx = (e.clientX / window.innerWidth - 0.5) * 2;
    var ny = (e.clientY / window.innerHeight - 0.5) * 2;
    view.rx = -ny * 2.6;
    view.ry = nx * 3.2;
    kick();
  });
  stage.addEventListener('mouseleave', function () { view.rx = 0; view.ry = 0; kick(); });

  stage.addEventListener('click', function (e) {
    if (e.detail !== 0) return;
    var el = e.target.closest ? e.target.closest('.photo') : null;
    if (el) openLightbox(parseInt(el.dataset.i, 10) || 0);
  });

  // 空白处点击 → 小烟花
  var lastBurst = 0;
  stage.addEventListener('click', function (e) {
    if (e.detail === 0) return;
    if (document.body.classList.contains('collapsing') || !finaleEl.hidden) return;
    if (e.target.closest && e.target.closest('.photo')) return;
    var now = performance.now();
    if (now - lastBurst < 260) return;
    lastBurst = now;
    if (window.Fireworks) window.Fireworks.burst(e.clientX, e.clientY);
  });

  window.addEventListener('resize', function () { kick(); });

  /* ---------- 入场 ---------- */
  var entered = false;

  function entrance() {
    var snap = QS.get('snap') === '1';
    figures.forEach(function (el) {
      el.style.transition = 'none';
      el.style.transform = 'translate3d(0,0,0) scale(.14) rotate(0deg)';
      el.style.opacity = '0';
      el.classList.remove('in');
    });
    void stage.offsetHeight;
    if (snap) {
      figures.forEach(function (el) {
        el.style.transition = 'none';
        el.style.transform = el._target;
        el.style.opacity = '1';
        el.classList.add('in');
      });
      return;
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        figures.forEach(function (el) {
          var d = (el._seq * 0.026).toFixed(3);
          el.style.transition = 'transform 1.25s cubic-bezier(.16,1,.3,1), opacity .85s ease';
          el.style.transitionDelay = d + 's';
          el.style.transform = el._target;
          el.style.opacity = '1';
          el.classList.add('in');
        });
        setTimeout(function () {
          figures.forEach(function (el) { el.style.transitionDelay = '0s'; });
        }, 1200 + figures.length * 26 + 260);
      });
    });
  }

  function enterScene() {
    if (entered) return;
    entered = true;
    if (trackIndex < 0) playTrack(0);
    intro.classList.add('hide');
    document.body.classList.remove('locked');
    document.body.classList.remove('intro-open');
    if (window.Fireworks) window.Fireworks.auto(true, 500);
    entrance();
    setTimeout(function () {
      var hl = document.querySelector('.heart-line');
      if (hl) hl.classList.add('show');
    }, 500);
    setTimeout(function () {
      toolbar.classList.add('on');
      hint.classList.remove('hide');
    }, 1500);
  }

  /* ---------- 照片粒子消散 ---------- */
  var dustCanvas = document.getElementById('dust');
  var dustCtx = dustCanvas ? dustCanvas.getContext('2d') : null;
  var dustDPR = 1, dustW = 0, dustH = 0;
  var dustParts = [], dustStart = 0, dustRAF = 0, dustOnDone = null;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function resizeDust() {
    if (!dustCanvas) return;
    dustDPR = Math.min(window.devicePixelRatio || 1, 2);
    dustW = window.innerWidth; dustH = window.innerHeight;
    dustCanvas.width = Math.round(dustW * dustDPR);
    dustCanvas.height = Math.round(dustH * dustDPR);
    dustCanvas.style.width = dustW + 'px';
    dustCanvas.style.height = dustH + 'px';
    dustCtx.setTransform(dustDPR, 0, 0, dustDPR, 0, 0);
  }

  // 把照片缩成小图取色，得到每格的颜色
  function samplePhoto(img, w, h, cols) {
    try {
      if (!img || !img.naturalWidth) return null;
      var sw = 28, sh = Math.max(6, Math.round(28 * h / w));
      var c = document.createElement('canvas');
      c.width = sw; c.height = sh;
      var g = c.getContext('2d');
      g.drawImage(img, 0, 0, sw, sh);
      var data = g.getImageData(0, 0, sw, sh).data;
      var out = [];
      for (var gy = 0; gy < cols; gy++) {
        for (var gx = 0; gx < cols; gx++) {
          var px = Math.min(sw - 1, Math.floor((gx + 0.5) / cols * sw));
          var py = Math.min(sh - 1, Math.floor((gy + 0.5) / cols * sh));
          var i = (py * sw + px) * 4;
          if (data[i + 3] < 36) continue;
          var cr = Math.min(255, Math.round(data[i] * 1.2)) | 0;
          var cg = Math.min(255, Math.round(data[i + 1] * 1.2)) | 0;
          var cb = Math.min(255, Math.round(data[i + 2] * 1.2)) | 0;
          out.push({
            dx: ((gx + 0.5) / cols - 0.5) * w,
            dy: ((gy + 0.5) / cols - 0.5) * h,
            color: 'rgb(' + cr + ',' + cg + ',' + cb + ')'
          });
        }
      }
      return out.length ? out : null;
    } catch (e) {
      return null; // file:// 下 canvas 被跨源污染时走配色兜底
    }
  }

  function fallbackPoints(w, h, cols) {
    var pal = ['#f6d3a2', '#ef9fb0', '#cbb0f7', '#fff0d6', '#e8c58f', '#f7c7d4'];
    var out = [];
    for (var gy = 0; gy < cols; gy++) {
      for (var gx = 0; gx < cols; gx++) {
        out.push({
          dx: ((gx + 0.5) / cols - 0.5) * w,
          dy: ((gy + 0.5) / cols - 0.5) * h,
          color: pal[(gx * 3 + gy) % pal.length]
        });
      }
    }
    return out;
  }

  function spawnDust() {
    if (!dustCtx) return;
    stopDust();
    resizeDust();
    dustParts = [];
    var cx = dustW / 2, cy = dustH / 2;
    var cols = dustW < 760 ? 5 : 7;
    var recs = [], maxD = 1;
    for (var i = 0; i < figures.length; i++) {
      var r = figures[i].getBoundingClientRect();
      if (!r.width) continue;
      var d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
      if (d > maxD) maxD = d;
      recs.push({ el: figures[i], r: r, d: d });
    }
    for (var k = 0; k < recs.length; k++) {
      var rec = recs[k], el = rec.el, rc = rec.r;
      var img = el.querySelector('img');
      var pts = samplePhoto(img, rc.width, rc.height, cols) || fallbackPoints(rc.width, rc.height, cols);
      var cxp = rc.left + rc.width / 2, cyp = rc.top + rc.height / 2;
      var dn = clamp(rec.d / maxD, 0, 1);
      var rot = (el._tr || 0) * Math.PI / 180;
      var cos = Math.cos(rot), sin = Math.sin(rot);
      var delay = (1 - dn) * 0.68 + Math.random() * 0.1;
      for (var m = 0; m < pts.length; m++) {
        var pt = pts[m];
        var dx = pt.dx * cos - pt.dy * sin;
        var dy = pt.dx * sin + pt.dy * cos;
        dustParts.push({
          x0: cxp + dx, y0: cyp + dy,
          cx: cx + rand(-7, 7), cy: cy + rand(-7, 7),
          delay: delay + Math.random() * 0.14,
          dur: 1.75 + dn * 0.9 + Math.random() * 0.4,
          size: (dustW < 760 ? 1.9 : 2.5) + Math.random() * 1.0,
          color: pt.color,
          swirl: (Math.random() - 0.5) * 46,
          ang: Math.random() * 6.283
        });
      }
    }
    dustStart = performance.now();
    dustRAF = requestAnimationFrame(dustFrame);
  }

  function dustFrame(now) {
    if (!dustCtx) return;
    var t = (now - dustStart) / 1000;
    dustCtx.clearRect(0, 0, dustW, dustH);
    var alive = 0;
    for (var i = 0; i < dustParts.length; i++) {
      var p = dustParts[i];
      var tt = t - p.delay;
      if (tt < 0) { alive++; continue; }
      var pr = tt / p.dur;
      if (pr >= 1) continue;
      alive++;
      var e = pr * pr * pr;                 // 越靠近心口越快
      var sw = Math.sin(pr * Math.PI) * p.swirl;
      var x = p.x0 + (p.cx - p.x0) * e + sw * Math.cos(p.ang);
      var y = p.y0 + (p.cy - p.y0) * e + sw * Math.sin(p.ang);
      var a = pr < 0.12 ? pr / 0.12 : (pr > 0.72 ? Math.max(0, (1 - pr) / 0.28) : 1);
      var size = p.size * (1 - pr * 0.5);
      dustCtx.globalAlpha = a;
      dustCtx.fillStyle = p.color;
      dustCtx.fillRect(x - size / 2, y - size / 2, size, size);
    }
    dustCtx.globalAlpha = 1;
    if (!alive) {
      stopDust();
      if (dustOnDone) { var f = dustOnDone; dustOnDone = null; f(); }
      return;
    }
    dustRAF = requestAnimationFrame(dustFrame);
  }

  function stopDust() {
    if (dustRAF) { cancelAnimationFrame(dustRAF); dustRAF = 0; }
    if (dustCtx) dustCtx.clearRect(0, 0, dustW, dustH);
    dustParts = [];
  }

  /* ---------- 结尾：坍塌 → 烟花 ---------- */
  var collapsing = false;

  function boom() {
    flashEl.classList.remove('on');
    void flashEl.offsetWidth;
    flashEl.classList.add('on');
    if (window.Fireworks) {
      window.Fireworks.finale(window.innerWidth / 2, window.innerHeight / 2);
      window.Fireworks.auto(true, 900);
    }
    setTimeout(function () {
      finaleEl.hidden = false;
      requestAnimationFrame(function () { finaleEl.classList.add('on'); });
      coreEl.style.opacity = '0';
    }, 420);
  }

  function finale(instant) {
    if (collapsing) return;
    collapsing = true;
    document.body.classList.add('collapsing');
    toolbar.classList.remove('on');
    hint.classList.add('hide');
    var hl = document.querySelector('.heart-line');
    if (hl) hl.classList.remove('show');

    var snap = QS.get('snap') === '1' || instant === true;
    if (snap) {
      figures.forEach(function (el) { el.style.opacity = '0'; });
      coreEl.classList.add('on');
      setTimeout(boom, 140);
      return;
    }

    // 1) 先从每张照片里抽出像素粒子（颜色取自照片本身）
    spawnDust();

    // 2) 照片慢慢缩小、淡出，像被粒子一点点带走
    figures.forEach(function (el) {
      var dn = clamp(el._dist / maxDist, 0, 1);
      var delay = (1 - dn) * 0.68;
      el.style.transition = 'transform 1.35s cubic-bezier(.42,0,.58,1), opacity 1s ease';
      el.style.transitionDelay = delay.toFixed(3) + 's, ' + (delay + 0.9).toFixed(3) + 's';
      el.style.transform =
        'translate3d(' + (el._tx * 0.95).toFixed(2) + 'px,' + (el._ty * 0.95).toFixed(2) + 'px,' + el._tz + 'px)' +
        ' rotate(' + el._tr + 'deg) scale(.68)';
      el.style.opacity = '0';
    });

    // 3) 心口光核在粒子多数汇聚时亮起
    setTimeout(function () { coreEl.classList.add('on'); }, 2400);

    // 4) 粒子全部没入心口 → 爆成烟花
    dustOnDone = function () { setTimeout(boom, 240); };
  }

  function resetToHeart() {
    // 从烟花回到照片墙
    stopDust();
    dustOnDone = null;
    finaleEl.classList.remove('on');
    document.body.classList.remove('collapsing');
    collapsing = false;
    coreEl.classList.remove('on');
    coreEl.style.opacity = '';
    setTimeout(function () { finaleEl.hidden = true; }, 900);

    figures.forEach(function (el) {
      el.style.transition = 'none';
      el.style.transform = 'translate3d(0,0,0) scale(.06)';
      el.style.opacity = '0';
      el.style.transitionDelay = '0s';
    });
    void stage.offsetHeight;
    setTimeout(function () { entrance(); }, 60);
    if (window.Fireworks) {
      window.Fireworks.clear();
      window.Fireworks.auto(true, 2400);
    }
    setTimeout(function () {
      toolbar.classList.add('on');
      hint.classList.remove('hide');
    }, 2200);
  }

  /* ---------- 大图查看 ---------- */
  var lb = document.getElementById('lb');
  var lbViewport = document.getElementById('lb-viewport');
  var lbImg = document.getElementById('lb-img');
  var lbLoading = document.getElementById('lb-loading');
  var lbCount = document.getElementById('lb-count');
  var lbDate = document.getElementById('lb-date');
  var lbIndex = -1;
  var lbState = { scale: 1, tx: 0, ty: 0 };
  var lbPointers = new Map();
  var lbMoved = 0, lbPinch = null, lbToken = 0;

  function lbApply() {
    lbImg.style.transform = 'translate(-50%,-50%) translate3d(' + lbState.tx.toFixed(1) + 'px,' + lbState.ty.toFixed(1) + 'px,0) scale(' + lbState.scale.toFixed(3) + ')';
    lbViewport.classList.toggle('zoomed', lbState.scale > 1.02);
  }
  function lbReset() { lbState.scale = 1; lbState.tx = 0; lbState.ty = 0; lbApply(); }
  function lbClampPan() {
    if (lbState.scale <= 1.001) { lbState.tx = 0; lbState.ty = 0; return; }
    var vw = lbViewport.clientWidth, vh = lbViewport.clientHeight;
    var w = lbImg.clientWidth * lbState.scale, h = lbImg.clientHeight * lbState.scale;
    lbState.tx = clamp(lbState.tx, -Math.max(0, (w - vw) / 2), Math.max(0, (w - vw) / 2));
    lbState.ty = clamp(lbState.ty, -Math.max(0, (h - vh) / 2), Math.max(0, (h - vh) / 2));
  }
  function lbZoomAt(clientX, clientY, factor) {
    var rect = lbViewport.getBoundingClientRect();
    var ox = clientX - (rect.left + rect.width / 2) - lbState.tx;
    var oy = clientY - (rect.top + rect.height / 2) - lbState.ty;
    var ns = clamp(lbState.scale * factor, 1, 6);
    var ratio = ns / lbState.scale;
    lbState.tx = clientX - (rect.left + rect.width / 2) - ox * ratio;
    lbState.ty = clientY - (rect.top + rect.height / 2) - oy * ratio;
    lbState.scale = ns;
    lbClampPan();
    lbApply();
  }

  function setLbImage(i) {
    var n = COUNT;
    i = ((i % n) + n) % n;
    lbIndex = i;
    var p = DATA[i];
    lbToken++;
    var token = lbToken;
    lbCount.innerHTML = '<b>' + (i + 1) + '</b> / ' + n;
    lbDate.textContent = hexDate(p.date);
    lbImg.classList.remove('ready');
    lbImg.src = p.thumb;
    lbLoading.hidden = false;
    lbReset();
    var full = new Image();
    full.onload = function () {
      if (token !== lbToken) return;
      lbImg.src = p.full;
      lbImg.classList.add('ready');
      lbLoading.hidden = true;
    };
    full.onerror = function () {
      if (token !== lbToken) return;
      lbImg.classList.add('ready');
      lbLoading.hidden = true;
    };
    full.src = p.full;
    [1, -1].forEach(function (d) {
      var q = DATA[((i + d) % n + n) % n];
      if (q) { var im = new Image(); im.src = q.full; }
    });
  }

  function openLightbox(i) {
    lb.hidden = false;
    document.body.classList.add('locked');
    setLbImage(i);
  }
  function closeLightbox() {
    lb.classList.add('closing');
    setTimeout(function () {
      lb.hidden = true;
      lb.classList.remove('closing');
      lbImg.removeAttribute('src');
      document.body.classList.remove('locked');
    }, 240);
  }

  document.getElementById('lb-close').addEventListener('click', closeLightbox);
  document.getElementById('lb-prev').addEventListener('click', function () { setLbImage(lbIndex - 1); });
  document.getElementById('lb-next').addEventListener('click', function () { setLbImage(lbIndex + 1); });
  document.getElementById('lb-in').addEventListener('click', function () {
    var r = lbViewport.getBoundingClientRect();
    lbZoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.5);
  });
  document.getElementById('lb-out').addEventListener('click', function () {
    var r = lbViewport.getBoundingClientRect();
    lbZoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.5);
  });
  document.getElementById('lb-reset').addEventListener('click', function () { lbReset(); });

  lbViewport.addEventListener('wheel', function (e) {
    e.preventDefault();
    lbZoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0022));
  }, { passive: false });

  lbViewport.addEventListener('dblclick', function (e) {
    if (lbState.scale > 1.02) lbReset(); else lbZoomAt(e.clientX, e.clientY, 2.4);
  });

  lbViewport.addEventListener('pointerdown', function (e) {
    try { lbViewport.setPointerCapture(e.pointerId); } catch (err) {}
    lbPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lbMoved = 0;
    if (lbPointers.size === 2) {
      var pts = Array.from(lbPointers.values());
      lbPinch = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), scale: lbState.scale };
    } else {
      lbViewport.classList.add('grabbing');
    }
  });

  lbViewport.addEventListener('pointermove', function (e) {
    var prev = lbPointers.get(e.pointerId);
    if (!prev) return;
    var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    prev.x = e.clientX; prev.y = e.clientY;
    lbMoved += Math.abs(dx) + Math.abs(dy);
    if (lbPointers.size === 2 && lbPinch) {
      var pts = Array.from(lbPointers.values());
      var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (lbPinch.dist > 8) {
        lbState.scale = clamp(lbPinch.scale * (dist / lbPinch.dist), 1, 6);
        lbClampPan();
        lbApply();
      }
      return;
    }
    if (lbState.scale > 1.001) {
      lbState.tx += dx; lbState.ty += dy;
      lbClampPan(); lbApply();
    }
  });

  function lbEnd(e) {
    lbPointers.delete(e.pointerId);
    if (lbPointers.size < 2) lbPinch = null;
    if (lbPointers.size === 0) lbViewport.classList.remove('grabbing');
    try { lbViewport.releasePointerCapture(e.pointerId); } catch (err) {}
  }
  lbViewport.addEventListener('pointerup', function (e) {
    var moved = lbMoved;
    lbEnd(e);
    if (moved < 8 && lbState.scale <= 1.001 && e.target === lbViewport) closeLightbox();
  });
  lbViewport.addEventListener('pointercancel', lbEnd);

  document.addEventListener('keydown', function (e) {
    if (!lb.hidden) {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') setLbImage(lbIndex - 1);
      else if (e.key === 'ArrowRight') setLbImage(lbIndex + 1);
      else if (e.key === '+' || e.key === '=') {
        var r1 = lbViewport.getBoundingClientRect();
        lbZoomAt(r1.left + r1.width / 2, r1.top + r1.height / 2, 1.4);
      } else if (e.key === '-') {
        var r2 = lbViewport.getBoundingClientRect();
        lbZoomAt(r2.left + r2.width / 2, r2.top + r2.height / 2, 1 / 1.4);
      } else if (e.key === '0') lbReset();
      return;
    }
    if (e.key === 'Escape' && !intro.classList.contains('hide')) return;
    if (e.key === 'f' || e.key === 'F') finale();
    if (e.key === 'r' || e.key === 'R') resetToHeart();
    if ((e.key === 'Enter' || e.key === ' ') && !intro.classList.contains('hide')) {
      e.preventDefault();
      enterScene();
    }
  });

  /* ---------- 按钮 ---------- */
  document.getElementById('btn-enter').addEventListener('click', enterScene);
  document.getElementById('btn-letter').addEventListener('click', function () {
    intro.classList.remove('hide');
    document.body.classList.add('locked');
    document.body.classList.add('intro-open');
    toolbar.classList.remove('on');
    hint.classList.add('hide');
    intro.classList.remove('ready');
    void intro.offsetWidth;
    intro.classList.add('ready');
  });
  document.getElementById('btn-full').addEventListener('click', function () {
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
    } else if (document.exitFullscreen) document.exitFullscreen().catch(function () {});
  });
  document.getElementById('btn-replay').addEventListener('click', resetToHeart);
  document.getElementById('btn-finale').addEventListener('click', function () { finale(); });
  document.getElementById('btn-again').addEventListener('click', resetToHeart);

  var zoomed = false;
  document.getElementById('btn-zoom').addEventListener('click', function () {
    zoomed = !zoomed;
    view.zoom = zoomed ? fitZoom() * 1.55 : fitZoom();
    view.px = 0; view.py = 0;
    kick();
  });

  /* ---------- 背景音乐 ---------- */
  var TRACKS = [
    { title: '世界这么大还是遇见你', artist: '程响', src: 'music/t1.mp3' },
    { title: '大城小爱', artist: '王力宏', src: 'music/t2.mp3' },
    { title: '小情歌', artist: '苏打绿', src: 'music/t3.mp3' },
    { title: '告白气球', artist: '周杰伦', src: 'music/t4.mp3' },
    { title: '最重要的决定', artist: '范玮琪', src: 'music/t5.mp3' }
  ];
  var MUSIC_DATA = window.__MUSIC_DATA__;
  if (MUSIC_DATA) {
    for (var mi = 0; mi < TRACKS.length; mi++) if (MUSIC_DATA[mi]) TRACKS[mi].src = MUSIC_DATA[mi];
  }

  var audio = new Audio();
  audio.preload = 'none';
  audio.volume = 0.62;
  var trackIndex = -1;
  var musicBtn = document.getElementById('btn-music');
  var musicPanel = document.getElementById('music-panel');
  var musicList = document.getElementById('mp-list');
  var mpNow = document.getElementById('mp-now');
  var mpToggle = document.getElementById('mp-toggle');

  function renderMusicList() {
    musicList.innerHTML = '';
    TRACKS.forEach(function (tr, i) {
      var li = document.createElement('li');
      li.className = 'mp-item' + (i === trackIndex ? ' active' : '');
      li.innerHTML = '<span class="mp-n">' + (i + 1) + '</span>' +
        '<span class="mp-name">' + tr.title + '</span>' +
        '<span class="mp-artist">' + tr.artist + '</span>';
      li.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (i === trackIndex && !audio.paused) { audio.pause(); syncMusicUI(); }
        else playTrack(i);
      });
      musicList.appendChild(li);
    });
  }

  function syncMusicUI() {
    var playing = !!audio.src && !audio.paused && !audio.ended;
    musicBtn.classList.toggle('playing', playing);
    mpToggle.textContent = playing ? '暂停' : '继续';
    mpNow.textContent = trackIndex >= 0 ? TRACKS[trackIndex].title : '未播放';
  }

  function playTrack(i) {
    if (i < 0 || i >= TRACKS.length) return;
    trackIndex = i;
    audio.src = TRACKS[i].src;
    var p = audio.play();
    if (p && p.catch) p.catch(function () {});
    renderMusicList();
    syncMusicUI();
  }

  function closeMusicPanel() {
    musicPanel.classList.remove('show');
    setTimeout(function () { musicPanel.setAttribute('hidden', ''); }, 220);
  }

  musicBtn.addEventListener('click', function (ev) {
    ev.stopPropagation();
    if (musicPanel.hasAttribute('hidden')) {
      musicPanel.removeAttribute('hidden');
      requestAnimationFrame(function () { musicPanel.classList.add('show'); });
    } else {
      closeMusicPanel();
    }
  });

  mpToggle.addEventListener('click', function (ev) {
    ev.stopPropagation();
    if (!audio.src) { playTrack(0); return; }
    if (audio.paused) { var p = audio.play(); if (p && p.catch) p.catch(function () {}); }
    else audio.pause();
  });

  audio.addEventListener('ended', function () {
    playTrack((trackIndex + 1) % TRACKS.length);
  });
  audio.addEventListener('play', syncMusicUI);
  audio.addEventListener('pause', syncMusicUI);

  document.addEventListener('click', function (ev) {
    if (musicPanel.hasAttribute('hidden')) return;
    if (musicPanel.contains(ev.target) || musicBtn.contains(ev.target)) return;
    closeMusicPanel();
  });

  renderMusicList();
  syncMusicUI();

  document.getElementById('btn-burst').addEventListener('click', function (e) {
    var r = e.currentTarget.getBoundingClientRect();
    if (window.Fireworks) window.Fireworks.heartBurst(r.left + r.width / 2, r.top + r.height / 2);
  });

  /* ---------- 启动 ---------- */
  function boot() {
    if (!COUNT) {
      document.body.innerHTML = '<p style="padding:40px;font:16px/1.8 sans-serif;color:#f4ecef">没有找到照片数据，请确认 data/photos.js 存在。</p>';
      return;
    }
    if (window.Fireworks) window.Fireworks.init(document.getElementById('sky'));

    buildLayout();
    drawHeartOutline();
    render();

    var fit = fitZoom();
    cur.zoom = view.zoom = fit * 0.94;
    cur.px = view.px = 0;
    cur.py = view.py = window.innerWidth < 760 ? -10 : -26;
    apply();

    introCount.textContent = String(COUNT);
    if (window.matchMedia('(hover: none) and (pointer: coarse)').matches || 'ontouchstart' in window) {
      hint.innerHTML = '<span>拖动探索</span><i>·</i><span>双指缩放</span><i>·</i><span>点开看大图</span>';
    }

    // 初始：照片藏在中心
    figures.forEach(function (el) {
      el.style.transition = 'none';
      el.style.transform = 'translate3d(0,0,0) scale(.14)';
      el.style.opacity = '0';
    });

    intro.classList.add('ready');
    document.body.classList.add('locked');
    document.body.classList.add('intro-open');

    // 调试 / 分享直达
    if (QS.get('enter') === '1') {
      setTimeout(function () {
        entered = true;
        intro.classList.add('hide');
        document.body.classList.remove('locked');
        entrance();
        toolbar.classList.add('on');
        hint.classList.remove('hide');
        var hl = document.querySelector('.heart-line');
        if (hl) hl.classList.add('show');
        if (window.Fireworks) window.Fireworks.auto(true, 900);
      }, 50);
    }
    var ph = parseInt(QS.get('photo') || '', 10);
    if (ph > 0) {
      setTimeout(function () {
        enterScene();
        setTimeout(function () { openLightbox(ph - 1); }, 900);
      }, 80);
    }
    if (QS.get('finale') === '1') {
      setTimeout(function () {
        entered = true;
        intro.classList.add('hide');
        document.body.classList.remove('locked');
        figures.forEach(function (el) { el.style.transition = 'none'; el.style.transform = el._target; el.style.opacity = '1'; });
        finale(true);
      }, 80);
    }

    setTimeout(function () { view.zoom = fit; kick(); }, 260);

    window.__APP__ = {
      count: COUNT,
      enter: enterScene,
      openImage: openLightbox,
      close: closeLightbox,
      finale: finale,
      reset: resetToHeart,
      layout: function () { return layout; },
      figures: function () { return figures; }
    };
  }

  boot();
})();
