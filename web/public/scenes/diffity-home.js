// diffity: Home lists what needs you across repos; a new PR jumps to the top, you open it and review
(function () {
  const SC = (window.SCENES = window.SCENES || {});
  const R = window.RIG;
  const { C, E, P, mix, legs, walkSeg, fig, inkFill, rr, ln, text, seg, breathe, sparks, pulse, lp, bubble, lerp, words, circle, tickBadge } = R;

  const ADD = '#dafbe1', ADD_INK = '#1a7f37', DEL = '#ffebe9', DEL_INK = '#cf222e';
  const B = { x: -92, y: -172, w: 204, h: 128 };
  const MID = B.y + B.h / 2;
  const SLOT = (i) => B.y + 24 + i * 24;
  const HOME = -205, AT = -122;
  const CARDS = [
    { repo: 'web', col: '#e8a27c', title: 'agent finished', meta: 'login' },
    { repo: 'cli', col: '#9fd18f', title: '2 comments to answer', meta: '' },
    { repo: 'docs', col: '#b9a6e8', title: 'PR #7 waiting on you', meta: '' },
  ];
  const URGENT = { repo: 'api', col: '#8fb8e8', title: 'PR #42 needs review', meta: '' };
  const NOTE_ROW = 4;

  function folded(g, sy, fn) {
    if (sy <= 0.001) {
      return;
    }
    g.save();
    g.translate(0, MID);
    g.scale(1, sy);
    g.translate(0, -MID);
    fn(g);
    g.restore();
  }

  function stand(g) {
    ln(g, B.x + 26, B.y + B.h, B.x + 14, 0, 2.2);
    ln(g, B.x + B.w - 26, B.y + B.h, B.x + B.w - 14, 0, 2.2);
    ln(g, B.x + 44, B.y + B.h + 26, B.x + B.w - 44, B.y + B.h + 26, 1.4, '#bdbdbd');
  }

  function card(g, c, y, dx, glow, done, t) {
    const x = B.x + 8 + dx, w = B.w - 16;
    if (glow > 0) {
      g.save();
      g.globalAlpha *= glow * (0.55 + Math.sin(t * 6) * 0.25);
      rr(g, x - 3, y - 3, w + 6, 26, 6);
      g.fillStyle = C.butterHi;
      g.fill();
      g.restore();
    }
    rr(g, x, y, w, 20, 4);
    inkFill(g, glow > 0.5 ? '#fffbeb' : C.paper, 1.2, glow > 0.5 ? C.ink : '#cfcfcf');
    rr(g, x + 6, y + 6, 8, 8, 2);
    g.fillStyle = c.col;
    g.fill();
    text(g, c.repo, x + 18, y + 13, 7.5, C.muted, 'left');
    text(g, c.title, x + 42, y + 13, 8, C.ink, 'left');
    if (done > 0) {
      tickBadge(g, x + w - 10, y + 10, done, 6, ADD, ADD_INK);
    }
  }

  function home(g, list, t) {
    rr(g, B.x, B.y, B.w, B.h, 6);
    inkFill(g, C.paper, 1.7);
    ln(g, B.x, B.y + 15, B.x + B.w, B.y + 15, 1.3);
    text(g, 'diffity', B.x + 10, B.y + 11, 8.5, C.ink, 'left');
    text(g, 'Home · needs you', B.x + B.w - 10, B.y + 11, 8, C.muted, 'right');
    g.save();
    g.beginPath();
    g.rect(B.x + 2, B.y + 17, B.w - 4, B.h - 19);
    g.clip();
    for (const it of list) {
      if (it.a <= 0) {
        continue;
      }
      g.save();
      g.globalAlpha *= it.a;
      card(g, it.c, it.y, it.dx, it.glow, it.done, t);
      g.restore();
    }
    g.restore();
  }

  function diff(g, noteK) {
    rr(g, B.x, B.y, B.w, B.h, 6);
    inkFill(g, C.paper, 1.7);
    ln(g, B.x, B.y + 15, B.x + B.w, B.y + 15, 1.3);
    text(g, 'diffity', B.x + 10, B.y + 11, 8.5, C.ink, 'left');
    rr(g, B.x + B.w - 62, B.y + 4, 54, 9, 4.5);
    inkFill(g, '#eaf2fb', 1, '#5b88b8');
    text(g, 'api · #42', B.x + B.w - 35, B.y + 11, 7, '#2d5f8f');
    for (let i = 0; i < 8; i++) {
      const y = B.y + 26 + i * 12.5;
      const kind = i === 2 || i === NOTE_ROW ? 'del' : i === 3 || i === 5 || i === 6 ? 'add' : '';
      if (kind) {
        rr(g, B.x + 4, y - 5, B.w - 8, 10, 2);
        g.fillStyle = kind === 'add' ? ADD : DEL;
        g.fill();
        text(g, kind === 'add' ? '+' : '−', B.x + 26, y + 3, 9, kind === 'add' ? ADD_INK : DEL_INK);
      } else {
        text(g, String(30 + i), B.x + 12, y + 3, 7, '#b0b0b0', 'left');
      }
      words(g, B.x + 36 + (i % 3) * 6, y, 80 + ((i * 29) % 60), i * 7, kind === 'add' ? '#7cc48e' : kind === 'del' ? '#e7a3a3' : '#cfcfcf', 2);
    }
    if (noteK > 0) {
      const z = E.back(noteK);
      g.save();
      g.translate(B.x + 10, B.y + 26 + NOTE_ROW * 12.5 - 1);
      g.rotate(0.12);
      g.scale(z, z);
      rr(g, -2, -8, 24, 16, 2);
      inkFill(g, C.butter, 1.3);
      ln(g, 3, -3, 17, -3, 1.5, '#b98a1a');
      ln(g, 3, 2, 12, 2, 1.5, '#b98a1a');
      g.restore();
    }
  }

  function repos(g, bump, t) {
    const x = 182;
    rr(g, x - 30, -20, 60, 20, 3);
    inkFill(g, C.wood, 1.5);
    ln(g, x - 22, -10, x + 22, -10, 1, '#b8916a');
    const stack = [CARDS[0], CARDS[1], CARDS[2], URGENT];
    stack.forEach((c, i) => {
      const lift = i === 3 ? bump * 10 : 0;
      const y = -30 - i * 11 - lift;
      g.save();
      g.translate(x + (i % 2 ? 3 : -2), y);
      g.rotate((i % 2 ? 0.04 : -0.05) + (i === 3 ? Math.sin(t * 20) * 0.08 * bump : 0));
      rr(g, -24, -2, 14, 4, 1.5);
      inkFill(g, c.col, 1.1);
      rr(g, -24, 0, 48, 10, 2);
      inkFill(g, c.col, 1.3);
      text(g, c.repo, 0, 8, 7, C.ink);
      g.restore();
    });
    text(g, 'your repos', x, 16, 9, C.muted);
  }

  function mug(g, hand, t) {
    const [x, y] = hand;
    rr(g, x - 4.5, y - 9, 9, 10, 2);
    inkFill(g, C.paper, 1.3);
    g.beginPath();
    g.arc(x + 5, y - 4, 2.6, -Math.PI / 2, Math.PI / 2);
    g.lineWidth = 1.3;
    g.strokeStyle = C.ink;
    g.stroke();
    for (let i = 0; i < 2; i++) {
      const k = (t * 0.5 + i * 0.5) % 1;
      const yy = y - 12 - k * 10;
      g.save();
      g.globalAlpha *= Math.sin(Math.PI * k) * 0.5;
      ln(g, x - 1.5 + i * 3, yy, x - 1.5 + i * 3 + Math.sin(t * 3 + i) * 1.5, yy - 6, 1.2, '#9a9a9a');
      g.restore();
    }
  }

  SC['diffity-home'] = {
    dur: 9,
    width: 480,
    label: 'A person with a coffee watches Diffity Home, where a new pull request from another repo jumps to the top of what needs attention; they open it, comment on a line, and it drops off the list.',
    draw(g, S) {
      const T = S.on ? S.u * this.dur : -1;
      const t = S.t;
      let x = HOME, gait = { ph: 0, amp: 0 };
      const sip = P({ hF: [12, -60], hB: [9, -98], head: [4, -118] });
      let pose = breathe(P({ hF: [12, -60], hB: [6, -62], head: [6, -117] }), t);
      let bump = 0, enter = 0, rise = 0, leave = 0, done = 0, homeSy = 1, diffSy = 0, noteK = 0, oohK = 0, niceK = 0, flash = 0;
      if (T < 0) {
        pose = mix(pose, sip, pulse(t, 6, 2, 1.6));
      } else {
        const ws = T < 5 ? walkSeg(T, 1.9, 2.6, HOME, AT) : walkSeg(T, 7.0, 7.7, AT, HOME);
        x = ws.x;
        gait = ws;
        bump = Math.sin(Math.PI * seg(T, 0.05, 0.45));
        enter = E.out3(seg(T, 0.3, 0.8));
        rise = E.soft(seg(T, 1.0, 1.6));
        done = seg(T, 6.0, 6.25);
        leave = E.soft(seg(T, 6.3, 6.8));
        homeSy = T < 4.5 ? 1 - E.in(seg(T, 3.2, 3.45)) : E.back(seg(T, 5.65, 5.95));
        diffSy = T < 4.5 ? E.back(seg(T, 3.45, 3.8)) : 1 - E.in(seg(T, 5.4, 5.65));
        flash = Math.max(seg(T, 3.35, 3.5) * (1 - seg(T, 3.5, 3.7)), seg(T, 5.55, 5.7) * (1 - seg(T, 5.7, 5.9)));
        noteK = seg(T, 4.65, 4.85);
        oohK = seg(T, 1.3, 1.45) * (1 - seg(T, 2.3, 2.5));
        niceK = seg(T, 6.1, 6.25) * (1 - seg(T, 6.9, 7.1));
        const sipK = pulse(T + 100, 100, 100.4, 0.9) + E.soft(seg(T, 7.9, 8.2)) * (1 - E.soft(seg(T, 8.5, 8.8)));
        const look = E.soft(seg(T, 1.2, 1.4)) * (1 - E.soft(seg(T, 1.9, 2.1)));
        const tap = E.soft(seg(T, 2.7, 2.95)) * (1 - E.soft(seg(T, 3.2, 3.45)));
        const read = E.soft(seg(T, 3.8, 4.0)) * (1 - E.soft(seg(T, 4.35, 4.5)));
        const pin = E.soft(seg(T, 4.45, 4.7)) * (1 - E.soft(seg(T, 4.9, 5.15)));
        pose = mix(pose, sip, Math.min(1, sipK));
        pose = mix(pose, P({ hF: [12, -60], hB: [6, -62], head: [11, -119] }), look);
        pose = mix(pose, P({ hF: lp([B.x + 20, SLOT(0) + 10], x, 0, 1), hB: [6, -62], head: [10, -118], chest: [3, -90] }), tap);
        pose = mix(pose, P({ hF: [10, -96], hB: [6, -62], head: [9, -116] }), read);
        pose = mix(pose, P({ hF: lp([B.x + 14, B.y + 26 + NOTE_ROW * 12.5 + 1], x, 0, 1), hB: [6, -62], head: [9, -114], chest: [3, -90] }), pin);
      }
      pose = legs(pose, gait.ph, gait.amp, { arms: false });

      const list = [];
      CARDS.forEach((c, i) => {
        const slot = i + rise * (1 - leave);
        list.push({ c, y: SLOT(slot), dx: 0, a: 1, glow: 0, done: 0 });
      });
      if (T >= 0 && enter > 0) {
        const slot = lerp(3, 0, rise);
        list.push({ c: URGENT, y: SLOT(slot), dx: (1 - enter) * 220 + leave * 220, a: 1 - leave, glow: rise * (1 - done), done });
      }
      repos(g, bump, t);
      stand(g);
      folded(g, homeSy, () => home(g, list, t));
      folded(g, diffSy, () => diff(g, noteK));
      if (flash > 0) {
        g.save();
        g.globalAlpha *= flash;
        ln(g, B.x - 6, MID, B.x + B.w + 6, MID, 2.4, C.butterHi);
        g.restore();
      }
      const J = fig(g, pose, x, 0, { wave: S.wave, wt: S.wt });
      mug(g, J.w.handB, t);
      text(g, 'you', x, 16, 10, C.muted);
      sparks(g, 182, -70, seg(T, 0.1, 0.6), 14, 6, C.amber);
      sparks(g, B.x + B.w - 10, SLOT(3) + 4, seg(T, 0.7, 1.2), 12, 6, C.amber);
      bubble(g, x + 34, -142, 'ooh, #42', oohK, { tail: -24, size: 8.5 });
      bubble(g, x - 30, -142, 'done!', niceK, { tail: 22, size: 8.5 });
    },
  };
})();
