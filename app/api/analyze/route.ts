import { authorized, unauthorized } from "@/lib/auth";
import { extractReceipt } from "@/lib/extract";
import { selectOptions, uploadFile } from "@/lib/notion";

export const maxDuration = 60;

// Reads the receipt and uploads the file to Notion in parallel, so saving after review is instant.
export async function POST(req: Request) {
  if (!authorized(req)) return unauthorized();

  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return Response.json({ error: "Geen bestand" }, { status: 400 });

  const [fileUploadId, receipt] = await Promise.all([
    uploadFile(file, file.name).catch((err) => {
      console.error("Notion upload failed", err);
      return null;
    }),
    Promise.all([selectOptions("Categorie"), selectOptions("Leverancier")])
      .then(([categories, vendors]) => extractReceipt(file, categories, vendors))
      .catch((err) => {
        console.error("Extraction failed", err);
        return null;
      }),
  ]);

  return Response.json({ fileUploadId, filename: file.name, receipt });
}
