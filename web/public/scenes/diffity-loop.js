// diffity: prompt the agent in a terminal, it floods it with changes, open diffity, comment, send back, the agent fixes them
(function () {
  const SC = (window.SCENES = window.SCENES || {});
  const R = window.RIG;
  const { C, E, P, mix, legs, walkSeg, fig, inkFill, rr, ln, text, seg, breathe, sparks, pulse, lp, plane, bubble, tickBadge, words, lerp, arcPt, circle } = R;

  const ADD = '#dafbe1', ADD_INK = '#1a7f37', AGENT = '#d97757', AGENT_DARK = '#a8553a';
  const T_GREEN = '#8fd19e', T_TEXT = '#e5e5e5', T_DIM = '#8a8a8a', T_BUTTER = '#f5d77a';
  const B = { x: -90, y: -170, w: 180, h: 112 };
  const MID = B.y + B.h / 2;
  const ROWS = 7;
  const LY = (i) => B.y + 30 + i * 12;
  const PICKS = [2, 4, 6];
  const noteAt = (i) => [B.x + 8, LY(PICKS[i]) - 1];
  const ME = -236, BOT = 236;
  const LAP = [BOT - 46, -60], MYLAP = [ME + 46, -60];
  const PROMPT = 'add a login page';
  const CMD = 'diffity';

  const HOLDS = [[2.0, 1.2], [8.1, 1.2]];
  function warp(T) {
    let o = T;
    for (const [at, len] of HOLDS) {
      if (o <= at) {
        return { o, think: -1 };
      }
      if (o < at + len) {
        return { o: at, think: (o - at) / len };
      }
      o -= len;
    }
    return { o, think: -1 };
  }
  const thinkLine = (t) => ({ t: 'thinking' + '.'.repeat(1 + (Math.floor(t * 3) % 3)), col: T_DIM });

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

  function termLine(g, ln_, y) {
    const x = B.x + 10;
    if (ln_.bar) {
      text(g, ln_.mark, x, y + 3, 8, ln_.col, 'left');
      words(g, x + 10, y, ln_.w, ln_.seed, ln_.barCol, 2);
      return;
    }
    text(g, ln_.t, x, y + 3, 8.5, ln_.col, 'left');
  }

  function terminal(g, layers) {
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
    g.beginPath();
    g.rect(B.x + 2, B.y + 17, B.w - 4, B.h - 19);
    g.clip();
    for (const layer of layers) {
      if (layer.a <= 0) {
        continue;
      }
      g.save();
      g.globalAlpha *= layer.a;
      const shown = layer.lines.slice(-ROWS);
      shown.forEach((l, i) => termLine(g, l, B.y + 30 + i * 12.5));
      if (layer.cursor && shown.length) {
        const i = shown.length - 1;
        const last = shown[i];
        const w = last.t ? g.measureText(last.t).width : 0;
        rr(g, B.x + 11 + w, B.y + 30 + i * 12.5 - 4, 5, 9, 1);
        g.fillStyle = T_TEXT;
        g.fill();
      }
      g.restore();
    }
    g.restore();
  }

  function diffity(g, noteKs, ticks) {
    rr(g, B.x, B.y, B.w, B.h, 6);
    inkFill(g, C.paper, 1.7);
    ln(g, B.x, B.y + 17, B.x + B.w, B.y + 17, 1.3);
    text(g, 'diffity', B.x + 10, B.y + 12, 8.5, C.ink, 'left');
    text(g, '+1,284', B.x + B.w - 10, B.y + 12, 8.5, ADD_INK, 'right');
    for (let i = 0; i < ROWS; i++) {
      const y = LY(i);
      if (i === 0) {
        text(g, 'login.tsx', B.x + 10, y + 3, 7.5, C.muted, 'left');
        continue;
      }
      rr(g, B.x + 4, y - 5, B.w - 8, 10, 2);
      g.fillStyle = ADD;
      g.fill();
      text(g, '+', B.x + 26, y + 3, 9, ADD_INK);
      words(g, B.x + 36 + (i % 3) * 6, y, 80 + ((i * 29) % 50), i * 7, '#7cc48e', 2.2);
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
      g.rotate(i % 2 ? -0.1 : 0.12);
      g.scale(z, z);
      rr(g, -2, -8, 24, 16, 2);
      inkFill(g, C.butter, 1.3);
      ln(g, 3, -3, 17, -3, 1.5, '#b98a1a');
      ln(g, 3, 2, 12, 2, 1.5, '#b98a1a');
      g.restore();
    }
  }

  function idleLines(t) {
    return [
      { t: '$ claude', col: T_DIM },
      { t: '> ', col: T_TEXT },
    ];
  }

  function streamLine(i) {
    if (i % 5 === 0) {
      return { bar: true, mark: '›', col: T_DIM, barCol: '#6b6b6b', w: 60 + ((i * 17) % 40), seed: i * 3 };
    }
    return { bar: true, mark: '+', col: T_GREEN, barCol: '#5e9e6e', w: 70 + ((i * 31) % 70), seed: i * 7 };
  }

  function firstPass(T, think, t) {
    const lines = [{ t: '$ claude', col: T_DIM }];
    let cursor = true;
    lines.push({ t: '> ' + typed(PROMPT, seg(T, 0.6, 1.45)), col: T_TEXT });
    if (think >= 0) {
      lines.push(thinkLine(t));
    }
    if (T < 2.0 || think >= 0) {
      return { lines, cursor: T < 1.55 };
    }
    const n = Math.floor(seg(T, 2.0, 3.7) * 30);
    for (let i = 0; i < n; i++) {
      lines.push(streamLine(i));
    }
    if (T >= 3.7) {
      lines.push({ t: '23 files, +1,284', col: T_GREEN });
      lines.push({ t: '$ ' + typed(CMD, seg(T, 3.95, 4.4)), col: T_TEXT });
    }
    cursor = T >= 3.7 && T < 4.5;
    return { lines, cursor };
  }

  function secondPass(T, think, t) {
    const lines = [
      { t: '23 files, +1,284', col: T_GREEN },
      { t: '$ diffity', col: T_TEXT },
      { t: '3 comments from diffity', col: T_BUTTER },
    ];
    if (think >= 0) {
      lines.push(thinkLine(t));
    }
    const fixes = ['login.tsx:12', 'login.tsx:31', 'auth.ts:8'];
    for (let i = 0; i < 3; i++) {
      if (T >= 8.35 + i * 0.3) {
        lines.push({ t: '✓ fixed ' + fixes[i], col: T_GREEN });
      }
    }
    return { lines, cursor: false };
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

  function plant(g, x, t) {
    const sway = Math.sin(t * 1.3) * 0.06;
    const leaves = [[-0.5, 15], [0.05, 19], [0.6, 14]];
    for (const [a, len] of leaves) {
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

  function botStyle(glow, blink) {
    return { col: AGENT, dark: AGENT_DARK, glow, blink };
  }

  function strip(g, from, to, k, h) {
    if (k <= 0 || k >= 1) {
      return;
    }
    const p = arcPt(from, to, h, E.soft(k));
    rr(g, p[0] - 14, p[1] - 4, 28, 8, 2);
    inkFill(g, ADD, 1.2, ADD_INK);
  }

  function flyNote(g, to, k) {
    if (k <= 0 || k >= 1) {
      return;
    }
    const p = arcPt([MYLAP[0] + 4, MYLAP[1] - 18], to, 46, E.soft(k));
    g.save();
    g.translate(p[0], p[1]);
    g.rotate(0.12 + k * 0.6);
    rr(g, -9, -6, 18, 12, 2);
    inkFill(g, C.butter, 1.2);
    g.restore();
  }

  function typePose(t, on) {
    const bob = on ? Math.sin(t * 24) * 2.2 : 0;
    return P({ hF: [24, -58 + bob], hB: [20, -56 - bob], head: [5, -116] });
  }

  SC['diffity-loop'] = {
    dur: 13.4,
    steps: [0, 2.0, 5.7, 8.3],
    width: 520,
    label: 'A person prompts an AI agent in a terminal, the agent floods it with changes, the person opens Diffity, leaves comments on three lines and sends them back, Diffity folds into the terminal and the agent fixes each one.',
    draw(g, S) {
      const real = S.on ? S.u * this.dur : -1;
      const wp = warp(real);
      const T = S.on ? wp.o : -1;
      const think = S.on ? wp.think : -1;
      const t = S.t;
      let myTyping = pulse(t, 6.5, 4, 1.4) * 0.6;
      let typing = pulse(t, 7, 1, 1.6) * 0.6, fade = 1, askK = 0, sendK = 0, saidK = 0;
      let noteKs = [0, 0, 0], flyKs = [0, 0, 0], fixKs = [0, 0, 0];
      let termSy = 1, diffSy = 0, pass = 0;
      const agentLook = pulse(t, 6, 3.2, 1.4);
      const chin = P({ hF: [10, -96], head: [7, -116], hB: [-4, -54] });
      let pose;
      if (T < 0) {
        pose = mix(breathe(typePose(t, myTyping > 0.3), t), chin, pulse(t, 6.5, 1.2, 2));
      } else {
        fade = 1 - seg(real, this.dur - 0.5, this.dur);
        const notes = [5.4, 5.9, 6.4];
        myTyping = Math.max(
          E.soft(seg(T, 0.1, 0.3)) * (1 - E.soft(seg(T, 1.4, 1.55))),
          E.soft(seg(T, 3.75, 3.9)) * (1 - E.soft(seg(T, 4.4, 4.55))),
          E.soft(seg(T, 5.25, 5.4)) * (1 - E.soft(seg(T, 6.8, 6.95))),
        );
        pose = breathe(typePose(t, myTyping > 0.3), t);
        const whoa = E.soft(seg(T, 2.3, 2.6)) * (1 - E.soft(seg(T, 3.3, 3.55)));
        const look = E.soft(seg(T, 1.6, 1.9)) * (1 - E.soft(seg(T, 2.3, 2.45)));
        const flick = E.soft(seg(T, 6.95, 7.1)) * (1 - E.soft(seg(T, 7.25, 7.5)));
        const wait = E.soft(seg(T, 7.5, 7.8)) * (1 - E.soft(seg(T, 9.15, 9.3)));
        const cheer = E.back(seg(T, 9.3, 9.7)) * (1 - E.soft(seg(T, 9.9, 10.2)));
        pose = mix(pose, P({ hF: [12, -60], hB: [-4, -52], head: [9, -117] }), look);
        pose = mix(pose, P({ hF: [30, -116], hB: [-16, -114], head: [0, -118], chest: [-3, -89] }), whoa);
        pose = mix(pose, P({ hF: [40, -100], hB: [-4, -54], head: [10, -116] }), flick);
        pose = mix(pose, chin, wait);
        pose = mix(pose, P({ hF: [14, -132], hB: [-10, -130], head: [3, -118] }), cheer);
        for (let i = 0; i < 3; i++) {
          flyKs[i] = seg(T, notes[i], notes[i] + 0.4);
          noteKs[i] = seg(T, notes[i] + 0.35, notes[i] + 0.55);
        }

        askK = seg(T, 1.45, 2.0);
        sendK = seg(T, 7.45, 8.1);
        typing = Math.max(
          typing,
          E.soft(seg(T, 2.0, 2.15)) * (1 - E.soft(seg(T, 3.6, 3.75))),
          E.soft(seg(T, 8.1, 8.25)) * (1 - E.soft(seg(T, 9.0, 9.15))),
        );
        termSy = T < 6 ? 1 - E.in(seg(T, 4.6, 4.85)) : E.back(seg(T, 7.35, 7.7));
        diffSy = T < 6 ? E.back(seg(T, 4.85, 5.2)) : 1 - E.in(seg(T, 7.1, 7.35));
        pass = T < 6 ? 1 : 2;
        for (let i = 0; i < 3; i++) {
          const a = 8.1 + i * 0.3;
          fixKs[i] = seg(T, a, a + 0.3);
        }
        saidK = seg(T, 9.1, 9.3) * (1 - seg(T, 10.0, 10.2));
      }

      const host = g.canvas && g.canvas.parentElement;
      if (host) {
        const step = T < 0 ? '0' : T < 2.0 ? '1' : T < 4.5 ? '2' : T < 7.1 ? '3' : '4';
        if (host.dataset.step !== step) {
          host.dataset.step = step;
        }
      }

      plant(g, -128, t);
      stand(g);
      folded(g, termSy, () => {
        if (pass === 0) {
          terminal(g, [{ lines: idleLines(t), cursor: Math.floor(t * 2) % 2 === 0, a: 1 }]);
          return;
        }
        const st = pass === 1 ? firstPass(T, think, t) : secondPass(T, think, t);
        terminal(g, [
          { lines: idleLines(t), cursor: false, a: 1 - fade },
          { lines: st.lines, cursor: st.cursor && Math.floor(t * 3) % 2 === 0, a: fade },
        ]);
      });
      folded(g, diffSy, () => diffity(g, noteKs, [0, 0, 0]));
      const foldFlash = Math.max(seg(T, 4.75, 5.0) * (1 - seg(T, 5.0, 5.2)), seg(T, 7.25, 7.4) * (1 - seg(T, 7.4, 7.6)));
      if (foldFlash > 0) {
        g.save();
        g.globalAlpha *= foldFlash;
        ln(g, B.x - 6, MID, B.x + B.w + 6, MID, 2.4, C.butterHi);
        g.restore();
      }
      sparks(g, B.x + B.w / 2, B.y - 4, seg(T, 5.0, 5.5), 16, 7, C.amber);

      desk(g, ME, -1, myTyping, t + 0.4, C.muted);
      desk(g, BOT, 1, typing, t, AGENT);
      const working = typing > 0.3;
      let ap = mix(
        breathe(typePose(t, working), t + 1),
        P({ hF: [24, -58], hB: [20, -56], head: [-2, -117] }),
        agentLook,
      );
      const thinkK = think >= 0 ? E.soft(seg(think, 0, 0.2)) * (1 - E.soft(seg(think, 0.8, 1))) : 0;
      ap = mix(ap, P({ hF: [10, -96], hB: [20, -56], head: [6, -118] }), thinkK);
      const glow = working ? Math.floor(t * 6) % 2 : think >= 0 ? Math.floor(t * 2.5) % 2 : 0;
      const blink = pulse(t, 4.3, 1.2, 0.15) > 0.5;
      fig(g, ap, BOT, 0, { sx: -1, ink: AGENT, far: '#e8b7a3', bot: botStyle(glow, blink) });
      fig(g, pose, ME, 0, { wave: S.wave, wt: S.wt });
      text(g, 'you', ME, 18, 10, C.muted);
      text(g, 'agent', BOT, 18, 10, AGENT);

      plane(g, [B.x + B.w - 6, B.y + 20], [LAP[0], LAP[1] - 22], askK, 50, 0.9);
      plane(g, [B.x + B.w - 6, B.y + 20], [LAP[0], LAP[1] - 22], sendK, 50, 0.9);
      for (let i = 0; i < 3; i++) {
        flyNote(g, noteAt(i), flyKs[i]);
      }
      if (T >= 0) {
        for (let i = 0; i < 9; i++) {
          const a = 2.05 + i * 0.17;
          strip(g, [LAP[0] - 6, LAP[1] - 16], [B.x + B.w / 2 + ((i * 23) % 40) - 20, B.y + 70], seg(T, a, a + 0.5), 40);
        }
        for (let i = 0; i < 3; i++) {
          strip(g, [LAP[0] - 6, LAP[1] - 16], [B.x + 80, B.y + 70 + i * 12], fixKs[i], 34);
        }
        for (let i = 0; i < 3; i++) {
          tickBadge(g, B.x + B.w - 14, B.y + 30 + (3 + i) * 12.5, seg(T, 8.4 + i * 0.3, 8.7 + i * 0.3) * fade, 5.5, ADD, ADD_INK);
        }
      }
      if (think >= 0) {
        const first = T < 5;
        const hmm = seg(think, 0.05, 0.15) * (1 - seg(think, 0.55, 0.62));
        const ok = seg(think, 0.62, 0.72) * (1 - seg(think, 0.92, 1));
        bubble(g, BOT - 22, -132, 'hmm…', hmm, { tail: 14, size: 8.5 });
        bubble(g, BOT - 22, -132, first ? 'on it!' : 'got it', ok, { tail: 14, size: 8.5 });
      }
      bubble(g, BOT - 22, -132, 'fixed all 3', saidK, { tail: 14, size: 8.5 });
      sparks(g, ME + 2, -128, seg(T, 9.35, 9.95), 22, 8, C.amber);
      bubble(g, ME + 34, -146, 'nice!', seg(T, 9.65, 9.8) * (1 - seg(T, 10.2, 10.4)), { tail: -18, size: 8.5 });
    },
  };
})();
