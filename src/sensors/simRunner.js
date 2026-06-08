// Launches all sensor simulators in master mode (each forks per-room children).
const { spawn } = require("child_process");
const path = require("path");

const sims = ["temp.sim.js", "motion.sim.js", "light.sim.js", "facecam.sim.js"];

for (const sim of sims) {
  const child = spawn("node", [path.join(__dirname, "sims", sim)], { stdio: "inherit" });
  child.on("exit", (code, signal) => {
    console.error(`[simRunner] ${sim} exited (code=${code}, signal=${signal})`);
  });
}
