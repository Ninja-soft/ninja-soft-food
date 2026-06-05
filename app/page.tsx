import { redirect } from "next/navigation";

// Sin landing por ahora (como el POS): la raíz entra directo al login.
// El guard de (app) redirige a /dashboard si ya hay sesión con tenant.
export default function RootPage() {
  redirect("/login");
}
