// diffity: a spotlight rides a rail of model tags grouped by agent; picking a model picks the agent, then effort powers it up
(function () {
  const SC = (window.SCENES = window.SCENES || {});
  const R = window.RIG;
  const { C, E, P, mix, fig, inkFill, rr, ln, text, seg, breathe, sparks, pulse, lp, bubble, pill, lerp, circle, clamp } = R;

  const BOTS = {
    claude: { x: 10, ink: '#d97757', dark: '#a8553a', far: '#e8b7a3', tint: '#fbe9e1', base: 'sonnet' },
    codex: { x: 168, ink: '#3d7a8c', dark: '#2a5866', far: '#a9c9d1', tint: '#e1eef1', base: 'mini' },
  };
  const MODELS = [
    { name: 'haiku', x: -52, bot: 'claude' },
    { name: 'sonnet', x: 10, bot: 'claude' },
    { name: 'opus', x: 72, bot: 'claude' },
    { name: 'mini', x: 138, bot: 'codex' },
    { name: 'gpt-5', x: 198, bot: 'codex' },
  ];
  const PICKS = [2, 4, 0];
  const EFFORT = [4, 3, 2];
  const RAIL = { x0: -150, x1: 232, y: -176 };
  const PARK = -128;
  const ME = -212;
  const KMAX = 0.27;
  const BOX = { x: -192, y: -104, w: 46, h: 44 };
  const SLIDER = (k) => [BOX.x + 8 + k * (BOX.w - 16), BOX.y + 9];
  const KNOB = [BOX.x + 12, BOX.y + 26];

  function rail(g) {
    for (const x of [RAIL.x0 + 14, RAIL.x1 - 14]) {
      ln(g, x, RAIL.y - 4, x, -192, 1.2, '#9a9a9a');
    }
    rr(g, RAIL.x0, RAIL.y - 4, RAIL.x1 - RAIL.x0, 7, 3);
    inkFill(g, '#ececec', 1.4);
    for (let x = RAIL.x0 + 10; x < RAIL.x1 - 6; x += 12) {
      ln(g, x, RAIL.y - 3, x + 6, RAIL.y + 2, 0.9, '#c4c4c4');
    }
  }

  function tags(g, lampX, pick, pickK) {
    for (let i = 0; i < MODELS.length; i++) {
      const m = MODELS[i];
      const b = BOTS[m.bot];
      const near = clamp(1 - Math.abs(lampX - m.x) / 30, 0, 1);
      const on = i === pick ? pickK : 0;
      ln(g, m.x, RAIL.y + 3, m.x, RAIL.y + 9, 1, '#9a9a9a');
      const z = 1 + on * 0.12;
      g.save();
      g.translate(m.x, RAIL.y + 16);
      g.scale(z, z);
      pill(g, 0, 0, m.name, on > 0.5 ? C.butter : near > 0.3 ? b.tint : C.paper, on > 0.5 ? C.ink : b.dark, 8);
      g.restore();
    }
    text(g, 'claude', (MODELS[0].x + MODELS[2].x) / 2, RAIL.y - 9, 8, BOTS.claude.ink);
    text(g, 'codex', (MODELS[3].x + MODELS[4].x) / 2, RAIL.y - 9, 8, BOTS.codex.ink);
  }

  function trolley(g, x) {
    ln(g, x, RAIL.y + 2, x, RAIL.y + 32, 1.6);
    rr(g, x - 9, RAIL.y - 6, 18, 6, 2);
    inkFill(g, '#d4d4d4', 1.3);
    circle(g, x - 5, RAIL.y + 1, 2);
    inkFill(g, C.paper, 1.1);
    circle(g, x + 5, RAIL.y + 1, 2);
    inkFill(g, C.paper, 1.1);
  }

  function lamp(g, x, ang, on) {
    g.save();
    g.translate(x, RAIL.y + 32);
    g.rotate(ang);
    g.beginPath();
    g.moveTo(-4, 0);
    g.lineTo(4, 0);
    g.lineTo(8, 11);
    g.lineTo(-8, 11);
    g.closePath();
    inkFill(g, on > 0.3 ? C.butterHi : '#3a3a3a', 1.4);
    g.restore();
  }

  function beam(g, from, to, bright) {
    if (bright <= 0) {
      return;
    }
    const spread = 22 + bright * 8;
    g.save();
    g.globalAlpha *= 0.18 + bright * 0.3;
    g.beginPath();
    g.moveTo(from[0] - 5, from[1]);
    g.lineTo(from[0] + 5, from[1]);
    g.lineTo(to + spread, 0);
    g.lineTo(to - spread, 0);
    g.closePath();
    g.fillStyle = C.butter;
    g.fill();
    g.beginPath();
    g.ellipse(to, 1, spread + 4, 4.5, 0, 0, Math.PI * 2);
    g.fillStyle = C.butterHi;
    g.fill();
    g.restore();
  }

  function control(g, slideK, level, knobAng) {
    ln(g, BOX.x + BOX.w / 2, BOX.y + BOX.h, BOX.x + BOX.w / 2, 0, 2.2);
    ln(g, BOX.x + BOX.w / 2 - 10, 0, BOX.x + BOX.w / 2 + 10, 0, 2.2);
    rr(g, BOX.x, BOX.y, BOX.w, BOX.h, 5);
    inkFill(g, C.paper, 1.6);
    ln(g, BOX.x + 8, BOX.y + 9, BOX.x + BOX.w - 8, BOX.y + 9, 2, '#d4d4d4');
    const [sx, sy] = SLIDER(slideK);
    rr(g, sx - 3, sy - 4.5, 6, 9, 2);
    inkFill(g, C.butterHi, 1.2);
    circle(g, KNOB[0], KNOB[1], 5.5);
    inkFill(g, '#ececec', 1.3);
    ln(g, KNOB[0], KNOB[1], KNOB[0] + Math.cos(knobAng) * 4.5, KNOB[1] + Math.sin(knobAng) * 4.5, 1.6);
    for (let i = 0; i < 4; i++) {
      const h = 4 + i * 2.5;
      rr(g, BOX.x + 24 + i * 5, BOX.y + 32 - h, 3.4, h, 1);
      inkFill(g, i < level ? '#1a7f37' : C.paper, 0.9);
    }
    text(g, 'model', BOX.x + BOX.w / 2, BOX.y + 19, 6.5, C.muted);
    text(g, 'effort', BOX.x + BOX.w / 2, BOX.y + 41, 6.5, C.muted);
  }

  SC['diffity-agents'] = {
    dur: 7.6,
    width: 500,
    label: 'A spotlight slides along a rail of models grouped by agent, stops on one and lights up that agent, then turning up effort powers the agent up.',
    draw(g, S) {
      const T = S.on ? S.u * this.dur : -1;
      const t = S.t;
      const pick = PICKS[S.n % PICKS.length];
      const effort = EFFORT[S.n % EFFORT.length];
      const target = MODELS[pick];
      const chosen = target.bot;
      let pose = breathe(P({ hF: [12, -60], hB: [-4, -52], head: [6, -117] }), t);
      let slideK = 0, lampOn = 0, aimK = 0, pickK = 0, level = 0, knob = -Math.PI / 2, power = 0, hop = 0, happy = 0, saidK = 0, mySaidK = 0;
      if (T < 0) {
        pose = mix(pose, P({ hF: [10, -96], head: [7, -116], hB: [-4, -54] }), pulse(t, 5.5, 2, 2.2));
      } else {
        const back = seg(T, 6.4, 7.3);
        slideK = E.soft(seg(T, 0.6, 2.0)) * (1 - E.soft(back));
        lampOn = seg(T, 0.3, 0.5) * (1 - seg(T, 6.3, 6.6));
        aimK = E.soft(seg(T, 2.0, 2.4)) * (1 - E.soft(seg(T, 6.1, 6.4)));
        pickK = E.back(seg(T, 2.0, 2.3)) * (1 - seg(T, 6.4, 6.7));
        level = Math.round(effort * E.soft(seg(T, 2.6, 3.6)) * (1 - seg(T, 6.5, 7.0)));
        knob = -Math.PI / 2 + E.soft(seg(T, 2.6, 3.6)) * (effort / 4) * 2.4 * (1 - E.soft(seg(T, 6.5, 7.0)));
        power = seg(T, 2.6, 3.6) * (1 - seg(T, 6.1, 6.4));
        hop = Math.sin(Math.PI * seg(T, 3.7, 4.15)) * 9;
        happy = seg(T, 3.7, 3.75) * (1 - seg(T, 5.8, 5.9));
        saidK = seg(T, 3.9, 4.05) * (1 - seg(T, 5.4, 5.6));
        mySaidK = seg(T, 4.6, 4.75) * (1 - seg(T, 5.9, 6.1));
        const slide = E.soft(seg(T, 0.3, 0.6)) * (1 - E.soft(seg(T, 2.0, 2.3)));
        const turn = E.soft(seg(T, 2.4, 2.65)) * (1 - E.soft(seg(T, 3.6, 3.85)));
        const nod = E.soft(seg(T, 4.4, 4.6)) * (1 - E.soft(seg(T, 5.6, 5.9)));
        const slideBack = E.soft(seg(T, 6.2, 6.4)) * (1 - E.soft(seg(T, 7.2, 7.5)));
        const sl = SLIDER(Math.min(slideK, KMAX));
        const wob = Math.sin(t * 9) * 1.2;
        pose = mix(pose, P({ hF: lp([sl[0], sl[1] + 1], ME, 0, 1), hB: [-4, -54], head: [9, -115], chest: [6, -89] }), Math.max(slide, slideBack));
        pose = mix(pose, P({ hF: lp([KNOB[0] + wob, KNOB[1] - 1], ME, 0, 1), hB: [-4, -54], head: [9, -114], chest: [3, -90] }), turn);
        pose = mix(pose, P({ hF: [16, -104], hB: [-4, -54], head: [8, -118] }), nod);
      }
      const lampX = lerp(PARK, target.x, slideK);
      const lampSwing = T < 0 ? 0 : Math.sin(t * 7) * 0.12 * seg(T, 0.6, 2.0) * (1 - seg(T, 2.0, 2.6));
      const mouth = [lampX, RAIL.y + 42];
      const bx = BOTS[chosen].x;
      const aimX = lerp(lampX, bx, aimK);
      const ang = -Math.atan2(aimX - lampX, 180) * 0.9 + lampSwing;

      beam(g, mouth, aimX, lampOn * (0.35 + power * 0.65));
      rail(g);
      trolley(g, lampX);
      tags(g, slideK > 0.02 ? lampX : -999, pick, pickK);
      lamp(g, lampX, ang, lampOn);
      control(g, slideK, level, knob);

      for (const key of ['claude', 'codex']) {
        const b = BOTS[key];
        const me = key === chosen;
        const lit = me ? aimK : 0;
        const dim = !me && aimK > 0 ? 1 - aimK * 0.5 : 1;
        rr(g, b.x - 22, -8, 44, 8, 2);
        inkFill(g, b.tint, 1.4);
        const picked = me && pickK > 0.5;
        const look = pulse(t, 6, key === 'claude' ? 1.5 : 4, 1.2);
        let bp = breathe(P({ hF: [10, -58], hB: [-6, -56], head: [3, -117] }), t + b.x);
        bp = mix(bp, P({ hF: [10, -58], hB: [-6, -56], head: [-1, -119] }), look);
        if (me && T >= 0) {
          bp = mix(bp, P({ hF: [12, -127], hB: [-10, -128], head: [3, -118] }), E.back(seg(T, 3.7, 4.15)) * (1 - E.soft(seg(T, 5.0, 5.4))));
        }
        const glow = me ? Math.max(power, lit * 0.4) : 0;
        fig(g, bp, b.x, -8 - (me ? hop : 0), {
          sx: -1,
          ink: b.ink,
          far: b.far,
          floor: -8,
          alpha: dim,
          bot: { col: b.ink, dark: b.dark, glow, blink: pulse(t, 4.3, key === 'claude' ? 1.2 : 2.8, 0.15) > 0.5, happy: me && happy > 0.5 },
        });
        text(g, key, b.x, 16, 10, b.ink);
        text(g, picked ? target.name : b.base, b.x, 28, 8, picked ? C.ink : C.muted);
      }
      fig(g, pose, ME, 0, { wave: S.wave, wt: S.wt });
      text(g, 'you', ME, 16, 10, C.muted);

      sparks(g, bx, -128, seg(T, 3.7, 4.3), 24, 8, C.amber);
      const side = chosen === 'claude' ? 1 : -1;
      bubble(g, bx + side * 46, -128, chosen === 'claude' ? 'powered up!' : 'ready!', saidK, { tail: -side * 36, size: 8.5 });
      bubble(g, ME + 30, -140, target.name + ', please', mySaidK, { tail: -22, size: 8.5 });
    },
  };
})();
