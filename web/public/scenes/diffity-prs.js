// diffity: pull a pull request out of the mailbox, drop it into diffity, it checks out and runs, you comment on it
(function () {
  const SC = (window.SCENES = window.SCENES || {});
  const R = window.RIG;
  const { C, E, P, mix, legs, walkSeg, fig, inkFill, rr, ln, text, seg, breathe, sparks, pulse, bubble, words, lerp, circle, arcPt } = R;

  const ADD = '#dafbe1', ADD_INK = '#1a7f37', DEL = '#ffebe9', DEL_INK = '#cf222e';
  const MB = { x: -174, y: -98, w: 46, h: 26 };
  const CARDS = [
    { x: -166, label: '#41' },
    { x: -151, label: '#42' },
    { x: -136, label: '#43' },
  ];
  const B = { x: -84, y: -170, w: 176, h: 112 };
  const LY = (i) => B.y + 30 + i * 12.5;
  const KINDS = ['del', 'add', 'add', 'ctx', 'add', 'del', 'add'];
  const NOTE_ROW = 3;
  const NOTE = [B.x + 10, LY(NOTE_ROW) - 1];
  const PW = { x: 116, y: -132, w: 112, h: 76 };
  const HOME = -222, AT_MB = -186, AT_B = -104;

  function card(g, x, y, label, rot) {
    g.save();
    g.translate(x, y);
    g.rotate(rot || 0);
    rr(g, -8, -12, 16, 24, 2);
    inkFill(g, C.paper, 1.3);
    text(g, label, 0, -3, 6.5, C.ink);
    ln(g, -4, 3, 4, 3, 1.3, ADD_INK);
    ln(g, -4, 7, 2, 7, 1.3, DEL_INK);
    g.restore();
  }

  function mailbox(g, held, back, flag) {
    ln(g, MB.x + MB.w / 2, MB.y + MB.h, MB.x + MB.w / 2, 0, 3);
    ln(g, MB.x + MB.w / 2 - 8, 0, MB.x + MB.w / 2 + 8, 0, 2.2);
    for (let i = 0; i < CARDS.length; i++) {
      const c = CARDS[i];
      if (i === 1 && held) {
        continue;
      }
      g.save();
      if (i === 1 && back < 1) {
        g.globalAlpha *= back;
      }
      card(g, c.x, MB.y - 6, c.label, (i - 1) * 0.12);
      g.restore();
    }
    rr(g, MB.x, MB.y, MB.w, MB.h, 8);
    inkFill(g, '#cfe3f3', 1.7);
    ln(g, MB.x + 6, MB.y + 8, MB.x + MB.w - 6, MB.y + 8, 1.2, '#7d9bb3');
    text(g, 'PRs', MB.x + MB.w / 2, MB.y + 20, 8, C.ink);
    g.save();
    g.translate(MB.x + MB.w, MB.y + 16);
    g.rotate((1 - flag) * 1.5);
    ln(g, 0, 0, 0, -16, 1.8);
    rr(g, 0, -17, 10, 7, 1.5);
    inkFill(g, C.red, 1.2);
    g.restore();
  }

  function board(g, tagK, rowsK, noteK, fade) {
    ln(g, B.x + 22, B.y + B.h, B.x + 10, 0, 2.2);
    ln(g, B.x + B.w - 22, B.y + B.h, B.x + B.w - 10, 0, 2.2);
    ln(g, B.x + 40, B.y + B.h + 30, B.x + B.w - 40, B.y + B.h + 30, 1.4, '#bdbdbd');
    rr(g, B.x, B.y, B.w, B.h, 6);
    inkFill(g, C.paper, 1.7);
    ln(g, B.x, B.y + 17, B.x + B.w, B.y + 17, 1.3);
    text(g, 'diffity', B.x + 10, B.y + 12, 8.5, C.ink, 'left');
    const flip = Math.abs(Math.cos(Math.PI * tagK));
    const label = tagK < 0.5 ? 'main' : 'feat/login';
    const lw = tagK < 0.5 ? 34 : 54;
    g.save();
    g.translate(B.x + B.w - 10 - lw / 2, B.y + 9);
    g.scale(1, Math.max(0.05, flip));
    rr(g, -lw / 2, -5.5, lw, 11, 5.5);
    inkFill(g, tagK < 0.5 ? '#f0f0f0' : '#fff6d8', 1.1, tagK < 0.5 ? '#9a9a9a' : '#b98a1a');
    text(g, label, 0, 3, 7.5, C.ink);
    g.restore();
    if (rowsK < 1) {
      g.save();
      g.globalAlpha *= 1 - rowsK;
      text(g, 'no changes', B.x + B.w / 2, B.y + 66, 9, '#b0b0b0');
      g.restore();
    }
    if (rowsK > 0) {
      g.save();
      g.globalAlpha *= fade;
      for (let i = 0; i < KINDS.length; i++) {
        const k = seg(rowsK, i / KINDS.length * 0.6, i / KINDS.length * 0.6 + 0.4);
        if (k <= 0) {
          continue;
        }
        const y = LY(i);
        const kind = KINDS[i];
        if (kind === 'ctx') {
          g.save();
          g.globalAlpha *= k;
          text(g, String(30 + i), B.x + 10, y + 3, 7, '#b0b0b0', 'left');
          words(g, B.x + 26, y, 80, i * 5, '#cfcfcf', 2);
          g.restore();
          continue;
        }
        const add = kind === 'add';
        rr(g, B.x + 4, y - 5, (B.w - 8) * E.out3(k), 10, 2);
        g.fillStyle = add ? ADD : DEL;
        g.fill();
        if (k > 0.6) {
          text(g, add ? '+' : '−', B.x + 10, y + 3, 9, add ? ADD_INK : DEL_INK);
          words(g, B.x + 22, y, 70 + ((i * 29) % 60), i * 7, add ? '#7cc48e' : '#e7a3a3', 2.2);
        }
      }
      g.restore();
    }
    if (noteK > 0) {
      const z = E.back(noteK);
      g.save();
      g.translate(NOTE[0], NOTE[1]);
      g.rotate(0.12);
      g.scale(z, z);
      g.globalAlpha *= fade;
      rr(g, -2, -9, 26, 18, 2);
      inkFill(g, C.butter, 1.3);
      ln(g, 3, -4, 19, -4, 1.5, '#b98a1a');
      ln(g, 3, 2, 14, 2, 1.5, '#b98a1a');
      g.restore();
    }
  }

  function preview(g, runK, t) {
    ln(g, PW.x + 26, PW.y + PW.h, PW.x + 18, 0, 2.2);
    ln(g, PW.x + PW.w - 26, PW.y + PW.h, PW.x + PW.w - 18, 0, 2.2);
    rr(g, PW.x, PW.y, PW.w, PW.h, 5);
    inkFill(g, C.paper, 1.6);
    ln(g, PW.x, PW.y + 13, PW.x + PW.w, PW.y + 13, 1.1);
    circle(g, PW.x + 8, PW.y + 6.5, 2.3);
    g.fillStyle = runK > 0.5 ? (Math.floor(t * 2) % 2 ? '#3fbf62' : '#8fd19e') : '#d0d0d0';
    g.fill();
    text(g, 'localhost:3000', PW.x + 16, PW.y + 9.5, 7, C.muted, 'left');
    const cx = PW.x + PW.w / 2;
    if (runK < 1) {
      g.save();
      g.globalAlpha *= 1 - runK;
      text(g, '…', cx, PW.y + 46, 12, '#c0c0c0');
      g.restore();
    }
    if (runK <= 0) {
      return;
    }
    const z = E.back(runK);
    g.save();
    g.translate(cx, PW.y + 44);
    g.scale(z, z);
    text(g, 'Log in', 0, -14, 8.5, C.ink);
    rr(g, -32, -9, 64, 9, 2);
    inkFill(g, C.paper, 1.1, '#9a9a9a');
    rr(g, -32, 3, 64, 9, 2);
    inkFill(g, C.paper, 1.1, '#9a9a9a');
    rr(g, -32, 16, 64, 10, 3);
    inkFill(g, ADD_INK, 1.1, ADD_INK);
    text(g, 'go', 0, 23.5, 7, C.paper);
    g.restore();
  }

  SC['diffity-prs'] = {
    dur: 8.8,
    width: 480,
    label: 'A person pulls pull request 42 out of a mailbox and drops it into Diffity, which checks out the branch, shows its diff and runs it, and the person pins a comment on a line.',
    draw(g, S) {
      const T = S.on ? S.u * this.dur : -1;
      const t = S.t;
      let x = HOME, gait = { ph: 0, amp: 0 };
      let pose = breathe(P({ hF: [12, -60], hB: [-4, -52] }), t);
      let held = false, back = 1, flag = 1, tagK = 0, rowsK = 0, noteK = 0, runK = 0, fade = 1, cardFly = 0, sayK = 0, niceK = 0;
      const chin = P({ hF: [10, -96], head: [7, -116], hB: [-4, -54] });
      if (T < 0) {
        pose = mix(pose, chin, pulse(t, 5.5, 2, 2.2));
        flag = 1 - pulse(t, 6, 4, 0.8) * 0.25;
      } else {
        fade = 1 - seg(T, 7.7, 8.2);
        const walks = [
          walkSeg(T, 0, 0.5, HOME, AT_MB),
          walkSeg(T, 1.2, 1.9, AT_MB, AT_B),
          walkSeg(T, 6.4, 7.4, AT_B, HOME),
        ];
        const ws = T < 1.2 ? walks[0] : T < 6.4 ? walks[1] : walks[2];
        x = ws.x;
        gait = ws.dir * 1 < 0 ? { ph: -ws.ph, amp: ws.amp, stride: ws.stride } : ws;
        const card42 = [CARDS[1].x - 4, MB.y - 6];
        const reachK = E.soft(seg(T, 0.5, 0.8)) * (1 - E.soft(seg(T, 0.95, 1.2)));
        pose = mix(pose, P({ hF: [(card42[0] - x) / 0.88, card42[1] / 0.88], hB: [-4, -54], head: [7, -115], chest: [5, -90] }), reachK);
        const carry = E.soft(seg(T, 1.0, 1.2)) * (1 - E.soft(seg(T, 2.0, 2.1)));
        pose = mix(pose, P({ hF: [26, -68], hB: [-4, -54], head: [6, -116] }), carry);
        const toss = E.soft(seg(T, 1.95, 2.1)) * (1 - E.soft(seg(T, 2.25, 2.5)));
        pose = mix(pose, P({ hF: [38, -112], hB: [-4, -54], head: [10, -117] }), toss);
        const look = E.soft(seg(T, 3.2, 3.4)) * (1 - E.soft(seg(T, 4.0, 4.2)));
        pose = mix(pose, P({ hF: [40, -100], hB: [-4, -54], head: [12, -117] }), look);
        const pin = E.soft(seg(T, 4.4, 4.7)) * (1 - E.soft(seg(T, 5.0, 5.3)));
        pose = mix(pose, P({ hF: [(NOTE[0] + 4 - x) / 0.88, (NOTE[1] + 2) / 0.88], hB: [-4, -54], head: [9, -114], chest: [3, -90] }), pin);
        const cheer = E.back(seg(T, 5.5, 5.9)) * (1 - E.soft(seg(T, 6.1, 6.4)));
        pose = mix(pose, P({ hF: [14, -132], hB: [-10, -130], head: [3, -118] }), cheer);

        held = T >= 0.9 && T < 2.1;
        cardFly = seg(T, 2.1, 2.6);
        back = T < 2.1 ? 1 : seg(T, 7.6, 8.4);
        flag = 1 - E.soft(seg(T, 0.8, 1.1)) * (1 - E.soft(seg(T, 7.8, 8.4)));
        const flipBack = seg(T, 7.6, 7.9);
        tagK = Math.min(1, seg(T, 2.6, 2.9)) * (1 - flipBack);
        rowsK = seg(T, 2.85, 3.5) * (1 - seg(T, 7.6, 7.9));
        runK = seg(T, 3.0, 3.4) * (1 - seg(T, 7.7, 8.1));
        noteK = seg(T, 4.6, 4.85) * (1 - seg(T, 7.55, 7.8));
        sayK = seg(T, 3.25, 3.4) * (1 - seg(T, 4.1, 4.25));
        niceK = seg(T, 5.55, 5.7) * (1 - seg(T, 6.3, 6.45));
      }
      pose = legs(pose, gait.ph, gait.amp, { arms: false, stride: gait.stride });

      board(g, tagK, rowsK, noteK, 1);
      preview(g, runK, t);
      mailbox(g, held || (cardFly > 0 && back < 1), back, flag);
      const J = fig(g, pose, x, 0, { wave: S.wave, wt: S.wt });
      if (held) {
        card(g, J.w.handF[0] + 3, J.w.handF[1] - 2, '#42', 0.1);
      }
      if (cardFly > 0 && cardFly < 1) {
        const p = arcPt([AT_B + 34, -110], [B.x + B.w / 2, B.y + 8], 40, E.soft(cardFly));
        const z = 1 - 0.6 * cardFly;
        g.save();
        g.translate(p[0], p[1]);
        g.scale(z, z);
        card(g, 0, 0, '#42', cardFly * 3);
        g.restore();
      }
      text(g, 'you', x, 18, 10, C.muted);
      sparks(g, B.x + B.w - 30, B.y + 6, seg(T, 2.6, 3.1), 14, 6, C.amber);
      sparks(g, PW.x + 8, PW.y + 6, seg(T, 3.0, 3.5), 10, 5, ADD_INK);
      sparks(g, NOTE[0] + 10, NOTE[1], seg(T, 4.65, 5.1), 14, 6, C.amber);
      bubble(g, x - 22, -140, 'it runs!', sayK, { tail: 14, size: 8.5 });
      bubble(g, x - 26, -146, 'looks good', niceK, { tail: 18, size: 8.5 });
    },
  };
})();
