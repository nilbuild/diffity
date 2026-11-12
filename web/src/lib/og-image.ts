import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import satori from 'satori';
import sharp from 'sharp';
import { SITE } from './site';

// Mirrors the tokens in src/styles/global.css; satori cannot read CSS variables.
const COLOR = {
  bg: '#ffffff',
  panel: '#fafafa',
  frame: '#e4e4e4',
  line: '#e0e0e0',
  text: '#0a0a0a',
  textSecondary: '#555555',
  textMuted: '#707070',
  textFaint: '#8a8a8a',
  online: '#2da44e',
};

const HATCH = `repeating-linear-gradient(-45deg, ${COLOR.frame} 0px, ${COLOR.frame} 1px, transparent 1px, transparent 7px)`;

type Style = Record<string, string | number>;

interface Node {
  type: string;
  props: { style?: Style; children?: Child | Child[]; [key: string]: unknown };
}

type Child = Node | string;

function h(type: string, style: Style, children?: Child | Child[], attrs: Record<string, unknown> = {}): Node {
  return { type, props: { ...attrs, style, children } };
}

const root = process.cwd();

function readFont(pkg: string, file: string) {
  return readFile(join(root, 'node_modules', pkg, 'files', file));
}

async function pngDataUri(path: string, width: number) {
  const buffer = await sharp(join(root, path)).resize({ width }).png().toBuffer();
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

function rail() {
  return h('div', { width: 14, flexShrink: 0, borderLeft: `1px solid ${COLOR.frame}`, borderRight: `1px solid ${COLOR.frame}`, backgroundImage: HATCH });
}

function layout(logo: string, shot: string) {
  const topBar = h(
    'div',
    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72, padding: '0 40px', borderBottom: `1px dashed ${COLOR.line}` },
    [
      h('div', { display: 'flex', alignItems: 'center', gap: 14 }, [
        h('img', { width: 44, height: 44 }, undefined, { src: logo, width: 44, height: 44 }),
        h('div', { display: 'flex', fontSize: 28, fontWeight: 500, letterSpacing: -0.6 }, [
          'Diffity',
          h('span', { color: COLOR.textFaint, marginLeft: 8 }, 'for Mac and Linux'),
        ]),
      ]),
      h('div', { display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, color: COLOR.textSecondary }, [
        h('div', { width: 9, height: 9, borderRadius: 9, backgroundColor: COLOR.online }),
        'macOS 13.3+',
        h('span', { color: '#c4c4c4' }, '/'),
        'Linux',
      ]),
    ],
  );

  const copy = h(
    'div',
    { display: 'flex', flexDirection: 'column', width: 500, flexShrink: 0, padding: '44px 40px', borderRight: `1px dashed ${COLOR.line}` },
    [
      h('div', { fontFamily: 'Geist Mono', fontSize: 15, letterSpacing: 1, color: COLOR.textMuted }, 'CODE REVIEW, ON MAC AND LINUX'),
      h('div', { display: 'flex', flexDirection: 'column', marginTop: 18, fontSize: 50, lineHeight: 1.06, fontWeight: 500, letterSpacing: -2 }, [
        h('div', { color: COLOR.text }, 'Review your code like a pull request.'),
        h('div', { color: COLOR.textFaint }, 'Let your agent fix what you find.'),
      ]),
      h('div', { display: 'flex', marginTop: 'auto', fontFamily: 'Geist Mono', fontSize: 15, color: COLOR.textMuted }, 'Claude Code · Codex · Free and open source'),
    ],
  );

  const preview = h('div', { display: 'flex', flex: 1, padding: '44px 0 0 36px', overflow: 'hidden' }, [
    h('div', { display: 'flex', flexShrink: 0, width: 820, height: 520, padding: 7, borderRadius: 12, border: `1px solid ${COLOR.frame}`, backgroundColor: COLOR.panel }, [
      h('img', { width: 806, height: 504, borderRadius: 7 }, undefined, { src: shot, width: 806, height: 504 }),
    ]),
  ]);

  return h('div', { display: 'flex', width: SITE.ogImage.width, height: SITE.ogImage.height, padding: '0 40px', backgroundColor: COLOR.bg, color: COLOR.text, fontFamily: 'Geist' }, [
    rail(),
    h('div', { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }, [topBar, h('div', { display: 'flex', flex: 1 }, [copy, preview])]),
    rail(),
  ]);
}

/** Renders the Open Graph card with the same frame, rails, dashed lines and type as the site. */
export async function renderOgImage() {
  const [regular, medium, monoRegular, logo, shot] = await Promise.all([
    readFont('@fontsource/geist', 'geist-latin-400-normal.woff'),
    readFont('@fontsource/geist', 'geist-latin-500-normal.woff'),
    readFont('@fontsource/geist-mono', 'geist-mono-latin-400-normal.woff'),
    pngDataUri('src/assets/logo.png', 88),
    pngDataUri('src/assets/hero.png', 1612),
  ]);

  const svg = await satori(layout(logo, shot) as Parameters<typeof satori>[0], {
    width: SITE.ogImage.width,
    height: SITE.ogImage.height,
    fonts: [
      { name: 'Geist', data: regular, weight: 400, style: 'normal' },
      { name: 'Geist', data: medium, weight: 500, style: 'normal' },
      { name: 'Geist Mono', data: monoRegular, weight: 400, style: 'normal' },
    ],
  });

  return sharp(Buffer.from(svg)).png().toBuffer();
}
