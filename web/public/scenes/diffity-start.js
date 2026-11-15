// diffity: get started — unpack the app, carry a repo from the shelf into Diffity, pin a comment on a line
(function () {
  const SC = (window.SCENES = window.SCENES || {});
  const R = window.RIG;
  const { C, E, P, mix, legs, walkSeg, fig, inkFill, rr, ln, text, seg, breathe, pulse, lp, sparks, tickBadge, words, arcPt, circle } = R;

  const ADD = '#dafbe1', ADD_INK = '#1a7f37', DEL = '#ffebe9', DEL_INK = '#cf222e';
  const APP = '#173d24', APP_HI = '#8fe388';
  const BOX = { x: -192, top: -44 };
  const SHELF = { x: -104, w: 52, top: -92 };
  const BINDERS = [
    { x: -100, col: '#cfe0ea' },
    { x: -86, col: C.butter, pick: true },
    { x: -72, col: '#e6e6e6' },
  ];
  const B = { x: 66, y: -152, w: 180, h: 100 };
  const ROW = (i) => B.y + 31 + i * 12;
  const NOTE = [B.x + 10, ROW(2) + 1];
  const HOME = -232, AT_SHELF = -122, AT_BOARD = 50;

  function stool(g) {
    ln(g, BOX.x - 14, BOX.top + 4, BOX.x - 18, 0, 2.2);
    ln(g, BOX.x + 14, BOX.top + 4, BOX.x + 18, 0, 2.2);
    ln(g, BOX.x - 16, -18, BOX.x + 16, -18, 1.4, '#bdbdbd');
    rr(g, BOX.x - 22, BOX.top, 44, 5, 2);
    inkFill(g, C.wood, 1.5);
  }

  function appIcon(g, x, y, s) {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    rr(g, -11, -11, 22, 22, 6);
    inkFill(g, APP, 1.5, C.ink);
    text(g, 'D', 0, 5, 13, APP_HI);
    g.restore();
  }

  function box(g, y, lid, a) {
    if (a <= 0) {
      return;
    }
    g.save();
    g.globalAlpha *= a;
    const x0 = BOX.x - 16, w = 32, h = 24;
    rr(g, x0, y - h, w, h, 2);
    inkFill(g, '#ead2a4', 1.6);
    ln(g, BOX.x, y - h + 6, BOX.x, y - 7, 1.6, C.umber);
    ln(g, BOX.x - 4, y - 11, BOX.x, y - 7, 1.6, C.umber);
    ln(g, BOX.x + 4, y - 11, BOX.x, y - 7, 1.6, C.umber);
    g.save();
    g.translate(x0, y - h);
    g.rotate(-lid * 2.1);
    rr(g, -1, -4, w + 2, 4, 1.5);
    inkFill(g, '#dcc08c', 1.5);
    g.restore();
    g.restore();
  }

  function binder(g, x, y, col, rot, s) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.scale(s, s);
    rr(g, -6, -22, 12, 22, 1.5);
    inkFill(g, col, 1.4);
    rr(g, -3.5, -17, 7, 6, 1);
    inkFill(g, C.paper, 1);
    g.restore();
  }

  function shelf(g, pickedA) {
    const x0 = SHELF.x, x1 = SHELF.x + SHELF.w;
    ln(g, x0 + 4, SHELF.top + 4, x0, 0, 2.2);
    ln(g, x1 - 4, SHELF.top + 4, x1, 0, 2.2);
    rr(g, x0 + 2, -46, SHELF.w - 4, 4, 1.5);
    inkFill(g, C.wood, 1.3);
    for (const b of BINDERS) {
      if (b.pick && pickedA <= 0) {
        continue;
      }
      g.save();
      g.globalAlpha *= b.pick ? pickedA : 1;
      binder(g, b.x, SHELF.top, b.col, 0, 1);
      g.restore();
    }
    rr(g, x0 - 2, SHELF.top, SHELF.w + 4, 5, 2);
    inkFill(g, C.wood, 1.5);
    text(g, 'repos', SHELF.x + SHELF.w / 2, -24, 8, C.muted);
  }

  function boardStand(g) {
    ln(g, B.x + 16, B.y + B.h, B.x + 8, 0, 2.2);
    ln(g, B.x + B.w - 16, B.y + B.h, B.x + B.w - 8, 0, 2.2);
    ln(g, B.x + 30, B.y + B.h + 28, B.x + B.w - 30, B.y + B.h + 28, 1.4, '#bdbdbd');
  }

  function board(g, diffK, emptyA) {
    rr(g, B.x, B.y, B.w, B.h, 6);
    inkFill(g, C.paper, 1.7);
    ln(g, B.x, B.y + 17, B.x + B.w, B.y + 17, 1.3);
    text(g, 'diffity', B.x + 10, B.y + 12, 8.5, C.ink, 'left');
    if (emptyA > 0) {
      g.save();
      g.globalAlpha *= emptyA;
      const cx = B.x + B.w / 2, cy = B.y + 52;
      rr(g, cx - 13, cy - 14, 26, 18, 2);
      g.setLineDash([3, 3]);
      g.lineWidth = 1.3;
      g.strokeStyle = '#b5b5b5';
      g.stroke();
      g.setLineDash([]);
      text(g, 'open a repo', cx, cy + 20, 8.5, C.muted);
      g.restore();
    }
    if (diffK <= 0) {
      return;
    }
    g.save();
    g.globalAlpha *= Math.min(1, diffK * 2);
    text(g, '+24 −6', B.x + B.w - 10, B.y + 12, 8.5, C.muted, 'right');
    g.restore();
    const kinds = 'f-++c+';
    for (let i = 0; i < kinds.length; i++) {
      const k = kinds[i];
      const a = seg(diffK, i / kinds.length * 0.8, i / kinds.length * 0.8 + 0.25);
      if (a <= 0) {
        continue;
      }
      const y = ROW(i) - 2;
      g.save();
      g.globalAlpha *= a;
      if (k === 'f') {
        text(g, 'app.ts', B.x + 10, y + 3, 7.5, C.muted, 'left');
        g.restore();
        continue;
      }
      if (k === 'c') {
        words(g, B.x + 30, y, 80, i * 5, '#cfcfcf', 2);
        g.restore();
        continue;
      }
      rr(g, B.x + 4, y - 5, B.w - 8, 10, 2);
      g.fillStyle = k === '+' ? ADD : DEL;
      g.fill();
      text(g, k === '+' ? '+' : '−', B.x + 44, y + 3, 9, k === '+' ? ADD_INK : DEL_INK);
      words(g, B.x + 54 + (i % 3) * 6, y, 60 + ((i * 29) % 40), i * 7, k === '+' ? '#7cc48e' : '#e7a3a3', 2.2);
      g.restore();
    }
  }

  function note(g, k, tickK, a) {
    if (k <= 0 || a <= 0) {
      return;
    }
    g.save();
    g.globalAlpha *= a;
    const z = E.back(k);
    g.save();
    g.translate(NOTE[0], NOTE[1]);
    g.rotate(0.12);
    g.scale(z, z);
    rr(g, -2, -11, 30, 22, 2);
    inkFill(g, C.butter, 1.3);
    ln(g, 4, -4, 20, -4, 1.6, '#b98a1a');
    ln(g, 4, 2, 15, 2, 1.6, '#b98a1a');
    g.restore();
    tickBadge(g, NOTE[0] + 27, NOTE[1] - 10, tickK, 6.5, ADD, ADD_INK);
    g.restore();
  }

  function setStep(g, step) {
    const el = g.canvas.parentElement;
    if (!el) {
      return;
    }
    const v = String(step);
    if (el.dataset.step !== v) {
      el.dataset.step = v;
    }
  }

  const REST = P({ hF: [12, -60], hB: [-4, -52] });
  const CHIN = P({ hF: [10, -96], head: [7, -116], hB: [-4, -54] });
  const CARRY = P({ hF: [18, -72], hB: [-4, -54], head: [6, -116] });
  const NOD = P({ hF: [12, -60], hB: [-4, -52], head: [8, -113] });

  SC['diffity-start'] = {
    dur: 8.8,
    width: 540,
    label: 'Diffity drops in a box and you unpack it, carry a repo from the shelf into Diffity, and pin a comment on a changed line.',
    draw(g, S) {
      const T = S.on ? S.u * this.dur : -1;
      const t = S.t;
      let x = HOME, face = 1, gait = { ph: 0, amp: 0 };
      let pose = breathe(REST, t);
      let boxY = BOX.top, boxA = 0, lid = 0, iconK = 0, iconTick = 0, iconA = 0;
      let pickedA = 1, holding = 0, flyK = 0, diffK = 0, emptyA = 1, noteK = 0, noteTick = 0, noteA = 1, step = 0;

      if (T < 0) {
        pose = mix(pose, CHIN, pulse(t, 6, 2, 2.2));
      } else {
        const fade = 1 - seg(T, 7.0, 7.6);
        step = T < 2.0 ? 1 : T < 5.2 ? 2 : T < 7.0 ? 3 : 0;

        const drop = seg(T, 0.1, 0.55);
        boxY = BOX.top - (1 - E.in(drop)) * 190 - Math.sin(Math.PI * seg(T, 0.55, 0.75)) * 4;
        boxA = (drop > 0 ? 1 : 0) * fade;
        lid = E.soft(seg(T, 1.0, 1.3));
        iconK = E.back(seg(T, 1.2, 1.6));
        iconA = fade;
        iconTick = seg(T, 1.6, 1.9);

        const w1 = walkSeg(T, 2.0, 2.7, HOME, AT_SHELF);
        const w2 = walkSeg(T, 3.3, 4.3, AT_SHELF, AT_BOARD);
        const w3 = walkSeg(T, 6.95, 8.55, AT_BOARD, HOME);
        const ws = T < 3.0 ? w1 : T < 6.0 ? w2 : w3;
        x = ws.x;
        gait = ws;
        if (T >= 6.95 && T < 8.55) {
          face = -1;
        }

        const reachBox = E.soft(seg(T, 0.7, 1.0)) * (1 - E.soft(seg(T, 1.5, 1.8)));
        pose = mix(pose, P({ hF: lp([BOX.x - 8, boxY - 26], x, 0, 1), hB: [-4, -54], head: [10, -112], chest: [4, -89] }), reachBox);

        const reachShelf = E.soft(seg(T, 2.7, 2.95));
        pose = mix(pose, P({ hF: lp([BINDERS[1].x, SHELF.top - 12], x, 0, 1), hB: [-4, -54], head: [9, -114], chest: [3, -90] }), reachShelf);
        pickedA = T < 2.98 ? 1 : 0;
        holding = T >= 2.98 && T < 4.55 ? 1 : 0;
        pose = mix(pose, CARRY, E.soft(seg(T, 3.0, 3.3)));
        const reachBoard = E.soft(seg(T, 4.3, 4.5)) * (1 - E.soft(seg(T, 4.75, 5.0)));
        pose = mix(pose, P({ hF: lp([B.x + 14, B.y + 40], x, 0, 1), hB: [-4, -54], head: [9, -116], chest: [3, -90] }), reachBoard);
        pose = mix(pose, REST, E.soft(seg(T, 4.75, 5.0)) * (1 - reachBoard));
        flyK = seg(T, 4.5, 4.8);
        emptyA = 1 - seg(T, 4.6, 4.8);
        diffK = seg(T, 4.75, 5.3);

        const reachNote = E.soft(seg(T, 5.3, 5.6)) * (1 - E.soft(seg(T, 6.0, 6.3)));
        pose = mix(pose, P({ hF: lp([NOTE[0] + 6, NOTE[1] + 2], x, 0, 1), hB: [-4, -54], head: [9, -114], chest: [3, -90] }), reachNote);
        noteK = seg(T, 5.55, 5.85);
        noteTick = seg(T, 6.1, 6.4);
        pose = mix(pose, NOD, E.soft(seg(T, 6.3, 6.5)) * (1 - E.soft(seg(T, 6.7, 6.95))));

        const back = seg(T, 7.1, 7.4);
        if (back > 0) {
          diffK = 1 - back;
          noteA = 1 - back;
          emptyA = seg(T, 7.4, 7.7);
          pickedA = seg(T, 7.1, 7.5);
        }
      }
      pose = legs(pose, gait.ph, gait.amp, { arms: false, stride: gait.stride });
      setStep(g, step);

      stool(g);
      shelf(g, pickedA);
      boardStand(g);
      board(g, diffK, emptyA);
      note(g, noteK, noteTick, noteA);

      box(g, boxY, lid, boxA);
      if (iconK > 0 && iconA > 0) {
        g.save();
        g.globalAlpha *= iconA;
        appIcon(g, BOX.x, BOX.top - 44 - iconK * 6 + Math.sin(t * 2.4) * 1.2, iconK);
        g.restore();
        tickBadge(g, BOX.x + 11, BOX.top - 62, iconTick * iconA, 6);
      }
      if (boxA > 0 && T < 0.6) {
        for (let i = -1; i <= 1; i++) {
          ln(g, BOX.x + i * 9, boxY - 34, BOX.x + i * 9, boxY - 48, 1.3, '#bdbdbd');
        }
      }

      const J = fig(g, pose, x, 0, { sx: face, wave: S.wave, wt: S.wt });
      const hand = J.w.handF;
      if (holding) {
        binder(g, hand[0] + 2, hand[1] + 8, BINDERS[1].col, 0.15, 1);
      }
      if (flyK > 0 && flyK < 1) {
        const p = arcPt([hand[0], hand[1] + 8], [B.x + B.w / 2, B.y + 60], 26, E.soft(flyK));
        g.save();
        g.globalAlpha *= 1 - E.in(flyK);
        binder(g, p[0], p[1], BINDERS[1].col, 0.15 + flyK * 0.5, 1 - flyK * 0.5);
        g.restore();
      }

      sparks(g, B.x + B.w / 2, B.y - 4, seg(T, 4.8, 5.4), 16, 7, C.amber);

      const labels = [[BOX.x, '1  download'], [SHELF.x + SHELF.w / 2 + 6, '2  open a repo'], [B.x + B.w / 2, '3  comment']];
      labels.forEach(([lx, s], i) => {
        text(g, s, lx, 18, 9.5, step === i + 1 ? C.ink : '#a8a8a8');
      });
    },
  };
})();
