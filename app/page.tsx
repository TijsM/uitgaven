"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Receipt } from "@/lib/extract";
import type { Expense, ExpenseRow, TodoRow } from "@/lib/notion";
import { dequeue, enqueue, readOutbox, type Queued } from "@/lib/outbox";
import { InstallPrompt } from "./install-prompt";

type Row = ExpenseRow & { pending?: boolean };

type Draft = {
  description: string;
  vendor: string;
  date: string;
  amount: string;
  vat: number | null;
  category: string;
  notes: string;
};

const emptyDraft: Draft = { description: "", vendor: "", date: "", amount: "", vat: null, category: "", notes: "" };

const money = (n: number | null) => (n == null ? "" : n.toFixed(2).replace(".", ","));
const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
const monthLabel = (ym: string) => {
  const label = new Date(`${ym}-01T12:00:00`).toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
};
const shortDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
// The fields an expense needs to count as complete; anything missing is highlighted in the overview.
const missingFields = (e: { amount: number | null; date: string | null; paymentMethod: string | null }) =>
  [e.amount == null && "bedrag", !e.date && "datum", !e.paymentMethod && "betaalmethode"].filter(Boolean) as string[];

const parseMoney = (s: string) => (s.trim() ? Number(s.replace(/\s/g, "").replace(",", ".")) : null);

// Shrink phone photos before upload: faster to send and well within API limits.
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

// Notion-style picker: existing options as chips, plus creating a new one.
// Values not yet in Notion get a "nieuw" badge so it's clear an option will be created.
function Choice({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const isNew = !!value && !options.includes(value);
  const all = isNew ? [value, ...options] : options;

  return (
    <div className="chips">
      {all.map((name) => (
        <button
          type="button"
          key={name}
          className={name === value ? "chip on" : "chip"}
          // tapping the selected chip again clears it
          onClick={() => onChange(name === value ? "" : name)}
        >
          {name}
          {isNew && name === value && <span className="badge">nieuw</span>}
        </button>
      ))}
      {adding ? (
        <input
          className="chip-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
          onBlur={() => {
            if (text.trim()) onChange(text.trim());
            setText("");
            setAdding(false);
          }}
          placeholder={placeholder}
          autoFocus
        />
      ) : (
        <button type="button" className="chip add" onClick={() => setAdding(true)}>
          + Nieuw
        </button>
      )}
    </div>
  );
}

// Text field with a dropdown of existing options. Opening it shows every option;
// typing filters the list, and anything typed that isn't in it becomes a new option.
function Combo({
  options,
  value,
  onChange,
  disabled,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const shown = options.filter((o) => o.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="combo">
      <input
        value={value}
        disabled={disabled}
        onFocus={() => {
          setFilter("");
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          onChange(e.target.value);
          setFilter(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
      />
      {open && shown.length > 0 && (
        <ul className="combo-list">
          {shown.map((o) => (
            <li
              key={o}
              className={o === value ? "on" : undefined}
              // mousedown fires before the input's blur, so the pick isn't lost
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(o);
                setOpen(false);
                (document.activeElement as HTMLElement | null)?.blur();
              }}
            >
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Textarea that grows with its content. singleLine turns Enter into "done" instead of a newline.
function AutoText({
  value,
  onChange,
  singleLine,
  ...props
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> & {
  value: string;
  onChange: (v: string) => void;
  singleLine?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);

  return (
    <textarea
      {...props}
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(singleLine ? e.target.value.replace(/\n/g, " ") : e.target.value)}
      onKeyDown={(e) => singleLine && e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
    />
  );
}

export default function Home() {
  const [password, setPassword] = useState<string | null>(null);
  const [methods, setMethods] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [vendors, setVendors] = useState<string[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[] | null>(null);
  const [databaseUrl, setDatabaseUrl] = useState<string | null>(null);
  const [todos, setTodos] = useState<TodoRow[] | null>(null);
  const [newTodo, setNewTodo] = useState({ description: "", amount: "" });
  const [addingTodo, setAddingTodo] = useState(false);
  // The "nog toe te voegen" item whose invoice is being added, if any
  const [todo, setTodo] = useState<TodoRow | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [manual, setManual] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [upload, setUpload] = useState<{ fileUploadId: string | null; filename: string } | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [method, setMethod] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [outbox, setOutbox] = useState<Queued[]>([]);
  const syncing = useRef(false);

  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPassword(localStorage.getItem("password") ?? "");
    setMethod(localStorage.getItem("method") ?? "");
  }, []);

  useEffect(() => {
    if (!password) return;
    loadOptions(password).catch(() => {});
    loadExpenses(password).catch(() => {});
    setOutbox(readOutbox());
    setOnline(navigator.onLine);
    sync(password);

    const onOnline = () => {
      setOnline(true);
      sync(password);
      loadOptions(password).catch(() => {});
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => document.visibilityState === "visible" && navigator.onLine && sync(password);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [password]);

  // Send expenses that were saved offline, oldest first. Stops at the first failure and retries later.
  async function sync(pw: string) {
    if (syncing.current || !navigator.onLine || readOutbox().length === 0) return;
    syncing.current = true;
    let sent = 0;
    try {
      for (const item of readOutbox()) {
        const res = await fetch("/api/expense", {
          method: "POST",
          headers: { "content-type": "application/json", "x-app-password": pw },
          body: JSON.stringify(item.expense),
        });
        if (!res.ok) break;
        setOutbox(dequeue(item.id));
        sent++;
      }
    } catch {
      // still offline; next online/visibility event retries
    } finally {
      syncing.current = false;
    }
    if (sent > 0) {
      setStatus(`✓ ${sent} offline ${sent === 1 ? "uitgave" : "uitgaven"} gesynchroniseerd met Notion`);
      loadExpenses(pw).catch(() => {});
    }
  }

  async function api(path: string, init: RequestInit = {}) {
    const res = await fetch(path, { ...init, headers: { ...init.headers, "x-app-password": password! } });
    if (res.status === 401) {
      localStorage.removeItem("password");
      setPassword("");
      throw new Error("unauthorized");
    }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function loadExpenses(pw: string) {
    const res = await fetch("/api/expenses", { headers: { "x-app-password": pw } });
    if (!res.ok) return;
    const data = await res.json();
    setExpenses(data.expenses);
    setTodos(data.todos ?? []);
    setDatabaseUrl(data.databaseUrl);
  }

  async function loadOptions(pw: string) {
    const res = await fetch("/api/options", { headers: { "x-app-password": pw } });
    if (res.status === 401) return setPassword("");
    const data = await res.json();
    setMethods(data.paymentMethods);
    // Forget a remembered payment method that was removed in Notion
    const remembered = localStorage.getItem("method");
    if (remembered && !data.paymentMethods.includes(remembered)) {
      localStorage.removeItem("method");
      setMethod((m) => (m === remembered ? "" : m));
    }
    setCategories(data.categories);
    setVendors(data.vendors);
  }

  async function start(picked: File | undefined) {
    if (!picked) return;
    setStatus(null);
    setFile(picked);
    setPreview(picked.type.startsWith("image/") ? URL.createObjectURL(picked) : null);
    // When completing a "nog toe te voegen" item, start from what was noted down for it
    const base: Draft = todo
      ? { ...emptyDraft, description: todo.description, vendor: todo.vendor ?? "", amount: money(todo.amount), notes: todo.notes ?? "" }
      : emptyDraft;
    setDraft(base);
    setUpload(null);
    setAnalyzing(true);
    try {
      const form = new FormData();
      form.set("file", await shrink(picked));
      const res: { fileUploadId: string | null; filename: string; receipt: Receipt | null } = await api("/api/analyze", {
        method: "POST",
        body: form,
      });
      setUpload({ fileUploadId: res.fileUploadId, filename: res.filename });
      const r = res.receipt;
      if (r)
        setDraft({
          description: base.description || r.description,
          vendor: r.vendor ?? base.vendor,
          date: r.date ?? "",
          amount: r.amount != null ? money(r.amount) : base.amount,
          vat: r.vat,
          category: r.category ?? "",
          notes: r.notes ?? base.notes,
        });
      else setStatus("Kon de bon niet lezen, vul hem zelf in.");
    } catch {
      setStatus("Uploaden mislukt, vul hem zelf in of probeer opnieuw.");
      setUpload({ fileUploadId: null, filename: picked.name });
    } finally {
      setAnalyzing(false);
    }
  }

  function startManual() {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setStatus(null);
    setUpload(null);
    setDraft({ ...emptyDraft, date: today });
    setManual(true);
  }

  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setManual(false);
    setTodo(null);
    setFile(null);
    setPreview(null);
    if (camera.current) camera.current.value = "";
    if (picker.current) picker.current.value = "";
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const expense: Expense = {
      description: draft.description,
      vendor: draft.vendor.trim() || null,
      date: draft.date || null,
      amount: parseMoney(draft.amount),
      vat: draft.vat,
      category: draft.category || null,
      notes: draft.notes || null,
      paymentMethod: method || null,
      fileUploadId: upload?.fileUploadId,
      filename: upload?.filename ?? file?.name ?? "",
      todoId: todo?.id,
    };
    let queued = false;
    try {
      if (!navigator.onLine) {
        setOutbox(enqueue(expense));
        queued = true;
      } else {
        try {
          await api("/api/expense", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(expense),
          });
        } catch (err) {
          // fetch throws a TypeError when there's no connection at all: keep it for later
          if (!(err instanceof TypeError)) throw err;
          setOutbox(enqueue(expense));
          queued = true;
        }
      }
      if (method) localStorage.setItem("method", method);
      const add = (list: string[], v: string) => (v && !list.includes(v) ? [...list, v] : list);
      setMethods(add(methods, method));
      setCategories(add(categories, draft.category));
      setVendors(add(vendors, draft.vendor.trim()));
      if (todo) setTodos((list) => list?.filter((t) => t.id !== todo.id) ?? null);
      reset();
      if (queued) {
        setStatus("📴 Offline bewaard, wordt naar Notion gestuurd zodra je weer online bent");
      } else {
        setStatus("✓ Opgeslagen in Notion");
        loadExpenses(password!).catch(() => {});
      }
    } catch {
      setStatus("❌ Opslaan mislukt, probeer opnieuw");
    } finally {
      setSaving(false);
    }
  }

  // Opens the camera or file picker; for a "nog toe te voegen" item the result completes that item.
  function pick(input: React.RefObject<HTMLInputElement | null>, forTodo: TodoRow | null) {
    setTodo(forTodo);
    input.current?.click();
  }

  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    if (!newTodo.description.trim()) return;
    setAddingTodo(true);
    try {
      await api("/api/todos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: newTodo.description.trim(), amount: parseMoney(newTodo.amount) }),
      });
      setNewTodo({ description: "", amount: "" });
      await loadExpenses(password!);
    } catch {
      setStatus("❌ Toevoegen mislukt, probeer opnieuw");
    } finally {
      setAddingTodo(false);
    }
  }

  async function removeTodo(t: TodoRow) {
    if (!confirm(`„${t.description}" van de lijst halen?`)) return;
    setTodos((list) => list?.filter((x) => x.id !== t.id) ?? null);
    try {
      await api(`/api/todos?id=${encodeURIComponent(t.id)}`, { method: "DELETE" });
    } catch {
      setStatus("❌ Verwijderen mislukt");
      loadExpenses(password!).catch(() => {});
    }
  }

  const set = (key: "date" | "amount") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft({ ...draft, [key]: e.target.value });

  if (password === null) return null;

  if (!password)
    return (
      <main>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const value = new FormData(e.currentTarget).get("password") as string;
            localStorage.setItem("password", value);
            setPassword(value);
          }}
        >
          <h1>Uitgaven</h1>
          <InstallPrompt />
          <input name="password" type="password" placeholder="Wachtwoord" autoFocus />
          <button className="primary">Inloggen</button>
        </form>
      </main>
    );

  const inputs = (
    <>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => start(e.target.files?.[0])} />
      <input ref={picker} type="file" accept="image/*,application/pdf" hidden onChange={(e) => start(e.target.files?.[0])} />
    </>
  );

  if (!file && !manual) {
    // Group by the month of the receipt date (list is already sorted newest first)
    const pending: Row[] = outbox.map((q) => ({
      id: q.id,
      url: "",
      description: q.expense.description,
      vendor: q.expense.vendor ?? null,
      date: q.expense.date ?? null,
      amount: q.expense.amount ?? null,
      category: q.expense.category ?? null,
      paymentMethod: q.expense.paymentMethod ?? null,
      pending: true,
    }));
    const rows: Row[] = [...pending, ...(expenses ?? [])].sort((a, b) =>
      (b.date ?? "").localeCompare(a.date ?? ""),
    );
    const groups = new Map<string, Row[]>();
    for (const e of rows) {
      const key = e.date?.slice(0, 7) ?? "";
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    const incomplete = rows.filter((e) => missingFields(e).length > 0).length;

    return (
      <main>
        <h1>Uitgaven</h1>
        <InstallPrompt />
        {!online && (
          <p className="offline-note">📴 Offline. Handmatig toevoegen werkt; het wordt verstuurd zodra je weer online bent.</p>
        )}
        <button className="primary big" disabled={!online} onClick={() => pick(camera, null)}>
          📷 Foto maken
        </button>
        <div className="row">
          <button className="secondary" disabled={!online} onClick={() => pick(picker, null)}>
            📄 Bestand kiezen
          </button>
          <button className="secondary" onClick={startManual}>
            ✍️ Handmatig
          </button>
        </div>
        {inputs}
        {status && <p className="status">{status}</p>}

        <section className="overview">
          <label>Nog toe te voegen</label>
          {todos && todos.length > 0 && (
            <ul className="expenses todos">
              {todos.map((t) => (
                <li key={t.id}>
                  <div className="expense-row">
                    <a className="expense-main" href={t.url} target="_blank" rel="noreferrer">
                      <span className="expense-title">{t.description || "Zonder omschrijving"}</span>
                      {(t.vendor || t.amount != null) && (
                        <span className="expense-meta">
                          {[t.vendor, t.amount != null && `± ${euro(t.amount)}`].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </a>
                    <button className="secondary small" disabled={!online} onClick={() => pick(picker, t)}>
                      📎 Factuur
                    </button>
                    <button className="icon-button" aria-label="Verwijderen" disabled={!online} onClick={() => removeTodo(t)}>
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form className="todo-add" onSubmit={addTodo}>
            <input
              value={newTodo.description}
              onChange={(e) => setNewTodo({ ...newTodo, description: e.target.value })}
              placeholder="Nog geen factuur van…"
              disabled={!online || addingTodo}
            />
            <input
              className="todo-amount"
              value={newTodo.amount}
              onChange={(e) => setNewTodo({ ...newTodo, amount: e.target.value })}
              placeholder="€"
              inputMode="decimal"
              disabled={!online || addingTodo}
            />
            <button className="primary" disabled={!online || addingTodo || !newTodo.description.trim()}>
              {addingTodo ? "…" : "+"}
            </button>
          </form>
        </section>

        <section className="overview">
          <label>Laatste uitgaven</label>
          {incomplete > 0 && (
            <p className="incomplete-note">
              ⚠️ {incomplete} {incomplete === 1 ? "uitgave is" : "uitgaven zijn"} nog niet compleet
            </p>
          )}
          {outbox.length > 0 && (
            <p className="pending-note">
              ⏳ {outbox.length} {outbox.length === 1 ? "uitgave wacht" : "uitgaven wachten"} op verbinding
            </p>
          )}
          {expenses === null && pending.length === 0 ? (
            <p className="hint">{online ? "Laden…" : "Offline: nog geen opgeslagen overzicht."}</p>
          ) : rows.length === 0 ? (
            <p className="hint">Nog geen uitgaven.</p>
          ) : (
            [...groups].map(([key, items]) => (
              <div key={key || "none"} className="month-group">
                <div className="month-head">
                  <span>{key ? monthLabel(key) : "Zonder datum"}</span>
                  <span>{euro(items.reduce((sum, e) => sum + (e.amount ?? 0), 0))}</span>
                </div>
                <ul className="expenses">
                  {items.map((e) => {
                    const missing = missingFields(e);
                    const content = (
                      <>
                        <div className="expense-main">
                          <span className="expense-title">{e.description || "Zonder omschrijving"}</span>
                          <span className="expense-meta">
                            {[e.date && shortDate(e.date), e.vendor, e.paymentMethod].filter(Boolean).join(" · ")}
                          </span>
                          {e.pending && <span className="expense-pending">⏳ Wacht op sync</span>}
                          {missing.length > 0 && (
                            <span className="expense-missing">Ontbreekt: {missing.join(", ")}</span>
                          )}
                        </div>
                        <span className="expense-amount">{e.amount != null ? euro(e.amount) : "–"}</span>
                      </>
                    );
                    const classes = [missing.length && "incomplete", e.pending && "pending"].filter(Boolean).join(" ");
                    return (
                      <li key={e.id} className={classes || undefined}>
                        {e.pending ? (
                          <div className="expense-row">{content}</div>
                        ) : (
                          <a className="expense-row" href={e.url} target="_blank" rel="noreferrer">
                            {content}
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
          {databaseUrl && (
            <a className="secondary table-link" href={databaseUrl} target="_blank" rel="noreferrer">
              📊 Open tabel in Notion ↗
            </a>
          )}
        </section>
      </main>
    );
  }

  const newVendor = !!draft.vendor.trim() && !vendors.includes(draft.vendor.trim());

  return (
    <main>
      <form className={analyzing ? "review analyzing" : "review"} onSubmit={save}>
        {file ? (
          <div className="preview">
            {preview ? <img src={preview} alt="Bon" /> : <span className="doc">📄 {file.name}</span>}
            {analyzing && (
              <div className="scan">
                <div className="scan-line" />
                <span className="scan-label">Bon wordt gelezen…</span>
              </div>
            )}
          </div>
        ) : (
          <h1>Nieuwe uitgave</h1>
        )}
        {todo && <p className="todo-note">📌 Factuur voor „{todo.description}" uit nog toe te voegen</p>}
        {status && <p className="status">{status}</p>}

        <section>
          <label>Omschrijving</label>
          <AutoText
            value={draft.description}
            onChange={(description) => setDraft({ ...draft, description })}
            singleLine
            autoFocus={manual}
            required
            disabled={analyzing}
          />
        </section>
        <div className="row">
          <section>
            <label>Totaal bedrag €</label>
            <input value={draft.amount} onChange={set("amount")} inputMode="decimal" disabled={analyzing} />
            {draft.vat != null && <p className="hint">waarvan btw € {money(draft.vat)}</p>}
          </section>
          <section>
            <label>Datum</label>
            <input type="date" value={draft.date} onChange={set("date")} disabled={analyzing} />
          </section>
        </div>
        <section>
          <label>
            Leverancier {newVendor && !analyzing && <span className="badge">nieuw</span>}
          </label>
          <Combo
            options={vendors}
            value={draft.vendor}
            onChange={(vendor) => setDraft({ ...draft, vendor })}
            disabled={analyzing}
          />
        </section>
        <section>
          <label>Categorie</label>
          <Choice
            options={categories}
            value={draft.category}
            onChange={(category) => setDraft({ ...draft, category })}
            placeholder="Nieuwe categorie"
          />
        </section>
        <section>
          <label>Betaalmethode</label>
          <Choice options={methods} value={method} onChange={setMethod} placeholder="Nieuwe rekening" />
        </section>
        <section>
          <label>Notities</label>
          <AutoText value={draft.notes} onChange={(notes) => setDraft({ ...draft, notes })} disabled={analyzing} />
        </section>

        <div className="actions">
          <button type="button" className="secondary" onClick={reset} disabled={saving}>
            Annuleren
          </button>
          <button className="primary" disabled={analyzing || saving || !draft.description.trim()}>
            {saving
              ? "Opslaan…"
              : analyzing
                ? "Bon wordt gelezen…"
                : !draft.description.trim()
                  ? "Vul een omschrijving in"
                  : missingFields({ amount: parseMoney(draft.amount), date: draft.date || null, paymentMethod: method || null }).length
                    ? "Opslaan als onvolledig"
                    : "Opslaan"}
          </button>
        </div>
      </form>
      {inputs}
    </main>
  );
}
