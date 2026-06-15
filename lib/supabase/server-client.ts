import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

/** One Supabase server client per RSC request (avoids repeated cookie reads). */
export const getServerSupabase = cache(async () => {
  const cookieStore = await cookies();
  return createClient(cookieStore);
});
