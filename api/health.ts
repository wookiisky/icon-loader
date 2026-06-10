/** Vercel 健康检查接口。 */
export function GET(): Response {
  return Response.json({ ok: true });
}
