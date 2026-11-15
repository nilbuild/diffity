// diffity: ask the agent for a review, it scans the diff with a magnifier and pins notes on the lines that matter
(function () {
  const SC = (window.SCENES = window.SCENES || {});
  const R = window.RIG;
  const { C, E, P, mix, legs, walkSeg, fig, inkFill, rr, ln, text, seg, breathe, sparks, pulse, bubble, words, lerp, circle, lp } = R;

  const ADD = '#dafbe1', ADD_INK = '#1a7f37', DEL = '#ffebe9', DEL_INK = '#cf222e';
  const AGENT = '#d97757', AGENT_DARK = '#a8553a', AGENT_NOTE = '#fde3d7';
  const B = { x: -70, y: -168, w: 176, h: 112 };
  const LY = (i) => B.y + 30 + i * 12.5;
  const KINDS = ['ctx', 'del', 'add', 'ctx', 'add', 'del', 'add'];
  const PICKS = [1, 3, 5];
  const noteAt = (i) => [B.x + 34, LY(PICKS[i]) - 1];
  const ME = -200, BOT_HOME = 206, BOT_AT = 118;
  const SCAN = [2.4, 5.0];
  const rowTime = (r) => lerp(SCAN[0], SCAN[1], r / 5);

  function board(g, noteKs, lensY) {
    ln(g, B.x + 22, B.y + B.h, B.x + 10, 0, 2.2);
    ln(g, B.x + B.w - 22, B.y + B.h, B.x + B.w - 10, 0, 2.2);
    ln(g, B.x + 40, B.y + B.h + 30, B.x + B.w - 40, B.y + B.h + 30, 1.4, '#bdbdbd');
    rr(g, B.x, B.y, B.w, B.h, 6);
    inkFill(g, C.paper, 1.7);
    ln(g, B.x, B.y + 17, B.x + B.w, B.y + 17, 1.3);
    text(g, 'diffity', B.x + 10, B.y + 12, 8.5, C.ink, 'left');
    text(g, 'auth.ts', B.x + B.w - 10, B.y + 12, 8, C.muted, 'right');
    for (let i = 1; i < KINDS.length; i++) {
      const y = LY(i - 1);
      const kind = KINDS[i];
      if (kind === 'ctx') {
        text(g, String(20 + i), B.x + 10, y + 3, 7, '#b0b0b0', 'left');
        words(g, B.x + 26, y, 70 + ((i * 37) % 40), i * 5, '#cfcfcf', 2);
        continue;
      }
      const add = kind === 'add';
      rr(g, B.x + 4, y - 5, B.w - 8, 10, 2);
      g.fillStyle = add ? ADD : DEL;
      g.fill();
      text(g, add ? '+' : '−', B.x + 10, y + 3, 9, add ? ADD_INK : DEL_INK);
      words(g, B.x + 22, y, 76 + ((i * 29) % 40), i * 7, add ? '#7cc48e' : '#e7a3a3', 2.2);
    }
    if (lensY != null) {
      g.save();
      g.globalAlpha *= 0.35;
      rr(g, B.x + 2, lensY - 6, B.w - 4, 12, 2);
      g.fillStyle = C.butterHi;
      g.fill();
      g.restore();
    }
    for (let i = 0; i < PICKS.length; i++) {
      const k = noteKs[i];
      if (k <= 0) {
        continue;
      }
      const [nx, ny] = noteAt(i);
      const z = E.back(k);
      g.save();
      g.translate(nx, ny);
      g.rotate(i % 2 ? 0.1 : -0.12);
      g.scale(z, z);
      rr(g, -12, -8, 24, 16, 2);
      inkFill(g, AGENT_NOTE, 1.3, AGENT_DARK);
      ln(g, -7, -3, 7, -3, 1.5, AGENT);
      ln(g, -7, 2, 2, 2, 1.5, AGENT);
      g.restore();
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

  function desk(g, cx, sx, typing, t, mugOn) {
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
    if (mugOn) {
      rr(g, -86, -66, 12, 16, 2);
      inkFill(g, C.paper, 1.3);
    }
    g.restore();
    if (mugOn) {
      steam(g, cx + sx * -80, -70, t);
    }
    if (typing > 0) {
      for (let i = 0; i < 3; i++) {
        const k = (t * 2.6 + i / 3) % 1;
        g.save();
        g.globalAlpha *= typing * (1 - k);
        text(g, ['{', '}', ';'][i], cx + sx * (-56 + i * 9), -68 - k * 22, 9, C.muted);
        g.restore();
      }
    }
  }

  // The person's hands on the laptop keys (desk-local x -22..-64 at y -55, mirrored by sx -1).
  function typePose(bob) {
    const f = lp([ME + 30, -56], ME, 0, 1), b = lp([ME + 24, -56], ME, 0, 1);
    return P({ hF: [f[0], f[1] + bob], hB: [b[0], b[1] - bob], head: [5, -116], chest: [4, -89] });
  }

  function botStyle(glow, blink) {
    return { col: AGENT, dark: AGENT_DARK, glow, blink };
  }

  function lens(g, hand, k) {
    if (k <= 0) {
      return;
    }
    const z = E.back(k);
    const c = [hand[0] - 20 * z, hand[1] - 11 * z];
    ln(g, hand[0], hand[1], c[0] + 7 * z, c[1] + 4 * z, 3.2 * z, '#7a5a3a');
    circle(g, c[0], c[1], 11 * z);
    g.fillStyle = 'rgba(214,236,255,0.45)';
    g.fill();
    g.lineWidth = 2.4;
    g.strokeStyle = C.ink;
    g.stroke();
    ln(g, c[0] - 5 * z, c[1] - 4 * z, c[0] - 2 * z, c[1] - 7 * z, 1.5, '#ffffff');
  }

  function mug(g, hand) {
    rr(g, hand[0] - 4, hand[1] - 12, 11, 13, 2);
    inkFill(g, C.paper, 1.3);
  }

  SC['diffity-agent-review'] = {
    dur: 8.6,
    width: 480,
    label: 'A person asks the agent for a review and sips coffee while the agent scans the diff with a magnifying glass and pins notes on the lines that matter.',
    draw(g, S) {
      const T = S.on ? S.u * this.dur : -1;
      const t = S.t;
      let myTyping = pulse(t, 6.5, 4, 1.4) * 0.6;
      let pose = breathe(typePose(0), t);
      let bx = BOT_HOME, bgait = { ph: 0, amp: 0 };
      let ap = breathe(P({ hF: [12, -60], hB: [-4, -52], head: [3, -117] }), t + 1);
      let fade = 1, lensK = 0, lensY = null, sipK = 0, glow = 0;
      let noteKs = [0, 0, 0];
      let askK = 0, sureK = 0, niceK = 0;
      const chin = P({ hF: [10, -96], head: [7, -116], hB: [-4, -54] });
      const idleK = T < 0 ? 1 : 1 - E.soft(seg(T, 0, 0.4));
      ap = mix(ap, chin, pulse(t, 7, 3.5, 1.8) * idleK);
      if (T < 0) {
        const bob = myTyping > 0.3 ? Math.sin(t * 24) * 2.2 : 0;
        pose = breathe(typePose(bob), t);
        pose = mix(pose, chin, pulse(t, 6.5, 1.2, 2));
      } else {
        fade = 1 - seg(T, this.dur - 0.5, this.dur);
        myTyping = E.soft(seg(T, 0.05, 0.2)) * (1 - E.soft(seg(T, 0.7, 0.85)));
        const bob = myTyping > 0.3 ? Math.sin(t * 24) * 2.2 : 0;
        pose = breathe(typePose(bob), t);
        pose = mix(pose, chin, pulse(t, 6.5, 1.2, 2) * idleK);
        const ask = E.soft(seg(T, 0.8, 1.0)) * (1 - E.soft(seg(T, 1.5, 1.7)));
        pose = mix(pose, P({ hF: [40, -100], hB: [-4, -54], head: [10, -116] }), ask);
        sipK = E.soft(seg(T, 2.0, 2.4)) * (1 - E.soft(seg(T, 5.3, 5.6)));
        const sipBob = Math.max(0, Math.sin((T - 2.4) * 2.2)) * 6;
        pose = mix(pose, P({ hF: [12, -96 - sipBob * 0.6], hB: [-6, -54], head: [-1, -116 - sipBob * 0.2], chest: [-4, -89] }), sipK);
        const thumbs = E.back(seg(T, 5.6, 5.9)) * (1 - E.soft(seg(T, 6.8, 7.1)));
        pose = mix(pose, P({ hF: [26, -98], hB: [-4, -54], head: [6, -117] }), thumbs);

        const ws = T < 4 ? walkSeg(T, 1.6, 2.3, BOT_HOME, BOT_AT) : walkSeg(T, 5.4, 6.1, BOT_AT, BOT_HOME);
        bx = ws.x;
        bgait = ws.dir * -1 < 0 ? { ph: -ws.ph, amp: ws.amp, stride: ws.stride } : ws;
        lensK = seg(T, 1.3, 1.6) * (1 - seg(T, 6.1, 6.4));
        const hold = E.soft(seg(T, 1.3, 1.6)) * (1 - E.soft(seg(T, 6.0, 6.3)));
        ap = mix(ap, P({ hF: [22, -86], hB: [-4, -54], head: [6, -117] }), hold);
        const scanK = E.soft(seg(T, 2.25, 2.45)) * (1 - E.soft(seg(T, 5.05, 5.3)));
        if (scanK > 0) {
          const v = seg(T, SCAN[0], SCAN[1]);
          lensY = lerp(LY(0), LY(5), v);
          const wig = Math.sin(T * 9) * 4;
          const target = [B.x + B.w - 38 + wig, lensY + 11];
          const aim = [(bx - target[0]) / 0.88, target[1] / 0.88];
          const ad = Math.hypot(aim[0] - 4, aim[1] + 88);
          const local = ad > 38 ? [4 + ((aim[0] - 4) / ad) * 38, -88 + ((aim[1] + 88) / ad) * 38] : aim;
          ap = mix(ap, P({ hF: local, hB: [-4, -54], head: [9, -114], chest: [4, -89] }), scanK);
          if (scanK < 0.9) {
            lensY = null;
          }
        }
        for (let i = 0; i < PICKS.length; i++) {
          const at = rowTime(PICKS[i]) + 0.12;
          noteKs[i] = seg(T, at, at + 0.3) * fade;
        }
        glow = scanK > 0.5 ? Math.floor(t * 4) % 2 : 0;
        askK = seg(T, 0.8, 0.95) * (1 - seg(T, 1.9, 2.05));
        sureK = seg(T, 1.15, 1.3) * (1 - seg(T, 1.95, 2.1));
        niceK = seg(T, 5.75, 5.9) * (1 - seg(T, 6.9, 7.1));
      }

      board(g, noteKs, lensY);
      desk(g, ME, -1, myTyping, t + 0.4, sipK < 0.05);
      ap = legs(ap, bgait.ph, bgait.amp, { arms: false, stride: bgait.stride });
      const blink = pulse(t, 4.3, 1.2, 0.15) > 0.5;
      const J = fig(g, ap, bx, 0, { sx: -1, ink: AGENT, far: '#e8b7a3', bot: botStyle(glow, blink) });
      lens(g, J.w.handF, lensK);
      const MJ = fig(g, pose, ME, 0, { wave: S.wave, wt: S.wt });
      if (sipK > 0.05) {
        mug(g, MJ.w.handF);
        steam(g, MJ.w.handF[0] + 1, MJ.w.handF[1] - 15, t);
      }
      if (T >= 0) {
        const thumbsK = seg(T, 5.7, 5.85) * (1 - seg(T, 6.8, 6.95));
        if (thumbsK > 0) {
          const h = MJ.w.handF;
          ln(g, h[0], h[1] - 1, h[0], h[1] - 8 * thumbsK, 3, C.ink);
        }
      }
      text(g, 'you', ME, 18, 10, C.muted);
      text(g, 'agent', bx, 18, 10, AGENT);
      bubble(g, ME + 30, -140, 'review auth?', askK, { tail: -18, size: 8.5 });
      bubble(g, bx - 18, -138, 'sure!', sureK, { tail: 10, size: 8.5 });
      bubble(g, ME + 30, -140, 'good catches', niceK, { tail: -18, size: 8.5 });
      for (let i = 0; i < PICKS.length; i++) {
        const [nx, ny] = noteAt(i);
        const at = rowTime(PICKS[i]) + 0.12;
        sparks(g, nx, ny, seg(T, at, at + 0.45), 14, 6, AGENT);
      }
    },
  };
})();
