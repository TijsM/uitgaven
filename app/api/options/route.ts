import { authorized, unauthorized } from "@/lib/auth";
import { selectOptions } from "@/lib/notion";

export async function GET(req: Request) {
  if (!authorized(req)) return unauthorized();
  const [paymentMethods, categories, vendors] = await Promise.all([
    selectOptions("Betaalmethode"),
    selectOptions("Categorie"),
    selectOptions("Leverancier"),
  ]);
  return Response.json({ paymentMethods, categories, vendors });
}
