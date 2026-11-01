"use client";

import { useEffect, useRef, useState } from "react";
import type { Receipt } from "@/lib/extract";

const PAID_BY = ["Tijs", "Amber"];

type Draft = {
  description: string;
  vendor: string;
  date: string;
  amount: string;
  vat: string;
  category: string;
  notes: string;
};

const emptyDraft: Draft = { description: "", vendor: "", date: "", amount: "", vat: "", category: "", notes: "" };

const money = (n: number | null) => (n == null ? "" : n.toFixed(2).replace(".", ","));
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
function Choice({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const all = value && !options.includes(value) ? [...options, value] : options;

  return (
    <div className="chips">
      {all.map((name) => (
        <button type="button" key={name} className={name === value ? "chip on" : "chip"} onClick={() => onChange(name)}>
          {name}
        </button>
      ))}
      {placeholder &&
        (adding ? (
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
        ))}
    </div>
  );
}

export default function Home() {
  const [password, setPassword] = useState<string | null>(null);
  const [methods, setMethods] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [upload, setUpload] = useState<{ fileUploadId: string | null; filename: string } | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [paidBy, setPaidBy] = useState(PAID_BY[0]);
  const [method, setMethod] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPassword(localStorage.getItem("password") ?? "");
    setPaidBy(localStorage.getItem("paidBy") ?? PAID_BY[0]);
    setMethod(localStorage.getItem("method") ?? "");
  }, []);

  useEffect(() => {
    if (password) loadOptions(password);
  }, [password]);

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

  async function loadOptions(pw: string) {
    const res = await fetch("/api/options", { headers: { "x-app-password": pw } });
    if (res.status === 401) return setPassword("");
    const data = await res.json();
    setMethods(data.paymentMethods);
    setCategories(data.categories);
  }

  async function start(picked: File | undefined) {
    if (!picked) return;
    setStatus(null);
    setFile(picked);
    setPreview(picked.type.startsWith("image/") ? URL.createObjectURL(picked) : null);
    setDraft(emptyDraft);
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
          description: r.description,
          vendor: r.vendor ?? "",
          date: r.date ?? "",
          amount: money(r.amount),
          vat: money(r.vat),
          category: r.category ?? "",
          notes: r.notes ?? "",
        });
      else setStatus("Kon de bon niet lezen, vul hem zelf in.");
    } catch {
      setStatus("Uploaden mislukt, vul hem zelf in of probeer opnieuw.");
      setUpload({ fileUploadId: null, filename: picked.name });
    } finally {
      setAnalyzing(false);
    }
  }

  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    if (camera.current) camera.current.value = "";
    if (picker.current) picker.current.value = "";
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/expense", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description: draft.description,
          vendor: draft.vendor || null,
          date: draft.date || null,
          amount: parseMoney(draft.amount),
          vat: parseMoney(draft.vat),
          category: draft.category || null,
          notes: draft.notes || null,
          paidBy,
          paymentMethod: method,
          fileUploadId: upload?.fileUploadId,
          filename: upload?.filename ?? file?.name,
        }),
      });
      localStorage.setItem("paidBy", paidBy);
      localStorage.setItem("method", method);
      if (!methods.includes(method)) setMethods([...methods, method]);
      if (draft.category && !categories.includes(draft.category)) setCategories([...categories, draft.category]);
      reset();
      setStatus("✓ Opgeslagen in Notion");
    } catch {
      setStatus("❌ Opslaan mislukt, probeer opnieuw");
    } finally {
      setSaving(false);
    }
  }

  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
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

  if (!file)
    return (
      <main>
        <h1>Uitgaven</h1>
        <button className="primary big" onClick={() => camera.current?.click()}>
          📷 Foto maken
        </button>
        <button className="secondary" onClick={() => picker.current?.click()}>
          📄 Bestand kiezen
        </button>
        {inputs}
        {status && <p className="status">{status}</p>}
      </main>
    );

  const loading = analyzing ? "Wordt gelezen…" : undefined;

  return (
    <main>
      <form className="review" onSubmit={save}>
        <div className="preview">
          {preview ? <img src={preview} alt="Bon" /> : <span>📄 {file.name}</span>}
          {analyzing && <div className="reading">Bon wordt gelezen…</div>}
        </div>
        {status && <p className="status">{status}</p>}

        <section>
          <label>Omschrijving</label>
          <input value={draft.description} onChange={set("description")} placeholder={loading} required disabled={analyzing} />
        </section>
        <div className="row">
          <section>
            <label>Bedrag €</label>
            <input value={draft.amount} onChange={set("amount")} inputMode="decimal" placeholder={loading} disabled={analyzing} />
          </section>
          <section>
            <label>BTW €</label>
            <input value={draft.vat} onChange={set("vat")} inputMode="decimal" disabled={analyzing} />
          </section>
        </div>
        <div className="row">
          <section>
            <label>Datum</label>
            <input type="date" value={draft.date} onChange={set("date")} disabled={analyzing} />
          </section>
          <section>
            <label>Leverancier</label>
            <input value={draft.vendor} onChange={set("vendor")} disabled={analyzing} />
          </section>
        </div>
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
          <label>Betaald door</label>
          <Choice options={PAID_BY} value={paidBy} onChange={setPaidBy} />
        </section>
        <section>
          <label>Betaalmethode</label>
          <Choice options={methods} value={method} onChange={setMethod} placeholder="Nieuwe rekening" />
        </section>
        <section>
          <label>Notities</label>
          <input value={draft.notes} onChange={set("notes")} disabled={analyzing} />
        </section>

        <div className="actions">
          <button type="button" className="secondary" onClick={reset} disabled={saving}>
            Annuleren
          </button>
          <button className="primary" disabled={analyzing || saving || !method || !draft.description.trim()}>
            {saving ? "Opslaan…" : "Opslaan"}
          </button>
        </div>
      </form>
      {inputs}
    </main>
  );
}
