// diffity: mention @claude or @codex in a comment and that agent answers in the thread
(function () {
  const SC = (window.SCENES = window.SCENES || {});
  const R = window.RIG;
  const { C, E, P, mix, legs, walkSeg, fig, inkFill, rr, ln, text, seg, breathe, sparks, pulse, lp, bubble, words, arcPt, circle } = R;

  const ADD = '#dafbe1', DEL = '#ffebe9', DEL_INK = '#cf222e', ADD_INK = '#1a7f37';
  const BOTS = [
    { name: 'claude', x: 148, ink: '#d97757', dark: '#a8553a', far: '#e8b7a3' },
    { name: 'codex', x: 216, ink: '#3d7a8c', dark: '#2a5866', far: '#a9c9d1' },
  ];
  const B = { x: -150, y: -172, w: 210, h: 124 };
  const LY = (i) => B.y + 32 + i * 12.5;
  const ROWS = 7;
  const NOTE = { x: B.x + 14, y: LY(3) - 8, w: 48, h: 16 };
  const CARD = { x: B.x + 14, y: NOTE.y + NOTE.h + 3, w: 92, h: 22 };
  const HOME = -222, AT = B.x - 28;

  function board(g) {
    ln(g, B.x + 24, B.y + B.h, B.x + 12, 0, 2.2);
    ln(g, B.x + B.w - 24, B.y + B.h, B.x + B.w - 12, 0, 2.2);
    ln(g, B.x + 40, B.y + B.h + 28, B.x + B.w - 40, B.y + B.h + 28, 1.4, '#bdbdbd');
    rr(g, B.x, B.y, B.w, B.h, 6);
    inkFill(g, C.paper, 1.7);
    ln(g, B.x, B.y + 17, B.x + B.w, B.y + 17, 1.3);
    text(g, 'diffity', B.x + 10, B.y + 12, 8.5, C.ink, 'left');
    text(g, 'cache.ts', B.x + B.w - 10, B.y + 12, 8.5, C.muted, 'right');
    for (let i = 0; i < ROWS; i++) {
      const y = LY(i);
      text(g, String(60 + i), B.x + 11, y + 3, 7, '#b0b0b0');
      if (i === 2 || i === 3) {
        rr(g, B.x + 20, y - 5, B.w - 24, 10, 2);
        g.fillStyle = i === 2 ? DEL : ADD;
        g.fill();
        text(g, i === 2 ? '−' : '+', B.x + 26, y + 3, 9, i === 2 ? DEL_INK : ADD_INK);
      }
      const col = i === 2 ? '#e7a3a3' : i === 3 ? '#7cc48e' : '#cfcfcf';
      words(g, B.x + 34 + (i % 3) * 8, y, 80 + ((i * 37) % 60), i * 5 + 3, col, 2);
    }
  }

  function note(g, k, who) {
    if (k <= 0) {
      return;
    }
    const z = E.back(k);
    g.save();
    g.translate(NOTE.x, NOTE.y);
    g.scale(z, z);
    g.rotate(-0.04);
    rr(g, 0, 0, NOTE.w, NOTE.h, 2);
    inkFill(g, C.butter, 1.3);
    text(g, '@' + BOTS[who].name, 5, 11, 8, '#7a5a00', 'left');
    g.restore();
  }

  function card(g, k, who) {
    if (k <= 0) {
      return;
    }
    const z = E.back(k);
    const b = BOTS[who];
    g.save();
    g.translate(CARD.x, CARD.y);
    g.scale(z, z);
    ln(g, 6, -3, 6, 2, 1.4, '#bdbdbd');
    rr(g, 0, 0, CARD.w, CARD.h, 3);
    inkFill(g, C.paper, 1.3);
    rr(g, 4, 5, 10, 10, 3);
    inkFill(g, b.ink, 1, b.dark);
    words(g, 19, 7, 64, 11 + who * 3, '#bdbdbd', 1.8);
    words(g, 19, 14, 46, 23 + who * 3, '#bdbdbd', 1.8);
    g.restore();
  }

  function botStyle(b, glow, blink) {
    return { col: b.ink, dark: b.dark, glow: glow ? 1 : 0, blink };
  }

  function plant(g, x, t) {
    const sway = Math.sin(t * 1.3) * 0.06;
    for (const [a, len] of [[-0.5, 15], [0.05, 19], [0.6, 14]]) {
      g.save();
      g.translate(x, -15);
      g.rotate(a + sway);
      g.beginPath();
      g.ellipse(0, -len / 2, 4.2, len / 2, 0, 0, Math.PI * 2);
      inkFill(g, '#9fd18f', 1.3);
      g.restore();
    }
    g.beginPath();
    g.moveTo(x - 8, -16);
    g.lineTo(x + 8, -16);
    g.lineTo(x + 6, 0);
    g.lineTo(x - 6, 0);
    g.closePath();
    inkFill(g, '#e8a27c', 1.5);
  }

  SC['diffity-ask'] = {
    dur: 8,
    width: 500,
    label: 'A stick figure pins a comment that mentions @claude or @codex on a diff, that AI agent thinks for a moment and its answer appears right under the comment in the same thread.',
    draw(g, S) {
      const T = S.on ? S.u * this.dur : -1;
      const t = S.t;
      const who = S.n % 2;
      let x = HOME, gait = { ph: 0, amp: 0 };
      let pose = breathe(P({ hF: [12, -60], hB: [-4, -52] }), t);
      let noteK = 0, cardK = 0, tagK = 0, ansK = 0, think = 0, hop = 0, point = 0, hmm = 0, thanks = 0, look = 0;
      const chin = P({ hF: [10, -96], head: [7, -116], hB: [-4, -54] });
      if (T < 0) {
        pose = mix(pose, chin, pulse(t, 5.5, 2, 2.2));
      } else {
        const fade = 1 - seg(T, this.dur - 0.5, this.dur);
        const ws = T < 3 ? walkSeg(T, 0, 0.55, HOME, AT) : walkSeg(T, 5.4, 6.0, AT, HOME);
        x = ws.x;
        gait = ws;
        const reach = E.soft(seg(T, 0.6, 0.85)) * (1 - E.soft(seg(T, 1.05, 1.3)));
        const read = E.soft(seg(T, 3.7, 3.95)) * (1 - E.soft(seg(T, 4.25, 4.45)));
        const nod = E.soft(seg(T, 4.45, 4.6)) * (1 - E.soft(seg(T, 4.75, 4.95)));
        pose = mix(pose, P({ hF: lp([NOTE.x + 6, NOTE.y + 8], x, 0, 1), hB: [-4, -54], head: [9, -114], chest: [3, -90] }), reach);
        pose = mix(pose, P({ hF: [12, -60], hB: [-4, -52], head: [11, -113], chest: [4, -89] }), read);
        pose = mix(pose, P({ hF: [12, -60], hB: [-4, -52], head: [9, -110] }), nod);
        noteK = seg(T, 0.8, 1.05) * fade;
        tagK = seg(T, 1.2, 1.8);
        hop = Math.sin(Math.PI * seg(T, 1.8, 2.1)) * 6;
        think = E.soft(seg(T, 2.05, 2.25)) * (1 - E.soft(seg(T, 2.85, 3.0)));
        hmm = seg(T, 2.1, 2.25) * (1 - seg(T, 2.8, 2.95));
        point = E.soft(seg(T, 2.95, 3.1)) * (1 - E.soft(seg(T, 3.4, 3.65)));
        ansK = seg(T, 3.0, 3.55);
        cardK = seg(T, 3.5, 3.75) * fade;
        look = E.soft(seg(T, 1.8, 2.1)) * (1 - E.soft(seg(T, 3.7, 4.0)));
        thanks = seg(T, 4.5, 4.65) * (1 - seg(T, 5.3, 5.45));
      }
      pose = legs(pose, gait.ph, gait.amp, { arms: false });

      plant(g, 92, t);
      board(g);
      BOTS.forEach((b, i) => {
        const me = T >= 0 && i === who;
        let bp = breathe(P({ hF: [12, -60], hB: [-4, -52], head: [4, -117] }), t + i * 1.7);
        bp = mix(bp, P({ hF: [10, -60], hB: [-4, -52], head: [1, -118] }), pulse(t, 6, 1 + i * 2.6, 1.3));
        if (me) {
          bp = mix(bp, P({ hF: [10, -96], hB: [-4, -54], head: [6, -118] }), think);
          bp = mix(bp, i === 0 ? P({ hF: [40, -100], hB: [-4, -54], head: [10, -116] }) : P({ hF: [16, -132], hB: [-4, -54], head: [6, -117] }), point);
        } else if (T >= 0) {
          const side = who < i ? -1 : 1;
          bp = mix(bp, P({ hF: [12, -60], hB: [-4, -52], head: [side * 5 + 2, -117] }), look);
        }
        const glow = me && (tagK >= 1 && T < 3.6) ? Math.floor(t * 4) % 2 === 0 : false;
        const blink = pulse(t, 4.3 + i, 1.2 + i, 0.15) > 0.5;
        fig(g, bp, b.x, me ? -hop : 0, { sx: -1, ink: b.ink, far: b.far, floor: 0, bot: botStyle(b, glow, blink) });
        text(g, b.name, b.x, 18, 10, b.ink);
      });
      fig(g, pose, x, 0, { wave: S.wave, wt: S.wt });
      text(g, 'you', x, 18, 10, C.muted);

      note(g, noteK, who);
      card(g, cardK, who);
      const b = BOTS[who];
      if (tagK > 0 && tagK < 1) {
        const p = arcPt([NOTE.x + 20, NOTE.y], [b.x - 4, -122], 14, E.soft(tagK));
        circle(g, p[0], p[1], 8);
        inkFill(g, C.butter, 1.3);
        text(g, '@', p[0], p[1] + 4, 11, '#7a5a00');
      }
      if (ansK > 0 && ansK < 1) {
        const p = arcPt([b.x - 18, -96], [CARD.x + CARD.w / 2, CARD.y + 8], 46, E.soft(ansK));
        rr(g, p[0] - 12, p[1] - 6, 24, 12, 3);
        inkFill(g, C.paper, 1.3, b.dark);
        circle(g, p[0] - 6, p[1], 2.4);
        g.fillStyle = b.ink;
        g.fill();
      }
      sparks(g, b.x, -150, seg(T, 1.8, 2.3), 12, 6, C.amber);
      bubble(g, b.x - 16, -138, 'hmm…', hmm, { tail: 10, size: 8.5 });
      bubble(g, x - 4, -142, 'ah, thanks!', thanks, { tail: 8, size: 8.5 });
    },
  };
})();
