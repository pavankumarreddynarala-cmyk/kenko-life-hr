"use client";

import { useCallback, useEffect, useState } from "react";
import { requestJson } from "@/lib/client-api";

type Category = { id: string; name: string; usefulLifeYears: number; residualPercent: string | number; method: string; defaultTaxBlock: string | null; verified: boolean; active: boolean };
type Block = { id: string; name: string; rate: string | number; verified: boolean; active: boolean };

export default function DepreciationSetupPage() {
  const [cats, setCats] = useState<Category[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [catForm, setCatForm] = useState({ name: "", usefulLifeYears: "", residualPercent: "5", defaultTaxBlock: "" });
  const [blockForm, setBlockForm] = useState({ name: "", rate: "" });
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [editBlock, setEditBlock] = useState<Block | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, b] = await Promise.all([
        requestJson<{ data: Category[] }>("/api/asset-categories", { cache: "no-store" }),
        requestJson<{ data: Block[] }>("/api/tax-blocks", { cache: "no-store" }),
      ]);
      setCats(c.data ?? []);
      setBlocks(b.data ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load the depreciation settings.");
    }
    setLoading(false);
  }, []);
  useEffect(() => void load(), [load]);

  async function send(url: string, method: string, body: unknown, done: string) {
    try {
      await requestJson(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save");
      return false;
    }
    setNotice(done);
    await load();
    return true;
  }

  const unverified = cats.some((c) => !c.verified) || blocks.some((b) => !b.verified);

  return (
    <>
      <div className="mb-6">
        <p className="text-xs font-bold tracking-widest text-kenko-green">ASSET REGISTER</p>
        <h2 className="text-2xl font-bold">Depreciation Setup</h2>
        <p className="text-sm text-stone-500">Useful life, residual value and tax block rates drive the depreciation calculation. Change them here when the law or policy changes.</p>
      </div>
      {unverified && <p className="mb-4 rounded-lg bg-orange-50 p-3 text-sm text-orange-900">Rows marked <b>To verify</b> are starter values. Check them against Schedule II and the Income Tax rates, then save each row to confirm it.</p>}

      <section className="card mb-6 p-0">
        <div className="p-4"><h3 className="font-bold">Asset categories (Companies Act, Schedule II)</h3><p className="text-xs text-stone-500">Straight-line method. Residual value is the share of cost kept at the end of life (default 5%).</p></div>
        <div className="grid gap-2 border-t bg-orange-50 p-4 md:grid-cols-[1.5fr_120px_120px_1.5fr_auto]">
          <input className="input" placeholder="Category name" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
          <input className="input" inputMode="numeric" placeholder="Life (years)" value={catForm.usefulLifeYears} onChange={(e) => setCatForm({ ...catForm, usefulLifeYears: e.target.value.replace(/\D/g, "") })} />
          <input className="input" inputMode="decimal" placeholder="Residual %" value={catForm.residualPercent} onChange={(e) => setCatForm({ ...catForm, residualPercent: e.target.value })} />
          <select className="input" value={catForm.defaultTaxBlock} onChange={(e) => setCatForm({ ...catForm, defaultTaxBlock: e.target.value })}><option value="">Default tax block</option>{blocks.map((b) => <option key={b.id}>{b.name}</option>)}</select>
          <button className="btn-primary" onClick={async () => { if (await send("/api/asset-categories", "POST", catForm, "Category added.")) setCatForm({ name: "", usefulLifeYears: "", residualPercent: "5", defaultTaxBlock: "" }); }}>Add</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-max min-w-full">
            <thead><tr>{["Category", "Life (years)", "Residual %", "Default tax block", "Status", ""].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-stone-500">Loading…</td></tr>}
              {cats.map((c) => editCat?.id === c.id ? (
                <tr key={c.id} className="bg-green-50">
                  <td className="px-4 py-2"><input className="input" value={editCat.name} onChange={(e) => setEditCat({ ...editCat, name: e.target.value })} /></td>
                  <td className="px-4 py-2"><input className="input w-24" inputMode="numeric" value={editCat.usefulLifeYears} onChange={(e) => setEditCat({ ...editCat, usefulLifeYears: Number(e.target.value.replace(/\D/g, "")) })} /></td>
                  <td className="px-4 py-2"><input className="input w-24" inputMode="decimal" value={editCat.residualPercent} onChange={(e) => setEditCat({ ...editCat, residualPercent: e.target.value })} /></td>
                  <td className="px-4 py-2"><select className="input" value={editCat.defaultTaxBlock ?? ""} onChange={(e) => setEditCat({ ...editCat, defaultTaxBlock: e.target.value || null })}><option value="">None</option>{blocks.map((b) => <option key={b.id}>{b.name}</option>)}</select></td>
                  <td className="px-4 py-2"><select className="input" value={editCat.active ? "a" : "i"} onChange={(e) => setEditCat({ ...editCat, active: e.target.value === "a" })}><option value="a">Active</option><option value="i">Inactive</option></select></td>
                  <td className="whitespace-nowrap px-4 py-2"><button className="btn-primary mr-2" onClick={async () => { if (await send(`/api/asset-categories/${c.id}`, "PATCH", { name: editCat.name, usefulLifeYears: editCat.usefulLifeYears, residualPercent: Number(editCat.residualPercent), defaultTaxBlock: editCat.defaultTaxBlock, active: editCat.active }, "Saved and verified.")) setEditCat(null); }}>Save</button><button className="btn" onClick={() => setEditCat(null)}>Cancel</button></td>
                </tr>
              ) : (
                <tr key={c.id}>
                  <td className="px-4 py-3">{c.name}</td><td className="px-4 py-3">{c.usefulLifeYears}</td><td className="px-4 py-3">{String(c.residualPercent)}</td><td className="px-4 py-3">{c.defaultTaxBlock ?? "—"}</td>
                  <td className="px-4 py-3">{c.active ? "Active" : "Inactive"}{!c.verified && <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-800">To verify</span>}</td>
                  <td className="px-4 py-3"><button className="rounded-md bg-stone-100 px-2 py-1 text-kenko-green" onClick={() => setEditCat({ ...c })}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-0">
        <div className="p-4"><h3 className="font-bold">Income Tax blocks (written down value)</h3><p className="text-xs text-stone-500">Rate is the percentage on the block&apos;s written down value. Half rate applies automatically to additions used under 180 days.</p></div>
        <div className="grid gap-2 border-t bg-orange-50 p-4 md:grid-cols-[2fr_160px_auto]">
          <input className="input" placeholder="Block name" value={blockForm.name} onChange={(e) => setBlockForm({ ...blockForm, name: e.target.value })} />
          <input className="input" inputMode="decimal" placeholder="Rate %" value={blockForm.rate} onChange={(e) => setBlockForm({ ...blockForm, rate: e.target.value })} />
          <button className="btn-primary" onClick={async () => { if (await send("/api/tax-blocks", "POST", blockForm, "Block added.")) setBlockForm({ name: "", rate: "" }); }}>Add</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-max min-w-full">
            <thead><tr>{["Block", "Rate %", "Status", ""].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
            <tbody>
              {blocks.map((b) => editBlock?.id === b.id ? (
                <tr key={b.id} className="bg-green-50">
                  <td className="px-4 py-2"><input className="input" value={editBlock.name} onChange={(e) => setEditBlock({ ...editBlock, name: e.target.value })} /></td>
                  <td className="px-4 py-2"><input className="input w-28" inputMode="decimal" value={editBlock.rate} onChange={(e) => setEditBlock({ ...editBlock, rate: e.target.value })} /></td>
                  <td className="px-4 py-2"><select className="input" value={editBlock.active ? "a" : "i"} onChange={(e) => setEditBlock({ ...editBlock, active: e.target.value === "a" })}><option value="a">Active</option><option value="i">Inactive</option></select></td>
                  <td className="whitespace-nowrap px-4 py-2"><button className="btn-primary mr-2" onClick={async () => { if (await send(`/api/tax-blocks/${b.id}`, "PATCH", { name: editBlock.name, rate: Number(editBlock.rate), active: editBlock.active }, "Saved and verified.")) setEditBlock(null); }}>Save</button><button className="btn" onClick={() => setEditBlock(null)}>Cancel</button></td>
                </tr>
              ) : (
                <tr key={b.id}>
                  <td className="px-4 py-3">{b.name}</td><td className="px-4 py-3">{String(b.rate)}</td>
                  <td className="px-4 py-3">{b.active ? "Active" : "Inactive"}{!b.verified && <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-800">To verify</span>}</td>
                  <td className="px-4 py-3"><button className="rounded-md bg-stone-100 px-2 py-1 text-kenko-green" onClick={() => setEditBlock({ ...b })}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {notice && <p className="mt-4 rounded-lg bg-orange-50 p-3 text-sm text-orange-900">{notice}</p>}
    </>
  );
}
