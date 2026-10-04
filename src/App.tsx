import { useState, useEffect } from "react";
import { GlobalStyle, PromoBar } from "@/components/shared";
import { type CartItem, type Order, type OrderItem, type Product, type SiteSettings } from "@/lib/supabase";
import { mockProducts, mockCategories, mockDeliveryZones, mockSiteSettings, mockOrders, mockOrderItems } from "@/lib/mockData";
import { NavBar, HomePage, ShopPage, CartPage, AboutPage, FaqPage, ContactPage } from "@/components/client-app";
import { ProductPage } from "@/components/product-page";
import { AdminDashboard } from "@/components/admin-app";
import { AdminLogin } from "@/components/admin/admin-login";

export default function App() {
  const [view, setView] = useState("home");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  // Vitrine visuelle uniquement — pas de backend branché pour l'instant.
  // Tout est gardé en state React : ça se comporte normalement pendant la
  // session, mais rien n'est persisté après un rechargement de page.
  const [products, setProducts] = useState<Product[]>(mockProducts);
  const [categories] = useState(mockCategories);
  const [deliveryZones, setDeliveryZones] = useState(mockDeliveryZones);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(mockSiteSettings);
  const [orders, setOrders] = useState<Order[]>(mockOrders);
  const [orderItems, setOrderItems] = useState<OrderItem[]>(mockOrderItems);

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  // Accès admin via l'URL #admin, comme dans la version d'origine.
  useEffect(() => {
    const checkHash = () => {
      if (window.location.hash === "#admin" && !isAdmin) setView("admin-login");
    };
    checkHash();
    window.addEventListener("hashchange", checkHash);
    return () => window.removeEventListener("hashchange", checkHash);
  }, [isAdmin]);

  const handleLogin = (_token: string) => {
    setIsAdmin(true);
    setView("dashboard");
  };

  const handleLogout = () => {
    setIsAdmin(false);
    window.location.hash = "";
    setView("home");
  };

  // ── Handlers admin : mutent uniquement le state local (mode démo) ──────────
  const handleUpdateOrderStatus = (id: number, status: string) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: status as Order["status"] } : o)));
  };

  const handleUpsertProduct = (id: number | "new", data: Record<string, unknown>) => {
    if (id === "new") {
      const newId = Math.max(0, ...products.map((p) => p.id)) + 1;
      setProducts((prev) => [
        ...prev,
        {
          id: newId,
          reviews: 0,
          sort_order: prev.length + 1,
          ...data,
        } as Product,
      ]);
    } else {
      setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } as Product : p)));
    }
  };

  const handleDeleteProduct = (id: number) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  };

  const handleUpdateStock = (id: number, stock: number) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, stock } : p)));
  };

  const handleUpdateZone = (id: number, name: string, price: number) => {
    setDeliveryZones((prev) => prev.map((z) => (z.id === id ? { ...z, name, price } : z)));
  };

  const handleAddZone = (name: string, price: number) => {
    setDeliveryZones((prev) => {
      const newId = Math.max(0, ...prev.map((z) => z.id)) + 1;
      return [...prev, { id: newId, name, price, sort_order: prev.length + 1 }];
    });
  };

  const handleDeleteZone = (id: number) => {
    setDeliveryZones((prev) => prev.filter((z) => z.id !== id));
  };

  const handleUpdateSettings = (settings: SiteSettings) => {
    setSiteSettings(settings);
  };

  if (view === "admin-login" || (view === "dashboard" && !isAdmin)) {
    return (
      <>
        <GlobalStyle />
        <AdminLogin onSuccess={handleLogin} />
      </>
    );
  }

  return (
    <>
      <GlobalStyle />
      <PromoBar />
      <NavBar view={view} setView={setView} cartCount={cartCount} isAdmin={isAdmin} onLogout={handleLogout} />
      <main>
        {view === "home" && <HomePage setView={setView} products={products} />}

        {view === "shop" && (
          <ShopPage products={products} categories={categories} cart={cart} setCart={setCart} setView={setView} />
        )}

        {view === "cart" && (
          <CartPage cart={cart} setCart={setCart} setView={setView} deliveryZones={deliveryZones} products={products} onOrderPlaced={() => {}} />
        )}

        {view === "about" && <AboutPage />}
        {view === "faq" && <FaqPage />}
        {view === "contact" && <ContactPage siteInfo={siteSettings} />}

        {view.startsWith("product:") && (() => {
          const productId = Number(view.split(":")[1]);
          const product = products.find((p) => p.id === productId);
          if (!product) {
            return <div style={{ padding: 60, textAlign: "center", color: "#7A6E65" }}>Produit introuvable.</div>;
          }
          const related = products.filter((p) => p.active && p.id !== product.id && p.category_id === product.category_id).slice(0, 4);
          return <ProductPage product={product} cart={cart} setCart={setCart} setView={setView} relatedProducts={related} />;
        })()}

        {view === "dashboard" && isAdmin && (
          <AdminDashboard
            products={products}
            categories={categories}
            orders={orders}
            orderItems={orderItems}
            deliveryZones={deliveryZones}
            siteSettings={siteSettings}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onUpsertProduct={handleUpsertProduct}
            onDeleteProduct={handleDeleteProduct}
            onUpdateStock={handleUpdateStock}
            onUpdateZone={handleUpdateZone}
            onAddZone={handleAddZone}
            onDeleteZone={handleDeleteZone}
            onUpdateSettings={handleUpdateSettings}
          />
        )}
      </main>
    </>
  );
}