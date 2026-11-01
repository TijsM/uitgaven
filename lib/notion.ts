import { Client, isFullPage, type PageObjectResponse } from "@notionhq/client";

export const notion = new Client({ auth: process.env.NOTION_TOKEN });

const dataSourceId = () => process.env.NOTION_DATA_SOURCE_ID!;

// Existing options of a select property, read live so options added in Notion show up too.
export async function selectOptions(property: string): Promise<string[]> {
  const ds = await notion.dataSources.retrieve({ data_source_id: dataSourceId() });
  const prop = ds.properties[property];
  return prop?.type === "select" ? prop.select.options.map((o) => o.name) : [];
}

export type ExpenseRow = {
  id: string;
  url: string;
  description: string;
  vendor: string | null;
  date: string | null;
  amount: number | null;
  category: string | null;
  paymentMethod: string | null;
};

type Prop = PageObjectResponse["properties"][string];
const plain = (p?: Prop) =>
  p?.type === "title" ? p.title.map((t) => t.plain_text).join("") : p?.type === "rich_text" ? p.rich_text.map((t) => t.plain_text).join("") : "";
const select = (p?: Prop) => (p?.type === "select" ? (p.select?.name ?? null) : null);

// Checkbox marking a row as "still to add": an expense we know about but don't have the invoice of yet.
// Those rows are kept out of the expense overview until the invoice is attached.
const TODO = "Nog toe te voegen";

export type TodoRow = {
  id: string;
  url: string;
  description: string;
  vendor: string | null;
  amount: number | null;
  notes: string | null;
};

const toRow = (page: PageObjectResponse) => {
  const p = page.properties;
  return {
    id: page.id,
    url: page.url,
    description: plain(p.Omschrijving),
    vendor: select(p.Leverancier),
    date: p.Datum?.type === "date" ? (p.Datum.date?.start ?? null) : null,
    amount: p.Bedrag?.type === "number" ? p.Bedrag.number : null,
    category: select(p.Categorie),
    paymentMethod: select(p.Betaalmethode),
    notes: plain(p.Notities) || null,
  };
};

// Latest expenses (newest date first), the items still to add, and a link to the database itself.
export async function listExpenses(): Promise<{ expenses: ExpenseRow[]; todos: TodoRow[]; databaseUrl: string | null }> {
  const ds = await notion.dataSources.retrieve({ data_source_id: dataSourceId() });
  const hasTodo = ds.properties[TODO]?.type === "checkbox";

  const [res, todoRes] = await Promise.all([
    notion.dataSources.query({
      data_source_id: dataSourceId(),
      ...(hasTodo && { filter: { property: TODO, checkbox: { equals: false } } }),
      sorts: [
        { property: "Datum", direction: "descending" },
        { timestamp: "created_time", direction: "descending" },
      ],
      page_size: 50,
    }),
    hasTodo
      ? notion.dataSources.query({
          data_source_id: dataSourceId(),
          filter: { property: TODO, checkbox: { equals: true } },
          sorts: [{ timestamp: "created_time", direction: "ascending" }],
          page_size: 100,
        })
      : null,
  ]);

  const expenses = res.results.filter(isFullPage).map((page) => {
    const { notes, ...row } = toRow(page);
    return row;
  });
  const todos = (todoRes?.results ?? [])
    .filter(isFullPage)
    .map(toRow)
    .map(({ id, url, description, vendor, amount, notes }) => ({ id, url, description, vendor, amount, notes }));

  const databaseUrl =
    "parent" in ds && ds.parent.type === "database_id" ?`https://www.notion.so/${ds.parent.database_id.replace(/-/g, "")}` : null;
  return { expenses, todos, databaseUrl };
}

// Adds the checkbox to the database the first time an item is put on the list.
async function ensureTodoProperty() {
  const ds = await notion.dataSources.retrieve({ data_source_id: dataSourceId() });
  if (ds.properties[TODO]?.type === "checkbox") return;
  await notion.dataSources.update({ data_source_id: dataSourceId(), properties: { [TODO]: { checkbox: {} } } });
}

export async function createTodo(t: { description: string; vendor?: string | null; amount?: number | null }) {
  await ensureTodoProperty();
  await notion.pages.create({
    parent: { type: "data_source_id", data_source_id: dataSourceId() },
    properties: {
      Omschrijving: { title: text(t.description) },
      ...(t.vendor && { Leverancier: { select: { name: t.vendor.slice(0, 100) } } }),
      ...(t.amount != null && { Bedrag: { number: t.amount } }),
      [TODO]: { checkbox: true },
    },
  });
}

export async function deleteTodo(id: string) {
  await notion.pages.update({ page_id: id, in_trash: true });
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
  paymentMethod?: string | null;
  fileUploadId?: string | null;
  filename: string;
  // Set when this expense fills in an item from the "nog toe te voegen" list: that row is completed instead.
  todoId?: string | null;
};

// Select values that don't exist yet are created by Notion automatically.
export async function createExpense(e: Expense) {
  const properties = {
    Omschrijving: { title: text(e.description) },
    ...(e.vendor && { Leverancier: { select: { name: e.vendor.slice(0, 100) } } }),
    ...(e.date && { Datum: { date: { start: e.date } } }),
    ...(e.amount != null && { Bedrag: { number: e.amount } }),
    ...(e.vat != null && { BTW: { number: e.vat } }),
    ...(e.category && { Categorie: { select: { name: e.category } } }),
    ...(e.notes && { Notities: { rich_text: text(e.notes) } }),
    ...(e.paidBy && { "Betaald door": { select: { name: e.paidBy } } }),
    ...(e.paymentMethod && { Betaalmethode: { select: { name: e.paymentMethod } } }),
    ...(e.fileUploadId && {
      Bon: { files: [{ type: "file_upload" as const, file_upload: { id: e.fileUploadId }, name: e.filename }] },
    }),
  };
  if (e.todoId) {
    await notion.pages.update({ page_id: e.todoId, properties: { ...properties, [TODO]: { checkbox: false } } });
  } else {
    await notion.pages.create({ parent: { type: "data_source_id", data_source_id: dataSourceId() }, properties });
  }
}
