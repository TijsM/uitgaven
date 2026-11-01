export function authorized(req: Request) {
  return !!process.env.APP_PASSWORD && req.headers.get("x-app-password") === process.env.APP_PASSWORD;
}

export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });
