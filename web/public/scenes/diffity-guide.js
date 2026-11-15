// diffity: the agent guides you through a change, box by box, with each step's code spotlighted in the diff
(function () {
  const SC = (window.SCENES = window.SCENES || {});
  const R = window.RIG;
  const { C, E, P, mix, fig, inkFill, rr, ln, text, seg, breathe, sparks, pulse, lp, bubble, lerp, clamp } = R;

  const ADD = '#dafbe1', ADD_INK = '#1a7f37', DEL = '#ffebe9', DEL_INK = '#cf222e';
  const AGENT = '#d97757', AGENT_DARK = '#a8553a', AGENT_FAR = '#e8b7a3';
  const BOT = -222, ME = 208;
  const DX = 14;
  const G = { x: -186 + DX, y: -170, w: 124, h: 92 };
  const BOXES = [
    { c: [-153 + DX, -134], t: 'route' },
    { c: [-95 + DX, -134], t: 'auth' },
    { c: [-95 + DX, -100], t: 'session' },
    { c: [-153 + DX, -100], t: 'db' },
  ];
  const RISKY = 2;
  const D = { x: -34 + DX, y: -166, w: 186, h: 108 };
  const ROWS = 7;
  const LY = (i) => D.y + 29 + i * 11.5;
  const KINDS = ['ctx', 'del', 'add', 'ctx', 'add', 'add', 'ctx'];
  const STEP_ROWS = [[1, 2], [3, 3], [4, 5], [6, 6]];
  const STEP_AT = [1.9, 3.3, 4.7, 6.1];

  function legs(g, x, y, w, h) {
    ln(g, x + 18, y + h, x + 8, 0, 2.2);
    ln(g, x + w - 18, y + h, x + w - 8, 0, 2.2);
    ln(g, x + 30, y + h + 28, x + w - 30, y + h + 28, 1.4, '#bdbdbd');
  }

  function arrow(g, a, b, k) {
    if (k <= 0) {
      return;
    }
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    const s = [a[0] + ux * 10, a[1] + uy * 10];
    const e = [lerp(s[0], b[0] - ux * 11, k), lerp(s[1], b[1] - uy * 11, k)];
    ln(g, s[0], s[1], e[0], e[1], 1.6, C.ink);
    if (k > 0.85) {
      const px = -uy, py = ux;
      ln(g, e[0], e[1], e[0] - ux * 5 + px * 3.5, e[1] - uy * 5 + py * 3.5, 1.6, C.ink);
      ln(g, e[0], e[1], e[0] - ux * 5 - px * 3.5, e[1] - uy * 5 - py * 3.5, 1.6, C.ink);
    }
  }

  function guideBoard(g, lit, arrows, riskK, riskPulse) {
    legs(g, G.x, G.y, G.w, G.h);
    rr(g, G.x, G.y, G.w, G.h, 6);
    inkFill(g, C.paper, 1.7);
    ln(g, G.x, G.y + 16, G.x + G.w, G.y + 16, 1.3);
    text(g, 'guide', G.x + 9, G.y + 11.5, 8.5, C.ink, 'left');
    text(g, 'login flow', G.x + G.w - 9, G.y + 11.5, 7.5, C.muted, 'right');
    for (let i = 0; i < BOXES.length - 1; i++) {
      arrow(g, BOXES[i].c, BOXES[i + 1].c, arrows[i]);
    }
    for (let i = 0; i < BOXES.length; i++) {
      const b = BOXES[i];
      const on = lit[i];
      const risky = i === RISKY && riskK > 0;
      rr(g, b.c[0] - 19, b.c[1] - 8, 38, 16, 4);
      inkFill(g, on > 0.5 ? C.butter : risky ? '#fff4f3' : C.paper, on > 0.5 ? 1.7 : 1.3, risky && riskPulse > 0 ? DEL_INK : C.ink);
      text(g, b.t, b.c[0], b.c[1] + 2.8, 7.5, C.ink);
    }
    if (riskK > 0) {
      const b = BOXES[RISKY].c;
      const z = E.back(riskK);
      g.save();
      g.translate(b[0] + 18, b[1] - 9);
      g.scale(z, z);
      R.circle(g, 0, 0, 5.2);
      inkFill(g, DEL_INK, 1.2, '#8f1820');
      text(g, '!', 0, 3, 8, C.paper);
      g.restore();
    }
  }

  function diffWindow(g, band, spotOn, step) {
    legs(g, D.x, D.y, D.w, D.h);
    rr(g, D.x, D.y, D.w, D.h, 6);
    inkFill(g, C.paper, 1.7);
    ln(g, D.x, D.y + 16, D.x + D.w, D.y + 16, 1.3);
    text(g, 'diffity', D.x + 9, D.y + 11.5, 8.5, C.ink, 'left');
    if (step > 0 && spotOn > 0.5) {
      R.pill(g, D.x + D.w - 30, D.y + 8.5, 'step ' + step + '/4', C.butter, C.ink, 7);
    } else {
      text(g, 'login.ts', D.x + D.w - 9, D.y + 11.5, 7.5, C.muted, 'right');
    }
    for (let i = 0; i < ROWS; i++) {
      const y = LY(i);
      const k = KINDS[i];
      if (k !== 'ctx') {
        rr(g, D.x + 4, y - 4.5, D.w - 8, 9, 2);
        g.fillStyle = k === 'add' ? ADD : DEL;
        g.fill();
        text(g, k === 'add' ? '+' : '−', D.x + 22, y + 3, 8.5, k === 'add' ? ADD_INK : DEL_INK);
      }
      text(g, String(40 + i), D.x + 9, y + 2.5, 6.5, '#b0b0b0', 'left');
      const col = k === 'add' ? '#7cc48e' : k === 'del' ? '#e7a3a3' : '#cfcfcf';
      R.words(g, D.x + 30 + (i % 3) * 7, y, 80 + ((i * 31) % 50), i * 7 + 3, col, 2);
    }
    if (spotOn <= 0) {
      return;
    }
    const top = band[0] - 5.5, bot = band[1] + 5.5;
    g.save();
    g.globalAlpha *= spotOn;
    g.beginPath();
    g.rect(D.x + 1.5, D.y + 17.5, D.w - 3, top - (D.y + 17.5));
    g.rect(D.x + 1.5, bot, D.w - 3, D.y + D.h - 1.5 - bot);
    g.fillStyle = 'rgba(255,255,255,0.62)';
    g.fill();
    rr(g, D.x + 3, top, D.w - 6, bot - top, 3);
    g.lineWidth = 1.6;
    g.strokeStyle = C.butterHi;
    g.stroke();
    rr(g, D.x + 3, top, 3.5, bot - top, 1.5);
    g.fillStyle = C.butterHi;
    g.fill();
    g.restore();
  }

  function jumpLine(g, from, toY, k) {
    if (k <= 0) {
      return;
    }
    g.save();
    g.globalAlpha *= k * 0.8;
    g.setLineDash([3, 3]);
    g.beginPath();
    g.moveTo(from[0], from[1]);
    g.bezierCurveTo(from[0] + 30, from[1], D.x - 22, toY, D.x - 2, toY);
    g.lineWidth = 1.3;
    g.strokeStyle = C.amber;
    g.stroke();
    g.restore();
  }

  function flagPole(g, hand, tip) {
    const dx = tip[0] - hand[0], dy = tip[1] - hand[1], d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    const back = [hand[0] - ux * 6, hand[1] - uy * 6];
    ln(g, back[0], back[1], tip[0], tip[1], 2.2, '#6b4a2b');
    const fx = tip[0] - ux * 7, fy = tip[1] - uy * 7;
    const px = uy, py = -ux;
    const side = py < 0 ? 1 : -1;
    g.beginPath();
    g.moveTo(fx, fy);
    g.lineTo(fx - ux * 11, fy - uy * 11);
    g.lineTo(fx - ux * 5.5 + px * 8 * side, fy - uy * 5.5 + py * 8 * side);
    g.closePath();
    inkFill(g, AGENT, 1.2, AGENT_DARK);
  }

  SC['diffity-guide'] = {
    dur: 9.4,
    width: 500,
    label: 'The agent, holding a guide flag, taps the boxes of a diagram one by one, each step lights up its code in the diff, a risky step gets a red warning, and you follow along until it clicks.',
    draw(g, S) {
      const T = S.on ? S.u * this.dur : -1;
      const t = S.t;
      const fade = T < 0 ? 1 : 1 - seg(T, this.dur - 0.5, this.dur);
      let lit = [0, 0, 0, 0], arrows = [0, 0, 0], riskK = 0, spotOn = 0, stepF = 0, jumpK = 0, saidRisk = 0, saidGot = 0, botSaid = 0, happy = false;
      let tip = null;
      const idleTip = [BOT + 20, -158];
      const chin = P({ hF: [10, -96], head: [7, -116], hB: [-4, -54] });
      let me = breathe(P({ hF: [12, -60], hB: [-4, -52], head: [7, -117] }), t);
      let bp = breathe(P({ hF: [18, -92], hB: [-4, -54], head: [5, -117] }), t + 2);
      if (T < 0) {
        me = mix(me, chin, pulse(t, 6, 2.5, 2));
        tip = [idleTip[0] + Math.sin(t * 1.4) * 2, idleTip[1]];
      } else {
        riskK = seg(T, 0.7, 1.0) * fade;
        saidRisk = seg(T, 0.8, 0.95) * (1 - seg(T, 1.7, 1.85));
        let target = idleTip;
        let w = 0;
        const riskPoint = E.soft(seg(T, 0.35, 0.65)) * (1 - E.soft(seg(T, 1.45, 1.75)));
        target = [lerp(idleTip[0], BOXES[RISKY].c[0] - 12, riskPoint), lerp(idleTip[1], BOXES[RISKY].c[1] + 6, riskPoint)];
        w = riskPoint;
        let cur = -1;
        for (let i = 0; i < 4; i++) {
          const a = STEP_AT[i];
          const k = E.soft(seg(T, a - 0.35, a)) * (i === 3 ? 1 - E.soft(seg(T, 7.2, 7.6)) : 1);
          if (T >= a - 0.35) {
            const prev = i === 0 ? target : [BOXES[i - 1].c[0] - 12, BOXES[i - 1].c[1] + 6];
            const to = [BOXES[i].c[0] - 12, BOXES[i].c[1] + 6];
            target = [lerp(prev[0], to[0], k), lerp(prev[1], to[1], k)];
            if (i === 3 && T > 7.2) {
              target = [lerp(idleTip[0], to[0], k), lerp(idleTip[1], to[1], k)];
            }
            w = Math.max(w, i === 0 ? k : 1);
            if (i === 3) {
              w = 1 - E.soft(seg(T, 7.2, 7.6));
            }
          }
          lit[i] = seg(T, a, a + 0.15) * (1 - seg(T, a + 1.3, a + 1.4)) * fade;
          if (i > 0) {
            arrows[i - 1] = E.out3(seg(T, a - 0.3, a + 0.1)) * fade;
          }
          if (T >= a) {
            cur = i;
          }
        }
        tip = target;
        if (cur >= 0) {
          const a = STEP_AT[cur];
          const prevRows = STEP_ROWS[Math.max(0, cur - 1)];
          const rows = STEP_ROWS[cur];
          const m = cur === 0 ? 1 : E.soft(seg(T, a, a + 0.35));
          stepF = cur + 1;
          spotOn = seg(T, STEP_AT[0], STEP_AT[0] + 0.3) * (1 - seg(T, 7.6, 8.0));
          const band = [lerp(LY(prevRows[0]), LY(rows[0]), m), lerp(LY(prevRows[1]), LY(rows[1]), m)];
          S.st.band = band;
          jumpK = seg(T, a, a + 0.15) * (1 - seg(T, a + 0.9, a + 1.2));
        }
        const nods = STEP_AT.map((a) => Math.sin(Math.PI * seg(T, a + 0.2, a + 0.6))).reduce((x, y) => Math.max(x, y), 0);
        me = mix(me, P({ hF: [12, -60], hB: [-4, -52], head: [9, -112] }), nods * 0.8);
        const cheer = E.back(seg(T, 7.4, 7.65)) * (1 - E.soft(seg(T, 8.4, 8.7)));
        me = mix(me, P({ hF: [16, -104], hB: [-4, -54], head: [8, -118] }), cheer);
        saidGot = seg(T, 7.5, 7.65) * (1 - seg(T, 8.6, 8.8));
        botSaid = seg(T, 2.0, 2.15) * (1 - seg(T, 3.0, 3.15));
        happy = T > 7.5 && T < 8.8;
        const aim = lp(target, BOT, 0, 1);
        const ad = Math.hypot(aim[0] - 3, aim[1] + 89);
        const hand = ad > 38 ? [3 + ((aim[0] - 3) / ad) * 38, -89 + ((aim[1] + 89) / ad) * 38] : aim;
        const reach = P({ hF: hand, hB: [-4, -54], head: [9, -115], chest: [3, -90] });
        bp = mix(bp, reach, w * 0.85);
      }
      const band = S.st.band || [LY(1), LY(2)];

      guideBoard(g, lit, arrows, riskK, riskK > 0 ? pulse(t, 0.8, 0, 0.4) : 0);
      diffWindow(g, band, spotOn, stepF);
      if (jumpK > 0 && stepF > 0) {
        const b = BOXES[stepF - 1].c;
        jumpLine(g, [b[0] + 19, b[1]], (band[0] + band[1]) / 2, jumpK);
      }

      const J = fig(g, bp, BOT, 0, {
        ink: AGENT,
        far: AGENT_FAR,
        bot: { col: AGENT, dark: AGENT_DARK, glow: spotOn > 0.5 ? 1 : 0, blink: pulse(t, 4.3, 1.2, 0.15) > 0.5, happy },
      });
      flagPole(g, J.w.handF, tip);
      fig(g, me, ME, 0, { sx: -1, wave: S.wave, wt: S.wt });
      text(g, 'agent', BOT, 16, 10, AGENT);
      text(g, 'you', ME, 16, 10, C.muted);

      bubble(g, BOT + 16, -146, 'careful here', saidRisk, { tail: -14, size: 8.5 });
      bubble(g, BOT + 12, -146, 'start here', botSaid, { tail: -10, size: 8.5 });
      bubble(g, ME - 14, -134, 'ah, got it', saidGot, { tail: 12, size: 8.5 });
      sparks(g, ME - 2, -122, seg(T, 7.45, 8.0), 20, 7, C.amber);
    },
  };
})();
