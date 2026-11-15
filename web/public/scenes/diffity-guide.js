// diffity: you ask for a walkthrough, the agent writes a guide to the change (risky part first), you read it and get it
(function () {
  const SC = (window.SCENES = window.SCENES || {});
  const R = window.RIG;
  const { C, E, P, mix, legs, walkSeg, fig, inkFill, rr, ln, text, seg, breathe, sparks, pulse, lp, bubble, circle, words } = R;

  const DEL = '#ffebe9', DEL_INK = '#cf222e';
  const AGENT = '#d97757', AGENT_DARK = '#a8553a', AGENT_FAR = '#e8b7a3';
  const BOT = -168, HOME = 205, AT = 98;
  const B = { x: -140, y: -170, w: 206, h: 128 };
  const DY = B.y + 60;
  const BOXES = [
    { x: B.x + 38, t: 'route' },
    { x: B.x + 103, t: 'auth' },
    { x: B.x + 168, t: 'session' },
  ];
  const NOTE = { x: B.x + 156, y: B.y + 104 };
  const WRITE = [B.x - 2, -100];
  const REST = { hF: [12, -60], hB: [-4, -52] };
  const CHIN = P({ hF: [10, -96], head: [7, -116], hB: [-4, -54] });
  // When each part of the guide is written, in the order the agent writes it: risky first.
  const AT_CALLOUT = 1.85, AT_BOX = [2.45, 2.75, 3.05], AT_STEP = [3.3, 3.6], AT_NOTE = 3.95;

  const bump = (T, a, b, c, d) => E.soft(seg(T, a, b)) * (1 - E.soft(seg(T, c, d)));

  function board(g, s) {
    ln(g, B.x + 26, B.y + B.h, B.x + 14, 0, 2.2);
    ln(g, B.x + B.w - 26, B.y + B.h, B.x + B.w - 14, 0, 2.2);
    ln(g, B.x + 40, B.y + B.h + 26, B.x + B.w - 40, B.y + B.h + 26, 1.4, '#bdbdbd');
    rr(g, B.x, B.y, B.w, B.h, 7);
    inkFill(g, C.paper, 1.8);
    text(g, 'guide', B.x + 10, B.y + 12.5, 9, C.ink, 'left');
    text(g, '· login flow', B.x + 40, B.y + 12.5, 8, C.muted, 'left');
    ln(g, B.x, B.y + 18, B.x + B.w, B.y + 18, 1.3);
    g.save();
    g.globalAlpha *= s.fade;

    const ck = s.callout;
    if (ck > 0) {
      const w = (B.w - 20) * E.out3(Math.min(1, ck * 1.6));
      rr(g, B.x + 10, B.y + 25, w, 19, 4);
      inkFill(g, DEL, 1.4, DEL_INK);
      const z = E.back(seg(ck, 0.3, 0.7));
      if (z > 0) {
        g.save();
        g.translate(B.x + 21, B.y + 34.5);
        g.scale(z, z);
        circle(g, 0, 0, 5.2);
        inkFill(g, DEL_INK, 1.1, DEL_INK);
        text(g, '!', 0, 3, 8, C.paper);
        g.restore();
      }
      g.save();
      g.beginPath();
      g.rect(B.x + 28, B.y + 26, (B.w - 40) * seg(ck, 0.45, 1), 17);
      g.clip();
      text(g, 'careful here', B.x + 31, B.y + 37.5, 8.5, DEL_INK, 'left');
      words(g, B.x + 100, B.y + 34.5, 86, 11, '#e7a3a3', 2);
      g.restore();
    }

    for (let i = 0; i < 2; i++) {
      const a = BOXES[i].x + 26, b = BOXES[i + 1].x - 26;
      R.arrow(g, [[a, DY], [b, DY]], { k: s.arrows[i], lw: 1.6 });
    }
    for (let i = 0; i < 3; i++) {
      const k = s.boxes[i];
      if (k <= 0) {
        continue;
      }
      const z = E.back(Math.min(1, k));
      const risky = i === 2;
      g.save();
      g.translate(BOXES[i].x, DY);
      g.scale(z, z);
      rr(g, -23, -9, 46, 18, 4);
      inkFill(g, risky ? DEL : C.paper, 1.5, risky ? DEL_INK : C.ink);
      text(g, BOXES[i].t, 0, 3, 8, risky ? DEL_INK : C.ink);
      g.restore();
    }

    for (let i = 0; i < 2; i++) {
      const k = s.steps[i];
      if (k <= 0) {
        continue;
      }
      const y = B.y + 86 + i * 13;
      text(g, String(i + 1) + '.', B.x + 12, y + 3, 8, C.muted, 'left');
      g.save();
      g.beginPath();
      g.rect(B.x + 22, y - 4, 112 * E.out3(k), 8);
      g.clip();
      words(g, B.x + 24, y, 106 - i * 22, 5 + i * 9, '#bdbdbd', 2.2);
      g.restore();
    }

    if (s.note > 0) {
      const z = E.back(Math.min(1, s.note));
      g.save();
      g.translate(NOTE.x, NOTE.y);
      g.rotate(-0.05);
      g.scale(z, z);
      rr(g, -40, -12, 80, 24, 2);
      inkFill(g, C.butter, 1.3);
      text(g, 'outside the diff', 0, -2, 6.5, C.umber);
      text(g, 'logout.ts', 0, 8, 8.5, C.ink);
      g.restore();
    }
    g.restore();
  }

  // The agent writes from where it stands: a dotted stream of ink runs from its hand to the part being written.
  function stream(g, from, to, k, t) {
    if (k <= 0) {
      return;
    }
    g.save();
    g.globalAlpha *= k * 0.9;
    g.setLineDash([2.5, 4]);
    g.lineDashOffset = -t * 40;
    g.beginPath();
    g.moveTo(from[0], from[1]);
    g.quadraticCurveTo((from[0] + to[0]) / 2, Math.min(from[1], to[1]) - 18, to[0], to[1]);
    g.strokeStyle = AGENT;
    g.lineWidth = 1.6;
    g.stroke();
    g.restore();
  }

  SC['diffity-guide'] = {
    dur: 8,
    width: 500,
    label: 'You ask your agent to walk you through a change, and it writes a guide on a board, risky part first, then a flow diagram, the steps and a note on code outside the diff, and you read it until it clicks.',
    draw(g, S) {
      const T = S.on ? S.u * this.dur : -1;
      const t = S.t;
      let me = breathe(P({ ...REST, head: [6, -117] }), t);
      let bp = breathe(P({ ...REST, head: [5, -117] }), t + 2);
      let x = HOME, sx = -1, gait = { ph: 0, amp: 0 };
      let callout = 0, boxes = [0, 0, 0], arrows = [0, 0], steps = [0, 0], note = 0, fade = 1;
      let ask = 0, hmm = 0, got = 0, glow = 0, happy = false, writing = 0, target = null, thumb = 0, hop = 0;
      if (T < 0) {
        me = mix(me, CHIN, pulse(t, 6.2, 2.4, 2));
        bp = mix(bp, P({ ...REST, head: [10, -116] }), pulse(t, 5.4, 3.6, 1.4));
      } else {
        fade = 1 - seg(T, this.dur - 0.5, this.dur);
        callout = seg(T, AT_CALLOUT, AT_CALLOUT + 0.55);
        boxes = AT_BOX.map((a) => seg(T, a, a + 0.25));
        arrows = [E.out3(seg(T, AT_BOX[0] + 0.15, AT_BOX[1])), E.out3(seg(T, AT_BOX[1] + 0.15, AT_BOX[2]))];
        steps = AT_STEP.map((a) => seg(T, a, a + 0.3));
        note = seg(T, AT_NOTE, AT_NOTE + 0.3);
        const spots = [
          [AT_CALLOUT, [B.x + 30, B.y + 34]],
          [AT_BOX[0], [BOXES[0].x - 10, DY]],
          [AT_BOX[1], [BOXES[1].x - 10, DY]],
          [AT_BOX[2], [BOXES[2].x - 10, DY]],
          [AT_STEP[0], [B.x + 30, B.y + 86]],
          [AT_STEP[1], [B.x + 30, B.y + 99]],
          [AT_NOTE, [NOTE.x - 30, NOTE.y]],
        ];
        for (const [a, p] of spots) {
          if (T >= a - 0.05) {
            target = p;
          }
        }
        writing = seg(T, AT_CALLOUT - 0.1, AT_CALLOUT) * (1 - seg(T, AT_NOTE + 0.3, AT_NOTE + 0.45));
        glow = seg(T, 1.6, 1.7) * (1 - seg(T, 4.3, 4.4));

        ask = seg(T, 0.2, 0.35) * (1 - seg(T, 1.2, 1.35));
        hmm = seg(T, 1.0, 1.15) * (1 - seg(T, 1.6, 1.72));
        got = seg(T, 6.15, 6.3) * (1 - seg(T, 7.0, 7.15));

        const ws = T < 6.8 ? walkSeg(T, 4.05, 4.8, HOME, AT) : walkSeg(T, 7.05, 7.75, AT, HOME);
        x = ws.x;
        gait = ws;
        sx = T >= 7.0 && T < 7.8 ? 1 : -1;
        const askHand = bump(T, 0.2, 0.45, 1.0, 1.3);
        const look = bump(T, 1.5, 1.8, 3.9, 4.1);
        const readTop = bump(T, 4.75, 4.95, 5.05, 5.2);
        const readMid = bump(T, 5.05, 5.2, 5.3, 5.45);
        const readLow = bump(T, 5.3, 5.45, 5.55, 5.7);
        const chin = bump(T, 5.55, 5.75, 6.05, 6.25);
        thumb = bump(T, 6.2, 6.45, 6.75, 7.0);
        me = mix(me, P({ hF: [24, -80], hB: [-4, -52], head: [8, -117] }), askHand);
        me = mix(me, P({ ...REST, head: [9, -116] }), look);
        me = mix(me, P({ ...REST, head: [9, -120], chest: [2, -91] }), readTop);
        me = mix(me, P({ ...REST, head: [10, -115], chest: [3, -90] }), readMid);
        me = mix(me, P({ ...REST, head: [10, -110], chest: [3, -89] }), readLow);
        me = mix(me, P({ hF: [10, -96], head: [9, -115], hB: [-4, -54] }), chin);
        me = mix(me, P({ hF: [18, -98], hB: [-4, -54], head: [6, -118] }), thumb);

        const think = bump(T, 0.95, 1.2, 1.5, 1.75);
        const write = bump(T, 1.65, 1.9, 4.2, 4.5);
        const wig = Math.sin(t * 18) * 1.6 * writing;
        const cheer = E.back(seg(T, 6.25, 6.8)) * (1 - E.soft(seg(T, 7.0, 7.4)));
        bp = mix(bp, CHIN, think);
        bp = mix(bp, P({ hF: lp([WRITE[0] + wig, WRITE[1] + wig * 0.6], BOT, 0, 1), hB: [-4, -54], head: [9, -117], chest: [3, -90] }), write);
        bp = mix(bp, P({ hF: [14, -122], hB: [-4, -54], head: [4, -118] }), cheer);
        hop = Math.sin(Math.PI * seg(T, 6.32, 6.62)) * 4;
        happy = T > 6.3 && T < 7.3;
      }
      me = legs(me, gait.ph, gait.amp, { arms: false, stride: gait.stride });

      board(g, { callout, boxes, arrows, steps, note, fade });
      const J = fig(g, bp, BOT, -hop, {
        ink: AGENT,
        far: AGENT_FAR,
        floor: 0,
        bot: { col: AGENT, dark: AGENT_DARK, glow, blink: hmm > 0 ? pulse(t, 0.5, 0, 0.25) > 0.5 : pulse(t, 4.3, 1.2, 0.15) > 0.5, happy },
      });
      if (target) {
        stream(g, J.w.handF, target, writing, t);
      }
      const M = fig(g, me, x, 0, { sx, wave: S.wave, wt: S.wt });
      if (thumb > 0.3) {
        const h = M.w.handF;
        ln(g, h[0], h[1] - 1, h[0] + 0.5, h[1] - 7 * thumb, 2.6, C.ink);
      }
      text(g, 'agent', BOT, 16, 10, AGENT);
      text(g, 'you', x, 16, 10, C.muted);

      bubble(g, HOME - 34, -130, 'walk me through it?', ask, { tail: 28, size: 9 });
      bubble(g, BOT - 30, -130, 'hmm…', hmm, { tail: 34, size: 9 });
      bubble(g, AT + 44, -128, 'ah, got it', got, { tail: -38, size: 9 });
      sparks(g, BOT + 2, -134, seg(T, 6.3, 6.9), 14, 5, AGENT);
    },
  };
})();
