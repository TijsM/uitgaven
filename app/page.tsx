"use client";

import { useEffect, useRef, useState } from "react";

const PAID_BY = ["Tijs", "Amber"];

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

export default function Home() {
  const [password, setPassword] = useState<string | null>(null);
  const [paidBy, setPaidBy] = useState(PAID_BY[0]);
  const [method, setMethod] = useState("");
  const [methods, setMethods] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [newMethod, setNewMethod] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPassword(localStorage.getItem("password") ?? "");
    setPaidBy(localStorage.getItem("paidBy") ?? PAID_BY[0]);
    setMethod(localStorage.getItem("method") ?? "");
  }, []);

  useEffect(() => {
    if (!password) return;
    fetch("/api/options", { headers: { "x-app-password": password } }).then(async (res) => {
      if (res.status === 401) return logout();
      const { paymentMethods } = await res.json();
      setMethods(paymentMethods);
    });
  }, [password]);

  function logout() {
    localStorage.removeItem("password");
    setPassword("");
  }

  function pickPaidBy(name: string) {
    setPaidBy(name);
    localStorage.setItem("paidBy", name);
  }

  function pickMethod(name: string) {
    setMethod(name);
    localStorage.setItem("method", name);
    if (!methods.includes(name)) setMethods([...methods, name]);
  }

  async function upload(files: FileList | null) {
    if (!files?.length || !password) return;
    setStatus("Versturen…");
    for (const original of Array.from(files)) {
      const form = new FormData();
      form.set("file", await shrink(original));
      form.set("paidBy", paidBy);
      form.set("paymentMethod", method);
      const res = await fetch("/api/expense", { method: "POST", body: form, headers: { "x-app-password": password } });
      if (res.status === 401) return logout();
      if (!res.ok) return setStatus("❌ Mislukt, probeer opnieuw");
    }
    setStatus(`✓ Opgeslagen, staat zo in Notion`);
    if (input.current) input.current.value = "";
  }

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

  return (
    <main>
      <h1>Uitgaven</h1>

      <section>
        <label>Betaald door</label>
        <div className="chips">
          {PAID_BY.map((name) => (
            <button key={name} className={name === paidBy ? "chip on" : "chip"} onClick={() => pickPaidBy(name)}>
              {name}
            </button>
          ))}
        </div>
      </section>

      <section>
        <label>Betaalmethode</label>
        <div className="chips">
          {methods.map((name) => (
            <button key={name} className={name === method ? "chip on" : "chip"} onClick={() => pickMethod(name)}>
              {name}
            </button>
          ))}
          {adding ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newMethod.trim()) pickMethod(newMethod.trim());
                setNewMethod("");
                setAdding(false);
              }}
            >
              <input
                value={newMethod}
                onChange={(e) => setNewMethod(e.target.value)}
                onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                placeholder="Nieuwe rekening"
                autoFocus
              />
            </form>
          ) : (
            <button className="chip add" onClick={() => setAdding(true)}>
              + Nieuw
            </button>
          )}
        </div>
      </section>

      <button className="primary big" disabled={!method} onClick={() => input.current?.click()}>
        📷 Bon toevoegen
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        multiple
        hidden
        onChange={(e) => upload(e.target.files)}
      />
      {status && <p className="status">{status}</p>}
    </main>
  );
}
