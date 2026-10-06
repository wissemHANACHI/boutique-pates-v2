import type { Category, Product, DeliveryZone, SiteSettings, Order, OrderItem } from "@/lib/supabase";

export const mockCategories: Category[] = [
  { id: 1, name: "Pâtes longues", sort_order: 1 },
  { id: 2, name: "Pâtes courtes", sort_order: 2 },
  { id: 3, name: "Pâtes farcies", sort_order: 3 },
  { id: 4, name: "Sauces maison", sort_order: 4 },
];

export const mockProducts: Product[] = [
  {
    id: 1, category_id: 1, name: "Tagliatelles fraîches",
    description: "Pâtes longues et fines, préparées chaque matin avec de la semoule de blé dur premium.",
    price: 650, unit: "320g", stock: 24, active: true, low_stock_alert: 5,
    emoji: "🍝", badge: "Bestseller", reviews: 128,
    image_url: "https://images.unsplash.com/photo-1551462147-37885acc36f1?w=400&q=80",
    ingredients: "Semoule de blé dur, œufs frais, eau, sel",
    allergens: "Gluten, œufs",
    weight: "320g",
    sort_order: 1,
  },
  {
    id: 2, category_id: 2, name: "Fusilli tricolore",
    description: "Torsades colorées naturellement aux légumes (épinard, tomate, curcuma).",
    price: 600, unit: "320g", stock: 18, active: true, low_stock_alert: 5,
    emoji: "🌀", badge: "Nouveau", reviews: 42,
    image_url: "https://images.unsplash.com/photo-1621996346565-e3dbc353d2e5?w=400&q=80",
    ingredients: "Semoule de blé dur, œufs, épinard, tomate, curcuma",
    allergens: "Gluten, œufs",
    weight: "320g",
    sort_order: 2,
  },
  {
    id: 3, category_id: 3, name: "Ravioles ricotta-épinard",
    description: "Farcies à la main, ricotta fraîche et épinards fondants.",
    price: 900, unit: "400g", stock: 3, active: true, low_stock_alert: 5,
    emoji: "🥟", badge: "Coup de cœur", reviews: 76,
    image_url: "https://images.unsplash.com/photo-1587740908075-9e245311bd3d?w=400&q=80",
    ingredients: "Semoule de blé dur, œufs, ricotta, épinards, parmesan",
    allergens: "Gluten, œufs, lactose",
    weight: "400g",
    sort_order: 3,
  },
  {
    id: 4, category_id: 4, name: "Sauce tomate basilic",
    description: "Sauce maison mijotée, tomates fraîches et basilic du jardin.",
    price: 350, unit: "250ml", stock: 40, active: true, low_stock_alert: 10,
    emoji: "🍅", badge: null, reviews: 21,
    image_url: "https://images.unsplash.com/photo-1608897013039-887f21d8c804?w=400&q=80",
    ingredients: "Tomates fraîches, basilic, huile d'olive, ail, sel",
    allergens: "Aucun",
    weight: "250ml",
    sort_order: 4,
  },
];

export const mockDeliveryZones: DeliveryZone[] = [
  { id: 1, name: "Alger Centre", price: 400, sort_order: 1 },
  { id: 2, name: "Alger Est", price: 600, sort_order: 2 },
  { id: 3, name: "Alger Ouest", price: 800, sort_order: 3 },
];

export const mockSiteSettings: SiteSettings = {
  id: 1,
  phone: "0661 997 537",
  instagram: "@maison_eglantine16",
  address: "Alger, Algérie",
  hours: "Tous les jours – commandez en ligne",
};

export const mockOrders: Order[] = [
  {
    id: 1, order_number: 1001, client_name: "Sarah Benali", client_phone: "0555 12 34 56",
    client_address: "12 rue des Frères Bouadou", zone: "Alger Centre", delivery_fee: 400,
    notes: "", total: 1300, payment_mode: "À la livraison", status: "Nouvelle",
    deliverer_id: null, created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: 2, order_number: 1002, client_name: "Yacine Meziane", client_phone: "0661 98 76 54",
    client_address: "Cité 5 Juillet, Bt B", zone: "Alger Est", delivery_fee: 600,
    notes: "Sonner à l'interphone 12", total: 1500, payment_mode: "À la livraison", status: "En préparation",
    deliverer_id: null, created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    id: 3, order_number: 1003, client_name: "Lina Cherif", client_phone: "0770 22 33 44",
    client_address: "Résidence El Amel", zone: "Alger Ouest", delivery_fee: 800,
    notes: "", total: 2250, payment_mode: "À la livraison", status: "Livrée",
    deliverer_id: null, created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
];

export const mockOrderItems: OrderItem[] = [
  { id: 1, order_id: 1, product_id: 1, name: "Tagliatelles fraîches", qty: 2, price: 650 },
  { id: 2, order_id: 2, product_id: 3, name: "Ravioles ricotta-épinard", qty: 1, price: 900 },
  { id: 3, order_id: 2, product_id: 4, name: "Sauce tomate basilic", qty: 1, price: 350 },
  { id: 4, order_id: 3, product_id: 1, name: "Tagliatelles fraîches", qty: 3, price: 650 },
  { id: 5, order_id: 3, product_id: 2, name: "Fusilli tricolore", qty: 1, price: 600 },
];