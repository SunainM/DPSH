"use strict";
const { hashFace } = require("../../src/common/hashFace");

const SIZE = 4;
const makeFace = (size, val) =>
  Array.from({ length: size }, () =>
    Array.from({ length: size }, () => [val, val, val])
  );

describe("hashFace", () => {
  test("returns an 8-character lowercase hex string", () => {
    expect(hashFace(makeFace(SIZE, 0))).toMatch(/^[0-9a-f]{8}$/);
  });

  test("is deterministic — same input produces same hash", () => {
    const face = makeFace(SIZE, 128);
    expect(hashFace(face)).toBe(hashFace(face));
  });

  test("different pixel values produce different hashes", () => {
    expect(hashFace(makeFace(SIZE, 0))).not.toBe(hashFace(makeFace(SIZE, 255)));
  });

  test("single-pixel change changes the hash", () => {
    const f1 = makeFace(SIZE, 100);
    // deep-copy and mutate one channel
    const f2 = f1.map(row => row.map(px => [...px]));
    f2[0][0][0] = 101;
    expect(hashFace(f1)).not.toBe(hashFace(f2));
  });

  test("pixel values > 255 are masked to their low byte", () => {
    // 256 & 0xff === 0, so face with value 256 should hash the same as value 0
    const fZero  = makeFace(SIZE, 0);
    const f256   = makeFace(SIZE, 256);
    expect(hashFace(f256)).toBe(hashFace(fZero));
  });

  test("handles non-64 face sizes without crashing", () => {
    const hash = hashFace(makeFace(2, 50));
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });
});
