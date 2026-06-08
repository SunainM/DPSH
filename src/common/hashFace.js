// FNV-1a 32-bit hash over a face pixel array (shared by facecam.sim and faceMLSim)
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME  = 0x01000193;

function hashFace(face) {
  let h = FNV_OFFSET >>> 0;
  for (let y = 0; y < face.length; y++) {
    const row = face[y];
    for (let x = 0; x < row.length; x++) {
      const [r, g, b] = row[x];
      h ^= r & 0xff; h = (h * FNV_PRIME) >>> 0;
      h ^= g & 0xff; h = (h * FNV_PRIME) >>> 0;
      h ^= b & 0xff; h = (h * FNV_PRIME) >>> 0;
    }
  }
  return ("00000000" + h.toString(16)).slice(-8);
}

module.exports = { hashFace };
