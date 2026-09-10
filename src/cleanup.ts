import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { z } from "zod";

// Eve hooks handle normal deletion; a terminated service cannot run those hooks.
export async function cleanupSandbox(directory: string) {
  const text = await readFile(join(directory, "sandbox.json"), "utf8").catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    },
  );
  if (!text) return;
  const { id } = z
    .object({ id: z.string().regex(/^eve-sbx-ses-docker-[a-zA-Z0-9_-]+$/) })
    .parse(JSON.parse(text));
  const inspect = spawnSync(
    "docker",
    ["container", "inspect", "--format", '{{index .Config.Labels "eve.sandbox"}}', id],
    { encoding: "utf8", timeout: 10000 },
  );
  if (inspect.status !== 0) {
    if (inspect.stderr?.includes("No such container") || inspect.stderr?.includes("No such object"))
      return;
    throw new Error(
      `Could not inspect review sandbox: ${inspect.error?.message ?? inspect.stderr}`,
    );
  }
  if (inspect.stdout.trim() !== "1")
    throw new Error("Refusing to delete a container without Eve's sandbox label");
  const removed = spawnSync("docker", ["rm", "-f", id], {
    encoding: "utf8",
    timeout: 10000,
  });
  if (removed.status !== 0)
    throw new Error(`Could not remove review sandbox: ${removed.error?.message ?? removed.stderr}`);
}
