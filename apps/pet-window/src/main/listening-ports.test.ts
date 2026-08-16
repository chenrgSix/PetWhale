import { describe, expect, it, vi } from 'vitest';
import {
  listeningPorts,
  listeningPortsCommand,
  parseListeningPorts,
} from './listening-ports';

describe('listeningPortsCommand', () => {
  it('uses lsof on macOS', () => {
    expect(listeningPortsCommand('darwin')).toEqual({
      file: 'lsof',
      args: ['-nP', '-iTCP', '-sTCP:LISTEN'],
    });
  });

  it('keeps the existing Windows netstat path', () => {
    expect(listeningPortsCommand('win32')).toEqual({
      file: 'netstat',
      args: ['-ano', '-p', 'TCP'],
    });
  });
});

describe('parseListeningPorts', () => {
  it('parses IPv4 and IPv6 macOS lsof listeners', () => {
    const stdout = [
      'COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME',
      'node 101 me 20u IPv4 0x123 0t0 TCP 127.0.0.1:5173 (LISTEN)',
      'node 101 me 21u IPv6 0x456 0t0 TCP *:43121 (LISTEN)',
      'node 101 me 22u IPv6 0x789 0t0 TCP [::1]:5173 (LISTEN)',
      'node 101 me 23u IPv4 0xabc 0t0 TCP 127.0.0.1:9000->127.0.0.1:9001 (ESTABLISHED)',
    ].join('\n');

    expect(parseListeningPorts(stdout, 'darwin')).toEqual([5173, 43121]);
  });

  it('parses Windows listeners and ignores non-local addresses', () => {
    const stdout = [
      '  TCP    127.0.0.1:3000       0.0.0.0:0       LISTENING       10',
      '  TCP    0.0.0.0:8080          0.0.0.0:0       LISTENING       11',
      '  TCP    192.168.1.5:9000      0.0.0.0:0       LISTENING       12',
    ].join('\r\n');

    expect(parseListeningPorts(stdout, 'win32')).toEqual([3000, 8080]);
  });
});

describe('listeningPorts', () => {
  it('runs the macOS command and parses its output', async () => {
    const run = vi.fn().mockResolvedValue({
      stdout: 'node 101 me 20u IPv4 0x123 0t0 TCP 127.0.0.1:5173 (LISTEN)',
    });

    await expect(listeningPorts('darwin', run)).resolves.toEqual([5173]);
    expect(run).toHaveBeenCalledWith(
      'lsof',
      ['-nP', '-iTCP', '-sTCP:LISTEN'],
      { timeout: 8000 },
    );
  });
});
