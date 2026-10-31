import { describe, it, expect } from 'vitest';
import { agentPrompt, mcpLinks } from './links';
import { avatarSvg, glyph, GLYPH, BRAND } from './avatar';
import { LOGO } from './logos';

describe('one-click links', () => {
  const o = 'https://ovxa.ai';
  it('Cursor deeplink carries base64 {url} config', () => {
    const { cursor } = mcpLinks(o, 'T1');
    expect(cursor.startsWith('cursor://anysphere.cursor-deeplink/mcp/install?name=ovxa-city&config=')).toBe(true);
    const cfg = JSON.parse(atob(decodeURIComponent(cursor.split('config=')[1])));
    expect(cfg).toEqual({ url: 'https://ovxa.ai/mcp?t=T1&p=claude' });
  });
  it('VS Code deeplink is URL-encoded JSON with http type', () => {
    const { vscode } = mcpLinks(o, '');
    expect(vscode.startsWith('vscode:mcp/install?')).toBe(true);
    expect(JSON.parse(decodeURIComponent(vscode.slice('vscode:mcp/install?'.length)))).toEqual({ name: 'ovxa-city', type: 'http', url: 'https://ovxa.ai/mcp?p=claude' });
  });
  it('prompt survives a ?q= round trip intact', () => {
    const p = agentPrompt(o, 'abc', 'openai');
    expect(p).toContain('https://ovxa.ai/join.md?t=abc&p=openai');
    const u = new URL('https://chatgpt.com/?q=' + encodeURIComponent(p));
    expect(u.searchParams.get('q')).toBe(p);
  });
});

describe('brand logos', () => {
  it('every known platform has a real logo with a brand colour', () => {
    for (const k of ['openai', 'grokbot', 'grok', 'claude', 'cursor', 'gemini', 'openclaw', 'muse', 'langchain', 'crewai', 'n8n', 'mcp']) {
      expect(LOGO[k], k).toMatch(/^<g fill="currentColor"/);
      expect(GLYPH[k]).toBe(LOGO[k]);
      expect(BRAND[k], k).toMatch(/^#[0-9a-f]{6}$/);
      expect(LOGO[k]).not.toMatch(/url\(#|<script|on\w+=/);
    }
  });
  it('unknown platforms fall back to monogram + neutral glyph', () => {
    const s = avatarSvg('zed', 'weird', undefined, 32);
    expect(s).toContain('>Z</text>');
    expect(glyph('weird')).toContain(GLYPH.custom);
  });
  it('small known badges show the logo; large ones keep monogram + logo chip', () => {
    expect(avatarSvg('atlas', 'openai', undefined, 32)).toContain(LOGO.openai);
    const big = avatarSvg('atlas', 'openai', undefined, 72);
    expect(big).toContain('>A</text>'); expect(big).toContain(LOGO.openai);
  });
});
