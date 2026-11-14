// diffity: slide a bracket along the commit rail to pick a commit, a range or your uncommitted edits, and the diff swaps to match
(function () {
  const SC = (window.SCENES = window.SCENES || {});
  const R = window.RIG;
  const { C, E, P, mix, legs, walkSeg, fig, inkFill, rr, ln, text, seg, breathe, sparks, pulse, bubble, words, lerp, circle, arcPt, hash } = R;

  const ADD = '#dafbe1', ADD_INK = '#1a7f37', DEL = '#ffebe9', DEL_INK = '#cf222e';
  const RY = -74;
  const RX0 = -196, RX1 = 36;
  const HASHES = ['a1f', '3c2', '7e9', 'c9e', 'f04', 'wip'];
  const bx = (i) => -176 + i * 38;
  const B = { x: 60, y: -170, w: 172, h: 112 };
  const MID = B.y + B.h / 2;
  const LY = (i) => B.y + 30 + i * 12.5;
  const HOME = -222;
  const GRAB = 24;
  const IDLE = { a: 4, b: 4, label: 'f04', seed: 4, say: '' };
  const PICKS = [
    { a: 1, b: 3, label: '3c2..c9e', seed: 11, say: 'just these' },
    { a: 2, b: 2, label: '7e9', seed: 23, say: 'that one' },
    { a: 5, b: 5, label: 'uncommitted', seed: 37, say: 'my edits' },
  ];
  const edgeL = (p) => bx(p.a) - 13;
  const edgeR = (p) => bx(p.b) + 13;

  function rail(g, L, Rr, t) {
    ln(g, RX0 + 6, RY + 4, RX0, 0, 2.2);
    ln(g, RX1 - 6, RY + 4, RX1, 0, 2.2);
    ln(g, RX0, RY, RX1, RY, 2.4);
    for (let i = 0; i < HASHES.length; i++) {
      const x = bx(i);
      const on = x > L && x < Rr;
      circle(g, x, RY, 7.5);
      if (i === 5) {
        g.fillStyle = on ? C.butterHi : C.paper;
        g.fill();
        g.save();
        g.setLineDash([2.5, 2.5]);
        g.lineWidth = 1.6;
        g.strokeStyle = C.ink;
        g.stroke();
        g.restore();
      } else {
        inkFill(g, on ? C.butterHi : C.paper, 1.8);
      }
      text(g, HASHES[i], x, RY + 21, 7.5, on ? C.ink : C.muted);
    }
  }

  function bracket(g, L, Rr, glow) {
    g.save();
    if (glow > 0) {
      g.globalAlpha *= 0.25 + 0.35 * glow;
      rr(g, L, RY - 13, Rr - L, 26, 7);
      g.fillStyle = C.butter;
      g.fill();
      g.globalAlpha = 1;
    }
    rr(g, L, RY - 13, Rr - L, 26, 7);
    g.lineWidth = 2.2;
    g.strokeStyle = '#b98a1a';
    g.stroke();
    g.restore();
    rr(g, L - 3, RY - 7, 5, 14, 2);
    inkFill(g, C.butter, 1.3, '#b98a1a');
    rr(g, Rr - 2, RY - 7, 5, 14, 2);
    inkFill(g, C.butter, 1.3, '#b98a1a');
  }

  function rowsFor(g, seed, uncommitted) {
    for (let i = 0; i < 6; i++) {
      const y = LY(i);
      const r = hash(seed * 7.3 + i * 3.1);
      const kind = r < 0.3 ? 'ctx' : r < 0.6 ? 'del' : 'add';
      if (kind === 'ctx') {
        text(g, String(10 + i), B.x + 10, y + 3, 7, '#b0b0b0', 'left');
        words(g, B.x + 26, y, 60 + ((seed * 13 + i * 37) % 50), seed + i * 5, '#cfcfcf', 2);
        continue;
      }
      const add = kind === 'add';
      rr(g, B.x + 4, y - 5, B.w - 8, 10, 2);
      g.fillStyle = add ? ADD : DEL;
      g.fill();
      if (uncommitted) {
        g.save();
        g.setLineDash([3, 2]);
        g.lineWidth = 1;
        g.strokeStyle = add ? '#7cc48e' : '#e7a3a3';
        g.stroke();
        g.restore();
      }
      text(g, add ? '+' : '−', B.x + 10, y + 3, 9, add ? ADD_INK : DEL_INK);
      words(g, B.x + 22, y, 70 + ((seed * 7 + i * 29) % 60), seed * 3 + i * 7, add ? '#7cc48e' : '#e7a3a3', 2.2);
    }
  }

  function board(g, state, sy) {
    ln(g, B.x + 22, B.y + B.h, B.x + 10, 0, 2.2);
    ln(g, B.x + B.w - 22, B.y + B.h, B.x + B.w - 10, 0, 2.2);
    ln(g, B.x + 40, B.y + B.h + 30, B.x + B.w - 40, B.y + B.h + 30, 1.4, '#bdbdbd');
    if (sy <= 0.001) {
      ln(g, B.x - 4, MID, B.x + B.w + 4, MID, 2.4, C.butterHi);
      return;
    }
    g.save();
    g.translate(0, MID);
    g.scale(1, sy);
    g.translate(0, -MID);
    rr(g, B.x, B.y, B.w, B.h, 6);
    inkFill(g, C.paper, 1.7);
    ln(g, B.x, B.y + 17, B.x + B.w, B.y + 17, 1.3);
    text(g, 'diffity', B.x + 10, B.y + 12, 8.5, C.ink, 'left');
    g.font = '8px "Balsamiq Sans", sans-serif';
    const lw = Math.max(26, g.measureText(state.label).width + 12);
    rr(g, B.x + B.w - 8 - lw, B.y + 3.5, lw, 11, 5.5);
    inkFill(g, '#fff6d8', 1.1, '#b98a1a');
    text(g, state.label, B.x + B.w - 8 - lw / 2, B.y + 11.5, 8, C.ink);
    rowsFor(g, state.seed, state === PICKS[2]);
    g.restore();
  }

  function card(g, from, to, k) {
    if (k <= 0 || k >= 1) {
      return;
    }
    const p = arcPt(from, to, 50, E.soft(k));
    g.save();
    g.translate(p[0], p[1]);
    g.rotate(k * 1.4 - 0.4);
    rr(g, -10, -6, 20, 12, 3);
    inkFill(g, C.butter, 1.3, '#b98a1a');
    g.restore();
  }

  SC['diffity-refs'] = {
    dur: 8.4,
    width: 480,
    label: 'A person slides a bracket along a line of commits to pick a commit, a range or their uncommitted changes, and the Diffity diff swaps to show it.',
    draw(g, S) {
      const T = S.on ? S.u * this.dur : -1;
      const t = S.t;
      const pick = PICKS[S.n % PICKS.length];
      let x = HOME, gait = { ph: 0, amp: 0 };
      let pose = breathe(P({ hF: [12, -60], hB: [-4, -52] }), t);
      let L = edgeL(IDLE), Rr = edgeR(IDLE);
      let state = IDLE, sy = 1, glow = 0, cardK = 0, sayK = 0, fade = 1;
      const chin = P({ hF: [10, -96], head: [7, -116], hB: [-4, -54] });
      if (T < 0) {
        pose = mix(pose, chin, pulse(t, 5.5, 2, 2.2));
      } else {
        fade = 1 - seg(T, this.dur - 0.6, this.dur);
        const L0 = edgeL(IDLE), La = edgeL(pick), R0 = edgeR(IDLE), Rb = edgeR(pick);
        const walks = [
          walkSeg(T, 0, 1.1, HOME, L0 - GRAB),
          walkSeg(T, 1.4, 2.6, L0 - GRAB, La - GRAB),
          walkSeg(T, 6.0, 7.2, La - GRAB, HOME),
        ];
        const ws = T < 1.4 ? walks[0] : T < 6.0 ? walks[1] : walks[2];
        x = ws.x;
        gait = ws;
        const dragK = E.soft(seg(T, 1.4, 2.6));
        const back = E.soft(seg(T, this.dur - 0.9, this.dur - 0.2));
        L = lerp(lerp(L0, La, dragK), L0, back);
        Rr = lerp(lerp(R0, Rb, dragK), R0, back);
        const grab = E.soft(seg(T, 1.0, 1.3)) * (1 - E.soft(seg(T, 2.65, 2.9)));
        pose = mix(pose, P({ hF: [(L - x) / 0.88 + 2, RY / 0.88], hB: [-4, -54], head: [9, -114], chest: [3, -90] }), grab);
        const point = E.soft(seg(T, 2.9, 3.1)) * (1 - E.soft(seg(T, 3.5, 3.7)));
        pose = mix(pose, P({ hF: [40, -100], hB: [-4, -54], head: [10, -116] }), point);
        const nod = E.back(seg(T, 4.2, 4.45)) * (1 - E.soft(seg(T, 5.2, 5.5)));
        pose = mix(pose, P({ hF: [14, -132], hB: [-10, -130], head: [3, -118] }), nod);
        glow = seg(T, 2.6, 2.8) * (1 - seg(T, 3.6, 4.2));
        cardK = seg(T, 3.0, 3.6);
        const foldIn = E.in(seg(T, 3.5, 3.7));
        const foldOut = E.back(seg(T, 3.7, 4.0));
        const foldBack = seg(T, this.dur - 0.9, this.dur - 0.2);
        if (foldBack > 0) {
          sy = foldBack < 0.5 ? 1 - E.in(foldBack * 2) : E.back((foldBack - 0.5) * 2);
          state = foldBack < 0.5 ? pick : IDLE;
        } else if (T < 3.7) {
          sy = 1 - foldIn;
          state = IDLE;
        } else {
          sy = foldOut;
          state = pick;
        }
        sayK = seg(T, 4.2, 4.35) * (1 - seg(T, 5.4, 5.6));
      }
      pose = legs(pose, gait.ph, gait.amp, { arms: false });

      board(g, state, sy);
      rail(g, L, Rr, t);
      bracket(g, L, Rr, glow);
      fig(g, pose, x, 0, { wave: S.wave, wt: S.wt });
      text(g, 'you', x, 18, 10, C.muted);
      card(g, [(L + Rr) / 2, RY - 14], [B.x + B.w / 2, B.y - 2], cardK);
      sparks(g, B.x + B.w / 2, B.y - 4, seg(T, 3.7, 4.2), 16, 7, C.amber);
      bubble(g, x + 26, -138, pick.say, sayK, { tail: -14, size: 8.5 });
    },
  };
})();
