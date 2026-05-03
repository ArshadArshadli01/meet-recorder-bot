/** Unbuffered lines for Docker log drivers (console.log can batch when stdout is not a TTY). */
export function workerLog(line: string): void {
  process.stdout.write(`${line}\n`);
}

export function workerErr(line: string): void {
  process.stderr.write(`${line}\n`);
}
