import { Client } from "@notionhq/client";

export const notion = new Client({ auth: process.env.NOTION_TOKEN });

const dataSourceId = () => process.env.NOTION_DATA_SOURCE_ID!;

// Existing options of a select property, read live so options added in Notion show up too.
export async function selectOptions(property: string): Promise<string[]> {
  const ds = await notion.dataSources.retrieve({ data_source_id: dataSourceId() });
  const prop = ds.properties[property];
  return prop?.type === "select" ? prop.select.options.map((o) => o.name) : [];
}

export async function uploadFile(file: Blob, filename: string): Promise<string> {
  const upload = await notion.fileUploads.create({
    mode: "single_part",
    filename,
    content_type: file.type,
  });
  await notion.fileUploads.send({ file_upload_id: upload.id, file: { filename, data: file } });
  return upload.id;
}

const text = (content: string) => [{ text: { content: content.slice(0, 2000) } }];

export type Expense = {
  description: string;
  vendor?: string | null;
  date?: string | null;
  amount?: number | null;
  vat?: number | null;
  category?: string | null;
  notes?: string | null;
  paidBy?: string | null;
  paymentMethod: string;
  fileUploadId?: string | null;
  filename: string;
};

// Select values that don't exist yet are created by Notion automatically.
export async function createExpense(e: Expense) {
  await notion.pages.create({
    parent: { type: "data_source_id", data_source_id: dataSourceId() },
    properties: {
      Omschrijving: { title: text(e.description) },
      ...(e.vendor && { Leverancier: { select: { name: e.vendor.slice(0, 100) } } }),
      ...(e.date && { Datum: { date: { start: e.date } } }),
      ...(e.amount != null && { Bedrag: { number: e.amount } }),
      ...(e.vat != null && { BTW: { number: e.vat } }),
      ...(e.category && { Categorie: { select: { name: e.category } } }),
      ...(e.notes && { Notities: { rich_text: text(e.notes) } }),
      ...(e.paidBy && { "Betaald door": { select: { name: e.paidBy } } }),
      Betaalmethode: { select: { name: e.paymentMethod } },
      ...(e.fileUploadId && {
        Bon: { files: [{ type: "file_upload", file_upload: { id: e.fileUploadId }, name: e.filename }] },
      }),
    },
  });
}
