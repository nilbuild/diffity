// diffity: ⌘N starts another agent in its own worktree; review a task round by round, then merge it into main
(function () {
  const SC = (window.SCENES = window.SCENES || {});
  const R = window.RIG;
  const { C, E, P, mix, fig, inkFill, rr, ln, text, seg, breathe, sparks, pulse, bubble, pill, lerp, plane, tickBadge, words, circle, arcPt } = R;

  const ADD = '#dafbe1', ADD_INK = '#1a7f37', DEL = '#ffebe9', DEL_INK = '#cf222e';
  const AGENT = '#d97757', AGENT_DARK = '#a8553a', AGENT_FAR = '#e8b7a3';
  const BOOTHS = [
    { cx: -40, name: 'login', idle: 0.55 },
    { cx: 62, name: 'search', idle: 0.25 },
    { cx: 164, name: 'docs', idle: 0 },
  ];
  const MAIN_Y = -178;
  const ME = -228;
  const KEY = { x: -196, y: -84 };
  const CARD = { x: -206, y: -176, w: 100, h: 48 };

  function mainLine(g, mergeK) {
    ln(g, -96, MAIN_Y, 214, MAIN_Y, 2.4, '#bdbdbd');
    text(g, 'main', 218, MAIN_Y + 3, 8, C.muted, 'left');
    for (let i = 0; i < BOOTHS.length; i++) {
      const b = BOOTHS[i];
      const merged = i === 0 ? mergeK : 0;
      g.save();
      g.setLineDash(merged > 0 ? [] : [3, 3]);
      ln(g, b.cx, MAIN_Y, b.cx, -153, 1.6, merged > 0 ? ADD_INK : '#bdbdbd');
      g.restore();
      circle(g, b.cx, MAIN_Y, 2.6);
      inkFill(g, merged > 0 ? ADD_INK : C.paper, 1.2, merged > 0 ? ADD_INK : '#9a9a9a');
    }
  }

  function booth(g, b, fillK, bar, label, done, t) {
    const x0 = b.cx - 46;
    g.save();
    if (fillK < 1) {
      g.save();
      g.globalAlpha *= 1 - fillK;
      g.setLineDash([4, 4]);
      rr(g, x0, -158, 92, 158, 6);
      inkFill(g, null, 1.2, '#c4c4c4');
      g.restore();
      text(g, '⌘N', b.cx, -76, 10, '#c4c4c4');
      g.restore();
      g.save();
      g.globalAlpha *= fillK;
    }
    rr(g, x0, -158, 92, 158, 6);
    inkFill(g, '#fafafa', 1.2, '#dcdcdc');
    pill(g, b.cx, -147, label, done ? ADD : C.paper, done ? ADD_INK : C.ink, 8);
    rr(g, b.cx - 32, -133, 64, 6, 3);
    inkFill(g, C.paper, 1);
    if (bar > 0.02) {
      rr(g, b.cx - 32, -133, 64 * Math.min(1, bar), 6, 3);
      g.fillStyle = bar >= 1 ? ADD_INK : '#7cc48e';
      g.fill();
    }
    const bx = b.cx + 28;
    ln(g, bx - 46, -46, bx - 48, 0, 2);
    ln(g, bx - 6, -46, bx - 4, 0, 2);
    rr(g, bx - 52, -50, 56, 5, 2);
    inkFill(g, C.wood, 1.4);
    rr(g, bx - 42, -55, 22, 5, 1.5);
    inkFill(g, '#e9e9e9', 1.2);
    g.save();
    g.translate(bx - 41, -55);
    g.rotate(-1.28);
    rr(g, 0, -3.5, 26, 3.5, 1.5);
    inkFill(g, '#2b2b2b', 1.2);
    g.restore();
    g.restore();
  }

  function glyphs(g, cx, k, t) {
    if (k <= 0) {
      return;
    }
    for (let i = 0; i < 3; i++) {
      const p = (t * 2.6 + i / 3) % 1;
      g.save();
      g.globalAlpha *= k * (1 - p);
      text(g, ['{', '}', ';'][i], cx - 6 + i * 7, -64 - p * 18, 8, AGENT);
      g.restore();
    }
  }

  function key(g, press) {
    ln(g, KEY.x, KEY.y + 10, KEY.x, 0, 2.2);
    ln(g, KEY.x - 9, 0, KEY.x + 9, 0, 2.2);
    rr(g, KEY.x - 16, KEY.y + 4, 32, 8, 2);
    inkFill(g, '#d4d4d4', 1.4);
    rr(g, KEY.x - 14, KEY.y - 8 + press * 4, 28, 13, 3);
    inkFill(g, C.paper, 1.5);
    text(g, '⌘N', KEY.x, KEY.y + 2 + press * 4, 8.5, C.ink);
  }

  function card(g, k, round, noteK) {
    if (k <= 0) {
      return;
    }
    const cx = CARD.x + CARD.w / 2, cy = CARD.y + CARD.h / 2;
    g.save();
    g.translate(cx, cy);
    g.scale(1, E.back(Math.min(1, k)));
    g.translate(-cx, -cy);
    rr(g, CARD.x, CARD.y, CARD.w, CARD.h, 5);
    inkFill(g, C.paper, 1.5);
    ln(g, CARD.x, CARD.y + 13, CARD.x + CARD.w, CARD.y + 13, 1.1);
    text(g, 'login', CARD.x + 7, CARD.y + 9.5, 7.5, C.ink, 'left');
    text(g, 'round ' + round, CARD.x + CARD.w - 7, CARD.y + 9.5, 7.5, C.muted, 'right');
    for (let i = 0; i < 3; i++) {
      const y = CARD.y + 20 + i * 9;
      const bad = round === 1 && i === 1;
      rr(g, CARD.x + 4, y - 3.5, CARD.w - 8, 7, 1.5);
      g.fillStyle = bad ? DEL : ADD;
      g.fill();
      words(g, CARD.x + 14, y, 50 + i * 10, i * 5 + round, bad ? '#e7a3a3' : '#7cc48e', 1.8);
    }
    if (noteK > 0) {
      const z = E.back(noteK);
      g.save();
      g.translate(CARD.x + CARD.w - 22, CARD.y + 29);
      g.rotate(0.12);
      g.scale(z, z);
      rr(g, -9, -6, 18, 12, 2);
      inkFill(g, C.butter, 1.2);
      ln(g, -5, -2, 5, -2, 1.3, '#b98a1a');
      ln(g, -5, 2, 2, 2, 1.3, '#b98a1a');
      g.restore();
    }
    g.restore();
  }

  function typePose(t, on) {
    const bob = on ? Math.sin(t * 24) * 2 : 0;
    return P({ hF: [24, -58 + bob], hB: [20, -56 - bob], head: [5, -116] });
  }

  SC['diffity-tasks'] = {
    dur: 10,
    width: 500,
    label: 'A person presses Command N and a third agent starts on its own branch beside two others; one task finishes, the person reviews it in two rounds, and it merges into main.',
    draw(g, S) {
      const T = S.on ? S.u * this.dur : -1;
      const t = S.t;
      let pose = breathe(P({ hF: [12, -60], hB: [-4, -52], head: [6, -117] }), t);
      let fade = 1, press = 0, fill3 = 0, drop = 0, think3 = 0, bar1 = BOOTHS[0].idle, bar2 = BOOTHS[1].idle, bar3 = 0;
      let done1 = 0, cardK = 0, round = 1, noteK = 0, flyNote = 0, sendK = 0, think1 = 0, mergeK = 0, dotK = 0, label1 = 'login';
      if (T < 0) {
        pose = mix(pose, P({ hF: [10, -96], head: [7, -116], hB: [-4, -54] }), pulse(t, 5.5, 2, 2.2));
      } else {
        fade = 1 - seg(T, this.dur - 0.5, this.dur);
        press = Math.sin(Math.PI * seg(T, 0.25, 0.5));
        fill3 = E.soft(seg(T, 0.4, 0.8)) * fade;
        drop = 1 - E.out3(seg(T, 0.5, 0.95));
        think3 = seg(T, 1.0, 1.1) * (1 - seg(T, 1.9, 2.0));
        bar3 = seg(T, 2.0, 9.5) * 0.45 * fade;
        bar1 = T < 4.8 ? lerp(BOOTHS[0].idle, 1, E.soft(seg(T, 0.2, 2.4))) : seg(T, 5.6, 6.6);
        bar1 = lerp(BOOTHS[0].idle, bar1, fade);
        bar2 = lerp(BOOTHS[1].idle, BOOTHS[1].idle + 0.45 * seg(T, 0, 9.5), fade);
        done1 = (T >= 2.4 && T < 4.8) || (T >= 6.6) ? 1 : 0;
        round = T < 6 ? 1 : 2;
        cardK = Math.max(seg(T, 2.7, 3.0) * (1 - seg(T, 4.1, 4.3)), seg(T, 6.8, 7.1) * (1 - seg(T, 8.4, 8.7)));
        flyNote = seg(T, 3.3, 3.7);
        noteK = seg(T, 3.65, 3.85) * (T < 6 ? 1 : 0);
        sendK = seg(T, 4.2, 4.8);
        think1 = seg(T, 4.8, 4.9) * (1 - seg(T, 5.5, 5.6));
        dotK = seg(T, 7.4, 7.9);
        mergeK = seg(T, 7.9, 8.0) * fade;
        label1 = mergeK > 0.5 ? 'merged' : T >= 4.8 && T < 7.9 ? 'round 2' : 'login';
        const reach = E.soft(seg(T, 0.0, 0.25)) * (1 - E.soft(seg(T, 0.55, 0.8)));
        const flick = E.soft(seg(T, 3.12, 3.3)) * (1 - E.soft(seg(T, 3.5, 3.75)));
        const chin = E.soft(seg(T, 2.9, 3.1)) * (1 - seg(T, 3.3, 3.4));
        const send = E.soft(seg(T, 4.05, 4.2)) * (1 - E.soft(seg(T, 4.4, 4.6)));
        const cheer = E.back(seg(T, 7.15, 7.55)) * (1 - E.soft(seg(T, 8.2, 8.5)));
        pose = mix(pose, P({ hF: R.lp([KEY.x - 2, KEY.y - 10 + press * 4], ME, 0, 1), hB: [-4, -54], head: [9, -114], chest: [3, -90] }), reach);
        pose = mix(pose, P({ hF: [10, -96], head: [8, -118], hB: [-4, -54] }), chin);
        pose = mix(pose, P({ hF: [34, -112], hB: [-4, -54], head: [10, -118] }), Math.max(flick, send));
        pose = mix(pose, P({ hF: [14, -132], hB: [-10, -130], head: [3, -118] }), cheer);
      }

      mainLine(g, mergeK);
      const states = [
        { fill: 1, bar: bar1, label: label1, done: done1 || mergeK > 0.5 },
        { fill: 1, bar: bar2, label: 'search', done: 0 },
        { fill: fill3, bar: bar3, label: 'docs', done: 0 },
      ];
      for (let i = 0; i < 3; i++) {
        booth(g, BOOTHS[i], states[i].fill, states[i].bar, states[i].label, states[i].done, t);
      }
      key(g, press);

      for (let i = 0; i < 3; i++) {
        const b = BOOTHS[i];
        const bx = b.cx + 28;
        let working = i === 1 || (i === 0 && !done1 && think1 <= 0 && mergeK < 0.5) || (i === 2 && T >= 2.0 && fade > 0.5);
        if (i === 0 && T < 0) {
          working = true;
        }
        if (i === 2 && fill3 <= 0.01) {
          continue;
        }
        let bp = breathe(typePose(t + i, working), t + i * 1.7);
        const thinking = T < 0 ? 0 : i === 2 ? E.soft(seg(T, 0.95, 1.25)) * (1 - E.soft(seg(T, 1.75, 2.05))) : i === 0 ? E.soft(seg(T, 4.75, 5.05)) * (1 - E.soft(seg(T, 5.35, 5.65))) : 0;
        bp = mix(bp, P({ hF: [10, -96], hB: [20, -56], head: [6, -118] }), thinking);
        if (i === 0 && T >= 0) {
          const yay = E.back(seg(T, 2.4, 2.8)) * (1 - E.soft(seg(T, 3.2, 3.5))) + E.back(seg(T, 7.9, 8.3)) * (1 - E.soft(seg(T, 8.8, 9.1)));
          bp = mix(bp, P({ hF: [12, -127], hB: [-10, -128], head: [3, -118] }), Math.min(1, yay));
        }
        glyphs(g, bx - 30, working ? 1 : 0, t + i * 0.3);
        const lift = i === 2 ? drop * 60 : 0;
        fig(g, bp, bx, -lift, {
          sx: -1,
          ink: AGENT,
          far: AGENT_FAR,
          floor: 0,
          alpha: i === 2 ? fill3 : 1,
          bot: { col: AGENT, dark: AGENT_DARK, glow: working ? Math.floor(t * 6 + i) % 2 : thinking > 0 ? Math.floor(t * 2.5) % 2 : 0, blink: pulse(t, 4.3, 1.2 + i, 0.15) > 0.5, happy: i === 0 && done1 > 0 },
        });
      }

      const J = fig(g, pose, ME, 0, { wave: S.wave, wt: S.wt });
      text(g, 'you', ME, 16, 10, C.muted);
      card(g, cardK, round, noteK);
      if (flyNote > 0 && flyNote < 1) {
        const p = arcPt(J.w.handF, [CARD.x + CARD.w - 22, CARD.y + 29], 24, E.soft(flyNote));
        rr(g, p[0] - 7, p[1] - 5, 14, 10, 2);
        inkFill(g, C.butter, 1.1);
      }
      plane(g, [CARD.x + CARD.w, CARD.y + 20], [BOOTHS[0].cx + 2, -70], sendK, 50, 0.85);
      if (dotK > 0 && dotK < 1) {
        circle(g, BOOTHS[0].cx, lerp(-153, MAIN_Y, E.soft(dotK)), 3.2);
        inkFill(g, C.butterHi, 1.2);
      }
      tickBadge(g, CARD.x + CARD.w + 2, CARD.y - 2, round === 2 ? seg(T, 7.0, 7.3) * (1 - seg(T, 8.4, 8.6)) : 0, 6, ADD, ADD_INK);
      sparks(g, KEY.x, KEY.y - 12, seg(T, 0.4, 0.9), 14, 6, C.amber);
      sparks(g, BOOTHS[0].cx, MAIN_Y, seg(T, 7.9, 8.5), 14, 7, ADD_INK);
      bubble(g, BOOTHS[2].cx - 14, -113, 'hmm…', think3, { tail: 30, size: 8 });
      bubble(g, BOOTHS[0].cx - 14, -113, 'on it', think1, { tail: 30, size: 8 });
    },
  };
})();
