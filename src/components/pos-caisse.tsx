import { useEffect, useMemo, useRef, useState } from "react";
import { BRAND, fmt, StatusBadge, type Product, type Category, type Order, type OrderItem, type SiteSettings } from "@/components/shared-deps";

/* ════════════════════════════════════════════════════════════════════════════
   MODULE CAISSE (POS) — PROTOTYPE FRONT-END
   Tout est gardé en state React (aucun backend). Les règles marquées
   "serveur" ci-dessous devront être refaites côté API quand le backend existera.
   ════════════════════════════════════════════════════════════════════════════ */

/* ───────────── Types ───────────── */
export type Role = "Vendeur" | "Responsable" | "Administrateur";
export const ROLE_USERS: Record<Role, string> = {
  Vendeur: "Amina (vendeuse)",
  Responsable: "Karim (responsable)",
  Administrateur: "Admin",
};
// Remise maximale autorisée par rôle (en %)
export const MAX_DISCOUNT: Record<Role, number> = { Vendeur: 0, Responsable: 20, Administrateur: 100 };
export const PAY_METHODS = ["Espèces", "Carte bancaire", "Edahabia", "CIB"] as const;

export type Payment = { method: string; amount: number; ref?: string };
export type SaleLine = { productId: number; name: string; unit: string; unitPrice: number; qty: number; total: number };
export type Sale = {
  id: string;
  key: string; // clé d'idempotence : empêche les doubles ventes
  sessionId: number;
  createdAt: string;
  seller: string;
  lines: SaleLine[];
  subtotal: number;
  discountPct: number;
  discount: number;
  total: number;
  payments: Payment[];
  cashReceived: number;
  change: number;
  status: "Finalisée" | "Remboursée";
  refundedAt?: string;
  refundedBy?: string;
  refundReason?: string;
  refundSessionId?: number;
};
export type NewSale = Omit<Sale, "id" | "status">;
export type Session = {
  id: number;
  seller: string;
  openedAt: string;
  openingFloat: number;
  closedAt?: string;
  closedBy?: string;
  countedCash?: number;
  expectedCash?: number;
  gap?: number;
  comment?: string;
};
export type AuditEntry = { id: number; at: string; user: string; action: string; detail: string };

/* ───────────── Helpers ───────────── */
export const isWeight = (x: { unit: string }) => /^\s*kg\s*$/i.test(x.unit);
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const fmtQty = (n: number) => String(round3(n)).replace(".", ",");
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dt = (iso: string) => new Date(iso).toLocaleString("fr-DZ");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cashApplied = (s: Sale) => s.payments.filter((p) => p.method === "Espèces").reduce((t, p) => t + p.amount, 0);

export function sessionStats(sess: Session, allSales: Sale[]) {
  const made = allSales.filter((s) => s.sessionId === sess.id);
  const net = made.filter((s) => s.status === "Finalisée");
  const refunded = allSales.filter((s) => s.refundSessionId === sess.id);
  const revenue = net.reduce((t, s) => t + s.total, 0);
  const cashRevenue = net.reduce((t, s) => t + cashApplied(s), 0);
  const cashTaken = made.reduce((t, s) => t + cashApplied(s), 0); // espèces encaissées (même si remboursées plus tard)
  const cashRefunded = refunded.reduce((t, s) => t + cashApplied(s), 0); // espèces sorties du tiroir
  return {
    count: made.length,
    revenue,
    cashRevenue,
    otherRevenue: revenue - cashRevenue,
    refundsTotal: refunded.reduce((t, s) => t + s.total, 0),
    refundsCount: refunded.length,
    expectedCash: sess.openingFloat + cashTaken - cashRefunded,
  };
}

/* ───────────── État de la caisse (hook) ───────────── */
export function usePos() {
  const [session, setSession] = useState<Session | null>(null);
  const [closedSessions, setClosedSessions] = useState<Session[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const counters = useRef({ sale: 1, session: 1, audit: 1 });
  const keys = useRef(new Set<string>());

  const log = (user: string, action: string, detail: string) => {
    const id = counters.current.audit++;
    setAudit((a) => [{ id, at: new Date().toISOString(), user, action, detail }, ...a]);
  };

  const openSession = (user: string, openingFloat: number) => {
    const s: Session = { id: counters.current.session++, seller: user, openedAt: new Date().toISOString(), openingFloat };
    setSession(s);
    log(user, "Ouverture de caisse", `Fonds initial : ${fmt(openingFloat)}`);
  };

  const closeSession = (user: string, countedCash: number, comment: string) => {
    if (!session) return null;
    const expected = sessionStats(session, sales).expectedCash;
    const closed: Session = {
      ...session,
      closedAt: new Date().toISOString(),
      closedBy: user,
      countedCash,
      expectedCash: expected,
      gap: countedCash - expected,
      comment,
    };
    setClosedSessions((c) => [closed, ...c]);
    setSession(null);
    log(user, "Clôture de caisse", `Attendu ${fmt(expected)} · compté ${fmt(countedCash)} · écart ${fmt(countedCash - expected)}${comment ? ` · « ${comment} »` : ""}`);
    return closed;
  };

  // Idempotent : une même clé ne crée jamais deux ventes (double clic, rejeu de requête…)
  const finalizeSale = (input: NewSale) => {
    if (keys.current.has(input.key)) return null;
    keys.current.add(input.key);
    const n = counters.current.sale++;
    const sale: Sale = { ...input, id: `V-${String(n).padStart(4, "0")}`, status: "Finalisée" };
    setSales((s) => [sale, ...s]);
    log(input.seller, "Vente", `${sale.id} — ${fmt(sale.total)}`);
    if (sale.discount > 0) log(input.seller, "Remise appliquée", `${sale.id} — ${sale.discountPct}% (−${fmt(sale.discount)})`);
    return sale;
  };

  // Jamais de suppression : un retour est une opération tracée
  const refundSale = (id: string, user: string, reason: string) => {
    const target = sales.find((s) => s.id === id);
    if (!target || target.status !== "Finalisée" || !session) return null;
    const updated: Sale = {
      ...target,
      status: "Remboursée",
      refundedAt: new Date().toISOString(),
      refundedBy: user,
      refundReason: reason,
      refundSessionId: session.id,
    };
    setSales((all) => all.map((s) => (s.id === id ? updated : s)));
    log(user, "Remboursement", `${id} — ${fmt(target.total)} — motif : ${reason}`);
    return updated;
  };

  return { session, closedSessions, sales, audit, openSession, closeSession, finalizeSale, refundSale, log };
}
export type PosState = ReturnType<typeof usePos>;

/* ───────────── Ticket de caisse ───────────── */
const TICKET_CSS = `
.tk{width:72mm;margin:0 auto;font-family:'Courier New',monospace;font-size:12px;line-height:1.35;color:#000}
.tk .c{text-align:center}.tk .b{font-weight:700}.tk .big{font-size:16px}.tk .sm{font-size:10px}
.tk hr{border:0;border-top:1px dashed #000;margin:6px 0}
.tk table{width:100%;border-collapse:collapse}.tk td{padding:1px 0;vertical-align:top}
.tk .r{text-align:right;white-space:nowrap}.tk .n{font-weight:700}.tk .tot td{font-size:14px;font-weight:700}
`;

function ticketBody(sale: Sale, shop: SiteSettings | null) {
  const rows = sale.lines
    .map((l) => {
      const q = isWeight(l) ? `${fmtQty(l.qty)} kg` : fmtQty(l.qty);
      return `<tr><td colspan="2" class="n">${esc(l.name)}</td></tr><tr><td>${q} × ${fmt(l.unitPrice)}</td><td class="r">${fmt(l.total)}</td></tr>`;
    })
    .join("");
  const pays = sale.payments
    .map((p) => `<tr><td>${esc(p.method)}${p.ref ? ` (${esc(p.ref)})` : ""}</td><td class="r">${fmt(p.amount)}</td></tr>`)
    .join("");
  const hasCash = sale.payments.some((p) => p.method === "Espèces");
  return `<div class="tk">
<div class="c b big">Maison Églantine</div>
<div class="c">Pâtes fraîches artisanales</div>
${shop?.address ? `<div class="c">${esc(shop.address)}</div>` : ""}
${shop?.phone ? `<div class="c">Tél : ${esc(shop.phone)}</div>` : ""}
<hr/>
<div>Ticket : <b>${esc(sale.id)}</b></div>
<div>${esc(dt(sale.createdAt))}</div>
<div>Vendeur : ${esc(sale.seller)}</div>
<hr/>
<table>${rows}</table>
<hr/>
<table>
<tr><td>Sous-total</td><td class="r">${fmt(sale.subtotal)}</td></tr>
${sale.discount > 0 ? `<tr><td>Remise (${sale.discountPct}%)</td><td class="r">-${fmt(sale.discount)}</td></tr>` : ""}
<tr class="tot"><td>TOTAL</td><td class="r">${fmt(sale.total)}</td></tr>
</table>
<hr/>
<table>${pays}
${hasCash ? `<tr><td>Espèces reçues</td><td class="r">${fmt(sale.cashReceived)}</td></tr><tr><td>Monnaie rendue</td><td class="r">${fmt(sale.change)}</td></tr>` : ""}
</table>
<hr/>
<div class="c">Merci de votre visite !</div>
<div class="c sm">Ticket de caisse — ne vaut pas facture.</div>
</div>`;
}

function printTicket(sale: Sale, shop: SiteSettings | null) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const w = iframe.contentWindow;
  const doc = w?.document;
  if (!w || !doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(sale.id)}</title><style>${TICKET_CSS}@page{size:80mm auto;margin:4mm}</style></head><body>${ticketBody(sale, shop)}</body></html>`
  );
  doc.close();
  setTimeout(() => {
    w.focus();
    w.print();
    setTimeout(() => iframe.parentNode && iframe.parentNode.removeChild(iframe), 1000);
  }, 200);
}

/* ───────────── Styles ───────────── */
const S = {
  card: { background: "#fff", borderRadius: 14, boxShadow: "0 1px 8px #0001", padding: 16 } as const,
  input: { padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${BRAND.teal}44`, fontSize: 14 } as const,
  label: { fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4, color: BRAND.dark } as const,
  btn: (bg: string, color = "#fff") => ({ background: bg, color, padding: "10px 18px", borderRadius: 10, fontWeight: 700, fontSize: 14 }) as const,
  round: { width: 32, height: 32, borderRadius: 8, background: BRAND.cream, color: BRAND.teal, fontWeight: 800, fontSize: 16 } as const,
};

function Modal({ children, onClose, width = 520 }: { children: React.ReactNode; onClose?: () => void; width?: number }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: width, maxHeight: "90vh", overflowY: "auto" }}>
        {children}
      </div>
    </div>
  );
}

type CartLine = { id: number; qty: number; p: Product };
type PayLine = { method: string; amount: number; confirmed: boolean; ref: string };
type Row = { key: string; id: string; channel: "Boutique" | "E-commerce"; at: string; seller: string; payment: string; total: number; status: string; sale?: Sale; order?: Order };

/* ═══════════════════════════ COMPOSANT PRINCIPAL ═══════════════════════════ */
export function PosCaisse({
  pos,
  products,
  categories,
  orders,
  orderItems,
  siteSettings,
  onUpdateStock,
}: {
  pos: PosState;
  products: Product[];
  categories: Category[];
  orders: Order[];
  orderItems: OrderItem[];
  siteSettings: SiteSettings | null;
  onUpdateStock: (id: number, stock: number) => void;
}) {
  const [role, setRole] = useState<Role>("Vendeur");
  const user = ROLE_USERS[role];
  const [tab, setTab] = useState<"sale" | "history" | "session" | "audit">("sale");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const notify = (ok: boolean, text: string) => setMsg({ ok, text });
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4500);
    return () => clearTimeout(t);
  }, [msg]);

  // ── Vente
  const [cart, setCart] = useState<{ id: number; qty: number }[]>([]);
  const [discountPct, setDiscountPct] = useState(0);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<number | "all">("all");
  const [checkout, setCheckout] = useState(false);
  const [pays, setPays] = useState<PayLine[]>([]);
  const [cashInput, setCashInput] = useState("");
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const busy = useRef(false);
  const saleKey = useRef("");

  // ── Historique
  const [hSearch, setHSearch] = useState("");
  const [hFrom, setHFrom] = useState("");
  const [hTo, setHTo] = useState("");
  const [hSeller, setHSeller] = useState("");
  const [hPay, setHPay] = useState("");
  const [hChannel, setHChannel] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [refundOpen, setRefundOpen] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");

  // ── Session
  const [floatInput, setFloatInput] = useState("5000");
  const [countedInput, setCountedInput] = useState("");
  const [closeComment, setCloseComment] = useState("");

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const lines: CartLine[] = cart.flatMap((c) => {
    const p = productById.get(c.id);
    return p ? [{ ...c, p }] : [];
  });
  const pct = Math.min(discountPct, MAX_DISCOUNT[role]);
  const subtotal = lines.reduce((t, l) => t + Math.round(l.p.price * l.qty), 0);
  const discount = Math.round((subtotal * pct) / 100);
  const total = subtotal - discount;
  const cartValid = lines.length > 0 && lines.every((l) => l.qty > 0 && l.qty <= l.p.stock);

  const visible = products
    .filter((p) => p.active)
    .filter((p) => cat === "all" || p.category_id === cat)
    .filter((p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.sort_order - b.sort_order);

  /* ── Panier ── */
  const addToCart = (p: Product) => {
    if (!pos.session) return notify(false, "Ouvrez d'abord la caisse (onglet Session).");
    if (!p.active || p.stock <= 0) return notify(false, `${p.name} est indisponible.`);
    const step = isWeight(p) ? 0.5 : 1;
    const ex = cart.find((x) => x.id === p.id);
    if (ex && ex.qty + step > p.stock) notify(false, `Stock maximum atteint pour ${p.name}.`);
    setCart((c) => {
      const cur = c.find((x) => x.id === p.id);
      if (!cur) return [...c, { id: p.id, qty: Math.min(step, p.stock) }];
      return c.map((x) => (x.id === p.id ? { ...x, qty: Math.min(p.stock, round3(x.qty + step)) } : x));
    });
  };
  const setQty = (id: number, raw: number) => {
    const p = productById.get(id);
    if (!p) return;
    let q = Number.isFinite(raw) ? raw : 0;
    q = isWeight(p) ? round3(q) : Math.floor(q);
    if (q < 0) q = 0;
    if (q > p.stock) {
      q = p.stock;
      notify(false, `Stock maximum pour ${p.name} : ${fmtQty(p.stock)}.`);
    }
    setCart((c) => c.map((x) => (x.id === id ? { ...x, qty: q } : x)));
  };
  const removeLine = (id: number) => setCart((c) => c.filter((x) => x.id !== id));
  const clearCart = () => {
    if (cart.length === 0) return;
    if (window.confirm("Vider le panier ?")) {
      setCart([]);
      setDiscountPct(0);
    }
  };

  /* ── Encaissement ── */
  const openCheckout = () => {
    if (!pos.session) return notify(false, "Ouvrez d'abord la caisse.");
    if (!cartValid) return notify(false, "Vérifiez les quantités du panier.");
    saleKey.current = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    setPays([{ method: "Espèces", amount: total, confirmed: false, ref: "" }]);
    setCashInput("");
    setCheckout(true);
  };
  const paid = pays.reduce((t, p) => t + (Number(p.amount) || 0), 0);
  const remaining = total - paid;
  const cashAmount = pays.filter((p) => p.method === "Espèces").reduce((t, p) => t + (Number(p.amount) || 0), 0);
  const hasCash = pays.some((p) => p.method === "Espèces");
  const cashReceived = cashInput === "" ? cashAmount : Number(cashInput) || 0;
  const change = hasCash ? Math.max(0, cashReceived - cashAmount) : 0;
  const nonCashOk = pays.filter((p) => p.method !== "Espèces").every((p) => p.confirmed);
  const canPay = remaining === 0 && pays.every((p) => Number(p.amount) > 0) && nonCashOk && (!hasCash || cashReceived >= cashAmount);

  const updatePay = (i: number, patch: Partial<PayLine>) => setPays((all) => all.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const addPay = () => setPays((all) => [...all, { method: "Carte bancaire", amount: Math.max(0, remaining), confirmed: false, ref: "" }]);
  const removePay = (i: number) => setPays((all) => (all.length > 1 ? all.filter((_, j) => j !== i) : all));

  const confirmSale = () => {
    if (busy.current || !pos.session) return;
    busy.current = true;
    try {
      // Revalidation du stock au moment de confirmer (règle "serveur")
      for (const l of lines) {
        const fresh = productById.get(l.id);
        if (!fresh || l.qty > fresh.stock) return notify(false, `Stock insuffisant pour ${l.p.name}.`);
      }
      const saleLines: SaleLine[] = lines.map((l) => ({
        productId: l.id,
        name: l.p.name,
        unit: l.p.unit,
        unitPrice: l.p.price,
        qty: l.qty,
        total: Math.round(l.p.price * l.qty),
      }));
      const sale = pos.finalizeSale({
        key: saleKey.current,
        sessionId: pos.session.id,
        createdAt: new Date().toISOString(),
        seller: user,
        lines: saleLines,
        subtotal,
        discountPct: pct,
        discount,
        total,
        payments: pays.map((p) => ({ method: p.method, amount: Number(p.amount), ref: p.ref.trim() || undefined })),
        cashReceived: hasCash ? cashReceived : 0,
        change,
      });
      if (!sale) return notify(false, "Cette vente est déjà enregistrée.");
      for (const l of lines) onUpdateStock(l.id, round3(l.p.stock - l.qty));
      setLastSale(sale);
      setCart([]);
      setDiscountPct(0);
      setCheckout(false);
    } finally {
      busy.current = false;
    }
  };

  /* ── Historique ── */
  const rows: Row[] = [
    ...pos.sales.map<Row>((s) => ({
      key: s.id, id: s.id, channel: "Boutique", at: s.createdAt, seller: s.seller,
      payment: s.payments.map((p) => p.method).join(" + "), total: s.total, status: s.status, sale: s,
    })),
    ...orders.map<Row>((o) => ({
      key: `o${o.id}`, id: `#${o.order_number}`, channel: "E-commerce", at: o.created_at, seller: "En ligne",
      payment: o.payment_mode, total: o.total, status: o.status, order: o,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const sellers = [...new Set(rows.map((r) => r.seller))];
  const methods = [...new Set(rows.flatMap((r) => r.payment.split(" + ")))];
  const shown = rows.filter(
    (r) =>
      (!hSearch.trim() || r.id.toLowerCase().includes(hSearch.trim().toLowerCase())) &&
      (!hFrom || ymd(r.at) >= hFrom) &&
      (!hTo || ymd(r.at) <= hTo) &&
      (!hSeller || r.seller === hSeller) &&
      (!hPay || r.payment.split(" + ").includes(hPay)) &&
      (!hChannel || r.channel === hChannel)
  );

  const handleRefund = (sale: Sale) => {
    if (role === "Vendeur") return notify(false, "Autorisation requise : Responsable ou Administrateur.");
    if (!pos.session) return notify(false, "Ouvrez une session de caisse pour effectuer un remboursement.");
    if (!refundReason.trim()) return notify(false, "Indiquez le motif du remboursement.");
    const r = pos.refundSale(sale.id, user, refundReason.trim());
    if (!r) return notify(false, "Remboursement impossible.");
    for (const l of sale.lines) {
      const p = productById.get(l.productId);
      if (p) onUpdateStock(p.id, round3(p.stock + l.qty));
    }
    setRefundOpen(null);
    setRefundReason("");
    notify(true, `${sale.id} remboursée — stock remis à jour.`);
  };
  const reprint = (sale: Sale) => {
    pos.log(user, "Réimpression ticket", sale.id);
    printTicket(sale, siteSettings);
  };

  /* ── Session ── */
  const stats = pos.session ? sessionStats(pos.session, pos.sales) : null;
  const counted = Number(countedInput);
  const gap = stats && countedInput !== "" ? counted - stats.expectedCash : 0;
  const doClose = () => {
    if (!pos.session || !stats) return;
    if (countedInput === "" || !Number.isFinite(counted) || counted < 0) return notify(false, "Saisissez le montant d'espèces compté.");
    if (gap !== 0 && !closeComment.trim()) return notify(false, "Un écart existe : ajoutez un commentaire.");
    pos.closeSession(user, counted, closeComment.trim());
    setCart([]);
    setCountedInput("");
    setCloseComment("");
    notify(true, "Caisse clôturée.");
  };

  /* ════════════════════════════ RENDU ════════════════════════════ */
  const tabs: ["sale" | "history" | "session" | "audit", string][] = [
    ["sale", "Vente"], ["history", "Historique"], ["session", "Session"], ["audit", "Journal d'audit"],
  ];

  return (
    <div>
      <style>{`.pos-layout{display:grid;grid-template-columns:1fr 380px;gap:16px;align-items:start}
.pos-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.pos-cart{position:sticky;top:12px}
@media (max-width:900px){.pos-layout{grid-template-columns:1fr}.pos-cart{position:static}}
${TICKET_CSS}`}</style>

      {/* En-tête */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <h3 className="serif" style={{ fontSize: 22, color: BRAND.teal, marginRight: 4 }}>Caisse</h3>
        <span style={{ padding: "4px 12px", borderRadius: 16, fontSize: 12, fontWeight: 700, background: pos.session ? "#E8F8F0" : "#FDEDEC", color: pos.session ? BRAND.green : BRAND.red }}>
          {pos.session ? `Session ouverte · ${pos.session.seller}` : "Caisse fermée"}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <label htmlFor="pos-role" style={{ fontSize: 12, color: BRAND.warmGrey }}>Rôle (simulation) :</label>
          <select id="pos-role" value={role} onChange={(e) => setRole(e.target.value as Role)} style={S.input}>
            {(Object.keys(ROLE_USERS) as Role[]).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: "7px 14px", borderRadius: 16, fontSize: 13, fontWeight: 700, background: tab === k ? BRAND.teal : "#fff", color: tab === k ? "#fff" : BRAND.dark, border: `1.5px solid ${BRAND.teal}44` }}>{l}</button>
        ))}
      </div>

      {msg && (
        <div role="status" style={{ background: msg.ok ? "#E8F8F0" : "#FDEDEC", color: msg.ok ? BRAND.green : BRAND.red, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, fontWeight: 600 }}>{msg.text}</div>
      )}

      {/* ═══════ VENTE ═══════ */}
      {tab === "sale" && (
        <div className="pos-layout">
          <div>
            {!pos.session && (
              <div style={{ ...S.card, border: `1.5px solid ${BRAND.orange}`, marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14 }}>La caisse est fermée : ouvrez une session pour commencer à vendre.</span>
                <button onClick={() => setTab("session")} style={S.btn(BRAND.orange)}>Ouvrir la caisse</button>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <input aria-label="Rechercher un produit" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un produit…" style={{ ...S.input, flex: 1, minWidth: 180 }} />
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {([["all", "Toutes"], ...categories.map((c) => [c.id, c.name] as [number, string])] as [number | "all", string][]).map(([k, l]) => (
                <button key={String(k)} onClick={() => setCat(k)} style={{ padding: "5px 12px", borderRadius: 16, fontSize: 12, fontWeight: 600, background: cat === k ? BRAND.orange : "#fff", color: cat === k ? "#fff" : BRAND.dark, border: `1.5px solid ${BRAND.orange}66` }}>{l}</button>
              ))}
            </div>
            <div className="pos-grid">
              {visible.map((p) => {
                const out = p.stock <= 0;
                const low = !out && p.stock <= p.low_stock_alert;
                return (
                  <button key={p.id} onClick={() => addToCart(p)} disabled={out} aria-label={`Ajouter ${p.name}`}
                    style={{ ...S.card, padding: 0, textAlign: "left", overflow: "hidden", opacity: out ? 0.5 : 1, cursor: out ? "not-allowed" : "pointer" }}>
                    <div style={{ position: "relative", height: 90, background: BRAND.creamDark, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }}>
                      <span>{p.emoji}</span>
                      {p.image_url && <img src={p.image_url} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
                    </div>
                    <div style={{ padding: "8px 10px" }}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{p.name}</div>
                      <div style={{ fontWeight: 800, fontSize: 13, color: BRAND.orange }}>{fmt(p.price)}{isWeight(p) ? " / kg" : ` · ${p.unit}`}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3, color: out ? BRAND.red : low ? BRAND.orangeDark : BRAND.green }}>
                        {out ? "Rupture" : `${low ? "Stock faible" : "Stock"} : ${fmtQty(p.stock)}${isWeight(p) ? " kg" : ""}`}
                      </div>
                    </div>
                  </button>
                );
              })}
              {visible.length === 0 && <p style={{ color: BRAND.warmGrey, gridColumn: "1/-1", textAlign: "center", padding: 24 }}>Aucun produit trouvé.</p>}
            </div>
          </div>

          {/* Panier */}
          <aside className="pos-cart" style={S.card} aria-label="Panier de vente">
            <h4 style={{ fontWeight: 800, marginBottom: 10, color: BRAND.teal }}>Panier</h4>
            {lines.length === 0 && <p style={{ color: BRAND.warmGrey, fontSize: 13, padding: "16px 0", textAlign: "center" }}>Panier vide — touchez un produit pour l'ajouter.</p>}
            {lines.map((l) => {
              const w = isWeight(l.p);
              return (
                <div key={l.id} style={{ borderBottom: `1px solid ${BRAND.creamDark}`, padding: "8px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{l.p.name}</span>
                    <button onClick={() => removeLine(l.id)} aria-label={`Supprimer ${l.p.name}`} style={{ background: "none", color: BRAND.red, fontWeight: 800, fontSize: 16 }}>✕</button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <button aria-label={`Diminuer ${l.p.name}`} style={S.round} onClick={() => setQty(l.id, round3(l.qty - (w ? 0.1 : 1)))}>−</button>
                    <input key={l.qty} type="number" step={w ? 0.05 : 1} min={0} defaultValue={l.qty} aria-label={`Quantité ${l.p.name}`}
                      onBlur={(e) => setQty(l.id, Number(e.target.value))}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      style={{ ...S.input, width: 72, textAlign: "center", padding: "6px" }} />
                    <button aria-label={`Augmenter ${l.p.name}`} style={S.round} onClick={() => setQty(l.id, round3(l.qty + (w ? 0.1 : 1)))}>+</button>
                    <span style={{ fontSize: 11, color: BRAND.warmGrey }}>{w ? "kg" : "×"} {fmt(l.p.price)}</span>
                    <span style={{ marginLeft: "auto", fontWeight: 800, fontSize: 14 }}>{fmt(Math.round(l.p.price * l.qty))}</span>
                  </div>
                </div>
              );
            })}

            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <label htmlFor="pos-discount" style={{ fontSize: 12, fontWeight: 600 }}>Remise (%)</label>
              <input id="pos-discount" type="number" min={0} max={MAX_DISCOUNT[role]} value={pct} disabled={MAX_DISCOUNT[role] === 0}
                onChange={(e) => setDiscountPct(Math.max(0, Math.min(MAX_DISCOUNT[role], Number(e.target.value) || 0)))}
                title={MAX_DISCOUNT[role] === 0 ? "Remise réservée au responsable / administrateur" : `Maximum ${MAX_DISCOUNT[role]}%`}
                style={{ ...S.input, width: 70, padding: "6px", opacity: MAX_DISCOUNT[role] === 0 ? 0.5 : 1 }} />
              <span style={{ fontSize: 11, color: BRAND.warmGrey }}>{MAX_DISCOUNT[role] === 0 ? "Non autorisé (vendeur)" : `max ${MAX_DISCOUNT[role]}%`}</span>
            </div>

            <div style={{ marginTop: 12, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Sous-total</span><span>{fmt(subtotal)}</span></div>
              {discount > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: BRAND.green }}><span>Remise ({pct}%)</span><span>−{fmt(discount)}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, fontWeight: 800, marginTop: 6, color: BRAND.teal }}><span>TOTAL</span><span data-testid="cart-total">{fmt(total)}</span></div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={clearCart} disabled={cart.length === 0} style={{ ...S.btn(BRAND.cream, BRAND.red), opacity: cart.length === 0 ? 0.5 : 1 }}>Vider</button>
              <button onClick={openCheckout} disabled={!cartValid || !pos.session} style={{ ...S.btn(BRAND.orange), flex: 1, fontSize: 16, padding: "14px", opacity: !cartValid || !pos.session ? 0.5 : 1 }}>Encaisser</button>
            </div>
          </aside>
        </div>
      )}

      {/* ═══════ HISTORIQUE ═══════ */}
      {tab === "history" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginBottom: 14 }}>
            <input aria-label="Rechercher un numéro" placeholder="N° de vente…" value={hSearch} onChange={(e) => setHSearch(e.target.value)} style={S.input} />
            <input aria-label="Du" type="date" value={hFrom} onChange={(e) => setHFrom(e.target.value)} style={S.input} />
            <input aria-label="Au" type="date" value={hTo} onChange={(e) => setHTo(e.target.value)} style={S.input} />
            <select aria-label="Filtre vendeur" value={hSeller} onChange={(e) => setHSeller(e.target.value)} style={S.input}>
              <option value="">Tous les vendeurs</option>
              {sellers.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select aria-label="Filtre paiement" value={hPay} onChange={(e) => setHPay(e.target.value)} style={S.input}>
              <option value="">Tous les paiements</option>
              {methods.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select aria-label="Filtre canal" value={hChannel} onChange={(e) => setHChannel(e.target.value)} style={S.input}>
              <option value="">Tous les canaux</option>
              <option value="Boutique">Boutique</option>
              <option value="E-commerce">E-commerce</option>
            </select>
          </div>
          {shown.length === 0 && <p style={{ color: BRAND.warmGrey, textAlign: "center", padding: 24 }}>Aucune opération.</p>}
          {shown.map((r) => {
            const isOpen = open === r.key;
            const s = r.sale;
            const items = r.order ? orderItems.filter((i) => i.order_id === r.order!.id) : [];
            return (
              <div key={r.key} style={{ ...S.card, marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 800 }}>{r.id}</span>
                  <span style={{ padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: r.channel === "Boutique" ? BRAND.tealLight : BRAND.orangeLight, color: r.channel === "Boutique" ? BRAND.teal : BRAND.orangeDark }}>{r.channel}</span>
                  {s ? (
                    <span style={{ padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: s.status === "Finalisée" ? "#E8F8F0" : "#FDEDEC", color: s.status === "Finalisée" ? BRAND.green : BRAND.red }}>{s.status}</span>
                  ) : <StatusBadge status={r.status} />}
                  <span style={{ fontSize: 12, color: BRAND.warmGrey }}>{dt(r.at)} · {r.seller} · {r.payment}</span>
                  <span style={{ marginLeft: "auto", fontWeight: 800, color: BRAND.orange }}>{fmt(r.total)}</span>
                  <button onClick={() => setOpen(isOpen ? null : r.key)} style={{ ...S.btn(BRAND.cream, BRAND.teal), padding: "5px 12px", fontSize: 12 }}>{isOpen ? "Masquer" : "Détail"}</button>
                </div>
                {isOpen && (
                  <div style={{ marginTop: 10, fontSize: 13 }}>
                    {s && (
                      <>
                        {s.lines.map((l) => <div key={l.productId} style={{ display: "flex", justifyContent: "space-between" }}><span>{l.name} — {isWeight(l) ? `${fmtQty(l.qty)} kg` : fmtQty(l.qty)} × {fmt(l.unitPrice)}</span><span>{fmt(l.total)}</span></div>)}
                        {s.discount > 0 && <div style={{ color: BRAND.green }}>Remise {s.discountPct}% : −{fmt(s.discount)}</div>}
                        <div style={{ marginTop: 6, color: BRAND.warmGrey }}>Paiement : {s.payments.map((p) => `${p.method} ${fmt(p.amount)}`).join(" + ")}{s.change > 0 ? ` · monnaie rendue ${fmt(s.change)}` : ""}</div>
                        {s.status === "Remboursée" && <div style={{ color: BRAND.red, marginTop: 4 }}>Remboursée par {s.refundedBy} le {dt(s.refundedAt!)} — motif : {s.refundReason}</div>}
                        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                          <button onClick={() => reprint(s)} style={S.btn(BRAND.teal)}>Réimprimer le ticket</button>
                          {s.status === "Finalisée" && refundOpen !== s.id && (
                            <button onClick={() => (role === "Vendeur" ? notify(false, "Autorisation requise : Responsable ou Administrateur.") : setRefundOpen(s.id))} style={S.btn("#FDEDEC", BRAND.red)}>Rembourser</button>
                          )}
                        </div>
                        {refundOpen === s.id && (
                          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <input aria-label="Motif du remboursement" placeholder="Motif du remboursement" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} style={{ ...S.input, flex: 1, minWidth: 180 }} />
                            <button onClick={() => handleRefund(s)} style={S.btn(BRAND.red)}>Confirmer le remboursement</button>
                            <button onClick={() => { setRefundOpen(null); setRefundReason(""); }} style={S.btn(BRAND.cream, BRAND.dark)}>Annuler</button>
                          </div>
                        )}
                      </>
                    )}
                    {r.order && (
                      <>
                        <div style={{ color: BRAND.warmGrey, marginBottom: 4 }}>{r.order.client_name} · {r.order.client_phone} · {r.order.zone}</div>
                        {items.map((i) => <div key={i.id} style={{ display: "flex", justifyContent: "space-between" }}><span>{i.name} × {i.qty}</span><span>{fmt(i.price * i.qty)}</span></div>)}
                        <div style={{ marginTop: 6, fontSize: 12, color: BRAND.warmGrey }}>Commande en ligne — gérée depuis l'onglet « Commandes » (livraison, statuts).</div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════ SESSION ═══════ */}
      {tab === "session" && (
        <div style={{ maxWidth: 640 }}>
          {!pos.session && (
            <div style={S.card}>
              <h4 style={{ fontWeight: 800, color: BRAND.teal, marginBottom: 10 }}>Ouverture de caisse</h4>
              <label htmlFor="pos-float" style={S.label}>Fonds de caisse initial (espèces dans le tiroir, en DA)</label>
              <input id="pos-float" type="number" min={0} value={floatInput} onChange={(e) => setFloatInput(e.target.value)} style={{ ...S.input, width: 200 }} />
              <div style={{ marginTop: 12 }}>
                <button onClick={() => { const f = Number(floatInput); if (!Number.isFinite(f) || f < 0) return notify(false, "Montant invalide."); pos.openSession(user, Math.round(f)); notify(true, "Caisse ouverte."); setTab("sale"); }} style={S.btn(BRAND.teal)}>Ouvrir la caisse</button>
              </div>
            </div>
          )}
          {pos.session && stats && (
            <div style={S.card}>
              <h4 style={{ fontWeight: 800, color: BRAND.teal, marginBottom: 4 }}>Session en cours</h4>
              <p style={{ fontSize: 12, color: BRAND.warmGrey, marginBottom: 12 }}>Ouverte le {dt(pos.session.openedAt)} par {pos.session.seller}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
                {([
                  ["Nombre de ventes", String(stats.count)],
                  ["CA net", fmt(stats.revenue)],
                  ["Ventes en espèces", fmt(stats.cashRevenue)],
                  ["Autres moyens", fmt(stats.otherRevenue)],
                  ["Remboursements", `${stats.refundsCount} · ${fmt(stats.refundsTotal)}`],
                  ["Fonds initial", fmt(pos.session.openingFloat)],
                ] as [string, string][]).map(([l, v]) => (
                  <div key={l} style={{ background: BRAND.cream, borderRadius: 10, padding: 10 }}>
                    <div style={{ fontSize: 11, color: BRAND.warmGrey }}>{l}</div>
                    <div style={{ fontWeight: 800 }}>{v}</div>
                  </div>
                ))}
              </div>
              <h4 style={{ fontWeight: 800, color: BRAND.teal, margin: "6px 0" }}>Clôture</h4>
              <div style={{ fontSize: 13, marginBottom: 8 }}>Espèces théoriques attendues : <b data-testid="expected-cash">{fmt(stats.expectedCash)}</b></div>
              <label htmlFor="pos-counted" style={S.label}>Espèces réellement comptées (DA)</label>
              <input id="pos-counted" type="number" min={0} value={countedInput} onChange={(e) => setCountedInput(e.target.value)} style={{ ...S.input, width: 200 }} />
              {countedInput !== "" && (
                <div data-testid="gap" style={{ marginTop: 8, fontWeight: 700, color: gap === 0 ? BRAND.green : BRAND.red }}>
                  Écart : {gap > 0 ? "+" : ""}{fmt(gap)} {gap === 0 ? "(caisse juste)" : gap > 0 ? "(excédent)" : "(manquant)"}
                </div>
              )}
              <label htmlFor="pos-comment" style={{ ...S.label, marginTop: 10 }}>Commentaire {gap !== 0 && countedInput !== "" ? "(obligatoire : écart constaté)" : "(facultatif)"}</label>
              <input id="pos-comment" value={closeComment} onChange={(e) => setCloseComment(e.target.value)} style={{ ...S.input, width: "100%" }} />
              <div style={{ marginTop: 12 }}><button onClick={doClose} style={S.btn(BRAND.red)}>Clôturer la caisse</button></div>
            </div>
          )}
          {pos.closedSessions.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ fontWeight: 800, color: BRAND.teal, marginBottom: 8 }}>Sessions clôturées (lecture seule)</h4>
              {pos.closedSessions.map((s) => (
                <div key={s.id} style={{ ...S.card, marginBottom: 8, fontSize: 13 }}>
                  <b>Session #{s.id}</b> · {s.seller} · {dt(s.openedAt)} → {dt(s.closedAt!)}<br />
                  Attendu {fmt(s.expectedCash!)} · compté {fmt(s.countedCash!)} · <b style={{ color: s.gap === 0 ? BRAND.green : BRAND.red }}>écart {fmt(s.gap!)}</b>
                  {s.comment && <div style={{ color: BRAND.warmGrey }}>« {s.comment} »</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════ AUDIT ═══════ */}
      {tab === "audit" && (
        <div>
          <p style={{ fontSize: 12, color: BRAND.warmGrey, marginBottom: 10 }}>Opérations sensibles : ouvertures/clôtures, remises, remboursements, réimpressions.</p>
          {pos.audit.length === 0 && <p style={{ color: BRAND.warmGrey, textAlign: "center", padding: 24 }}>Aucune opération enregistrée.</p>}
          {pos.audit.map((a) => (
            <div key={a.id} style={{ ...S.card, marginBottom: 6, padding: "10px 14px", fontSize: 13, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span style={{ color: BRAND.warmGrey }}>{dt(a.at)}</span>
              <b>{a.action}</b>
              <span>{a.detail}</span>
              <span style={{ marginLeft: "auto", color: BRAND.warmGrey }}>{a.user}</span>
            </div>
          ))}
        </div>
      )}

      {/* ═══════ MODALE ENCAISSEMENT ═══════ */}
      {checkout && (
        <Modal width={560}>
          <h3 className="serif" style={{ fontSize: 22, color: BRAND.teal, marginBottom: 4 }}>Encaissement</h3>
          <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>Total à payer : <span data-testid="checkout-total">{fmt(total)}</span></div>
          {pays.map((p, i) => (
            <div key={i} style={{ background: BRAND.cream, borderRadius: 10, padding: 10, marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <select aria-label={`Moyen de paiement ${i + 1}`} value={p.method} onChange={(e) => updatePay(i, { method: e.target.value, confirmed: false })} style={S.input}>
                  {PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <input aria-label={`Montant ${i + 1}`} type="number" min={0} value={p.amount} onChange={(e) => updatePay(i, { amount: Math.max(0, Math.round(Number(e.target.value) || 0)) })} style={{ ...S.input, width: 120 }} />
                <span style={{ fontSize: 12 }}>DA</span>
                {pays.length > 1 && <button onClick={() => removePay(i)} aria-label={`Retirer le paiement ${i + 1}`} style={{ background: "none", color: BRAND.red, fontWeight: 800 }}>✕</button>}
              </div>
              {p.method !== "Espèces" && (
                <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={p.confirmed} onChange={(e) => updatePay(i, { confirmed: e.target.checked })} />
                    Paiement confirmé sur le terminal
                  </label>
                  <input aria-label={`Référence ${i + 1}`} placeholder="Référence (facultatif)" value={p.ref} onChange={(e) => updatePay(i, { ref: e.target.value })} style={{ ...S.input, padding: "5px 8px", fontSize: 12 }} />
                </div>
              )}
            </div>
          ))}
          <button onClick={addPay} style={{ ...S.btn(BRAND.cream, BRAND.teal), padding: "6px 12px", fontSize: 12 }}>+ Ajouter un moyen de paiement</button>
          <div data-testid="remaining" style={{ margin: "10px 0", fontWeight: 700, color: remaining === 0 ? BRAND.green : BRAND.red }}>
            {remaining === 0 ? "Montant couvert" : remaining > 0 ? `Reste à payer : ${fmt(remaining)}` : `Trop-perçu : ${fmt(-remaining)}`}
          </div>
          {hasCash && (
            <div style={{ marginBottom: 10 }}>
              <label htmlFor="pos-received" style={S.label}>Espèces reçues du client (DA)</label>
              <input id="pos-received" type="number" min={0} placeholder={String(cashAmount)} value={cashInput} onChange={(e) => setCashInput(e.target.value)} style={{ ...S.input, width: 200 }} />
              <div data-testid="change" style={{ marginTop: 6, fontSize: 16, fontWeight: 800, color: cashReceived >= cashAmount ? BRAND.teal : BRAND.red }}>
                {cashReceived >= cashAmount ? `Monnaie à rendre : ${fmt(change)}` : "Montant reçu insuffisant"}
              </div>
            </div>
          )}
          {!nonCashOk && <div style={{ fontSize: 12, color: BRAND.orangeDark, marginBottom: 8 }}>Cochez la confirmation du terminal pour chaque paiement non espèces.</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => setCheckout(false)} style={S.btn(BRAND.cream, BRAND.dark)}>Annuler</button>
            <button onClick={confirmSale} disabled={!canPay} style={{ ...S.btn(BRAND.green), flex: 1, opacity: canPay ? 1 : 0.5 }}>Valider la vente</button>
          </div>
        </Modal>
      )}

      {/* ═══════ MODALE TICKET ═══════ */}
      {lastSale && (
        <Modal width={420}>
          <div style={{ textAlign: "center", color: BRAND.green, fontWeight: 800, marginBottom: 8 }}>Vente enregistrée ✓ — {lastSale.id}</div>
          <div style={{ border: `1px dashed ${BRAND.warmGrey}`, borderRadius: 8, padding: 12, background: "#fff", overflowX: "auto" }} dangerouslySetInnerHTML={{ __html: ticketBody(lastSale, siteSettings) }} />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => printTicket(lastSale, siteSettings)} style={{ ...S.btn(BRAND.teal), flex: 1 }}>Imprimer le ticket</button>
            <button onClick={() => setLastSale(null)} style={{ ...S.btn(BRAND.orange), flex: 1 }}>Nouvelle vente</button>
          </div>
        </Modal>
      )}
    </div>
  );
}