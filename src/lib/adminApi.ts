import { supabase } from "@/lib/supabase";

const TOKEN_KEY = "eglantine_admin_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Extrait un message d'erreur lisible depuis n'importe quelle forme
 * d'erreur (Error JS classique, PostgrestError de Supabase, ou autre).
 * Corrige le bug où les erreurs Supabase (pas des instances de Error)
 * tombaient toujours sur un message générique.
 */
function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return fallback;
}

export async function adminLogin(email: string, password: string): Promise<string> {
  const { data, error } = await supabase.rpc("admin_login", {
    p_email: email,
    p_password: password,
  });

  if (error) {
    throw new Error(extractErrorMessage(error, "Erreur de connexion au serveur"));
  }
  if (!data) {
    throw new Error("Email ou mot de passe incorrect");
  }

  const token = data as string;
  storeToken(token);
  return token;
}

export async function adminLogout(token: string): Promise<void> {
  try {
    await supabase.rpc("admin_logout", { p_token: token });
  } finally {
    clearStoredToken();
  }
}

export async function adminGetData(token: string): Promise<{
  orders: unknown[];
  order_items: unknown[];
  deliverers: unknown[];
} | null> {
  const { data, error } = await supabase.rpc("admin_get_data", { p_token: token });

  if (error) {
    throw new Error(extractErrorMessage(error, "Impossible de charger les données admin"));
  }
  if (!data || (data as Record<string, unknown>).error === "invalid_token") {
    clearStoredToken();
    return null;
  }
  return data as { orders: unknown[]; order_items: unknown[]; deliverers: unknown[] };
}