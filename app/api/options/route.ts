import { authorized, unauthorized } from "@/lib/auth";
import { selectOptions } from "@/lib/notion";

export async function GET(req: Request) {
  if (!authorized(req)) return unauthorized();
  const [paymentMethods, categories] = await Promise.all([selectOptions("Betaalmethode"), selectOptions("Categorie")]);
  return Response.json({ paymentMethods, categories });
}
