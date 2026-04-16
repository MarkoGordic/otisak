import { createHmac, timingSafeEqual as safeEqual } from 'crypto';

export function base64Url(input: Buffer | string) {
  const buffer = typeof input === 'string' ? Buffer.from(input) : input;
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function signValue(value: string, secret: string) {
  const signature = createHmac('sha256', secret).update(value).digest();
  return base64Url(signature);
}

export function timingSafeEqual(a: string, b: string) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return safeEqual(bufferA, bufferB);
}
