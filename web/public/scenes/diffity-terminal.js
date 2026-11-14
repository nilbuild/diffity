// diffity: run `diffity` in any terminal, or let your agent run it when it's done; the terminal flips into the review
(function () {
  const SC = (window.SCENES = window.SCENES || {});
  const R = window.RIG;
  const { C, E, P, mix, fig, inkFill, rr, ln, text, seg, breathe, sparks, pulse, bubble, words, arcPt, circle } = R;

  const ADD = '#dafbe1', ADD_INK = '#1a7f37', DEL = '#ffebe9', DEL_INK = '#cf222e';
  const AGENT = '#d97757', AGENT_DARK = '#a8553a';
  const T_GREEN = '#8fd19e', T_TEXT = '#e5e5e5', T_DIM = '#8a8a8a';
  const B = { x: -90, y: -168, w: 180, h: 110 };
  const MID = B.y + B.h / 2;
  const ME = -226, BOT = 226;
  const LAP = [BOT - 46, -60], MYLAP = [ME + 46, -60];

  const typed = (s, k) => s.slice(0, Math.floor(s.length * Math.min(1, Math.max(0, k))));

  function stand(g) {
    ln(g, B.x + 22, B.y + B.h, B.x + 10, 0, 2.2);
    ln(g, B.x + B.w - 22, B.y + B.h, B.x + B.w - 10, 0, 2.2);
    ln(g, B.x + 40, B.y + B.h + 30, B.x + B.w - 40, B.y + B.h + 30, 1.4, '#bdbdbd');
  }

  function folded(g, sy, fn) {
    if (sy <= 0.001) {
      return;
    }
    g.save();
    g.translate(0, MID);
    g.scale(1, sy);
    g.translate(0, -MID);
    fn(g);
    g.restore();
  }

  function terminal(g, lines, cursor, a) {
    rr(g, B.x, B.y, B.w, B.h, 6);
    inkFill(g, '#232323', 1.7, C.ink);
    ln(g, B.x, B.y + 15, B.x + B.w, B.y + 15, 1, '#4a4a4a');
    for (let i = 0; i < 3; i++) {
      circle(g, B.x + 9 + i * 7, B.y + 7.5, 2);
      g.fillStyle = ['#e58f8f', C.butterHi, '#8fd19e'][i];
      g.fill();
    }
    text(g, 'terminal', B.x + B.w / 2, B.y + 11, 8, '#a3a3a3');
    g.save();
    g.globalAlpha *= a;
    const shown = lines.slice(-7);
    shown.forEach((l, i) => {
      const y = B.y + 30 + i * 12.5;
      if (l.bar) {
        text(g, '+', B.x + 10, y + 3, 8, T_GREEN, 'left');
        words(g, B.x + 20, y, l.w, l.seed, '#5e9e6e', 2);
        return;
      }
      text(g, l.t, B.x + 10, y + 3, 8.5, l.col, 'left');
    });
    if (cursor && shown.length) {
      const i = shown.length - 1;
      const w = g.measureText(shown[i].t || '').width;
      rr(g, B.x + 11 + w, B.y + 30 + i * 12.5 - 4, 5, 9, 1);
      g.fillStyle = T_TEXT;
      g.fill();
    }
    g.restore();
  }

  function diffity(g) {
    rr(g, B.x, B.y, B.w, B.h, 6);
    inkFill(g, C.paper, 1.7);
    ln(g, B.x, B.y + 17, B.x + B.w, B.y + 17, 1.3);
    text(g, 'diffity', B.x + 10, B.y + 12, 8.5, C.ink, 'left');
    text(g, '+48 −12', B.x + B.w - 10, B.y + 12, 8.5, C.muted, 'right');
    const kinds = 'f-++c++';
    for (let i = 0; i < 7; i++) {
      const y = B.y + 30 + i * 12;
      const k = kinds[i];
      if (k === 'f') {
        text(g, 'cart.ts', B.x + 10, y + 3, 7.5, C.muted, 'left');
        continue;
      }
      if (k === 'c') {
        words(g, B.x + 36, y, 90, i * 5, '#cfcfcf', 2);
        continue;
      }
      rr(g, B.x + 4, y - 5, B.w - 8, 10, 2);
      g.fillStyle = k === '+' ? ADD : DEL;
      g.fill();
      text(g, k === '+' ? '+' : '−', B.x + 26, y + 3, 9, k === '+' ? ADD_INK : DEL_INK);
      words(g, B.x + 36 + (i % 3) * 6, y, 80 + ((i * 29) % 50), i * 7, k === '+' ? '#7cc48e' : '#e7a3a3', 2.2);
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

  function botStyle(glow, blink) {
    return { col: AGENT, dark: AGENT_DARK, glow, blink };
  }

  function bell(g, x, y, k, t, a) {
    if (k <= 0 || a <= 0) {
      return;
    }
    g.save();
    g.globalAlpha *= a;
    const z = E.back(Math.min(1, k * 3));
    const swing = Math.sin(t * 22) * 0.35 * (1 - k);
    g.save();
    g.translate(x, y);
    g.scale(z, z);
    g.rotate(swing);
    g.beginPath();
    g.moveTo(-7, 4);
    g.quadraticCurveTo(-6, -8, 0, -8);
    g.quadraticCurveTo(6, -8, 7, 4);
    g.closePath();
    inkFill(g, C.butter, 1.4);
    circle(g, 0, 6, 1.8);
    inkFill(g, C.ink, 1);
    g.restore();
    if (k < 0.7) {
      g.save();
      g.globalAlpha *= 1 - k / 0.7;
      for (const s of [-1, 1]) {
        ln(g, x + s * 11, y - 6, x + s * 15, y - 9, 1.4, C.amber);
        ln(g, x + s * 12, y, x + s * 17, y, 1.4, C.amber);
      }
      g.restore();
    }
    g.restore();
  }

  function signal(g, from, to, k) {
    if (k <= 0) {
      return;
    }
    for (let i = 0; i < 3; i++) {
      const u = ((k * 3 + i / 3) % 1);
      const p = arcPt(from, to, 40, u);
      g.save();
      g.globalAlpha *= Math.sin(Math.PI * u) * Math.min(1, k * 4);
      circle(g, p[0], p[1], 2.2);
      g.fillStyle = C.butterHi;
      g.fill();
      g.restore();
    }
  }

  const typePose = (t, on) => {
    const bob = on ? Math.sin(t * 24) * 2.2 : 0;
    return P({ hF: [24, -58 + bob], hB: [20, -56 - bob], head: [5, -116] });
  };

  SC['diffity-terminal'] = {
    dur: 7.4,
    width: 500,
    label: 'Either you or your agent types diffity into the terminal, and the terminal flips into Diffity showing the changes, ready to review.',
    draw(g, S) {
      const T = S.on ? S.u * this.dur : -1;
      const t = S.t;
      const botTypes = S.n % 2 === 0;
      let myType = pulse(t, 6.5, 4, 1.4) * 0.6, botType = pulse(t, 7, 1, 1.6) * 0.6;
      let fade = 1, termSy = 1, diffSy = 0, bellK = 0, bellA = 1, sigK = 0, saidK = 0, mySaidK = 0, thumb = 0;
      let lines = [{ t: '$ ', col: T_TEXT }], cursor = Math.floor(t * 2) % 2 === 0, lineA = 1;
      let pose, botLook = pulse(t, 6, 3.2, 1.4);
      const chin = P({ hF: [10, -96], head: [7, -116], hB: [-4, -54] });
      if (T < 0) {
        pose = mix(breathe(typePose(t, myType > 0.3), t), chin, pulse(t, 6.5, 1.2, 2));
      } else {
        fade = 1 - seg(T, this.dur - 0.5, this.dur);
        const ent = botTypes ? 1.9 : 1.3;
        const ty0 = botTypes ? 1.0 : 0.35;
        if (botTypes) {
          const n = Math.floor(seg(T, 0.05, 0.8) * 5);
          lines = [];
          for (let i = 0; i < n; i++) {
            lines.push({ bar: true, w: 70 + ((i * 31) % 60), seed: i * 7 });
          }
          if (T >= 0.85) {
            lines.push({ t: '✓ done, 4 files', col: T_GREEN });
          }
          lines.push({ t: '$ ' + typed('diffity', seg(T, ty0 + 0.1, ent - 0.1)), col: T_TEXT });
          botType = Math.max(botType, E.soft(seg(T, 0, 0.15)) * (1 - E.soft(seg(T, ent, ent + 0.15))));
        } else {
          lines = [{ t: '$ ' + typed('diffity', seg(T, ty0 + 0.1, ent - 0.1)), col: T_TEXT }];
          myType = Math.max(myType, E.soft(seg(T, ty0 - 0.1, ty0)) * (1 - E.soft(seg(T, ent, ent + 0.15))));
        }
        cursor = T < ent && Math.floor(t * 3) % 2 === 0;
        sigK = seg(T, ty0, ent);
        termSy = 1 - E.in(seg(T, ent + 0.1, ent + 0.35));
        diffSy = E.back(seg(T, ent + 0.35, ent + 0.7));
        const back = seg(T, this.dur - 1.3, this.dur - 1.05);
        if (back > 0) {
          diffSy = 1 - E.in(back);
          termSy = E.back(seg(T, this.dur - 1.05, this.dur - 0.7));
          lineA = 0;
        }
        pose = breathe(typePose(t, myType > 0.3), t);
        const look = E.soft(seg(T, ent + 0.2, ent + 0.5)) * (1 - E.soft(seg(T, ent + 1.4, ent + 1.6)));
        pose = mix(pose, P({ hF: [12, -62], hB: [-4, -52], head: [9, -118] }), look);
        thumb = E.back(seg(T, ent + 1.5, ent + 1.75)) * (1 - E.soft(seg(T, ent + 2.7, ent + 3.0)));
        pose = mix(pose, P({ hF: [28, -100], hB: [-4, -54], head: [6, -117] }), thumb);
        if (botTypes) {
          bellK = seg(T, ent + 0.7, ent + 1.6);
          bellA = 1 - seg(T, ent + 2.2, ent + 2.5);
          saidK = seg(T, ent + 0.75, ent + 0.9) * (1 - seg(T, ent + 2.2, ent + 2.4));
          mySaidK = seg(T, ent + 1.6, ent + 1.75) * (1 - seg(T, ent + 2.7, ent + 2.9));
        } else {
          mySaidK = seg(T, ent + 0.7, ent + 0.85) * (1 - seg(T, ent + 1.9, ent + 2.1));
          botLook = Math.max(botLook, E.soft(seg(T, ent + 0.5, ent + 0.8)) * (1 - E.soft(seg(T, ent + 2.4, ent + 2.7))));
        }
      }

      stand(g);
      folded(g, termSy, () => {
        if (fade < 1 || lineA < 1) {
          terminal(g, [{ t: '$ ', col: T_TEXT }], false, 1);
          return;
        }
        terminal(g, lines, cursor, 1);
      });
      folded(g, diffSy, () => diffity(g));
      sparks(g, B.x + B.w / 2, B.y - 4, seg(T, (botTypes ? 1.9 : 1.3) + 0.4, (botTypes ? 1.9 : 1.3) + 0.9), 16, 7, C.amber);
      bell(g, B.x + B.w - 6, B.y - 6, bellK, t, bellA);

      desk(g, ME, -1, myType, t + 0.4, C.muted);
      desk(g, BOT, 1, botType, t, AGENT);
      const working = botType > 0.3;
      const ap = mix(breathe(typePose(t, working), t + 1), P({ hF: [24, -58], hB: [20, -56], head: [-2, -117] }), botLook);
      const glow = working ? Math.floor(t * 6) % 2 : 0;
      const blink = pulse(t, 4.3, 1.2, 0.15) > 0.5;
      fig(g, ap, BOT, 0, { sx: -1, ink: AGENT, far: '#e8b7a3', bot: botStyle(glow, blink) });
      fig(g, pose, ME, 0, {
        wave: S.wave,
        wt: S.wt,
        front: (gg, J) => {
          if (thumb > 0.3) {
            ln(gg, J.handF[0], J.handF[1] - 1, J.handF[0] - 1, J.handF[1] - 8, 3.4, C.ink);
          }
        },
      });
      text(g, 'you', ME, 18, 10, C.muted);
      text(g, 'agent', BOT, 18, 10, AGENT);

      if (botTypes) {
        signal(g, [LAP[0] - 6, LAP[1] - 18], [B.x + B.w - 10, B.y + 60], sigK < 1 ? sigK : 0);
      } else {
        signal(g, [MYLAP[0] + 6, MYLAP[1] - 18], [B.x + 10, B.y + 60], sigK < 1 ? sigK : 0);
      }
      bubble(g, BOT - 22, -132, 'your turn!', saidK, { tail: 14, size: 8.5 });
      bubble(g, ME + 26, -136, botTypes ? 'on it' : "let's see", mySaidK, { tail: -16, size: 8.5 });
    },
  };
})();
