const REQUIRED_VARS = ["BROKER_URL", "MONGO_URL", "DB_NAME", "FACE_COLL", "MOOD_COLL"];

/**
 * Check that all required env vars are present and non-empty.
 * @param {string[]} vars   Variable names to check (defaults to REQUIRED_VARS)
 * @param {object}   env    Env object to read from (defaults to process.env)
 */
function checkRequiredEnv(vars = REQUIRED_VARS, env = process.env) {
  const missing = vars.filter(k => !env[k]);
  return { ok: missing.length === 0, missing };
}

module.exports = { checkRequiredEnv, REQUIRED_VARS };
