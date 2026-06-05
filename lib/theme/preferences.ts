import { createClient } from "@/lib/supabase/client";

// Persistir preferencias de apariencia en public.users.settings (patrón POS):
// quedan disponibles en cualquier dispositivo. Silencioso: si falla, localStorage
// sigue siendo la fuente local.
export async function persistPrefs(): Promise<void> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const appearance = {
      display: localStorage.getItem("food-display"),
      price: localStorage.getItem("food-price"),
      bg: localStorage.getItem("food-bg"),
      priceAccent: localStorage.getItem("food-price-accent"),
      theme: localStorage.getItem("ninja-food-theme"),
    };

    await supabase
      .from("users")
      .update({ settings: { appearance } })
      .eq("id", user.id);
  } catch {
    // best-effort
  }
}
