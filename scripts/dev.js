import { spawn } from "node:child_process";

const port = Number(process.env.PORT || 3000);

console.log("[dev] starting next dev on", {
  host: "0.0.0.0",
  port
});

const child = spawn(
  "npx",
  ["next", "dev", "-H", "0.0.0.0", "-p", String(port)],
  { stdio: "inherit" }
);

child.on("exit", (code) => process.exit(code ?? 0));
