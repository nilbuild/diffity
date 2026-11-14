// diffity: stomp a giant shortcut key, a search box drops, type a few letters, pick a result, the board jumps there
(function () {
  const SC = (window.SCENES = window.SCENES || {});
  const R = window.RIG;
  const { C, E, P, mix, legs, walkSeg, fig, inkFill, rr, ln, text, seg, breathe, sparks, pulse, lp, bubble, words, lerp } = R;

  const ADD = '#dafbe1', ADD_INK = '#1a7f37', DEL = '#ffebe9', DEL_INK = '#cf222e';
  const B = { x: -46, y: -166, w: 196, h: 116 };
  const LY = (i) => B.y + 34 + i * 12;
  const ROWS = 6;
  const KEY = { x: -140, w: 68, h: 30 };
  const HOME = -192, AT = -154;
  const VARIANTS = [
    { key: '⌘P', q: 'date', results: ['utils/date.ts', 'date.test.ts', 'format-date.ts'], file: 'utils/date.ts' },
    { key: '⌘K', q: 'login', results: ['login.tsx', 'add login page', 'PR #42 login'], file: 'add login page' },
    { key: '⌘F', q: 'TODO', results: ['store.ts:12', 'auth.ts:40', 'login.tsx:8'], file: 'auth.ts' },
  ];
  const PICK = 1;
  const typed = (s, k) => s.slice(0, Math.floor(s.length * Math.min(1, Math.max(0, k))));

  function key(g, down, label) {
    const y = -KEY.h + down * 8;
    rr(g, KEY.x - 3, -6, KEY.w + 6, 6, 2);
    inkFill(g, '#d9d9d9', 1.5);
    rr(g, KEY.x, y, KEY.w, KEY.h - down * 8 - 2, 6);
    inkFill(g, '#f4f4f4', 1.8);
    rr(g, KEY.x + 5, y + 3, KEY.w - 10, KEY.h - down * 8 - 10, 4);
    inkFill(g, C.paper, 1.2);
    text(g, label, KEY.x + KEY.w / 2, y + 17, 12, C.ink);
  }

  function stand(g) {
    ln(g, B.x + 22, B.y + B.h, B.x + 10, 0, 2.2);
    ln(g, B.x + B.w - 22, B.y + B.h, B.x + B.w - 10, 0, 2.2);
    ln(g, B.x + 40, B.y + B.h + 28, B.x + B.w - 40, B.y + B.h + 28, 1.4, '#bdbdbd');
  }

  function rows(g, scroll, speed, hiK) {
    g.save();
    g.beginPath();
    g.rect(B.x + 2, B.y + 20, B.w - 4, B.h - 22);
    g.clip();
    const base = Math.floor(scroll), off = (scroll - base) * 12;
    for (let i = 0; i <= ROWS + 1; i++) {
      const line = base + i;
      const y = LY(i) - 12 - off;
      g.save();
      g.globalAlpha *= 1 - speed * 0.6;
      const kind = line % 7 === 3 ? 2 : line % 11 === 5 ? 1 : 0;
      if (line === 120 && hiK > 0) {
        rr(g, B.x + 4, y - 5, B.w - 8, 10, 2);
        g.fillStyle = `rgba(250,226,140,${0.9 * hiK})`;
        g.fill();
      } else if (kind) {
        rr(g, B.x + 4, y - 5, B.w - 8, 10, 2);
        g.fillStyle = kind === 1 ? DEL : ADD;
        g.fill();
      }
      text(g, String(line + 1), B.x + 22, y + 3, 7, '#a6a6a6', 'right');
      const col = kind === 2 ? '#7cc48e' : kind === 1 ? '#e7a3a3' : '#cfcfcf';
      words(g, B.x + 30 + (line % 3) * 7, y, 70 + ((line * 37) % 70), line * 5, col, 2);
      g.restore();
    }
    g.restore();
    if (speed > 0.15) {
      g.save();
      g.globalAlpha *= speed;
      for (let i = 0; i < 3; i++) {
        const sx = B.x + B.w - 14 - i * 6;
        ln(g, sx, B.y + 40 + i * 16, sx, B.y + 76 + i * 16, 1.4, '#9a9a9a');
      }
      g.restore();
    }
  }

  function board(g, fileName, scroll, speed, hiK) {
    rr(g, B.x, B.y, B.w, B.h, 6);
    inkFill(g, C.paper, 1.7);
    rows(g, scroll, speed, hiK);
    rr(g, B.x, B.y, B.w, 18, 6);
    g.fillStyle = C.paper;
    g.fill();
    ln(g, B.x, B.y + 18, B.x + B.w, B.y + 18, 1.3);
    rr(g, B.x, B.y, B.w, B.h, 6);
    inkFill(g, null, 1.7);
    text(g, 'diffity', B.x + 10, B.y + 12.5, 8.5, C.ink, 'left');
    text(g, fileName, B.x + B.w - 10, B.y + 12.5, 8, C.muted, 'right');
  }

  function palette(g, v, k, typeK, resK, sel, flash, t) {
    if (k <= 0) {
      return;
    }
    const w = B.w - 40, x = B.x + 20;
    const y = lerp(B.y - 70, B.y + 24, E.back(Math.min(1, k)));
    const h = 22 + 13 * 3 * resK + (resK > 0 ? 6 : 0);
    g.save();
    g.globalAlpha *= Math.min(1, k * 3);
    rr(g, x + 3, y + 3, w, h, 5);
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fill();
    rr(g, x, y, w, h, 5);
    inkFill(g, C.paper, 1.6);
    text(g, '⌕', x + 10, y + 14.5, 10, C.muted);
    const q = typed(v.q, typeK);
    text(g, q, x + 20, y + 14.5, 9, C.ink, 'left');
    g.font = '9px "Balsamiq Sans", sans-serif';
    if (typeK < 1.2 && Math.floor(t * 3) % 2 === 0) {
      const cw = q ? g.measureText(q).width : 0;
      ln(g, x + 21 + cw, y + 7, x + 21 + cw, y + 17, 1.2);
    }
    if (resK > 0) {
      ln(g, x, y + 22, x + w, y + 22, 1, '#e0e0e0');
      for (let i = 0; i < 3; i++) {
        const ry = y + 29 + i * 13;
        const a = Math.min(1, Math.max(0, resK * 3 - i));
        if (a <= 0) {
          continue;
        }
        g.save();
        g.globalAlpha *= a;
        if (Math.abs(sel - i) < 0.5) {
          rr(g, x + 4, ry - 6, w - 8, 12, 3);
          g.fillStyle = flash ? '#cfe9d5' : '#eef6f0';
          g.fill();
        }
        text(g, v.results[i], x + 12, ry + 3, 8.5, C.ink, 'left');
        g.restore();
      }
    }
    g.restore();
  }

  SC['diffity-keys'] = {
    dur: 7.6,
    width: 460,
    label: 'A stick figure stomps a giant shortcut key, a search box drops over the Diffity board, a few letters filter the results, and the board jumps to the picked one.',
    draw(g, S) {
      const T = S.on ? S.u * this.dur : -1;
      const t = S.t;
      const v = VARIANTS[S.n % 3];
      let x = HOME, gait = { ph: 0, amp: 0 };
      let pose = breathe(P({ hF: [12, -60], hB: [-4, -52] }), t);
      let down = 0, palK = 0, typeK = 0, resK = 0, sel = 0, flash = false, scroll = 0, speed = 0, hiK = 0, jumped = false, saidK = 0;
      const chin = P({ hF: [10, -96], head: [7, -116], hB: [-4, -54] });
      if (T < 0) {
        pose = mix(pose, chin, pulse(t, 5.5, 2, 2.2));
      } else {
        const fade = 1 - seg(T, this.dur - 0.5, this.dur);
        const ws = T < 3 ? walkSeg(T, 0, 0.5, HOME, AT) : walkSeg(T, 5.6, 6.2, AT, HOME);
        x = ws.x;
        gait = ws;
        const lift = E.soft(seg(T, 0.55, 0.85)) * (1 - E.soft(seg(T, 0.88, 0.96)));
        const stomp = E.in(seg(T, 0.88, 0.96)) * (1 - E.soft(seg(T, 1.2, 1.45)));
        const watch = E.soft(seg(T, 1.4, 1.6)) * (1 - E.soft(seg(T, 3.9, 4.1)));
        const point = E.soft(seg(T, 2.5, 2.7)) * (1 - E.soft(seg(T, 3.2, 3.4)));
        const cheer = E.back(seg(T, 4.2, 4.45)) * (1 - E.soft(seg(T, 4.9, 5.2)));
        pose = mix(pose, P({ fF: [22, -40], kF: [26, -52], hF: [16, -78], hB: [-14, -74], head: [6, -117] }), lift);
        pose = mix(pose, P({ fF: [24, -22], kF: [26, -44], hF: [18, -70], hB: [-14, -70], head: [7, -115], chest: [2, -88], hip: [2, -50] }), stomp);
        pose = mix(pose, P({ hF: [12, -60], hB: [-4, -52], head: [12, -118] }), watch);
        pose = mix(pose, P({ hF: [40, -104], hB: [-4, -54], head: [10, -117] }), point);
        pose = mix(pose, P({ hF: [14, -132], hB: [-10, -130], head: [3, -118] }), cheer);
        down = E.out3(seg(T, 0.9, 0.98)) * (1 - E.back(seg(T, 1.2, 1.45)));
        palK = seg(T, 1.05, 1.45) * (1 - seg(T, 3.3, 3.5));
        typeK = seg(T, 1.55, 2.2);
        resK = seg(T, 1.8, 2.3);
        sel = lerp(0, PICK, E.soft(seg(T, 2.55, 2.85)));
        flash = T > 3.05 && T < 3.3;
        const jk = seg(T, 3.35, 3.95);
        scroll = (1 - Math.pow(1 - jk, 3)) * 117 * (1 - E.soft(seg(T, 6.4, 7.0)));
        speed = Math.max(jk > 0 && jk < 1 ? Math.sin(Math.PI * jk) : 0, seg(T, 6.4, 7.0) > 0 && seg(T, 6.4, 7.0) < 1 ? Math.sin(Math.PI * seg(T, 6.4, 7.0)) : 0);
        hiK = seg(T, 3.9, 4.1) * (1 - seg(T, 6.2, 6.4)) * fade;
        jumped = T > 3.6 && T < 6.6;
        saidK = seg(T, 4.25, 4.4) * (1 - seg(T, 5.0, 5.2));
      }
      pose = legs(pose, gait.ph, gait.amp, { arms: false });

      stand(g);
      board(g, jumped ? v.file : 'store.ts', scroll, speed, hiK);
      palette(g, v, palK, typeK, resK, sel, flash, t);
      key(g, down, v.key);
      fig(g, pose, x, 0, { wave: S.wave, wt: S.wt });
      text(g, 'you', HOME, 18, 10, C.muted);
      sparks(g, KEY.x + KEY.w / 2, -KEY.h - 4, seg(T, 0.95, 1.5), 22, 8, C.amber);
      bubble(g, AT + 20, -146, 'found it', saidK, { tail: -14, size: 8.5 });
    },
  };
})();
