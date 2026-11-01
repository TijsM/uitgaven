import { after } from "next/server";
import { authorized, unauthorized } from "@/lib/auth";
import { extractReceipt } from "@/lib/extract";
import { createExpense, selectOptions, uploadFile } from "@/lib/notion";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!authorized(req)) return unauthorized();

  const form = await req.formData();
  const file = form.get("file");
  const paidBy = String(form.get("paidBy") ?? "");
  const paymentMethod = String(form.get("paymentMethod") ?? "").trim();
  if (!(file instanceof File) || !paidBy || !paymentMethod) {
    return Response.json({ error: "Bestand, betaald door en betaalmethode zijn verplicht" }, { status: 400 });
  }

  // Answer right away; uploading, reading the receipt and writing to Notion happen in the background.
  after(async () => {
    const [fileUploadId, receipt] = await Promise.all([
      uploadFile(file, file.name).catch((err) => {
        console.error("Notion upload failed", err);
        return undefined;
      }),
      selectOptions("Categorie")
        .then((categories) => extractReceipt(file, categories))
        .catch((err) => {
          console.error("Extraction failed", err);
          return null;
        }),
    ]);

    await createExpense({
      ...(receipt ?? { description: `⚠️ Niet herkend: ${file.name}` }),
      paidBy,
      paymentMethod,
      fileUploadId,
      filename: file.name,
    });
  });

  return Response.json({ ok: true });
}
