// diffity: drag across line numbers, write a comment, it pins on those lines
(function () {
  const SC = (window.SCENES = window.SCENES || {});
  const R = window.RIG;
  const { C, E, P, mix, legs, walkSeg, fig, inkFill, rr, ln, text, seg, breathe, sparks, pulse, words, lerp } = R;

  const ADD = '#dafbe1', ADD_INK = '#1a7f37', DEL = '#ffebe9', DEL_INK = '#cf222e';
  const SEL = '#fff3b0', SEL_GUT = '#f2d66b';
  const B = { x: -50, y: -178, w: 200, h: 132 };
  const LY = (i) => B.y + 32 + i * 12.5;
  const ROWS = 8;
  const S0 = 3, S1 = 5;
  const CARD = { x: B.x + 12, y: LY(S1) + 8, w: 124, h: 32 };
  const BTN = { x: CARD.x + 6, y: CARD.y + 19, w: 40, h: 10 };
  const NOTE = [B.x + B.w - 24, LY(4)];
  const HOME = -150, AT = B.x - 26;
  const PEN = 30;

  function board(g, selTo, selK, writeK, cardK, pressK, noteK, morph) {
    ln(g, B.x + 24, B.y + B.h, B.x + 12, 0, 2.2);
    ln(g, B.x + B.w - 24, B.y + B.h, B.x + B.w - 12, 0, 2.2);
    ln(g, B.x + 40, B.y + B.h + 28, B.x + B.w - 40, B.y + B.h + 28, 1.4, '#bdbdbd');
    rr(g, B.x, B.y, B.w, B.h, 6);
    inkFill(g, C.paper, 1.7);
    ln(g, B.x, B.y + 17, B.x + B.w, B.y + 17, 1.3);
    text(g, 'diffity', B.x + 10, B.y + 12, 8.5, C.ink, 'left');
    text(g, 'app.ts', B.x + B.w - 10, B.y + 12, 8.5, C.muted, 'right');
    for (let i = 0; i < ROWS; i++) {
      const y = LY(i);
      const inSel = selK > 0 && i >= S0 && i <= selTo;
      if (i === 1 || i === 2) {
        rr(g, B.x + 22, y - 5, B.w - 26, 10, 2);
        g.fillStyle = i === 1 ? DEL : ADD;
        g.fill();
        text(g, i === 1 ? '−' : '+', B.x + 28, y + 3, 9, i === 1 ? DEL_INK : ADD_INK);
      }
      if (inSel) {
        g.save();
        g.globalAlpha *= selK;
        rr(g, B.x + 3, y - 6, B.w - 6, 12.5, 1.5);
        g.fillStyle = SEL;
        g.fill();
        rr(g, B.x + 3, y - 6, 17, 12.5, 1.5);
        g.fillStyle = SEL_GUT;
        g.fill();
        g.restore();
      }
      text(g, String(20 + i), B.x + 11, y + 3, 7, inSel ? '#7a5a00' : '#b0b0b0');
      const col = i === 1 ? '#e7a3a3' : i === 2 ? '#7cc48e' : '#cfcfcf';
      words(g, B.x + 36 + (i % 3) * 8, y, 70 + ((i * 37) % 60), i * 5 + 2, col, 2);
    }
    if (cardK > 0) {
      const z = E.back(cardK);
      const cx = lerp(CARD.x, NOTE[0] - 10, morph), cy = lerp(CARD.y, NOTE[1] - 8, morph);
      const sw = lerp(CARD.w, 22, morph), sh = lerp(CARD.h, 16, morph);
      g.save();
      g.translate(cx, cy);
      g.scale(z, z);
      g.rotate(morph * 0.12);
      rr(g, 0, 0, sw, sh, 3);
      inkFill(g, morph > 0.5 ? C.butter : C.paper, 1.5);
      if (morph < 0.5) {
        g.save();
        g.globalAlpha *= 1 - morph * 2;
        g.beginPath();
        g.rect(4, 2, (sw - 10) * writeK, 12);
        g.clip();
        words(g, 7, 8, sw - 14, 31, '#8a8a8a', 1.8);
        g.restore();
        rr(g, BTN.x - CARD.x, BTN.y - CARD.y + pressK * 1.2, BTN.w, BTN.h, 3);
        inkFill(g, pressK > 0.5 ? '#15692d' : ADD_INK, 1.2, '#0f5323');
        text(g, 'Comment', BTN.x - CARD.x + BTN.w / 2, BTN.y - CARD.y + 7.6 + pressK * 1.2, 6.8, C.paper);
      } else {
        ln(g, 4, 5, 17, 5, 1.5, '#b98a1a');
        ln(g, 4, 10, 13, 10, 1.5, '#b98a1a');
      }
      g.restore();
    }
    if (noteK > 0) {
      g.save();
      g.globalAlpha *= noteK;
      ln(g, B.x + 20, LY(S0) - 6, B.x + 20, LY(S1) + 6, 2.2, SEL_GUT);
      g.restore();
    }
  }

  function pencil(g, hand, ang) {
    g.save();
    g.translate(hand[0], hand[1]);
    g.rotate(ang);
    rr(g, -6, -2.6, 6, 5.2, 1.5);
    inkFill(g, '#f2a7a7', 1.2);
    rr(g, 0, -2.6, PEN - 12, 5.2, 0.5);
    inkFill(g, '#f6c945', 1.2);
    g.beginPath();
    g.moveTo(PEN - 12, -2.6);
    g.lineTo(PEN - 3, 0);
    g.lineTo(PEN - 12, 2.6);
    g.closePath();
    inkFill(g, '#f0d9b5', 1.2);
    g.beginPath();
    g.moveTo(PEN - 5.5, -0.8);
    g.lineTo(PEN - 2, 0);
    g.lineTo(PEN - 5.5, 0.8);
    g.closePath();
    g.fillStyle = C.ink;
    g.fill();
    g.restore();
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

  SC['diffity-comment'] = {
    dur: 8,
    width: 440,
    label: 'A stick figure drags a pencil down the line numbers of a diff to select three lines, writes a comment in the box that opens, clicks Comment, and the comment pins to those lines as a sticky note.',
    draw(g, S) {
      const T = S.on ? S.u * this.dur : -1;
      const t = S.t;
      let x = HOME, gait = { ph: 0, amp: 0 };
      let pose = breathe(P({ hF: [14, -64], hB: [-4, -52] }), t);
      let tip = null, aim = 0;
      let selTo = S0, selK = 0, writeK = 0, cardK = 0, pressK = 0, noteK = 0, morph = 0, fade = 1;
      const twirl = pulse(t, 6, 2.5, 1.2);
      const chin = P({ hF: [10, -96], head: [7, -116], hB: [-4, -54] });
      const idleK = T < 0 ? 1 : 1 - E.soft(seg(T, 0, 0.4));
      pose = mix(pose, chin, pulse(t, 6, 4.2, 1.6) * idleK);
      if (T >= 0) {
        fade = 1 - seg(T, this.dur - 0.5, this.dur);
        const ws = T < 3 ? walkSeg(T, 0, 0.6, HOME, AT) : walkSeg(T, 5.6, 6.3, AT, HOME);
        x = ws.x;
        gait = ws.dir * 1 < 0 ? { ph: -ws.ph, amp: ws.amp, stride: ws.stride } : ws;
        const gut = B.x + 11;
        const drag = E.soft(seg(T, 1.0, 1.8));
        const toCard = E.soft(seg(T, 2.1, 2.35));
        const toBtn = E.soft(seg(T, 3.6, 3.85));
        const wig = seg(T, 2.35, 3.5) > 0 && T < 3.5 ? Math.sin(T * 40) * 1.5 : 0;
        let tx = gut, ty = lerp(LY(S0), LY(S1), drag);
        const wx = lerp(CARD.x + 8, CARD.x + 26, seg(T, 2.35, 3.5));
        tx = lerp(tx, wx, toCard);
        ty = lerp(ty, CARD.y + 8 + wig, toCard);
        tx = lerp(tx, BTN.x + BTN.w / 2, toBtn);
        ty = lerp(ty, BTN.y + 5 + E.in(seg(T, 3.9, 4.0)) * 2 * (1 - seg(T, 4.05, 4.2)), toBtn);
        tip = [tx, ty];
        aim = E.soft(seg(T, 0.6, 0.95)) * (1 - E.soft(seg(T, 4.3, 4.6)));
        selK = seg(T, 0.95, 1.1) * fade;
        selTo = S0 + Math.min(S1 - S0, Math.floor(drag * (S1 - S0 + 0.99)));
        cardK = seg(T, 1.9, 2.2) * (fade < 1 ? fade : 1);
        writeK = E.soft(seg(T, 2.35, 3.5));
        pressK = seg(T, 3.95, 4.0) * (1 - seg(T, 4.1, 4.2));
        morph = E.soft(seg(T, 4.25, 4.75));
        noteK = seg(T, 4.6, 4.8) * fade;
        if (morph > 0) {
          selK *= 1 - 0.6 * morph;
        }
        const nod = E.soft(seg(T, 4.8, 5.0)) * (1 - E.soft(seg(T, 5.3, 5.5)));
        pose = mix(pose, P({ hF: [14, -64], hB: [-4, -52], head: [9, -112] }), nod);
      }
      const sh = [x + 2, -79];
      if (tip) {
        const d = Math.hypot(tip[0] - sh[0], tip[1] - sh[1]) || 1;
        const dir = [(tip[0] - sh[0]) / d, (tip[1] - sh[1]) / d];
        const hand = [tip[0] - dir[0] * (PEN - 2), tip[1] - dir[1] * (PEN - 2)];
        pose = mix(pose, P({ hF: R.lp(hand, x, 0, 1), hB: [-4, -54], head: [9, -114], chest: [3, -90] }), aim);
      }
      pose = legs(pose, gait.ph, gait.amp, { arms: false, stride: gait.stride });

      plant(g, 188, t);
      board(g, selTo, selK, writeK, cardK, pressK, noteK, morph);
      const J = fig(g, pose, x, 0, { wave: S.wave, wt: S.wt });
      const hand = J.w.handF;
      let ang = -1.15 + Math.sin(twirl * Math.PI * 2) * 0.5 * idleK;
      if (tip && aim > 0) {
        const a2 = Math.atan2(tip[1] - hand[1], tip[0] - hand[0]);
        ang = lerp(ang, a2, aim);
      }
      pencil(g, hand, ang);
      text(g, 'you', x, 18, 10, C.muted);
      sparks(g, BTN.x + BTN.w / 2, BTN.y, seg(T, 4.0, 4.5), 10, 6, ADD_INK);
      sparks(g, NOTE[0], NOTE[1], seg(T, 4.7, 5.2), 14, 6, C.amber);
    },
  };
})();
