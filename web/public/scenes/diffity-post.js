// diffity: stamp your review, it flies to GitHub, a GitHub comment flies back onto the diff, you resolve it
(function () {
  const SC = (window.SCENES = window.SCENES || {});
  const R = window.RIG;
  const { C, E, P, mix, legs, walkSeg, fig, inkFill, rr, ln, text, seg, breathe, sparks, pulse, lp, plane, bubble, tickBadge, words, arcPt, circle } = R;

  const ADD = '#dafbe1', ADD_INK = '#1a7f37', DEL = '#ffebe9', DEL_INK = '#cf222e';
  const B = { x: -150, y: -162, w: 176, h: 112 };
  const LY = (i) => B.y + 30 + i * 12;
  const STAMP = [B.x + 52, B.y + B.h - 20];
  const NOTE = [B.x + 14, LY(4)];
  const GH = [B.x + 120, LY(2)];
  const BOX = { x: 120, y: -134, w: 62, h: 42 };
  const SLOT = [BOX.x + 8, BOX.y + 16];
  const HOME = -208, AT = B.x - 14;
  const HIT = [STAMP[0] - 26, STAMP[1] + 2];
  const VERDICTS = [
    { s: 'approved', ink: ADD_INK, fill: 'rgba(218,251,225,0.92)', w: 72 },
    { s: 'changes requested', ink: DEL_INK, fill: 'rgba(255,235,233,0.92)', w: 108 },
    { s: 'comment', ink: '#6b6b6b', fill: 'rgba(240,240,240,0.92)', w: 70 },
  ];

  function board(g) {
    ln(g, B.x + 22, B.y + B.h, B.x + 10, 0, 2.2);
    ln(g, B.x + B.w - 22, B.y + B.h, B.x + B.w - 10, 0, 2.2);
    ln(g, B.x + 40, B.y + B.h + 28, B.x + B.w - 40, B.y + B.h + 28, 1.4, '#bdbdbd');
    rr(g, B.x, B.y, B.w, B.h, 6);
    inkFill(g, C.paper, 1.7);
    ln(g, B.x, B.y + 17, B.x + B.w, B.y + 17, 1.3);
    text(g, 'diffity', B.x + 10, B.y + 12, 8.5, C.ink, 'left');
    text(g, 'PR #42', B.x + B.w - 10, B.y + 12, 8.5, C.muted, 'right');
    for (let i = 0; i < 6; i++) {
      const y = LY(i);
      const kind = [0, 2, 1, 0, 2, 0][i];
      if (kind) {
        rr(g, B.x + 4, y - 5, B.w - 8, 10, 2);
        g.fillStyle = kind === 1 ? DEL : ADD;
        g.fill();
        text(g, kind === 1 ? '−' : '+', B.x + 12, y + 3, 9, kind === 1 ? DEL_INK : ADD_INK);
        words(g, B.x + 22, y, 80 + ((i * 23) % 50), i * 5, kind === 1 ? '#e7a3a3' : '#7cc48e', 2.2);
        continue;
      }
      text(g, String(20 + i), B.x + 12, y + 3, 7, '#b0b0b0');
      words(g, B.x + 24 + (i % 3) * 8, y, 70 + ((i * 37) % 40), i * 5, '#cfcfcf', 2);
    }
  }

  function sticky(g, x, y, rot, k) {
    if (k <= 0) {
      return;
    }
    const z = E.back(k);
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.scale(z, z);
    rr(g, -2, -8, 24, 16, 2);
    inkFill(g, C.butter, 1.3);
    ln(g, 3, -3, 17, -3, 1.5, '#b98a1a');
    ln(g, 3, 2, 12, 2, 1.5, '#b98a1a');
    g.restore();
  }

  function ghCard(g, x, y, k, rot, faded) {
    if (k <= 0) {
      return;
    }
    const z = E.back(Math.min(1, k));
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.scale(z, z);
    g.globalAlpha *= faded ? 0.55 : 1;
    rr(g, -16, -10, 34, 20, 3);
    inkFill(g, C.paper, 1.3);
    circle(g, -9, -3, 3.4);
    inkFill(g, '#c9c9c9', 1);
    ln(g, -3, -4, 12, -4, 1.6, '#9a9a9a');
    ln(g, -11, 4, 10, 4, 1.6, '#cfcfcf');
    g.restore();
  }

  function stamp(g, v, k) {
    if (k <= 0) {
      return;
    }
    const z = 1 + (1 - E.out3(Math.min(1, k))) * 0.9;
    g.save();
    g.translate(STAMP[0], STAMP[1]);
    g.rotate(-0.16);
    g.scale(z, z);
    g.globalAlpha *= seg(k, 0, 0.3);
    rr(g, -v.w / 2, -11, v.w, 22, 5);
    inkFill(g, v.fill, 1.8, v.ink);
    text(g, v.s, 0, 4, 10, v.ink);
    g.restore();
  }

  function mailbox(g, flagK, shake, flagCol) {
    rr(g, BOX.x + BOX.w / 2 - 4, BOX.y + BOX.h, 8, -BOX.y - BOX.h, 2);
    inkFill(g, C.wood, 1.5);
    g.save();
    g.translate(Math.sin(shake * 40) * shake * 2, 0);
    rr(g, BOX.x, BOX.y, BOX.w, BOX.h, 12);
    inkFill(g, C.paper, 1.8);
    rr(g, SLOT[0] - 3, SLOT[1] - 2.5, 16, 5, 2);
    g.fillStyle = '#2b2b2b';
    g.fill();
    text(g, 'GitHub', BOX.x + BOX.w / 2 + 4, BOX.y + 34, 9.5, C.ink);
    const px = BOX.x + BOX.w, py = BOX.y + 24;
    const ang = 1.35 - flagK * (1.35 + Math.PI / 2);
    g.translate(px, py);
    g.rotate(ang);
    ln(g, 0, 0, 22, 0, 2.2);
    g.restore();
    g.save();
    g.translate(px + Math.sin(shake * 40) * shake * 2, py);
    g.rotate(ang);
    g.beginPath();
    g.moveTo(12, 0);
    g.lineTo(22, 0);
    g.lineTo(22, 9);
    g.lineTo(12, 9);
    g.closePath();
    inkFill(g, flagCol, 1.4);
    g.restore();
    circle(g, px, py, 2.2);
    g.fillStyle = C.ink;
    g.fill();
  }

  SC['diffity-post'] = {
    dur: 9,
    width: 480,
    label: 'A stick figure stamps a review verdict on a pull request in Diffity, the review flies to a GitHub mailbox, a GitHub comment flies back onto the diff and the figure resolves it.',
    draw(g, S) {
      const T = S.on ? S.u * this.dur : -1;
      const t = S.t;
      const v = VERDICTS[S.n % 3];
      let x = HOME, gait = { ph: 0, amp: 0 };
      let pose = breathe(P({ hF: [12, -60], hB: [-4, -52] }), t);
      let stampK = 0, sheetK = 0, planeK = 0, flagK = 0, shake = 0, cardFly = 0, cardK = 0, tickK = 0, saidK = 0, fade = 1;
      const chin = P({ hF: [10, -96], head: [7, -116], hB: [-4, -54] });
      if (T < 0) {
        pose = mix(pose, chin, pulse(t, 5.5, 2, 2.2));
      } else {
        fade = 1 - seg(T, this.dur - 0.5, this.dur);
        const ws = T < 4 ? walkSeg(T, 0, 0.5, HOME, AT) : walkSeg(T, 7.2, 7.8, AT, HOME);
        x = ws.x;
        gait = ws.dir * 1 < 0 ? { ph: -ws.ph, amp: ws.amp, stride: ws.stride } : ws;
        const lift = E.soft(seg(T, 0.6, 0.9)) * (1 - seg(T, 1.05, 1.12));
        const slam = E.sm(seg(T, 0.88, 1.05)) * (1 - E.soft(seg(T, 1.3, 1.6)));
        const flick = E.soft(seg(T, 1.7, 1.9)) * (1 - E.soft(seg(T, 2.1, 2.4)));
        const watch = E.soft(seg(T, 2.4, 2.7)) * (1 - E.soft(seg(T, 4.6, 4.9)));
        const read = E.soft(seg(T, 4.9, 5.1)) * (1 - E.soft(seg(T, 5.3, 5.5)));
        const touch = E.soft(seg(T, 5.4, 5.7)) * (1 - E.soft(seg(T, 5.9, 6.2)));
        const cheer = E.back(seg(T, 6.3, 6.7)) * (1 - E.soft(seg(T, 6.8, 7.1)));
        pose = mix(pose, P({ hF: [20, -121], hB: [-4, -54], head: [6, -117] }), lift);
        pose = mix(pose, P({ hF: lp(HIT, x, 0, 1), hB: [-4, -54], head: [14, -112], chest: [8, -88] }), slam);
        pose = mix(pose, P({ hF: [40, -102], hB: [-4, -54], head: [10, -116] }), flick);
        pose = mix(pose, P({ hF: [12, -60], hB: [-4, -52], head: [12, -117] }), watch);
        pose = mix(pose, chin, read);
        pose = mix(pose, P({ hF: lp([NOTE[0] + 4, NOTE[1]], x, 0, 1), hB: [-4, -54], head: [9, -114], chest: [3, -90] }), touch);
        pose = mix(pose, P({ hF: [14, -132], hB: [-10, -130], head: [3, -118] }), cheer);
        stampK = T < 1.9 ? seg(T, 1.0, 1.12) : 0;
        sheetK = seg(T, 1.9, 2.2);
        planeK = seg(T, 2.15, 3.0);
        flagK = E.back(seg(T, 3.0, 3.35)) * (1 - E.soft(seg(T, 7.6, 8.1)));
        shake = seg(T, 2.95, 3.0) * (1 - seg(T, 3.0, 3.3));
        cardFly = seg(T, 3.7, 4.5);
        cardK = seg(T, 4.45, 4.7) * fade;
        tickK = seg(T, 5.6, 5.9) * fade;
        saidK = seg(T, 6.3, 6.45) * (1 - seg(T, 7.0, 7.2));
      }
      pose = legs(pose, gait.ph, gait.amp, { arms: false, stride: gait.stride });

      board(g);
      sticky(g, NOTE[0] - 6, LY(2), 0.1, 1);
      mailbox(g, flagK, shake, v.ink);
      const J = fig(g, pose, x, 0, { wave: S.wave, wt: S.wt });
      text(g, 'you', HOME, 18, 10, C.muted);
      stamp(g, v, stampK);
      if (stampK > 0) {
        R.frontArm(g, J);
      }
      if (sheetK > 0 && sheetK < 1) {
        const z = 1 - E.in(sheetK);
        g.save();
        g.translate(STAMP[0] + sheetK * 40, STAMP[1] - sheetK * 30);
        g.rotate(-0.16 + sheetK * 0.8);
        g.scale(z, z);
        rr(g, -v.w / 2 - 4, -14, v.w + 8, 28, 3);
        inkFill(g, C.paper, 1.5);
        text(g, v.s, 0, 4, 10, v.ink);
        g.restore();
      }
      plane(g, [STAMP[0] + 40, STAMP[1] - 30], [SLOT[0] + 4, SLOT[1]], planeK, 70, 1);
      sparks(g, SLOT[0] + 4, SLOT[1] - 4, seg(T, 3.0, 3.5), 14, 6, v.ink);
      sparks(g, STAMP[0], STAMP[1] - 12, seg(T, 1.02, 1.6), 16, 6, v.ink);
      if (cardFly > 0 && cardFly < 1) {
        const p = arcPt([SLOT[0] + 4, SLOT[1]], NOTE, 60, E.soft(cardFly));
        ghCard(g, p[0], p[1], 1, cardFly * 6.28, false);
      }
      ghCard(g, NOTE[0] + 10, NOTE[1] + 4, cardK, -0.08, tickK > 0.5);
      tickBadge(g, NOTE[0] + 26, NOTE[1] - 4, tickK, 6, ADD, ADD_INK);
      bubble(g, AT + 20, -142, 'nice', saidK, { tail: -14, size: 8.5 });
    },
  };
})();
