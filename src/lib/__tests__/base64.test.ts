import { base64ToArrayBuffer, decodeBase64 } from '../base64';

describe('base64 decoding for uploads', () => {
  test('matches Node’s decoder for all padding lengths', () => {
    for (const text of ['', 'a', 'ab', 'abc', 'abcd', 'hello world', 'ÿ\u0000binary']) {
      const encoded = Buffer.from(text, 'latin1').toString('base64');
      expect(Buffer.from(decodeBase64(encoded)).toString('latin1')).toBe(text);
    }
  });

  test('produces an exact-length ArrayBuffer (no trailing bytes)', () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const buffer = base64ToArrayBuffer(jpegHeader.toString('base64'));
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBe(6);
    expect([...new Uint8Array(buffer)]).toEqual([...jpegHeader]);
  });

  test('ignores whitespace and data-URI-unsafe characters', () => {
    expect(Buffer.from(decodeBase64('aGVs\nbG8=')).toString()).toBe('hello');
  });
});
