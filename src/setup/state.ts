import { chmod, lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function privateDirectory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.uid !== process.getuid?.() || info.mode & 0o077)
    throw new Error(`Use a private directory owned by your account: ${path}`);
}

export async function readPrivate(path: string): Promise<unknown> {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.uid !== process.getuid?.() || info.mode & 0o077)
      throw new Error(`Use a private file owned by your account: ${path}`);
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function savePrivateText(directory: string, name: string, text: string) {
  const temporary = join(directory, `${name}.${crypto.randomUUID()}.tmp`);
  await writeFile(temporary, text, { mode: 0o600, flag: "wx" });
  await chmod(temporary, 0o600);
  await rename(temporary, join(directory, name));
}

export async function savePrivate(directory: string, name: string, value: unknown) {
  await savePrivateText(directory, name, `${JSON.stringify(value, null, 2)}\n`);
}
