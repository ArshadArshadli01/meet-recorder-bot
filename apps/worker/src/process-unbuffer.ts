/**
 * In Docker, stdout/stderr are pipes — Node uses block buffering and logs can appear "empty"
 * until the buffer fills. Prefer synchronous/blocking writes so `docker logs` shows lines immediately.
 */
try {
  for (const stream of [process.stdout, process.stderr]) {
    if (stream.isTTY) continue;
    const handle = (
      stream as NodeJS.WriteStream & {
        _handle?: { setBlocking?: (flag: boolean) => void };
      }
    )._handle;
    handle?.setBlocking?.(true);
  }
} catch {
  /* ignore */
}
