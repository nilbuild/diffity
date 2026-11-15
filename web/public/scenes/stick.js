/* stick-scene runtime: the rig (figure, poses, easing, pen), a kit of props, and the <stick-scene> element. No dependencies. */
(function () {
  const C = {
    ink: '#141414', far: '#9a9a9a', muted: '#737373', soft: '#a3a3a3', faint: '#d4d4d4', line: '#ededed', paper: '#ffffff', floor: '#fafafa',
    butter: '#fde68a', butterHi: '#fcd34d', butterSoft: '#fef3c7', umber: '#78350f', amber: '#b45309',
    wood: '#ecdfc8', woodDk: '#dccab0', steel: '#e4e6e9', chip: '#f5f5f5',
    red: '#fbc4c4', redInk: '#c0392b', green: '#c6ebc9', greenInk: '#2f855a', sky: '#eef2f6',
  };
  const H = 230, GY = 192, FS = 0.88;
  const THIGH = 30, SHIN = 30, UARM = 21, FARM = 21;
  const LIMB = 5, ARM = 4.2, TORSO = 8.5, HEAD_R = 7.8;
  const TAU = Math.PI * 2;
  const FONT = (s) => `400 ${s}px 'Balsamiq Sans', 'Comic Sans MS', system-ui, sans-serif`;

  const lerp = (a, b, k) => a + (b - a) * k;
  const L2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const seg = (u, a, b) => clamp((u - a) / (b - a), 0, 1);
  const E = {
    lin: (k) => k,
    soft: (k) => 0.5 - Math.cos(Math.PI * k) / 2,
    io: (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
    in: (k) => k * k,
    out: (k) => 1 - (1 - k) * (1 - k),
    out3: (k) => 1 - Math.pow(1 - k, 3),
    back: (k) => {
      const m = k * k * (2 - k);
      return 1 + 2.4 * Math.pow(m - 1, 3) + 1.4 * Math.pow(m - 1, 2);
    },
    sm: (k) => k * k * (3 - 2 * k),
  };
  const WOB = Array.from({ length: 512 }, (_, i) => Math.sin(i * 0.37) * 0.35 + Math.sin(i * 1.71 + 1) * 0.22);
  const wob = (x) => {
    const i = Math.floor(x), f = x - i;
    const a = WOB[((i % 512) + 512) % 512], b = WOB[(((i + 1) % 512) + 512) % 512];
    return lerp(a, b, f);
  };
  function hash(n) {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  const PK = ['head', 'chest', 'hip', 'fF', 'fB', 'kF', 'kB', 'hF', 'hB'];
  const BASE = {
    head: [0, -116], chest: [0, -90], hip: [0, -59],
    fF: [4, -2.5], fB: [-5, -2.5], kF: [24, -32], kB: [12, -32],
    hF: [5, -50], hB: [-3, -50], ef: 1, eb: 1,
  };
  function P(o, b) {
    const r = Object.assign({}, b || BASE);
    for (const k in o) {
      r[k] = o[k];
    }
    return r;
  }
  // Hands swing around the shoulder on big moves instead of sliding through the body.
  function armArc(a, b, ca, cb, k) {
    const straight = L2(a, b, k);
    const va = [a[0] - ca[0], a[1] - ca[1]], vb = [b[0] - cb[0], b[1] - cb[1]];
    const ra = Math.hypot(va[0], va[1]), rb = Math.hypot(vb[0], vb[1]);
    if (ra < 4 || rb < 4) {
      return straight;
    }
    const aa = Math.atan2(va[1], va[0]);
    let d = Math.atan2(vb[1], vb[0]) - aa;
    const raw = Math.abs(d);
    const side = raw > 3.9 ? clamp((raw - 3.9) / 0.3, 0, 1) : clamp((3.9 - raw) / 0.3, 0, 1);
    if (raw > 3.9) {
      d -= Math.sign(d) * Math.PI * 2;
    }
    const w = clamp((Math.abs(d) - 0.25) / 0.45, 0, 1) * side;
    if (w <= 0) {
      return straight;
    }
    const c = L2(ca, cb, k);
    const ang = aa + d * k, r = lerp(ra, rb, k);
    const arc = [c[0] + Math.cos(ang) * r, c[1] + Math.sin(ang) * r];
    return L2(straight, arc, w);
  }
  function mix(a, b, k) {
    if (k <= 0) {
      return a;
    }
    if (k >= 1) {
      return b;
    }
    const r = {};
    for (const key of PK) {
      r[key] = L2(a[key], b[key], k);
    }
    r.hF = armArc(a.hF, b.hF, a.chest, b.chest, k);
    r.hB = armArc(a.hB, b.hB, a.chest, b.chest, k);
    r.ef = lerp(a.ef ?? 1, b.ef ?? 1, k);
    r.eb = lerp(a.eb ?? 1, b.eb ?? 1, k);
    r.hang = lerp(a.hang ?? 1, b.hang ?? 1, k);
    return r;
  }
  function seq(t, keys, ease) {
    const ez = ease || E.soft;
    if (t <= keys[0][0]) {
      return keys[0][1];
    }
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t < b[0]) {
        return mix(a[1], b[1], (b[2] || ez)((t - a[0]) / (b[0] - a[0])));
      }
    }
    return keys[keys.length - 1][1];
  }
  function nseq(t, keys, ease) {
    const ez = ease || E.soft;
    if (t <= keys[0][0]) {
      return keys[0][1];
    }
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t < b[0]) {
        const k = (b[2] || ez)((t - a[0]) / (b[0] - a[0]));
        if (Array.isArray(a[1])) {
          return L2(a[1], b[1], k);
        }
        return lerp(a[1], b[1], k);
      }
    }
    return keys[keys.length - 1][1];
  }
  function shift(p, dx, dy, keys) {
    const r = Object.assign({}, p);
    for (const k of keys || PK) {
      r[k] = [p[k][0] + dx, p[k][1] + dy];
    }
    return r;
  }
  const UPPER = ['head', 'chest', 'hF', 'hB'];
  function breathe(p, t, amt) {
    const a = Math.sin(t * 2.1) * (amt ?? 0.9);
    const r = Object.assign({}, p);
    r.head = [p.head[0], p.head[1] - a];
    r.chest = [p.chest[0], p.chest[1] - a * 0.8];
    r.hF = [p.hF[0], p.hF[1] - a * 0.5];
    r.hB = [p.hB[0], p.hB[1] - a * 0.5];
    return r;
  }
  const STRIDE = 26;
  function footCycle(ph, lift, stride) {
    const f = ((ph % 1) + 1) % 1;
    const STRIDE = 26 * (stride || 1);
    if (f < 0.5) {
      return [lerp(STRIDE / 2, -STRIDE / 2, f / 0.5), 0];
    }
    // Swing: a Hermite curve whose speed at lift-off and touch-down matches the planted foot, so in the world
    // the foot leaves and lands at rest instead of jolting. The lift eases in and out the same way.
    const k = (f - 0.5) / 0.5;
    const k2 = k * k, k3 = k2 * k;
    const x = (2 * k3 - 3 * k2 + 1) * (-STRIDE / 2) + (-2 * k3 + 3 * k2) * (STRIDE / 2) - STRIDE * (2 * k3 - 3 * k2 + k);
    const up = Math.sin(Math.PI * k);
    return [x, -up * up * lift * 1.25];
  }
  function legs(p, ph, amp, o) {
    const opt = o || {};
    const lift = opt.lift ?? 8;
    if (amp <= 0) {
      return p;
    }
    const r = Object.assign({}, p);
    const a = footCycle(ph, lift, opt.stride), b = footCycle(ph + 0.5, lift, opt.stride);
    const hx = p.hip[0];
    const fF = [hx + 3 + a[0], -2.5 + a[1]];
    const fB = [hx - 2 + b[0], -2.5 + b[1]];
    r.fF = L2(p.fF, fF, amp);
    r.fB = L2(p.fB, fB, amp);
    r.kF = [hx + 24, -32];
    r.kB = [hx + 22, -32];
    const bob = (1 - Math.abs(Math.cos(ph * TAU))) * 1.8 * amp;
    r.hip = [p.hip[0], p.hip[1] - bob + 1.2 * amp];
    r.chest = [p.chest[0], p.chest[1] - bob + 1 * amp];
    r.head = [p.head[0], p.head[1] - bob + 1 * amp];
    if (opt.arms) {
      const sw = Math.sin(ph * TAU) * 11 * amp;
      r.hF = [p.chest[0] - sw + 3, p.hF[1]];
      r.hB = [p.chest[0] + sw + 1, p.hB[1]];
    }
    return r;
  }
  function walkSeg(u, a, b, x0, x1, s, ease) {
    const ez = ease || E.soft;
    const k = ez(seg(u, a, b));
    const x = lerp(x0, x1, k);
    const d = Math.abs(x - x0), D = Math.abs(x1 - x0);
    // A quick walk takes longer strides instead of more steps, so a short, fast crossing reads as a brisk
    // walk or a jog rather than a scuttle. Stride follows the speed at each moment (short steps while
    // speeding up and slowing down), and the step phase is summed along the walk so the feet stay planted.
    // Pass stride to legs().
    const C = STRIDE * 2 * (s || FS), h = 0.004;
    const strideAt = (t) => clamp((D * (ez(seg(t + h, a, b)) - ez(seg(t - h, a, b))) / (2 * h)) / 110, 1, 2.2);
    const t1 = clamp(u, a, b);
    let ph = 0;
    if (D > 0 && t1 > a) {
      const n = 24;
      let kp = 0;
      for (let i = 1; i <= n; i++) {
        const kk = ez(seg(a + (t1 - a) * (i / n), a, b));
        ph += (D * (kk - kp)) / (C * strideAt(a + (t1 - a) * ((i - 0.5) / n)));
        kp = kk;
      }
    }
    const stride = strideAt(t1);
    const amp = Math.min(E.sm(seg(d, 0, 9)), E.sm(seg(D - d, 0, 9)));
    return { x, ph, amp, k, stride, dir: Math.sign(x1 - x0) };
  }

  function ik(a, b, l1, l2, hint) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    let d = Math.hypot(dx, dy);
    const base = Math.atan2(dy, dx);
    // Soft limit near full extension: a straight limb's joint would otherwise race across the last few units
    // of reach in a frame or two (the knee "snap" when a step lands). Past 96% it eases in instead.
    const L = l1 + l2, soft = L * 0.96;
    if (d > soft) {
      d = soft + (L - soft) * (1 - Math.exp(-(d - soft) / (L - soft)));
    }
    d = Math.max(Math.abs(l1 - l2) + 0.01, Math.min(L - 0.001, d));
    const c = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
    const ang = Math.acos(c);
    const j1 = [a[0] + l1 * Math.cos(base + ang), a[1] + l1 * Math.sin(base + ang)];
    const j2 = [a[0] + l1 * Math.cos(base - ang), a[1] + l1 * Math.sin(base - ang)];
    // Pick the bend on the hint's side of the limb line. Comparing distances to the hint flips sides
    // when the limb is nearly straight and both answers sit close to it.
    const side = dx * (hint[1] - a[1]) - dy * (hint[0] - a[0]);
    const s1 = dx * (j1[1] - a[1]) - dy * (j1[0] - a[0]);
    return side === 0 || Math.sign(s1) === Math.sign(side) ? j1 : j2;
  }
  function reach(a, b, max) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.hypot(dx, dy);
    if (d <= max) {
      return b;
    }
    return [a[0] + (dx / d) * max, a[1] + (dy / d) * max];
  }
  function elbowHint(sh, hand, flip) {
    const f = flip ?? 1;
    const dx = hand[0] - sh[0], dy = hand[1] - sh[1];
    return [(sh[0] + hand[0]) / 2 - dy * 0.6 * f, (sh[1] + hand[1]) / 2 + dx * 0.6 * f];
  }
  // A raised near arm that would cross the face is angled forward just enough to clear the head.
  // Hands that stop at the face (a sip, a chin scratch) are left alone.
  function clearHead(sh, hand, hc) {
    const vx = hand[0] - sh[0], vy = hand[1] - sh[1];
    const L = Math.hypot(vx, vy);
    const wx = hc[0] - sh[0], wy = hc[1] - sh[1];
    const Lw = Math.hypot(wx, wy);
    const need = HEAD_R + 3;
    if (L < 1 || Lw <= need) {
      return hand;
    }
    const along = (vx * wx + vy * wy) / L;
    const past = clamp((L - along - 2) / 8, 0, 1);
    if (along <= 0 || past <= 0) {
      return hand;
    }
    const th = Math.atan2(wy, wx), half = Math.asin(need / Lw);
    let d = Math.atan2(vy, vx) - th;
    while (d > Math.PI) {
      d -= Math.PI * 2;
    }
    while (d < -Math.PI) {
      d += Math.PI * 2;
    }
    if (d >= half || d <= -half) {
      return hand;
    }
    const a = th + lerp(d, half, past * E.sm(clamp((d + half) / half, 0, 1)));
    return [sh[0] + Math.cos(a) * L, sh[1] + Math.sin(a) * L];
  }
  // A back hand that rests low under the shoulder hangs from a nearly straight arm, the way a relaxed arm does.
  // Without this, a resting hand placed a little high bunches the arm and pushes the elbow out behind.
  // Hands reaching forward, up or out (typing, holding, pointing) are left alone; the blend is smooth.
  function relax(sh, t, amount) {
    const dx = t[0] - sh[0], dy = t[1] - sh[1];
    const d = Math.hypot(dx, dy);
    const want = (UARM + FARM) * 0.96;
    if (dy <= 0 || d < 1 || d >= want) {
      return t;
    }
    const w = E.sm(clamp((dy / d - 0.8) / 0.18, 0, 1)) * clamp(amount ?? 1, 0, 1);
    if (w <= 0) {
      return t;
    }
    const nd = lerp(d, want, w);
    return [sh[0] + (dx / d) * nd, sh[1] + (dy / d) * nd];
  }
  // Elbows always bend the way a real one does: the forearm folds toward the front of the body.
  // ef/eb only control straightness now: 1 is a natural bend, 0 is a straight arm. A negative value used to
  // flip the elbow backwards, which no real arm can do, so it is treated like its positive size.
  function elbow(sh, hand, l1, l2, flip) {
    const f = flip ?? 1;
    const j = ik(sh, hand, l1, l2, elbowHint(sh, hand, 1));
    const m = Math.min(1, Math.abs(f));
    if (m >= 1) {
      return j;
    }
    const dx = hand[0] - sh[0], dy = hand[1] - sh[1];
    const d = Math.hypot(dx, dy) || 1;
    const line = [sh[0] + (dx / d) * l1, sh[1] + (dy / d) * l1];
    return L2(line, j, E.sm(m));
  }

  function strokePath(g, pts, w, col) {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      g.lineTo(pts[i][0], pts[i][1]);
    }
    g.stroke();
  }
  function hatShape(g) {
    g.beginPath();
    g.moveTo(-6.5, 0);
    g.quadraticCurveTo(-6.6, -6.5, -4.6, -7.4);
    g.quadraticCurveTo(0, -8.6, 4.6, -7.4);
    g.quadraticCurveTo(6.6, -6.5, 6.5, 0);
    g.closePath();
    inkFill(g, C.paper, 1.4);
    g.beginPath();
    g.moveTo(-11, 2.4);
    g.quadraticCurveTo(-6, -1.2, 0, -0.8);
    g.quadraticCurveTo(7, -1.2, 13, 2.2);
    g.quadraticCurveTo(7, 1.6, 0, 1.8);
    g.quadraticCurveTo(-6, 1.6, -11, 2.4);
    g.closePath();
    inkFill(g, C.paper, 1.4);
    g.strokeStyle = C.ink;
    g.lineWidth = 2.2;
    g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(-6.3, -2.4);
    g.lineTo(6.3, -2.4);
    g.stroke();
    g.lineCap = 'round';
  }

  function wave(p, k, t) {
    if (!k) {
      return p;
    }
    const r = Object.assign({}, p);
    const hx = p.chest[0] + 13 + Math.sin(t * 12) * 6;
    r.hF = armArc(p.hF, [hx, p.chest[1] - 40], p.chest, p.chest, k);
    r.ef = lerp(p.ef ?? 1, 1, k);
    r.head = L2(p.head, [p.chest[0] + 4, p.chest[1] - 26], k * 0.7);
    return r;
  }

  // Draws a stick figure in local pose space at world (x, y). Returns joints in world space.
  function fig(g, pose, x, y, o) {
    const opt = o || {};
    const s = opt.s ?? FS, sx = opt.sx ?? 1;
    const p = wave(pose, opt.wave || 0, opt.wt || 0);
    const W = (q) => [x + q[0] * s * sx, y + q[1] * s];
    if (opt.shadow !== false) {
      const fy = opt.floor ?? y;
      const mx = (p.fF[0] + p.fB[0]) / 2, low = Math.min(-p.fF[1], -p.fB[1]);
      const k = clamp(1 - (low - 2.5) / 40, 0.2, 1);
      g.fillStyle = `rgba(0,0,0,${(0.11 * k * (opt.alpha ?? 1)).toFixed(3)})`;
      g.beginPath();
      g.ellipse(x + mx * s * sx, fy + 1.2, (12 + Math.abs(p.fF[0] - p.fB[0]) * 0.45) * s * k, 2.4 * s, 0, 0, TAU);
      g.fill();
    }
    g.save();
    g.translate(x, y);
    g.scale(s * sx, s);
    if (opt.alpha != null && opt.alpha < 1) {
      g.globalAlpha *= opt.alpha;
    }
    const ink = opt.ink || C.ink, far = opt.far || C.far;
    const vx = p.chest[0] - p.hip[0], vy = p.chest[1] - p.hip[1];
    const sl = Math.hypot(vx, vy) || 1;
    const u = [vx / sl, vy / sl];
    const sh = [p.chest[0] - u[0], p.chest[1] - u[1]];
    const kF = ik(p.hip, p.fF, THIGH, SHIN, p.kF);
    const kB = ik(p.hip, p.fB, THIGH, SHIN, p.kB);
    const hd = [p.head[0] - p.chest[0], p.head[1] - p.chest[1]];
    const hl = Math.hypot(hd[0], hd[1]) || 1;
    const hc = [p.chest[0] + (hd[0] / hl) * 20.5, p.chest[1] + (hd[1] / hl) * 20.5];
    // Only the far (back) arm relaxes: that is the arm that idles, and the near hand is the one doing
    // precise work under the shoulder (cutting, pressing, holding), which must land exactly. Set
    // hang: 0 on a pose when the back hand works under the shoulder too (it blends like ef/eb).
    const handF = clearHead(sh, reach(sh, p.hF, UARM + FARM), hc);
    const handB = reach(sh, relax(sh, p.hB, p.hang), UARM + FARM);
    const eF = elbow(sh, handF, UARM, FARM, p.ef);
    const eB = elbow(sh, handB, UARM, FARM, p.eb);
    const J = { sh, handF, handB, eF, eB, kF, kB, hc, hip: p.hip, chest: p.chest, fF: p.fF, fB: p.fB, hd: [hd[0] / hl, hd[1] / hl], s, sx, x, y, W };
    if (opt.behind) {
      opt.behind(g, J);
    }
    strokePath(g, [sh, eB, handB], ARM, far);
    if (opt.mid) {
      opt.mid(g, J);
    }
    strokePath(g, [p.hip, kB, p.fB], LIMB, far);
    strokePath(g, [[p.hip[0] + u[0], p.hip[1] + u[1]], [p.chest[0] + u[0] * 0.5, p.chest[1] + u[1] * 0.5]], TORSO, ink);
    if (opt.bot) {
      botChest(g, p.hip, p.chest, opt.bot, ink);
    }
    strokePath(g, [p.hip, kF, p.fF], LIMB, ink);
    if (opt.bot) {
      botHead(g, hc, hd, opt.bot, ink);
    } else {
      g.fillStyle = ink;
      g.beginPath();
      g.arc(hc[0], hc[1], HEAD_R, 0, TAU);
      g.fill();
    }
    if (opt.hat && !opt.hatInHand) {
      const ang = Math.atan2(hd[1], hd[0]) + Math.PI / 2;
      const L = HEAD_R - 2.6 + (opt.hatLift || 0);
      g.save();
      g.translate(hc[0] + (hd[0] / hl) * L, hc[1] + (hd[1] / hl) * L);
      g.rotate(ang * 0.85 + (opt.hatRot || 0));
      hatShape(g);
      g.restore();
    }
    if (opt.held) {
      opt.held(g, J);
    }
    strokePath(g, [sh, eF, handF], ARM, ink);
    if (opt.hat && opt.hatInHand) {
      g.save();
      g.translate(handF[0], handF[1] - 3);
      g.rotate(opt.hatRot || 0);
      hatShape(g);
      g.restore();
    }
    if (opt.front) {
      opt.front(g, J);
    }
    g.restore();
    J.w = { handF: W(handF), handB: W(handB), head: W(hc), sh: W(sh), hip: W(p.hip), chest: W(p.chest), fF: W(p.fF), fB: W(p.fB), eF: W(eF), eB: W(eB) };
    J.ink = ink;
    // Figures have no face, so this marks where a mouth would be: the front of the head, a little below its centre.
    J.mouth = W([hc[0] - (hd[1] / hl) * 6 - (hd[0] / hl) * 3, hc[1] + (hd[0] / hl) * 6 - (hd[1] / hl) * 3]);
    return J;
  }
  // Arrows are drawn by hand, like koboyo.com: an open chevron head with softly curved barbs and a round nose,
  // never a filled triangle. arrowHead draws just the head at tip, pointing along angle (radians).
  function arrowHead(g, tip, angle, len, lw, col) {
    const L = len ?? 7, HA = 0.58, NOSE = 0.15, EASE = 0.16;
    const nx = -Math.sin(angle), ny = Math.cos(angle);
    const end = (side) => [tip[0] - L * Math.cos(angle + HA * side), tip[1] - L * Math.sin(angle + HA * side)];
    const ease = (e) => [e[0] + (tip[0] - e[0]) * EASE, e[1] + (tip[1] - e[1]) * EASE];
    const nose = (e) => {
      const side = Math.sign((e[0] - tip[0]) * nx + (e[1] - tip[1]) * ny);
      return [tip[0] + nx * side * L * NOSE, tip[1] + ny * side * L * NOSE];
    };
    const a = end(-1), b = end(1), ca = ease(a), cb = ease(b), na = nose(a), nb = nose(b);
    g.save();
    g.strokeStyle = col || C.ink;
    g.lineWidth = lw ?? 1.8;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.bezierCurveTo(ca[0], ca[1], na[0], na[1], tip[0], tip[1]);
    g.bezierCurveTo(nb[0], nb[1], cb[0], cb[1], b[0], b[1]);
    g.stroke();
    g.restore();
  }
  // A hand-drawn arrow through points (2 for straight, more for a bend), with the head at the last point.
  // o: { lw, col, head (length), k (0..1 draws it on progressively) }
  function arrow(g, pts, o) {
    const opt = o || {};
    const k = opt.k ?? 1;
    if (k <= 0) {
      return;
    }
    const path = partial(pts, k);
    const lw = opt.lw ?? 1.8;
    strokePath(g, path, lw, opt.col || C.ink);
    const p1 = path[path.length - 1], p0 = path[path.length - 2] || pts[0];
    arrowHead(g, p1, Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), opt.head ?? 4 + lw * 1.6, lw, opt.col);
  }
  // A circular arrow (rotate, undo, refresh) around cx, cy from angle a0 to a1; the head points along the turn.
  function arcArrow(g, cx, cy, r, a0, a1, o) {
    const opt = o || {};
    const lw = opt.lw ?? 1.8;
    const n = 18, pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    strokePath(g, pts, lw, opt.col || C.ink);
    const dir = Math.sign(a1 - a0) || 1;
    const tip = pts[n];
    arrowHead(g, tip, a1 + dir * Math.PI / 2 - dir * 0.18, opt.head ?? 4 + lw * 1.6, lw, opt.col);
  }
  // Redraw the near arm on top, after a prop the hand is holding or gripping, so the hand stays in front of it.
  // Use it when the prop is drawn after fig() in world space (a card, a lever knob, a crank).
  function frontArm(g, J) {
    strokePath(g, [J.w.sh, J.w.eF, J.w.handF], ARM * J.s, J.ink || C.ink);
  }
  // A robot: rounded head with a dark visor, glowing eyes, ear bolts, an antenna bulb and a chest light.
  // o: { col, dark, screen, eye (a dark col gets a white visor and ink eyes by default), glow (0..1, lights the antenna and chest), blink, happy }
  function isDark(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) {
      return false;
    }
    const n = parseInt(m[1], 16);
    return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 < 110;
  }
  function botHead(g, hc, hd, o, ink) {
    const col = o.col || ink, dark = o.dark || C.ink;
    const inkHead = isDark(col);
    const tilt = (Math.atan2(hd[1], hd[0]) + Math.PI / 2) * 0.6;
    const glow = o.glow || 0;
    g.save();
    g.translate(hc[0], hc[1]);
    g.rotate(tilt);
    ln(g, 0, -10, 0, -16, 1.6, dark);
    if (glow > 0) {
      g.save();
      g.globalAlpha *= glow * 0.45;
      circle(g, 0, -17.5, 6.5);
      g.fillStyle = C.butterHi;
      g.fill();
      g.restore();
    }
    circle(g, 0, -17.5, 2.7);
    inkFill(g, glow > 0.3 ? C.butterHi : col, 1.2, dark);
    rr(g, -12.6, -4, 3.4, 8, 1.4);
    inkFill(g, dark, 1, dark);
    rr(g, 9.2, -4, 3.4, 8, 1.4);
    inkFill(g, dark, 1, dark);
    rr(g, -10, -10.5, 20, 19, 5.5);
    inkFill(g, col, 1.5, dark);
    rr(g, -6, -5.5, 14.5, 9.5, 3.2);
    inkFill(g, o.screen || (inkHead ? C.paper : '#262626'), 1.1, dark);
    const eye = o.eye || (inkHead ? C.ink : '#c9f4ff');
    g.strokeStyle = eye;
    g.fillStyle = eye;
    g.lineCap = 'round';
    for (const ex of [-1.6, 4.4]) {
      if (o.blink) {
        ln(g, ex - 1.4, -0.7, ex + 1.4, -0.7, 1.2, eye);
      } else if (o.happy) {
        g.beginPath();
        g.arc(ex, 0.3, 1.7, Math.PI * 1.1, Math.PI * 1.9);
        g.lineWidth = 1.3;
        g.stroke();
      } else {
        rr(g, ex - 1.2, -2.4, 2.4, 3.6, 1.2);
        g.fill();
      }
    }
    g.restore();
  }
  function botChest(g, hip, chest, o, ink) {
    const dark = o.dark || C.ink;
    const m = [lerp(hip[0], chest[0], 0.6), lerp(hip[1], chest[1], 0.6)];
    g.save();
    g.translate(m[0], m[1]);
    g.rotate(Math.atan2(chest[1] - hip[1], chest[0] - hip[0]) + Math.PI / 2);
    rr(g, -3.4, -4.6, 6.8, 9.2, 1.8);
    inkFill(g, C.paper, 1, dark);
    circle(g, 0, -0.6, 1.5);
    g.fillStyle = (o.glow || 0) > 0.3 ? C.butterHi : o.col || ink;
    g.fill();
    g.restore();
  }
  function toLocal(pt, x, y, s, sx) {
    const ss = s ?? FS, xx = sx ?? 1;
    return [(pt[0] - x) / (ss * xx), (pt[1] - y) / ss];
  }

  function inkFill(g, fill, lw, col) {
    if (fill) {
      g.fillStyle = fill;
      g.fill();
    }
    g.lineWidth = lw ?? 1.5;
    g.strokeStyle = col || C.ink;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.stroke();
  }
  function rr(g, x, y, w, h, r) {
    const rad = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    g.beginPath();
    g.moveTo(x + rad, y);
    g.arcTo(x + w, y, x + w, y + h, rad);
    g.arcTo(x + w, y + h, x, y + h, rad);
    g.arcTo(x, y + h, x, y, rad);
    g.arcTo(x, y, x + w, y, rad);
    g.closePath();
  }
  function ln(g, x0, y0, x1, y1, lw, col) {
    g.strokeStyle = col || C.ink;
    g.lineWidth = lw ?? 1.5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  function poly(g, pts, close) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      g.lineTo(pts[i][0], pts[i][1]);
    }
    if (close) {
      g.closePath();
    }
  }
  function circle(g, x, y, r) {
    g.beginPath();
    g.arc(x, y, Math.max(0.01, r), 0, TAU);
  }
  function wline(g, pts, lw, col, amp, seed) {
    g.strokeStyle = col || C.ink;
    g.lineWidth = lw ?? 1.5;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    let first = true;
    const a = amp ?? 0.5, sd = seed || 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1];
      const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const n = Math.max(1, Math.ceil(L / 5));
      const nx = -(p1[1] - p0[1]) / (L || 1), ny = (p1[0] - p0[0]) / (L || 1);
      for (let j = 0; j <= n; j++) {
        if (j === 0 && !first) {
          continue;
        }
        const k = j / n;
        const w = wob(sd + (i * 7 + j) * 0.9) * a * Math.sin(Math.PI * k);
        const px = lerp(p0[0], p1[0], k) + nx * w, py = lerp(p0[1], p1[1], k) + ny * w;
        if (first) {
          g.moveTo(px, py);
          first = false;
        } else {
          g.lineTo(px, py);
        }
      }
    }
    g.stroke();
  }
  function text(g, s, x, y, size, col, align, base) {
    g.font = FONT(size);
    g.fillStyle = col || C.ink;
    g.textAlign = align || 'center';
    g.textBaseline = base || 'alphabetic';
    g.fillText(s, x, y);
  }
  function partial(pts, k) {
    if (k >= 1) {
      return pts;
    }
    let total = 0;
    const lens = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      lens.push(l);
      total += l;
    }
    let want = total * Math.max(0, k);
    const out = [pts[0]];
    for (let i = 0; i < lens.length; i++) {
      if (want >= lens[i]) {
        out.push(pts[i + 1]);
        want -= lens[i];
        continue;
      }
      out.push(L2(pts[i], pts[i + 1], lens[i] ? want / lens[i] : 0));
      break;
    }
    return out;
  }
  function plen(pts) {
    let t = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      t += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    }
    return t;
  }
  function tip(pts) {
    return pts[pts.length - 1];
  }
  function star(g, x, y, r, n, inner) {
    g.beginPath();
    const N = n || 5;
    for (let i = 0; i < N * 2; i++) {
      const rad = i % 2 ? r * (inner ?? 0.45) : r;
      const a = -Math.PI / 2 + (i * Math.PI) / N;
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      if (i === 0) {
        g.moveTo(px, py);
      } else {
        g.lineTo(px, py);
      }
    }
    g.closePath();
  }
  function arcPt(a, b, h, k) {
    const x = lerp(a[0], b[0], k);
    const y = lerp(a[1], b[1], k) - Math.sin(Math.PI * k) * h;
    return [x, y];
  }
  function sparks(g, x, y, k, r, n, col) {
    if (k <= 0 || k >= 1) {
      return;
    }
    const N = n || 5;
    g.save();
    g.globalAlpha *= 1 - k;
    for (let i = 0; i < N; i++) {
      const a = -Math.PI / 2 + (i - (N - 1) / 2) * 0.55;
      const r0 = r * (0.6 + k * 0.6), r1 = r * (0.95 + k * 0.9);
      ln(g, x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1, 1.3, col || C.ink);
    }
    g.restore();
  }

  const NULLG = new Proxy({}, { get: (t, k) => (k === 'globalAlpha' ? 1 : () => {}), set: () => true });

  window.RIG = {
    NULLG,
    C, H, GY, FS, TAU, FONT, BASE, PK, E, WOB,
    lerp, L2, clamp, seg, wob, hash,
    P, mix, seq, nseq, shift, breathe, legs, walkSeg, footCycle, UPPER, STRIDE,
    ik, reach, fig, frontArm, arrow, arrowHead, arcArrow, toLocal, wave, hatShape,
    inkFill, rr, ln, poly, circle, wline, text, partial, plen, tip, star, arcPt, sparks, strokePath,
  };
})();

// ---------------------------------------------------------------- kit: shared prop and timing helpers
(function () {
  const R = window.RIG;
  const { C, E, FS, STRIDE, TAU, FONT, toLocal, seg, clamp, lerp, hash, partial, strokePath, inkFill, rr, ln, circle, text, arcPt } = R;

  const inWorld = (g, J, fn) => {
    g.save();
    g.scale(1 / (J.s * J.sx), 1 / J.s);
    g.translate(-J.x, -J.y);
    fn();
    g.restore();
  };
  // Idle gestures (pulse) fade back in after an action ends, so the pose never jumps.
  let settle = 1;
  const setSettle = (v) => {
    settle = v;
  };
  const pulse = (t, per, at, len, edge) => {
    const l = ((t % per) + per) % per;
    const e = edge ?? 0.25;
    return settle * E.soft(seg(l, at, at + len * e)) * (1 - E.soft(seg(l, at + len * (1 - e), at + len)));
  };
  const lp = (pt, x, y, sx) => toLocal(pt, x, y, FS, sx);
  const sxv = (v) => (v < 0 ? -1 : 1);
  const tri = (x) => 1 - Math.abs((((x % 2) + 2) % 2) - 1);
  const tw = (g, s, size) => {
    g.font = FONT(size || 9);
    return g.measureText(s).width;
  };
  const typed = (s, k) => s.slice(0, Math.floor(s.length * clamp(k, 0, 1) + 1e-4));
  const still = (x) => ({ x, ph: 0, amp: 0 });
  function gait(xf, T, sx) {
    const x = xf(T);
    const v = (xf(T + 0.04) - xf(T - 0.04)) / 0.08;
    return { x, ph: (x * (sx || 1)) / (STRIDE * 2 * FS), amp: clamp(Math.abs(v) / 40, 0, 1) };
  }
  function toward(from, to, back) {
    const dx = to[0] - from[0], dy = to[1] - from[1], d = Math.hypot(dx, dy) || 1;
    return [to[0] - (dx / d) * back, to[1] - (dy / d) * back];
  }
  function pill(g, cx, cy, label, fill, ink, size) {
    const s = size || 9;
    const w = tw(g, label, s) + 12, h = s + 8;
    rr(g, cx - w / 2, cy - h / 2, w, h, h / 2);
    inkFill(g, fill || C.paper, 1.2, ink || C.ink);
    text(g, label, cx, cy + s * 0.34, s, ink || C.ink);
    return w;
  }
  function pole(g, a, b, lw) {
    const w = lw || 4.2;
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    ln(g, a[0], a[1], b[0], b[1], w, C.ink);
    ln(g, a[0] + ux * 0.8, a[1] + uy * 0.8, b[0] - ux * 0.8, b[1] - uy * 0.8, w - 2.2, C.wood);
  }
  function tick(g, x, y, k, s, col) {
    if (k <= 0) {
      return;
    }
    const z = s || 1;
    strokePath(g, partial([[x - 5 * z, y], [x - 1.5 * z, y + 3.5 * z], [x + 6 * z, y - 5 * z]], k), 2.2 * Math.min(1.4, z), col || C.greenInk);
  }
  function tickBadge(g, x, y, k, r, fill, ink) {
    if (k <= 0) {
      return;
    }
    const rad = r || 8;
    const s = E.back(clamp(k * 1.6, 0, 1));
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    circle(g, 0, 0, rad);
    inkFill(g, fill || C.green, 1.3, ink || C.greenInk);
    strokePath(g, partial([[-rad * 0.45, 0], [-rad * 0.1, rad * 0.38], [rad * 0.5, -rad * 0.38]], clamp(k * 2 - 0.4, 0.01, 1)), 1.8, ink || C.greenInk);
    g.restore();
  }
  function win(g, x, y, w, h, title, fill) {
    rr(g, x, y, w, h, 4);
    inkFill(g, fill || C.paper, 1.6);
    ln(g, x, y + 13, x + w, y + 13, 1.2);
    for (let i = 0; i < 3; i++) {
      circle(g, x + 7 + i * 6, y + 6.5, 1.8);
      inkFill(g, i === 0 ? C.butter : C.paper, 0.9);
    }
    if (title) {
      text(g, title, x + w / 2 + 8, y + 10, 8.5, C.muted);
    }
  }
  function term(g, x, y, w, h, title) {
    rr(g, x, y, w, h, 4);
    inkFill(g, '#2b2b2b', 1.6);
    ln(g, x, y + 13, x + w, y + 13, 1, '#4a4a4a');
    for (let i = 0; i < 3; i++) {
      circle(g, x + 7 + i * 6, y + 6.5, 1.8);
      g.fillStyle = ['#e58f8f', C.butterHi, '#8fd19e'][i];
      g.fill();
    }
    if (title) {
      text(g, title, x + w / 2 + 8, y + 10, 8.5, '#a3a3a3');
    }
  }
  function stand(g, x0, x1, yb, sp) {
    ln(g, x0, yb, x0 - (sp ?? 6), 0, 2.2);
    ln(g, x1, yb, x1 + (sp ?? 6), 0, 2.2);
  }
  function words(g, x, y, w, seed, col, lw) {
    let cx = x, i = 0;
    while (cx < x + w - 3) {
      const ww = Math.min(x + w - cx, 7 + hash(seed + i * 3.1) * 15);
      ln(g, cx, y, cx + ww, y, lw ?? 2, col || '#cfcfcf');
      cx += ww + 4;
      i++;
    }
  }
  function held(g, J, fn) {
    inWorld(g, J, () => fn(J.W(J.handF), J.W(J.handB)));
  }
  function floatText(g, s, x, y, k, col, size) {
    if (k <= 0 || k >= 1) {
      return;
    }
    g.save();
    g.globalAlpha *= Math.sin(Math.PI * k);
    text(g, s, x, y - k * 16, size || 10, col || C.ink);
    g.restore();
  }
  // Speech bubble whose tail tip points down at (x + tail, y + 7). The body stays centred on x; the tail
  // base is kept inside the rounded body and the tip leans out toward the speaker, so it never detaches.
  function bubble(g, x, y, s, k, o) {
    if (k <= 0) {
      return;
    }
    const opt = o || {};
    const size = opt.size || 9;
    const w = tw(g, s, size) + 18, h = size + 12, r = Math.min(h / 2, 8);
    const z = E.back(clamp(k, 0, 1));
    const want = opt.tail ?? -w / 4;
    const lim = Math.max(0, w / 2 - r - 4);
    const base = clamp(want, -lim, lim);
    const tip = clamp(want, -w / 2 - 2, w / 2 + 2) + (want >= 0 ? 2 : -2) * (Math.abs(want) <= lim ? 1 : 0);
    g.save();
    g.translate(x, y);
    g.scale(z, z);
    g.beginPath();
    g.moveTo(-w / 2 + r, -h);
    g.lineTo(w / 2 - r, -h);
    g.arcTo(w / 2, -h, w / 2, -h + r, r);
    g.lineTo(w / 2, -r);
    g.arcTo(w / 2, 0, w / 2 - r, 0, r);
    g.lineTo(base + 4, 0);
    g.lineTo(tip, 7);
    g.lineTo(base - 4, 0);
    g.lineTo(-w / 2 + r, 0);
    g.arcTo(-w / 2, 0, -w / 2, -r, r);
    g.lineTo(-w / 2, -h + r);
    g.arcTo(-w / 2, -h, -w / 2 + r, -h, r);
    g.closePath();
    g.save();
    g.translate(1.6, 1.8);
    g.fillStyle = 'rgba(20,20,20,0.12)';
    g.fill();
    g.restore();
    inkFill(g, opt.fill || C.paper, 1.4, opt.stroke || C.ink);
    text(g, s, 0, -h / 2 + size * 0.36, size, opt.ink || C.ink);
    g.restore();
  }
  function plane(g, a, b, k, h, size) {
    if (k <= 0 || k >= 1) {
      return;
    }
    const p = arcPt(a, b, h ?? 40, k);
    const q = arcPt(a, b, h ?? 40, Math.min(1, k + 0.02));
    const ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const s = size || 1;
    g.save();
    g.translate(p[0], p[1]);
    g.rotate(ang);
    g.scale(s, s);
    g.beginPath();
    g.moveTo(9, 0);
    g.lineTo(-7, -6);
    g.lineTo(-3, 0);
    g.lineTo(-7, 6);
    g.closePath();
    inkFill(g, C.paper, 1.3);
    ln(g, 9, 0, -3, 0, 1);
    g.restore();
  }
  Object.assign(R, { setSettle, inWorld, pulse, lp, sxv, tri, tw, typed, still, gait, toward, pill, pole, tick, tickBadge, win, term, stand, words, held, floatText, bubble, plane });
})();

// ---------------------------------------------------------------- stage: one canvas per scene, shared clock
(function () {
  const R = window.RIG;
  const { C, H, GY, seg, E, wob } = R;
  const SCENES = (window.SCENES = window.SCENES || {});
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const WAVE_DUR = 1.25;

  class View {
    constructor(canvas, id, opt) {
      const o = opt || {};
      this.cv = canvas;
      this.g = canvas.getContext('2d');
      this.id = id;
      this.def = SCENES[id];
      this.st = {};
      this.t = o.t0 ?? Math.random() * 20;
      this.u = 0;
      this.on = false;
      this.n = 0;
      this.since = 99;
      this.hover = false;
      this.loop = !!o.loop;
      this.vis = false;
      this.paused = false;
      this.waveT = -1;
      this.ground = o.ground !== false;
      this.floor = o.floor !== false;
      this.zoom = o.zoom || 1;
      this.w = 0;
      this.h = 0;
      this.dirty = true;
      this.resize();
    }
    resize() {
      const r = this.cv.getBoundingClientRect();
      if (!r.width || !r.height) {
        return;
      }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.dpr = dpr;
      this.w = r.width;
      this.h = r.height;
      this.px = r.left + window.scrollX;
      const W = Math.round(r.width * dpr), Hh = Math.round(r.height * dpr);
      if (this.cv.width !== W || this.cv.height !== Hh) {
        this.cv.width = W;
        this.cv.height = Hh;
      }
      this.S = Math.min(r.height / H, r.width / ((this.def && this.def.width) || 380)) * this.zoom;
      this.dirty = true;
    }
    play() {
      if (this.def.loopOnly || reduced.matches) {
        return;
      }
      if (!this.on) {
        this.on = true;
        this.u = 0;
      }
      this.dirty = true;
      kick();
    }
    present() {
      this.waveT = 0;
      this.on = false;
      this.u = 0;
      kick();
    }
    step(dt) {
      this.t += dt;
      if (this.waveT >= 0) {
        this.waveT += dt;
        if (this.waveT > WAVE_DUR) {
          this.waveT = -1;
          if (this.loop) {
            this.play();
          }
        }
        return;
      }
      if (this.on) {
        this.u += dt / this.def.dur;
        if (this.u >= 1) {
          this.n++;
          if (this.hover || this.loop) {
            this.u -= 1;
          } else {
            this.on = false;
            this.u = 0;
            this.since = 0;
          }
        }
        return;
      }
      if (this.loop && !reduced.matches) {
        this.play();
      }
      this.since += dt;
    }
    draw() {
      const g = this.g;
      if (!this.w) {
        return;
      }
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.clearRect(0, 0, this.w, this.h);
      const S = this.S, gy = this.h - (H - GY) * S;
      if (this.floor) {
        g.fillStyle = C.floor;
        g.fillRect(0, gy, this.w, this.h - gy);
      }
      // The ground goes down first, so anything lying on it (a pond, a rug, a shadow) covers the line.
      if (this.ground) {
        g.save();
        g.strokeStyle = C.ink;
        g.lineWidth = 2.2 * Math.min(1.2, Math.max(0.75, S));
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.beginPath();
        const step = 6;
        for (let x = -step; x <= this.w + step; x += step) {
          const yy = gy + wob((this.px + x) / 6) * Math.max(0.8, S);
          if (x === -step) {
            g.moveTo(x, yy);
          } else {
            g.lineTo(x, yy);
          }
        }
        g.stroke();
        g.restore();
      }
      g.save();
      g.translate(this.w / 2, gy);
      g.scale(S, S);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      const u = this.u;
      const w = this.on ? E.sm(seg(u, 0, 0.07)) * E.sm(1 - seg(u, 0.93, 1)) : 0;
      const wk = this.waveT >= 0 ? E.soft(seg(this.waveT, 0, 0.25)) * (1 - E.soft(seg(this.waveT, WAVE_DUR - 0.3, WAVE_DUR))) : 0;
      R.setSettle(this.on ? 1 : E.sm(Math.min(1, Math.max(0, this.since / 0.8))));
      this.def.draw(g, { t: this.t, u, on: this.on, w, n: this.n, since: this.since, st: this.st, wave: wk, wt: this.waveT, hover: this.hover });
      R.setSettle(1);
      g.restore();
      this.dirty = false;
    }
  }

  const views = new Set();
  let raf = 0, last = 0;
  function tick(ts) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));
    last = ts;
    let any = false;
    for (const v of views) {
      if (!v.vis || v.paused) {
        continue;
      }
      if (reduced.matches) {
        if (v.dirty) {
          v.draw();
        }
        continue;
      }
      v.step(dt);
      v.draw();
      any = true;
    }
    if (any && !document.hidden) {
      raf = requestAnimationFrame(tick);
    }
  }
  function kick() {
    if (raf || document.hidden) {
      return;
    }
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      kick();
    }
  });
  const io =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (ents) => {
            for (const e of ents) {
              const v = e.target.__view;
              if (!v) {
                continue;
              }
              v.vis = e.isIntersecting;
              if (v.vis) {
                v.dirty = true;
                if (v.onSeen && e.intersectionRatio > 0.5) {
                  const f = v.onSeen;
                  v.onSeen = null;
                  setTimeout(f, 350);
                }
              }
            }
            kick();
          },
          { rootMargin: '80px 0px', threshold: [0, 0.55] },
        )
      : null;

  function add(canvas, id, opt) {
    const v = new View(canvas, id, opt);
    canvas.__view = v;
    views.add(v);
    if (io && !(opt && opt.always)) {
      io.observe(canvas);
    } else {
      v.vis = true;
    }
    if (reduced.matches) {
      v.t = 1.3;
    }
    kick();
    return v;
  }
  function remove(v) {
    views.delete(v);
    if (io) {
      io.unobserve(v.cv);
    }
  }

  // ---------------------------------------------------------------- <stick-scene scene="id" play="click|hover|view|loop|idle">
  const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Balsamiq+Sans:wght@400;700&display=swap';
  function ensureFont() {
    if (document.querySelector('link[data-stick-font]') || [...document.querySelectorAll('link[href*="Balsamiq"]')].length) {
      return;
    }
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = FONT_HREF;
    l.dataset.stickFont = '';
    document.head.appendChild(l);
  }
  function ensureStyle() {
    if (document.getElementById('stick-scene-css')) {
      return;
    }
    const s = document.createElement('style');
    s.id = 'stick-scene-css';
    s.textContent = 'stick-scene{display:block;position:relative;height:230px;-webkit-tap-highlight-color:transparent}stick-scene>canvas{position:absolute;inset:0;width:100%;height:100%;display:block}stick-scene[data-act]{cursor:pointer}stick-scene:focus-visible{outline:2px solid currentColor;outline-offset:4px;border-radius:8px}';
    document.head.appendChild(s);
  }
  function whenScene(id, cb, n) {
    if (SCENES[id]) {
      cb();
      return;
    }
    if ((n || 0) > 240) {
      console.warn(`stick-scene: no scene called "${id}"`);
      return;
    }
    requestAnimationFrame(() => whenScene(id, cb, (n || 0) + 1));
  }

  class StickScene extends HTMLElement {
    connectedCallback() {
      if (this.cv) {
        return;
      }
      ensureStyle();
      if (!this.hasAttribute('no-font')) {
        ensureFont();
      }
      this.cv = document.createElement('canvas');
      this.cv.setAttribute('aria-hidden', 'true');
      this.appendChild(this.cv);
      const id = this.getAttribute('scene');
      whenScene(id, () => this.start(id));
    }
    start(id) {
      const play = this.getAttribute('play') || 'click';
      const v = add(this.cv, id, {
        loop: play === 'loop',
        ground: !this.hasAttribute('no-ground'),
        floor: !this.hasAttribute('no-floor'),
        zoom: Number(this.getAttribute('zoom')) || 1,
      });
      this.v = v;
      this.setAttribute('role', 'img');
      if (!this.hasAttribute('aria-label')) {
        this.setAttribute('aria-label', this.getAttribute('label') || v.def.label || id);
      }
      if (play !== 'loop' && play !== 'idle') {
        this.dataset.act = '';
        this.tabIndex = 0;
        this.addEventListener('click', () => v.play());
        this.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            v.play();
          }
        });
      }
      if (play === 'hover') {
        this.addEventListener('pointerenter', (e) => {
          if (e.pointerType === 'mouse') {
            v.hover = true;
            v.play();
          }
        });
        this.addEventListener('pointerleave', () => {
          v.hover = false;
        });
      }
      if (play === 'view') {
        v.onSeen = () => v.play();
      }
      if ('ResizeObserver' in window) {
        new ResizeObserver(() => {
          v.resize();
          v.draw();
        }).observe(this);
      }
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          v.dirty = true;
          v.draw();
        });
      }
    }
    disconnectedCallback() {
      if (this.v) {
        remove(this.v);
        this.v = null;
        this.cv.remove();
        this.cv = null;
      }
    }
  }
  if (!customElements.get('stick-scene')) {
    customElements.define('stick-scene', StickScene);
  }

  // Freeze a scene at one moment, for screenshots and tests. { idle: seconds } or { u: 0..1 }.
  function at(el, o) {
    const v = el.v || el.__view;
    if (!v) {
      return false;
    }
    v.paused = true;
    if (o.n != null) {
      v.n = o.n;
    }
    if (o.u != null) {
      v.on = true;
      v.u = o.u;
      v.t = o.t ?? 3;
    } else {
      v.on = false;
      v.u = 0;
      v.t = o.idle ?? 0;
    }
    if (o.since != null) {
      v.since = o.since;
    }
    v.resize();
    v.draw();
    return true;
  }
  function theme(over) {
    Object.assign(C, over || {});
    for (const v of views) {
      v.dirty = true;
      v.draw();
    }
  }
  window.STICK = { View, add, remove, views, kick, reduced, at, theme, SCENES };
  window.CREW = window.CREW || window.STICK;
})();
