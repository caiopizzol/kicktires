import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

export async function ask(label: string, hidden = false) {
  if (!process.stdin.isTTY) throw new Error("Run setup in an interactive terminal.");
  process.stdout.write(`${label}: `);
  const output = new Writable({
    write(chunk, _encoding, next) {
      if (!hidden) process.stdout.write(chunk);
      next();
    },
  });
  const reader = createInterface({ input: process.stdin, output, terminal: true });
  try {
    return (await reader.question("")).trim();
  } finally {
    reader.close();
    if (hidden) process.stdout.write("\n");
  }
}

export async function openBrowser(url: string) {
  console.log(`Open: ${url}`);
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  if (!Bun.which(command)) return;
  const child = Bun.spawn([command, url], { stdout: "ignore", stderr: "ignore" });
  await child.exited;
}
