import { authorized, unauthorized } from "@/lib/auth";
import { createTodo, deleteTodo } from "@/lib/notion";

export async function POST(req: Request) {
  if (!authorized(req)) return unauthorized();

  const todo = (await req.json()) as { description: string; vendor?: string | null; amount?: number | null };
  if (!todo.description?.trim()) {
    return Response.json({ error: "Omschrijving is verplicht" }, { status: 400 });
  }

  await createTodo(todo);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!authorized(req)) return unauthorized();

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Geen id" }, { status: 400 });

  await deleteTodo(id);
  return Response.json({ ok: true });
}
