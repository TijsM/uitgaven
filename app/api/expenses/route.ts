import { authorized, unauthorized } from "@/lib/auth";
import { listExpenses } from "@/lib/notion";

export async function GET(req: Request) {
  if (!authorized(req)) return unauthorized();
  return Response.json(await listExpenses());
}
