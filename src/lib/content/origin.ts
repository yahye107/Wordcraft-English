/**
 * Guard for routes that change files: a web page on another site must not be able to make the learner's browser
 * post to this local app. A cross-site `Origin` or `Sec-Fetch-Site` is refused. Requests that send neither header
 * (command-line tools, the tests) are allowed.
 */
export function sameOrigin(request: Request): boolean {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (origin === null) return true;
  try {
    const host = request.headers.get('host') ?? new URL(request.url).host;
    return new URL(origin).host === host;
  } catch {
    return false; // "null" and anything that is not a URL
  }
}
