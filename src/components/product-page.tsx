import { useState } from "react";
import { type Product, type CartItem, fmt, Stars, getBadgeClass, BRAND } from "@/components/shared-deps";
import { ArrowLeft, Minus, Plus, ShoppingCart, AlertCircle, Package, Leaf, ShieldAlert } from "lucide-react";

export function ProductPage({
  product,
  cart,
  setCart,
  setView,
  relatedProducts,
}: {
  product: Product;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  setView: (v: string) => void;
  relatedProducts: Product[];
}) {
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [stockMsg, setStockMsg] = useState<string | null>(null);

  const cartQty = cart.find((i) => i.id === product.id)?.qty ?? 0;
  const maxQty = product.stock - cartQty;
  const totalPrice = product.price * qty;

  const handleAdd = () => {
    if (qty < 1) return;
    if (cartQty + qty > product.stock) {
      setStockMsg(`Stock maximum atteint pour « ${product.name} » (${product.stock} disponible${product.stock > 1 ? "s" : ""})`);
      setTimeout(() => setStockMsg(null), 3000);
      return;
    }
    setCart((c) => {
      const ex = c.find((i) => i.id === product.id);
      if (ex) {
        return c.map((i) => (i.id === product.id ? { ...i, qty: i.qty + qty } : i));
      }
      return [...c, { id: product.id, name: product.name, price: product.price, qty, image_url: product.image_url, emoji: product.emoji, unit: product.unit }];
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  const inc = () => {
    if (qty < maxQty) setQty((q) => q + 1);
  };
  const dec = () => {
    if (qty > 1) setQty((q) => q - 1);
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
      <button
        onClick={() => setView("shop")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          color: BRAND.teal,
          fontWeight: 600,
          fontSize: 14,
          marginBottom: 28,
          padding: 0,
        }}
      >
        <ArrowLeft size={18} /> Retour à la boutique
      </button>

      {stockMsg && (
        <div className="fadeIn" style={{ background: "#FDEDEC", color: BRAND.red, borderRadius: 12, padding: "12px 18px", marginBottom: 20, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertCircle size={18} /> {stockMsg}
        </div>
      )}

      <div className="product-page-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "start" }}>
        {/* Image side */}
        <div>
          <div style={{ position: "relative", borderRadius: 22, overflow: "hidden", boxShadow: "0 12px 40px rgba(10,61,64,.14)", aspectRatio: "1/1", background: BRAND.cream }}>
            <img src={product.image_url} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {product.badge && (
              <span className={`product-badge ${getBadgeClass(product.badge)}`} style={{ top: 16, left: 16, fontSize: 12, padding: "5px 14px" }}>
                {product.badge}
              </span>
            )}
            {product.stock <= product.low_stock_alert && product.stock > 0 && (
              <span style={{ position: "absolute", top: 16, right: 16, background: "rgba(0,0,0,.72)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20 }}>
                Plus que {product.stock} !
              </span>
            )}
          </div>
        </div>

        {/* Info side */}
        <div style={{ padding: "8px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Stars n={5} size={15} />
            <span style={{ fontSize: 13, color: BRAND.warmGrey }}>({product.reviews || 0} avis)</span>
          </div>

          <h1 className="serif" style={{ fontSize: "clamp(26px,4vw,38px)", fontStyle: "italic", color: BRAND.dark, marginBottom: 12, lineHeight: 1.2 }}>
            {product.name}
          </h1>

          <p style={{ fontSize: 15, color: BRAND.warmGrey, lineHeight: 1.8, marginBottom: 24 }}>
            {product.description}
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
            <span style={{ fontSize: 32, fontWeight: 800, color: BRAND.orange }}>{fmt(product.price)}</span>
            {product.unit && (
              <span style={{ fontSize: 14, color: BRAND.warmGrey, background: BRAND.cream, padding: "4px 12px", borderRadius: 20, fontWeight: 600 }}>
                {product.unit}
              </span>
            )}
          </div>

          {/* Detail cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 28 }}>
            {product.weight && (
              <div style={{ background: BRAND.cream, borderRadius: 14, padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Package size={16} style={{ color: BRAND.teal }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: BRAND.teal, textTransform: "uppercase", letterSpacing: .8 }}>Poids</span>
                </div>
                <p style={{ fontSize: 14, color: BRAND.dark, fontWeight: 600 }}>{product.weight}</p>
              </div>
            )}
            {product.ingredients && (
              <div style={{ background: "#E8F5E9", borderRadius: 14, padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Leaf size={16} style={{ color: BRAND.green }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: BRAND.green, textTransform: "uppercase", letterSpacing: .8 }}>Ingrédients</span>
                </div>
                <p style={{ fontSize: 13, color: BRAND.dark, lineHeight: 1.6 }}>{product.ingredients}</p>
              </div>
            )}
            {product.allergens && (
              <div style={{ background: "#FFF8E1", borderRadius: 14, padding: "16px 18px", gridColumn: "1 / -1" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <ShieldAlert size={16} style={{ color: "#E65100" }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#E65100", textTransform: "uppercase", letterSpacing: .8 }}>Allergènes</span>
                </div>
                <p style={{ fontSize: 13, color: BRAND.dark, lineHeight: 1.6 }}>{product.allergens}</p>
              </div>
            )}
          </div>

          {/* Quantity selector */}
          {product.stock > 0 ? (
            <>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: BRAND.dark, display: "block", marginBottom: 10 }}>Quantité</label>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 0, borderRadius: 30, overflow: "hidden", border: `2px solid ${BRAND.teal}33`, background: "#fff" }}>
                    <button
                      onClick={dec}
                      disabled={qty <= 1}
                      style={{
                        width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center",
                        background: "transparent", color: BRAND.teal, fontSize: 20, fontWeight: 700,
                        cursor: qty <= 1 ? "not-allowed" : "pointer", opacity: qty <= 1 ? .4 : 1,
                      }}
                    >
                      <Minus size={18} />
                    </button>
                    <span style={{ minWidth: 56, textAlign: "center", fontSize: 18, fontWeight: 800, color: BRAND.dark }}>{qty}</span>
                    <button
                      onClick={inc}
                      disabled={qty >= maxQty}
                      style={{
                        width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center",
                        background: "transparent", color: BRAND.teal, fontSize: 20, fontWeight: 700,
                        cursor: qty >= maxQty ? "not-allowed" : "pointer", opacity: qty >= maxQty ? .4 : 1,
                      }}
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                  <span style={{ fontSize: 13, color: BRAND.warmGrey }}>
                    {maxQty > 0 ? `${maxQty} disponible${maxQty > 1 ? "s" : ""}` : "Stock max atteint dans le panier"}
                  </span>
                </div>
              </div>

              {/* Total + Add to cart */}
              <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 auto" }}>
                  <span style={{ fontSize: 13, color: BRAND.warmGrey, display: "block", marginBottom: 2 }}>Total</span>
                  <span style={{ fontSize: 28, fontWeight: 800, color: BRAND.orange }}>{fmt(totalPrice)}</span>
                </div>
                <button
                  onClick={handleAdd}
                  disabled={added || maxQty <= 0}
                  className="btn-primary"
                  style={{
                    flex: "0 0 auto", padding: "15px 36px", fontSize: 16, borderRadius: 30,
                    display: "flex", alignItems: "center", gap: 10,
                    opacity: added || maxQty <= 0 ? .6 : 1, cursor: added || maxQty <= 0 ? "not-allowed" : "pointer",
                    background: added ? BRAND.green : BRAND.orange,
                  }}
                >
                  {added ? (
                    <>✓ Ajouté au panier !</>
                  ) : (
                    <><ShoppingCart size={20} /> Ajouter au panier</>
                  )}
                </button>
              </div>
            </>
          ) : (
            <div style={{ background: "#FDEDEC", color: BRAND.red, borderRadius: 14, padding: "16px 20px", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
              <AlertCircle size={20} /> Ce produit est actuellement épuisé
            </div>
          )}
        </div>
      </div>

      {/* Related products */}
      {relatedProducts.length > 0 && (
        <section style={{ marginTop: 64 }}>
          <h2 className="serif" style={{ fontSize: 24, fontStyle: "italic", color: BRAND.dark, marginBottom: 24 }}>
            Vous aimerez aussi
          </h2>
          <div className="related-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 20 }}>
            {relatedProducts.map((p) => (
              <div
                key={p.id}
                onClick={() => setView("product:" + p.id)}
                className="card"
                style={{ cursor: "pointer", display: "flex", flexDirection: "column" }}
              >
                <div style={{ position: "relative", height: 160, overflow: "hidden" }}>
                  <img src={p.image_url} alt={p.name} className="card-img" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  {p.badge && <span className={`product-badge ${getBadgeClass(p.badge)}`}>{p.badge}</span>}
                </div>
                <div style={{ padding: "14px 16px" }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: BRAND.dark, marginBottom: 4 }}>{p.name}</h3>
                  <span style={{ fontSize: 17, fontWeight: 800, color: BRAND.orange }}>{fmt(p.price)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
