import { supabase } from "@/lib/supabase";
import { unwrap } from "@/lib/supabase-errors";

import type { Profile } from "./profile";

/**
 * O perfil é criado pelo trigger `handle_new_user` no cadastro. O cliente
 * apenas lê e atualiza — não existe policy de INSERT nem de DELETE.
 *
 * A consulta não filtra por id: o RLS já devolve somente a linha do próprio
 * usuário.
 */
export async function fetchProfile(): Promise<Profile> {
  const row = unwrap(
    await supabase.from("profiles").select("id, display_name, time_zone").single(),
  );

  return {
    id: row.id,
    displayName: row.display_name,
    timeZone: row.time_zone,
  };
}
