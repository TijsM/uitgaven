import { authorized, unauthorized } from "@/lib/auth";
import { createExpense, type Expense } from "@/lib/notion";

export async function POST(req: Request) {
  if (!authorized(req)) return unauthorized();

  const expense = (await req.json()) as Expense;
  if (!expense.description?.trim()) {
    return Response.json({ error: "Omschrijving is verplicht" }, { status: 400 });
  }

  await createExpense(expense);
  return Response.json({ ok: true });
}
