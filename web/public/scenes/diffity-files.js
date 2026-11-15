// diffity: pull any file from the cabinet, it opens on the board, scroll a long file fast, pin a comment
(function () {
  const SC = (window.SCENES = window.SCENES || {});
  const R = window.RIG;
  const { C, E, P, mix, legs, walkSeg, fig, inkFill, rr, ln, text, seg, breathe, sparks, pulse, lp, bubble, words, arcPt, lerp, clamp } = R;

  const ADD = '#dafbe1', ADD_INK = '#1a7f37', DEL = '#ffebe9', DEL_INK = '#cf222e';
  const MANILA = '#f2d49b', MANILA_INK = '#b98a1a';
  const CAB = { x: -206, y: -98, w: 52, h: 98 };
  const B = { x: -86, y: -162, w: 184, h: 112 };
  const LY = (i) => B.y + 32 + i * 12;
  const ROWS = 6;
  const NOTE = [B.x + 8, LY(3) - 1];
  const ME = -116, AT_CAB = -128;

  function cabinet(g, out) {
    rr(g, CAB.x, CAB.y, CAB.w, CAB.h, 3);
    inkFill(g, '#efefef', 1.7);
    for (let i = 0; i < 3; i++) {
      const y = CAB.y + 4 + i * 31;
      const dx = i === 1 ? out * 18 : 0;
      if (i === 1 && out > 0) {
        for (let f = 0; f < 3; f++) {
          rr(g, CAB.x + 8 + f * 12 + dx, y - 6 + f, 14, 10, 1.5);
          inkFill(g, MANILA, 1.2, MANILA_INK);
        }
      }
      rr(g, CAB.x + 4 + dx, y, CAB.w - 8, 27, 2);
      inkFill(g, C.paper, 1.5);
      rr(g, CAB.x + CAB.w / 2 - 9 + dx, y + 6, 18, 7, 1);
      inkFill(g, '#f7f7f7', 1);
      ln(g, CAB.x + CAB.w / 2 - 6 + dx, y + 19, CAB.x + CAB.w / 2 + 6 + dx, y + 19, 2.4);
    }
  }

  function folder(g, x, y, rot, z) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.scale(z, z);
    rr(g, -12, -11, 9, 5, 1.5);
    inkFill(g, MANILA, 1.2, MANILA_INK);
    rr(g, -12, -8, 24, 17, 2);
    inkFill(g, MANILA, 1.3, MANILA_INK);
    g.restore();
  }

  function header(g, filesK, name) {
    rr(g, B.x, B.y, B.w, B.h, 6);
    inkFill(g, C.paper, 1.7);
    ln(g, B.x, B.y + 19, B.x + B.w, B.y + 19, 1.3);
    text(g, 'diffity', B.x + 10, B.y + 13, 8.5, C.ink, 'left');
    text(g, 'Changes', B.x + 92, B.y + 13, 8, filesK > 0.5 ? C.muted : C.ink);
    text(g, 'Files', B.x + 132, B.y + 13, 8, filesK > 0.5 ? C.ink : C.muted);
    const ux = lerp(B.x + 76, B.x + 121, E.soft(filesK)), uw = lerp(32, 22, filesK);
    ln(g, ux, B.y + 18, ux + uw, B.y + 18, 2.2, ADD_INK);
    if (name) {
      text(g, name, B.x + 10, B.y + 29, 7.5, C.muted, 'left');
    }
  }

  function diffRows(g, a) {
    if (a <= 0) {
      return;
    }
    g.save();
    g.globalAlpha *= a;
    text(g, 'store.ts', B.x + 10, B.y + 29, 7.5, C.muted, 'left');
    for (let i = 1; i < ROWS; i++) {
      const y = LY(i);
      const kind = [0, 2, 1, 2, 0, 0][i];
      if (kind) {
        rr(g, B.x + 4, y - 5, B.w - 8, 10, 2);
        g.fillStyle = kind === 1 ? DEL : ADD;
        g.fill();
        text(g, kind === 1 ? '−' : '+', B.x + 12, y + 3, 9, kind === 1 ? DEL_INK : ADD_INK);
        words(g, B.x + 22, y, 80 + ((i * 23) % 50), i * 5, kind === 1 ? '#e7a3a3' : '#7cc48e', 2.2);
        continue;
      }
      text(g, String(40 + i), B.x + 12, y + 3, 7, '#b0b0b0');
      words(g, B.x + 26, y, 80 + ((i * 37) % 40), i * 5, '#cfcfcf', 2);
    }
    g.restore();
  }

  function fileRows(g, a, scroll, speed) {
    if (a <= 0) {
      return;
    }
    g.save();
    g.globalAlpha *= a;
    g.beginPath();
    g.rect(B.x + 2, B.y + 34, B.w - 4, B.h - 36);
    g.clip();
    const base = Math.floor(scroll), off = (scroll - base) * 12;
    for (let i = 0; i <= ROWS; i++) {
      const line = base + i + 1;
      const y = LY(i + 1) - 4 - off;
      g.save();
      g.globalAlpha *= 1 - speed * 0.55;
      text(g, String(line), B.x + 24, y + 3, 7, '#9a9a9a', 'right');
      words(g, B.x + 32 + (line % 4) * 7, y, 60 + ((line * 37) % 70), line * 3, '#c4c4c4', 2);
      g.restore();
    }
    g.restore();
    const track = [B.y + 36, B.y + B.h - 6];
    const th = 12, ty = lerp(track[0], track[1] - th, clamp(scroll / 400, 0, 1));
    g.save();
    g.globalAlpha *= a;
    rr(g, B.x + B.w - 7, ty, 4, th, 2);
    g.fillStyle = '#bdbdbd';
    g.fill();
    if (speed > 0.15) {
      g.globalAlpha *= speed;
      for (let i = 0; i < 3; i++) {
        const sx = B.x + B.w - 16 - i * 5;
        ln(g, sx, B.y + 48 + i * 14, sx, B.y + 78 + i * 14, 1.4, '#9a9a9a');
      }
    }
    g.restore();
  }

  function stand(g) {
    ln(g, B.x + 22, B.y + B.h, B.x + 10, 0, 2.2);
    ln(g, B.x + B.w - 22, B.y + B.h, B.x + B.w - 10, 0, 2.2);
    ln(g, B.x + 40, B.y + B.h + 28, B.x + B.w - 40, B.y + B.h + 28, 1.4, '#bdbdbd');
  }

  function sticky(g, k) {
    if (k <= 0) {
      return;
    }
    const z = E.back(k);
    g.save();
    g.translate(NOTE[0], NOTE[1]);
    g.rotate(0.12);
    g.scale(z, z);
    rr(g, -2, -8, 24, 16, 2);
    inkFill(g, C.butter, 1.3);
    ln(g, 3, -3, 17, -3, 1.5, '#b98a1a');
    ln(g, 3, 2, 12, 2, 1.5, '#b98a1a');
    g.restore();
  }

  function plant(g, x, t) {
    const sway = Math.sin(t * 1.3) * 0.06;
    for (const [a, len] of [[-0.5, 15], [0.05, 19], [0.6, 14]]) {
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

  SC['diffity-files'] = {
    dur: 8.2,
    width: 440,
    label: 'A stick figure pulls a file from a filing cabinet, it opens on the Diffity board, the long file scrolls fast and the figure pins a comment on one of its lines.',
    draw(g, S) {
      const T = S.on ? S.u * this.dur : -1;
      const t = S.t;
      let pose = breathe(P({ hF: [12, -60], hB: [-4, -52] }), t);
      let x = ME, gait = { ph: 0, amp: 0 };
      let sx = 1, out = 0, held = 0, flyK = 0, filesK = 0, scroll = 0, speed = 0, noteK = 0, saidK = 0;
      const chin = P({ hF: [10, -96], head: [7, -116], hB: [-4, -54] });
      if (T < 0) {
        pose = mix(pose, chin, pulse(t, 5.5, 2, 2.2));
      } else {
        const fade = 1 - seg(T, this.dur - 0.5, this.dur);
        sx = T > 0.25 && T < 1.55 ? -1 : 1;
        const ws = T < 0.9 ? walkSeg(T, 0.25, 0.55, ME, AT_CAB) : walkSeg(T, 1.25, 1.55, AT_CAB, ME);
        x = ws.x;
        gait = ws.dir * sx < 0 ? { ph: -ws.ph, amp: ws.amp, stride: ws.stride } : ws;
        const handle = [CAB.x + CAB.w - 6 + out * 18, CAB.y + 4 + 31 + 12];
        out = E.soft(seg(T, 0.55, 0.95)) * (1 - E.soft(seg(T, 1.6, 1.95)));
        handle[0] = CAB.x + CAB.w - 6 + out * 18;
        const pull = E.soft(seg(T, 0.3, 0.55)) * (1 - E.soft(seg(T, 0.95, 1.1)));
        const pick = E.soft(seg(T, 1.0, 1.2)) * (1 - E.soft(seg(T, 1.45, 1.6)));
        const toss = E.soft(seg(T, 1.6, 1.75)) * (1 - E.soft(seg(T, 1.9, 2.2)));
        const watch = E.soft(seg(T, 2.3, 2.5)) * (1 - E.soft(seg(T, 3.7, 3.9)));
        const reach = E.soft(seg(T, 4.0, 4.3)) * (1 - E.soft(seg(T, 4.6, 4.9)));
        const cheer = E.back(seg(T, 5.0, 5.4)) * (1 - E.soft(seg(T, 5.6, 5.9)));
        pose = mix(pose, P({ hF: lp(handle, x, 0, -1), hB: [-4, -52], head: [14, -109], chest: [8, -86], hip: [-1, -58] }), pull);
        pose = mix(pose, P({ hF: lp([CAB.x + 30 + out * 18, CAB.y + 28], x, 0, -1), hB: [-4, -54], head: [9, -114], chest: [3, -90] }), pick);
        pose = mix(pose, P({ hF: [40, -104], hB: [-4, -54], head: [10, -116] }), toss);
        pose = mix(pose, P({ hF: [12, -60], hB: [-4, -52], head: [11, -118] }), watch);
        pose = mix(pose, P({ hF: lp([NOTE[0] + 4, NOTE[1] + 2], ME, 0, 1), hB: [-4, -54], head: [9, -114], chest: [3, -90] }), reach);
        pose = mix(pose, P({ hF: [14, -132], hB: [-10, -130], head: [3, -118] }), cheer);
        held = T > 1.15 && T < 1.55 ? 1 : 0;
        flyK = seg(T, 1.65, 2.2);
        filesK = E.soft(seg(T, 2.1, 2.35)) * (1 - E.soft(seg(T, 6.4, 6.9)));
        const sk = seg(T, 2.5, 3.7);
        scroll = (1 - Math.pow(1 - sk, 3)) * 400 * fade;
        speed = sk > 0 && sk < 1 ? Math.sin(Math.PI * sk) : 0;
        noteK = seg(T, 4.2, 4.45) * (1 - seg(T, 6.3, 6.6));
        saidK = seg(T, 5.0, 5.15) * (1 - seg(T, 5.8, 6.0));
      }

      plant(g, 160, t);
      cabinet(g, out);
      stand(g);
      header(g, filesK, filesK > 0.5 ? 'utils/date.ts' : '');
      diffRows(g, 1 - filesK);
      fileRows(g, filesK, scroll, speed);
      pose = legs(pose, gait.ph, gait.amp, { arms: false, stride: gait.stride });
      const J = fig(g, pose, x, 0, { sx, wave: S.wave, wt: S.wt });
      text(g, 'you', x, 18, 10, C.muted);
      if (held) {
        folder(g, J.w.handF[0], J.w.handF[1] - 6, -0.1, 1);
      }
      if (flyK > 0 && flyK < 1) {
        const p = arcPt([ME + 10, -110], [B.x + B.w / 2, B.y + B.h / 2], 50, E.soft(flyK));
        folder(g, p[0], p[1], flyK * 0.6, 1 + flyK * 1.6);
      }
      sparks(g, B.x + B.w / 2, B.y - 4, seg(T, 2.1, 2.6), 16, 7, C.amber);
      sticky(g, noteK);
      sparks(g, NOTE[0] + 10, NOTE[1], seg(T, 4.3, 4.8), 14, 6, '#b98a1a');
      bubble(g, ME - 24, -150, 'line 403!', saidK, { tail: 14, size: 8.5 });
    },
  };
})();
