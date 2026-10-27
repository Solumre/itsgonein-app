import { describe, it, expect } from 'vitest';
import { checkText, checkNickname } from '../../server/moderation.js';

describe('checkText', () => {
  it('allows normal banter', () => {
    expect(checkText('Arsenal 2-1 easy, no chance Chelsea score')).toMatchObject({ ok: true });
    expect(checkText('  what   a goal  ').text).toBe('what a goal');
  });
  it.each([
    ['swearing', 'that ref is a f*cking joke'],
    ['links', 'look at www.example.com'],
    ['links', 'go to https://x.y'],
    ['emails', 'mail me at kid@example.com'],
    ['phone numbers', 'text me 07700 900123'],
    ['handles', 'follow me @footyfan99'],
    ['other apps', 'add me on snapchat'],
    ['spam', 'goooooooooooooal'],
    ['empty', '   '],
  ])('blocks %s', (_kind, text) => {
    expect(checkText(text).ok).toBe(false);
  });
  it('caps length', () => {
    expect(checkText('a'.repeat(201)).ok).toBe(false);
  });
});

describe('checkNickname', () => {
  it('accepts sensible names', () => {
    expect(checkNickname('Saka Fan_7')).toEqual({ ok: true, nickname: 'Saka Fan_7' });
  });
  it.each(['ab', 'a'.repeat(17), 'bad<script>', 'Admin', 'shitface'])('rejects %s', (n) => {
    expect(checkNickname(n).ok).toBe(false);
  });
});
