import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Todo excepto estáticos y la traza pública QR (t/[slug] es anónima):
     */
    "/((?!_next/static|_next/image|favicon.ico|img/|t/).*)",
  ],
};
