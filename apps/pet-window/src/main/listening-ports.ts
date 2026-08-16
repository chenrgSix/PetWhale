import type { execFile } from 'node:child_process';

export interface ListeningPortsCommand {
  file: string;
  args: string[];
}

/** Return the native command used to enumerate local TCP listeners. */
export function listeningPortsCommand(
  platform: NodeJS.Platform,
): ListeningPortsCommand | null {
  if (platform === 'darwin') {
    return { file: 'lsof', args: ['-nP', '-iTCP', '-sTCP:LISTEN'] };
  }
  if (platform === 'win32') {
    return { file: 'netstat', args: ['-ano', '-p', 'TCP'] };
  }
  return null;
}

/** Parse the output of the platform command into unique TCP port numbers. */
export function parseListeningPorts(
  stdout: string,
  platform: NodeJS.Platform,
): number[] {
  const ports = new Set<number>();

  for (const line of stdout.split(/\r?\n/)) {
    const match =
      platform === 'darwin'
        ? line.match(/\bTCP\s+.+:(\d+)\s+\(LISTEN\)\s*$/)
        : line.match(/^\s*TCP\s+(\S+):(\d+)\s+\S+:\S+\s+LISTENING\b/i);
    if (match === null) continue;

    if (platform === 'win32') {
      const address = match[1] ?? '';
      if (!['127.0.0.1', '0.0.0.0', '[::]', '::'].includes(address)) continue;
    }

    const port = Number(match[platform === 'darwin' ? 1 : 2]);
    if (Number.isInteger(port) && port > 0 && port <= 65_535) ports.add(port);
  }

  return [...ports];
}

export type ExecFileAsync = (
  file: string,
  args: string[],
  options: Parameters<typeof execFile>[2],
) => Promise<{ stdout: string }>;

/** Enumerate TCP listeners without invoking a shell. */
export async function listeningPorts(
  platform: NodeJS.Platform,
  run: ExecFileAsync,
): Promise<number[]> {
  const command = listeningPortsCommand(platform);
  if (command === null) return [];

  try {
    const { stdout } = await run(command.file, command.args, { timeout: 8000 });
    return parseListeningPorts(stdout, platform);
  } catch {
    return [];
  }
}
