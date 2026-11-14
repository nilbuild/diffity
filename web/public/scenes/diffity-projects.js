// diffity: every repo you open stays in the left rail; one key jumps back to it
(function () {
  const SC = (window.SCENES = window.SCENES || {});
  const R = window.RIG;
  const { C, E, P, mix, fig, inkFill, rr, ln, text, seg, breathe, sparks, pulse, lp, words, lerp, arcPt, circle } = R;

  const ADD = '#dafbe1', DEL = '#ffebe9', ADD_INK = '#1a7f37', DEL_INK = '#cf222e';
  const B = { x: -96, y: -170, w: 226, h: 120 };
  const RAIL = B.x + 34;
  const CX0 = RAIL + 6, CX1 = B.x + B.w - 6;
  const ME = -192;
  const KEY = [-146, -54];
  const PILE = [190, 0];
  const PROJECTS = [
    { name: 'web', col: '#f2b8a2', rows: 'c+c-+cc' },
    { name: 'api', col: '#a9c9e8', rows: '-+ccc++' },
    { name: 'cli', col: '#c8e6b0', rows: 'cc++c-c' },
    { name: 'docs', col: '#e3cdf0', rows: '+++c+++' },
  ];
  const VARIANTS = [
    { key: '⌘2', to: 1 },
    { key: '⌘3', to: 2 },
    { key: '⌘O', to: 3, open: true },
  ];
  const tileY = (i) => B.y + 25 + i * 23;

  function tile(g, i, z, lit) {
    if (z <= 0) {
      return;
    }
    const p = PROJECTS[i];
    const cx = B.x + 17, cy = tileY(i) + 9;
    g.save();
    g.translate(cx, cy);
    g.scale(z, z);
    rr(g, -10, -9, 20, 18, 4);
    inkFill(g, p.col, lit ? 1.6 : 1.2, lit ? C.ink : '#6b6b6b');
    text(g, p.name[0], 0, 3.5, 9.5, C.ink);
    g.restore();
  }

  function content(g, p, dx) {
    const pr = PROJECTS[p];
    g.save();
    g.translate(dx, 0);
    text(g, pr.name + '/src', CX0 + 2, B.y + 31, 7.5, C.muted, 'left');
    for (let i = 0; i < 6; i++) {
      const y = B.y + 45 + i * 12.5;
      const k = pr.rows[i];
      if (k === '+' || k === '-') {
        rr(g, CX0, y - 5, CX1 - CX0, 10, 2);
        g.fillStyle = k === '+' ? ADD : DEL;
        g.fill();
        text(g, k === '+' ? '+' : '−', CX0 + 7, y + 3, 9, k === '+' ? ADD_INK : DEL_INK);
        words(g, CX0 + 16, y, 70 + ((i * 31 + p * 17) % 70), p * 11 + i * 3, k === '+' ? '#7cc48e' : '#e7a3a3', 2.2);
        continue;
      }
      words(g, CX0 + 16, y, 60 + ((i * 23 + p * 13) % 80), p * 7 + i * 5, '#cfcfcf', 2);
    }
    g.restore();
  }

  function board(g, from, to, slide, fadeBack, ringPos, extraK, header) {
    ln(g, B.x + 24, B.y + B.h, B.x + 12, 0, 2.2);
    ln(g, B.x + B.w - 24, B.y + B.h, B.x + B.w - 12, 0, 2.2);
    ln(g, B.x + 44, B.y + B.h + 28, B.x + B.w - 44, B.y + B.h + 28, 1.4, '#bdbdbd');
    rr(g, B.x, B.y, B.w, B.h, 6);
    inkFill(g, C.paper, 1.7);
    ln(g, B.x, B.y + 17, B.x + B.w, B.y + 17, 1.3);
    ln(g, RAIL, B.y + 17, RAIL, B.y + B.h, 1.1, '#d6d6d6');
    text(g, 'diffity', B.x + 10, B.y + 12, 8.5, C.ink, 'left');
    g.save();
    g.globalAlpha *= header.a;
    text(g, header.name, B.x + B.w - 10, B.y + 12 - header.dy, 8.5, C.muted, 'right');
    g.restore();

    g.save();
    g.beginPath();
    g.rect(RAIL + 1, B.y + 18, B.x + B.w - RAIL - 2, B.h - 19);
    g.clip();
    const span = CX1 - CX0 + 12;
    if (slide <= 0) {
      content(g, from, 0);
    } else if (slide >= 1 && fadeBack <= 0) {
      content(g, to, 0);
    } else if (fadeBack > 0) {
      g.save();
      g.globalAlpha *= 1 - fadeBack;
      content(g, to, 0);
      g.restore();
      g.save();
      g.globalAlpha *= fadeBack;
      content(g, from, 0);
      g.restore();
    } else {
      const k = E.soft(slide);
      content(g, from, -k * span);
      content(g, to, (1 - k) * span);
    }
    g.restore();

    const [ry, rz] = ringPos;
    rr(g, B.x + 4, ry - 2, 26, 22, 6);
    g.lineWidth = 2;
    g.strokeStyle = ADD_INK;
    g.globalAlpha *= rz;
    g.stroke();
    g.globalAlpha = 1;
    for (let i = 0; i < 3; i++) {
      tile(g, i, 1, false);
    }
    tile(g, 3, extraK, false);
  }

  function keycap(g, label, press, a) {
    ln(g, KEY[0] - 6, KEY[1] + 8, KEY[0] - 10, 0, 2.2);
    ln(g, KEY[0] + 6, KEY[1] + 8, KEY[0] + 10, 0, 2.2);
    rr(g, KEY[0] - 18, KEY[1], 36, 10, 3);
    inkFill(g, '#d9d9d9', 1.5);
    const dy = press * 3;
    rr(g, KEY[0] - 15, KEY[1] - 12 + dy, 30, 14, 4);
    inkFill(g, C.paper, 1.6);
    g.save();
    g.globalAlpha *= a;
    text(g, label, KEY[0], KEY[1] - 2 + dy, 9, C.ink);
    g.restore();
  }

  function folder(g, x, y, col, rot) {
    g.save();
    g.translate(x, y);
    g.rotate(rot || 0);
    g.beginPath();
    g.moveTo(-11, -8);
    g.lineTo(-4, -8);
    g.lineTo(-2, -5.5);
    g.lineTo(11, -5.5);
    g.lineTo(11, 7);
    g.lineTo(-11, 7);
    g.closePath();
    inkFill(g, col, 1.3);
    g.restore();
  }

  function pile(g, t, gone) {
    folder(g, PILE[0] - 4, PILE[1] - 7, '#f3e3b0', -0.04);
    folder(g, PILE[0] + 3, PILE[1] - 21, '#cfe0c8', 0.05);
    if (!gone) {
      folder(g, PILE[0] - 1, PILE[1] - 35, PROJECTS[3].col, -0.03);
    }
    rr(g, PILE[0] + 20, PILE[1] - 13, 11, 13, 2);
    inkFill(g, C.paper, 1.3);
    for (let i = 0; i < 2; i++) {
      const k = (t * 0.5 + i * 0.5) % 1;
      const yy = PILE[1] - 17 - k * 12;
      g.save();
      g.globalAlpha *= Math.sin(Math.PI * k) * 0.55;
      g.beginPath();
      g.moveTo(PILE[0] + 23 + i * 4, yy);
      g.bezierCurveTo(PILE[0] + 27 + i * 4, yy - 3, PILE[0] + 21 + i * 4, yy - 6, PILE[0] + 24 + i * 4, yy - 9);
      g.lineWidth = 1.3;
      g.strokeStyle = '#9a9a9a';
      g.lineCap = 'round';
      g.stroke();
      g.restore();
    }
  }

  SC['diffity-projects'] = {
    dur: 6.4,
    width: 460,
    label: 'A stick figure presses one key and Diffity jumps to another repo from its left rail; on another press a new repo folder flies onto the rail and opens.',
    draw(g, S) {
      const T = S.on ? S.u * this.dur : -1;
      const t = S.t;
      const v = VARIANTS[S.n % VARIANTS.length];
      let pose = breathe(P({ hF: [12, -60], hB: [-4, -52] }), t);
      let press = 0, slide = 0, fadeBack = 0, extraK = 0, flyK = 0, keyA = 1, cheerK = 0;
      const chin = P({ hF: [10, -96], head: [7, -116], hB: [-4, -54] });
      const ringFrom = tileY(0) + 0;
      let ringY = ringFrom, ringZ = 1;
      let header = { name: PROJECTS[0].name, a: 1, dy: 0 };
      if (T < 0) {
        pose = mix(pose, chin, pulse(t, 5.5, 2, 2.2));
      } else {
        const fade = seg(T, this.dur - 0.5, this.dur);
        const sel = v.open ? 1.9 : 1.05;
        const lift = E.soft(seg(T, 0.35, 0.75)) * (1 - E.soft(seg(T, 0.8, 0.88)));
        const slam = E.in(seg(T, 0.8, 0.9)) * (1 - E.soft(seg(T, 1.1, 1.35)));
        const look = E.soft(seg(T, 1.3, 1.6)) * (1 - E.soft(seg(T, sel + 0.6, sel + 0.8)));
        const cheer = E.back(seg(T, sel + 0.75, sel + 1.0)) * (1 - E.soft(seg(T, sel + 1.4, sel + 1.7)));
        cheerK = cheer;
        pose = mix(pose, P({ hF: [22, -128], hB: [-4, -54], head: [6, -117] }), lift);
        pose = mix(pose, P({ hF: lp([KEY[0], KEY[1] - 12], ME, 0, 1), hB: [-4, -54], head: [10, -113], chest: [4, -89] }), slam);
        pose = mix(pose, P({ hF: [12, -62], hB: [-4, -52], head: [10, -118] }), look);
        pose = mix(pose, P({ hF: [14, -132], hB: [-10, -130], head: [3, -118] }), cheer);
        press = seg(T, 0.86, 0.92) * (1 - seg(T, 1.15, 1.35));
        if (v.open) {
          flyK = seg(T, 1.0, 1.6);
          extraK = E.back(seg(T, 1.55, 1.8)) * (1 - fade);
        }
        slide = seg(T, sel, sel + 0.55);
        fadeBack = fade;
        const rk = E.out3(seg(T, sel, sel + 0.35));
        ringY = lerp(ringFrom, tileY(v.to), rk);
        ringY = lerp(ringY, ringFrom, E.soft(fade));
        const swap = seg(T, sel + 0.15, sel + 0.4);
        header = swap < 0.5 || fade > 0.5
          ? { name: PROJECTS[0].name, a: fade > 0.5 ? fade : 1 - swap * 2, dy: fade > 0.5 ? 0 : swap * 8 }
          : { name: PROJECTS[v.to].name, a: Math.min(1, (swap - 0.5) * 2) * (fade > 0 ? 1 - fade * 2 : 1), dy: (1 - swap) * -8 };
        keyA = 1 - fade * (1 - fade) * 4;
      }

      board(g, 0, v.to, slide, fadeBack, [ringY, ringZ], extraK, header);
      keycap(g, v.key, press, keyA);
      pile(g, t, v.open && T >= 1.0 && T < this.dur - 0.25);
      fig(g, pose, ME, 0, { wave: S.wave, wt: S.wt });
      text(g, 'you', ME, 18, 10, C.muted);

      if (flyK > 0 && flyK < 1) {
        const p = arcPt([PILE[0] - 1, PILE[1] - 35], [B.x + 17, tileY(3) + 9], 70, E.soft(flyK));
        folder(g, p[0], p[1], PROJECTS[3].col, Math.sin(flyK * Math.PI) * 0.5);
      }
      const selT = v.open ? 1.9 : 1.05;
      sparks(g, B.x + 17, tileY(v.to) + 9, seg(T, selT + 0.2, selT + 0.7), 16, 7, ADD_INK);
      sparks(g, KEY[0], KEY[1] - 10, seg(T, 0.88, 1.3), 14, 6, C.amber);
      if (cheerK > 0) {
        sparks(g, ME + 2, -128, seg(T, selT + 0.75, selT + 1.3), 20, 7, C.amber);
      }
    },
  };
})();
