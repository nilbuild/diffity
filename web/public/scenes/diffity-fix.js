// diffity: press Send, the agent takes your comments one by one, fixes each line and replies in the thread
(function () {
  const SC = (window.SCENES = window.SCENES || {});
  const R = window.RIG;
  const { C, E, P, mix, fig, inkFill, rr, ln, text, seg, breathe, sparks, pulse, lp, plane, bubble, tickBadge, words, arcPt, circle } = R;

  const ADD = '#dafbe1', ADD_INK = '#1a7f37', DEL = '#ffebe9', DEL_INK = '#cf222e';
  const AGENT = '#d97757', AGENT_DARK = '#a8553a', AGENT_FAR = '#e8b7a3';
  const B = { x: -150, y: -172, w: 210, h: 124 };
  const LY = (i) => B.y + 32 + i * 12.5;
  const ROWS = 7;
  const BUGS = [1, 4];
  const NOTES = BUGS.map((r) => [B.x + B.w - 30, LY(r) - 1]);
  const ME = -224, BOT = 230;
  const LAP = [BOT - 46, -60];
  const BTN = [-188, -60];
  const FIX = [[2.9, 3.5], [4.4, 5.0]];

  function board(g, fixKs, dropKs) {
    ln(g, B.x + 24, B.y + B.h, B.x + 12, 0, 2.2);
    ln(g, B.x + B.w - 24, B.y + B.h, B.x + B.w - 12, 0, 2.2);
    ln(g, B.x + 40, B.y + B.h + 28, B.x + B.w - 40, B.y + B.h + 28, 1.4, '#bdbdbd');
    rr(g, B.x, B.y, B.w, B.h, 6);
    inkFill(g, C.paper, 1.7);
    ln(g, B.x, B.y + 17, B.x + B.w, B.y + 17, 1.3);
    text(g, 'diffity', B.x + 10, B.y + 12, 8.5, C.ink, 'left');
    text(g, '2 comments', B.x + B.w - 10, B.y + 12, 8.5, C.muted, 'right');
    for (let i = 0; i < ROWS; i++) {
      const y = LY(i);
      const b = BUGS.indexOf(i);
      text(g, String(40 + i), B.x + 11, y + 3, 7, '#b0b0b0');
      if (b < 0) {
        words(g, B.x + 26 + (i % 3) * 8, y, 80 + ((i * 37) % 50), i * 5, '#cfcfcf', 2);
        continue;
      }
      const dropK = dropKs[b], fixK = fixKs[b];
      g.save();
      g.translate(0, dropK * 14);
      g.globalAlpha *= 1 - dropK;
      rr(g, B.x + 20, y - 5, B.w - 24, 10, 2);
      g.fillStyle = DEL;
      g.fill();
      text(g, '−', B.x + 26, y + 3, 9, DEL_INK);
      words(g, B.x + 34, y, 110, 7 + i, '#e7a3a3', 2.2);
      g.restore();
      if (fixK > 0) {
        rr(g, B.x + 20, y - 5, (B.w - 24) * E.out3(fixK), 10, 2);
        g.fillStyle = ADD;
        g.fill();
        if (fixK > 0.5) {
          text(g, '+', B.x + 26, y + 3, 9, ADD_INK);
          g.save();
          g.beginPath();
          g.rect(B.x + 32, y - 6, 140 * seg(fixK, 0.5, 1), 12);
          g.clip();
          words(g, B.x + 34, y, 116, 19 + i, '#7cc48e', 2.2);
          g.restore();
        }
      }
    }
  }

  function note(g, at, k, rot) {
    if (k <= 0) {
      return;
    }
    const z = E.back(k);
    g.save();
    g.translate(at[0], at[1]);
    g.rotate(rot);
    g.scale(z, z);
    rr(g, -2, -8, 24, 16, 2);
    inkFill(g, C.butter, 1.3);
    ln(g, 3, -3, 17, -3, 1.5, '#b98a1a');
    ln(g, 3, 2, 12, 2, 1.5, '#b98a1a');
    g.restore();
  }

  function reply(g, at, k) {
    if (k <= 0) {
      return;
    }
    const z = E.back(k);
    g.save();
    g.translate(at[0] - 30, at[1] + 11);
    g.scale(z, z);
    rr(g, 0, 0, 48, 13, 3);
    inkFill(g, C.paper, 1.3);
    circle(g, 7, 6.5, 3.2);
    g.fillStyle = AGENT;
    g.fill();
    words(g, 14, 6.5, 28, 41, '#bdbdbd', 1.8);
    g.restore();
    tickBadge(g, at[0] + 18, at[1] + 11, seg(k, 0.4, 1), 5, ADD, ADD_INK);
  }

  function sendButton(g, pressK) {
    ln(g, BTN[0], BTN[1] + 10, BTN[0], 0, 2.4);
    ln(g, BTN[0] - 9, 0, BTN[0] + 9, 0, 2.4);
    rr(g, BTN[0] - 15, BTN[1], 30, 11, 3);
    inkFill(g, C.paper, 1.6);
    text(g, 'Send', BTN[0], BTN[1] + 8.5, 7.5, C.ink);
    const dy = pressK * 3;
    g.beginPath();
    g.ellipse(BTN[0], BTN[1] + dy * 0.4, 10, 6 - dy, 0, Math.PI, 0);
    g.closePath();
    inkFill(g, pressK > 0.5 ? '#15692d' : '#2da44e', 1.6);
  }

  function desk(g, cx, sx, typing, t, col) {
    g.save();
    g.translate(cx, 0);
    g.scale(sx, 1);
    ln(g, -86, -46, -90, 0, 2.2);
    ln(g, -6, -46, -2, 0, 2.2);
    rr(g, -94, -50, 96, 6, 2);
    inkFill(g, C.wood, 1.5);
    rr(g, -64, -55, 42, 5, 1.5);
    inkFill(g, '#e9e9e9', 1.3);
    g.save();
    g.translate(-62, -55);
    g.rotate(-1.28);
    rr(g, 0, -4, 36, 4, 1.5);
    inkFill(g, '#2b2b2b', 1.3);
    g.restore();
    rr(g, -86, -66, 12, 16, 2);
    inkFill(g, C.paper, 1.3);
    g.restore();
    steam(g, cx + sx * -80, -70, t);
    if (typing > 0) {
      for (let i = 0; i < 3; i++) {
        const k = (t * 2.6 + i / 3) % 1;
        g.save();
        g.globalAlpha *= typing * (1 - k);
        text(g, ['{', '}', ';'][i], cx + sx * (-56 + i * 9), -68 - k * 22, 9, col);
        g.restore();
      }
    }
  }

  function steam(g, x, y, t) {
    for (let i = 0; i < 2; i++) {
      const k = (t * 0.5 + i * 0.5) % 1;
      const yy = y - k * 12;
      const sw = Math.sin(t * 3 + i * 2) * 2;
      g.save();
      g.globalAlpha *= Math.sin(Math.PI * k) * 0.55;
      g.beginPath();
      g.moveTo(x - 2 + i * 4, yy);
      g.bezierCurveTo(x + 2 + i * 4 + sw, yy - 3, x - 4 + i * 4 - sw, yy - 6, x - 1 + i * 4, yy - 9);
      g.lineWidth = 1.3;
      g.strokeStyle = '#9a9a9a';
      g.lineCap = 'round';
      g.stroke();
      g.restore();
    }
  }

  function botStyle(glow, blink) {
    return { col: AGENT, dark: AGENT_DARK, glow: glow ? 1 : 0, blink };
  }

  function strip(g, from, to, k, h) {
    if (k <= 0 || k >= 1) {
      return;
    }
    const p = arcPt(from, to, h, E.soft(k));
    rr(g, p[0] - 14, p[1] - 4, 28, 8, 2);
    inkFill(g, ADD, 1.2, ADD_INK);
  }

  SC['diffity-fix'] = {
    dur: 9,
    width: 500,
    label: 'A stick figure presses a Send button, two comments fly to an AI agent at its desk, and the agent fixes each commented line in turn and replies under each comment.',
    draw(g, S) {
      const T = S.on ? S.u * this.dur : -1;
      const t = S.t;
      let pose = breathe(P({ hF: [12, -60], hB: [-4, -52] }), t);
      let typing = pulse(t, 7, 1, 1.6) * 0.6, fade = 1, pressK = 0, thinkK = 0;
      const fixKs = [0, 0], dropKs = [0, 0], replyKs = [0, 0], sendKs = [0, 0];
      let hmm = 0, done = 0;
      const chin = P({ hF: [10, -96], head: [7, -116], hB: [-4, -54] });
      if (T < 0) {
        pose = mix(pose, chin, pulse(t, 5.5, 2, 2.2));
      } else {
        fade = 1 - seg(T, this.dur - 0.5, this.dur);
        const lift = E.soft(seg(T, 0.25, 0.55)) * (1 - seg(T, 0.72, 0.8));
        const slam = E.sm(seg(T, 0.56, 0.72)) * (1 - E.soft(seg(T, 0.95, 1.2)));
        const wait = E.soft(seg(T, 1.3, 1.6)) * (1 - E.soft(seg(T, 5.4, 5.6)));
        const cheer = E.back(seg(T, 5.6, 6.0)) * (1 - E.soft(seg(T, 6.4, 6.7)));
        pose = mix(pose, P({ hF: [20, -121], hB: [-4, -54], head: [6, -117] }), lift);
        pose = mix(pose, P({ hF: lp([BTN[0], BTN[1] - 6], ME, 0, 1), hB: [-4, -54], head: [9, -112], chest: [4, -88] }), slam);
        pose = mix(pose, chin, wait);
        pose = mix(pose, P({ hF: [14, -132], hB: [-10, -130], head: [3, -118] }), cheer);
        pressK = seg(T, 0.66, 0.72) * (1 - seg(T, 1.0, 1.15));
        sendKs[0] = seg(T, 0.8, 1.5);
        sendKs[1] = seg(T, 0.95, 1.65);
        thinkK = E.soft(seg(T, 1.7, 1.9)) * (1 - E.soft(seg(T, 2.5, 2.7)));
        hmm = seg(T, 1.75, 1.9) * (1 - seg(T, 2.5, 2.65));
        typing = Math.max(typing, E.soft(seg(T, 2.6, 2.75)) * (1 - E.soft(seg(T, 4.9, 5.05))));
        for (let i = 0; i < 2; i++) {
          const [a, b] = FIX[i];
          dropKs[i] = E.in(seg(T, b - 0.1, b + 0.25));
          fixKs[i] = seg(T, b, b + 0.5) * fade;
          replyKs[i] = seg(T, b + 0.45, b + 0.75) * fade;
        }
        if (fade < 1) {
          dropKs[0] = dropKs[1] = 0;
        }
        done = seg(T, 5.4, 5.55) * (1 - seg(T, 6.6, 6.8));
      }

      sendButton(g, pressK);
      board(g, fixKs, dropKs);
      desk(g, BOT, 1, typing, t, AGENT);
      const working = typing > 0.3;
      const bob = working ? Math.sin(t * 26) * 2.2 : 0;
      let ap = breathe(P({ hF: [24, -58 + bob], hB: [20, -56 - bob], head: [5, -116] }), t + 1);
      ap = mix(ap, P({ hF: [10, -96], hB: [20, -56], head: [6, -118] }), thinkK);
      const glow = working ? Math.floor(t * 6) % 2 : thinkK > 0.3 ? Math.floor(t * 2.5) % 2 : 0;
      const blink = pulse(t, 4.3, 1.2, 0.15) > 0.5;
      fig(g, ap, BOT, 0, { sx: -1, ink: AGENT, far: AGENT_FAR, bot: botStyle(glow, blink) });
      fig(g, pose, ME, 0, { wave: S.wave, wt: S.wt });
      text(g, 'you', ME, 18, 10, C.muted);
      text(g, 'agent', BOT, 18, 10, AGENT);

      NOTES.forEach((at, i) => {
        note(g, at, 1, i ? -0.1 : 0.12);
        reply(g, at, replyKs[i]);
      });
      for (let i = 0; i < 2; i++) {
        plane(g, [NOTES[i][0] + 22, NOTES[i][1] - 6], [LAP[0], LAP[1] - 22], sendKs[i], 46, 0.9);
        const [a] = FIX[i];
        strip(g, [LAP[0] - 6, LAP[1] - 16], [B.x + B.w / 2, LY(BUGS[i])], seg(T, a, a + 0.55), 40);
      }
      sparks(g, BTN[0], BTN[1] - 8, seg(T, 0.7, 1.2), 12, 7, ADD_INK);
      bubble(g, BOT - 22, -132, 'hmm…', hmm, { tail: 14, size: 8.5 });
      bubble(g, BOT - 22, -132, 'both fixed', done, { tail: 14, size: 8.5 });
      sparks(g, ME + 2, -128, seg(T, 5.65, 6.25), 22, 8, C.amber);
    },
  };
})();
