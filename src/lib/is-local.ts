export function isLocal(): boolean {
  const host = window.location.hostname;
  return /^(localhost|127\.0\.0\.1|10\.|192\.168\.)/.test(host) || host.endsWith('.localhost');
}
