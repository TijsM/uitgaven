import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const client = new Anthropic();

const Receipt = z.object({
  description: z.string().describe("Korte omschrijving, bv. 'Boodschappen Albert Heijn' of 'Verf voor slaapkamer'"),
  vendor: z.string().nullable().describe("Winkel of leverancier: exact een bestaande naam als het dezelfde zaak is, anders een korte nieuwe naam zonder adres"),
  date: z.string().nullable().describe("Factuur- of aankoopdatum als YYYY-MM-DD"),
  amount: z.number().nullable().describe("Totaalbedrag inclusief btw"),
  vat: z.number().nullable().describe("Totaal btw-bedrag, null als niet vermeld"),
  category: z.string().nullable().describe("Categorie: kies bij voorkeur een bestaande, maak alleen een nieuwe als niets past"),
  notes: z.string().nullable().describe("Meestal null. Alleen iets wat afwijkt en belangrijk is (bv. valuta geen EUR, factuur op bedrijfsnaam). Geen samenvatting, controle of betaalwijze"),
});

export type Receipt = z.infer<typeof Receipt>;

export async function extractReceipt(file: Blob, categories: string[], vendors: string[]): Promise<Receipt> {
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const source =
    file.type === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data } } as const)
      : ({
          type: "image",
          source: { type: "base64", media_type: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data },
        } as const);

  const response = await client.beta.messages.parse({
    model: "claude-sonnet-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(Receipt) },
    messages: [
      {
        role: "user",
        content: [
          source,
          {
            type: "text",
            text:
              "Lees deze factuur of kassabon uit voor een huishoudelijke uitgavenlijst. Schrijf in het Nederlands.\n" +
              `Bestaande categorieën: ${categories.length ? categories.join(", ") : "(nog geen)"}\n` +
              `Bestaande leveranciers: ${vendors.length ? vendors.join(", ") : "(nog geen)"}`,
          },
        ],
      },
    ],
  });

  if (!response.parsed_output) throw new Error(`Geen resultaat (stop_reason: ${response.stop_reason})`);
  return response.parsed_output;
}
