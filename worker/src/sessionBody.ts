/** Drop the raw DB session token from Better Auth get-session JSON. */
export async function stripGetSessionToken(
  res: Response,
  pathname: string,
): Promise<Response> {
  if (!pathname.endsWith("/get-session")) return res;
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("json")) return res;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return new Response(null, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  }
  if (body && typeof body === "object") {
    const session = (body as { session?: unknown }).session;
    if (session && typeof session === "object" && session !== null && "token" in session) {
      delete (session as { token?: unknown }).token;
    }
  }
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(JSON.stringify(body), {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
