// diffity: comment on a line, send it to the agent, the agent fixes it and replies, you approve
(function () {
  const SC = (window.SCENES = window.SCENES || {});
  const R = window.RIG;
  const { C, E, P, mix, legs, walkSeg, fig, inkFill, rr, ln, text, seg, breathe, sparks, pulse, lp, plane, bubble, tickBadge, words } = R;

  const ADD = '#dafbe1', ADD_INK = '#1a7f37', DEL = '#ffebe9', DEL_INK = '#cf222e', AGENT = '#d97757';
  const B = { x: -132, y: -150, w: 150, h: 104 };
  const LY = (i) => B.y + 30 + i * 12;
  const BUG = 2;
  const NOTE = [B.x + 6, LY(BUG) - 1];
  const STAMP = [B.x + 46, B.y + B.h - 18];
  const LAP = [112, -60];
  const HOME = -168, AT = -156, NEAR = -148;

  function board(g, fixK, dropK, stampK) {
    ln(g, B.x + 22, B.y + B.h, B.x + 10, 0, 2.2);
    ln(g, B.x + B.w - 22, B.y + B.h, B.x + B.w - 10, 0, 2.2);
    ln(g, B.x + 40, B.y + B.h + 30, B.x + B.w - 40, B.y + B.h + 30, 1.4, '#bdbdbd');
    rr(g, B.x, B.y, B.w, B.h, 6);
    inkFill(g, C.paper, 1.7);
    ln(g, B.x, B.y + 17, B.x + B.w, B.y + 17, 1.3);
    text(g, 'store.ts', B.x + 10, B.y + 12, 8.5, C.ink, 'left');
    text(g, '+1 −1', B.x + B.w - 10, B.y + 12, 8.5, C.muted, 'right');
    const lines = 6;
    for (let i = 0; i < lines; i++) {
      const y = LY(i);
      const isBug = i === BUG;
      if (isBug) {
        g.save();
        g.translate(0, dropK * 16);
        g.globalAlpha *= 1 - dropK;
        rr(g, B.x + 4, y - 5, B.w - 8, 10, 2);
        g.fillStyle = DEL;
        g.fill();
        text(g, '−', B.x + 10, y + 3, 9, DEL_INK);
        words(g, B.x + 20, y, 88, 7, '#e7a3a3', 2.2);
        g.restore();
        if (fixK > 0) {
          const w = (B.w - 8) * E.out3(fixK);
          rr(g, B.x + 4, y - 5, w, 10, 2);
          g.fillStyle = ADD;
          g.fill();
          if (fixK > 0.5) {
            text(g, '+', B.x + 10, y + 3, 9, ADD_INK);
            g.save();
            g.beginPath();
            g.rect(B.x + 18, y - 6, (B.w - 30) * seg(fixK, 0.5, 1), 12);
            g.clip();
            words(g, B.x + 20, y, 96, 19, '#7cc48e', 2.2);
            g.restore();
          }
        }
        continue;
      }
      text(g, String(41 + i), B.x + 10, y + 3, 7, '#b0b0b0', 'left');
      words(g, B.x + 24 + (i % 3) * 8, y, 70 + ((i * 37) % 40), i * 5, '#cfcfcf', 2);
    }
    if (stampK > 0) {
      const z = 1 + (1 - E.out3(stampK)) * 0.9;
      g.save();
      g.translate(STAMP[0], STAMP[1]);
      g.rotate(-0.16);
      g.scale(z, z);
      g.globalAlpha *= seg(stampK, 0, 0.3);
      rr(g, -36, -11, 72, 22, 5);
      inkFill(g, 'rgba(218,251,225,0.9)', 1.8, ADD_INK);
      text(g, 'approved', 0, 4, 10.5, ADD_INK);
      g.restore();
    }
  }
  function note(g, k, replyK) {
    if (k <= 0) {
      return;
    }
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
    tickBadge(g, NOTE[0] + 2, NOTE[1] - 12, replyK, 6.5, ADD, ADD_INK);
  }
  function desk(g, typing, t) {
    ln(g, 70, -46, 66, 0, 2.2);
    ln(g, 150, -46, 154, 0, 2.2);
    rr(g, 62, -50, 96, 6, 2);
    inkFill(g, C.wood, 1.5);
    rr(g, 92, -55, 42, 5, 1.5);
    inkFill(g, '#e9e9e9', 1.3);
    g.save();
    g.translate(94, -55);
    g.rotate(-1.28);
    rr(g, 0, -4, 36, 4, 1.5);
    inkFill(g, '#2b2b2b', 1.3);
    g.restore();
    rr(g, 70, -66, 12, 16, 2);
    inkFill(g, C.paper, 1.3);
    if (typing > 0) {
      for (let i = 0; i < 3; i++) {
        const k = (t * 2.2 + i / 3) % 1;
        g.save();
        g.globalAlpha *= typing * (1 - k);
        text(g, ['{', '}', ';'][i], 100 + i * 9, -68 - k * 22, 9, AGENT);
        g.restore();
      }
    }
  }

  SC['diffity-review'] = {
    dur: 7.2,
    width: 390,
    label: 'A stick figure comments on a line in a diff, sends it to an agent, the agent fixes the line and replies, and the change gets approved.',
    draw(g, S) {
      const T = S.on ? S.u * this.dur : -1;
      const t = S.t;
      let x = HOME, gait = { ph: 0, amp: 0 };
      let pose = breathe(P({ hF: [12, -60], hB: [-4, -52] }), t);
      let noteK = 0, replyK = 0, planeK = 0, typing = pulse(t, 7, 1, 1.6) * 0.6, fixK = 0, dropK = 0, stampK = 0, fixFly = 0, saidK = 0;
      const agentLook = pulse(t, 6, 3.2, 1.4);
      const chin = P({ hF: [10, -96], head: [7, -116], hB: [-4, -54] });
      if (T < 0) {
        pose = mix(pose, chin, pulse(t, 5.5, 2, 2.2));
      } else {
        const fade = 1 - seg(T, this.dur - 0.45, this.dur);
        const segs = [
          walkSeg(T, 0, 0.5, HOME, AT),
          walkSeg(T, 1.8, 2.3, AT, HOME),
          walkSeg(T, 4.6, 5.1, HOME, NEAR),
          walkSeg(T, 6.2, 6.8, NEAR, HOME),
        ];
        const ws = T < 1.8 ? segs[0] : T < 4.6 ? segs[1] : T < 6.2 ? segs[2] : segs[3];
        x = ws.x;
        gait = ws.dir * 1 < 0 ? { ph: -ws.ph, amp: ws.amp, stride: ws.stride } : ws;
        const reachNote = E.soft(seg(T, 0.5, 0.85)) * (1 - E.soft(seg(T, 1.05, 1.3)));
        const flick = E.soft(seg(T, 1.25, 1.45)) * (1 - E.soft(seg(T, 1.6, 1.9)));
        const wait = E.soft(seg(T, 2.3, 2.6)) * (1 - E.soft(seg(T, 4.4, 4.6)));
        const lift = E.soft(seg(T, 5.05, 5.3)) * (1 - seg(T, 5.42, 5.5));
        const slam = E.sm(seg(T, 5.27, 5.42)) * (1 - E.soft(seg(T, 5.6, 5.85)));
        const cheer = E.back(seg(T, 5.6, 6.0)) * (1 - E.soft(seg(T, 6.05, 6.3)));
        pose = mix(pose, P({ hF: lp([NOTE[0] + 4, NOTE[1] + 2], x, 0, 1), hB: [-4, -54], head: [9, -114], chest: [3, -90] }), reachNote);
        pose = mix(pose, P({ hF: [40, -100], hB: [-4, -54], head: [10, -116] }), flick);
        pose = mix(pose, chin, wait);
        pose = mix(pose, P({ hF: [22, -128], hB: [-4, -54], head: [6, -117] }), lift);
        pose = mix(pose, P({ hF: lp([STAMP[0] - 26, STAMP[1]], x, 0, 1), hB: [-4, -54], head: [10, -113], chest: [4, -89] }), slam);
        pose = mix(pose, P({ hF: [14, -132], hB: [-10, -130], head: [3, -118] }), cheer);
        noteK = seg(T, 0.7, 0.95) * fade;
        planeK = seg(T, 1.4, 2.4);
        typing = Math.max(typing, E.soft(seg(T, 2.3, 2.5)) * (1 - E.soft(seg(T, 3.4, 3.6))));
        fixFly = seg(T, 3.4, 4.0);
        dropK = E.in(seg(T, 3.85, 4.2));
        fixK = seg(T, 3.95, 4.5) * fade;
        replyK = seg(T, 4.4, 4.8) * fade;
        saidK = seg(T, 4.3, 4.5) * (1 - seg(T, 5.6, 5.8));
        stampK = seg(T, 5.38, 5.5) * fade;
        if (fade < 1) {
          dropK = 0;
        }
      }
      pose = legs(pose, gait.ph, gait.amp, { arms: false, stride: gait.stride });

      board(g, fixK, dropK, stampK);
      desk(g, typing, t);
      const typeBob = typing > 0.3 ? Math.sin(t * 22) * 2.2 : 0;
      const ap = mix(
        breathe(P({ hF: [24, -58 + typeBob], hB: [20, -56 - typeBob], head: [5, -116] }), t + 1),
        P({ hF: [24, -58], hB: [20, -56], head: [-2, -117] }),
        agentLook,
      );
      fig(g, ap, 156, 0, { sx: -1, ink: AGENT, far: '#e8b7a3', bot: { col: AGENT, dark: '#a8553a', glow: typing > 0.3 ? 1 : 0 } });
      note(g, noteK, replyK);
      fig(g, pose, x, 0, { wave: S.wave, wt: S.wt });
      plane(g, [NOTE[0] + 10, NOTE[1] - 10], [LAP[0], LAP[1] - 20], planeK, 70, 0.9);
      if (fixFly > 0 && fixFly < 1) {
        const p = R.arcPt([LAP[0] - 6, LAP[1] - 16], [B.x + B.w / 2, LY(BUG)], 50, E.soft(fixFly));
        rr(g, p[0] - 16, p[1] - 4, 32, 8, 2);
        inkFill(g, ADD, 1.2, ADD_INK);
      }
      bubble(g, 128, -124, 'fixed, see reply', saidK, { tail: 24, size: 8.5 });
      sparks(g, STAMP[0], STAMP[1] - 12, seg(T, 5.4, 6.0), 16, 6, ADD_INK);
    },
  };
})();
