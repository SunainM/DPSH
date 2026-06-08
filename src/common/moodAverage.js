/**
 * Average mood environment settings across multiple users.
 * @param {Array<{temp_c, temp_k, luminosity}>} entries  Pre-fetched mood objects from DB
 * @returns {{temp_c, temp_k, luminosity}|null}  Averaged settings, or null if no valid entries
 */
function averageMoods(entries) {
  let totalC = 0, totalK = 0, totalLum = 0, count = 0;

  for (const m of entries) {
    const c   = Number(m?.temp_c);
    const k   = Number(m?.temp_k);
    const lum = Number(m?.luminosity);
    if (isNaN(c) || isNaN(k) || isNaN(lum)) continue;
    if (m.temp_c == null || m.temp_k == null || m.luminosity == null) continue;
    totalC   += c;
    totalK   += k;
    totalLum += lum;
    count++;
  }

  if (count === 0) return null;

  return {
    temp_c:     Number((totalC   / count).toFixed(1)),
    temp_k:     Math.round(totalK   / count),
    luminosity: Math.round(totalLum / count),
  };
}

module.exports = { averageMoods };
