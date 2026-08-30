import { validationError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { unwrap } from "@/lib/supabase-errors";
import { isValidTimeZone } from "@/lib/time";

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

/**
 * Trocar o fuso do usuário.
 *
 * É a configuração mais consequente do produto: ela decide o que conta como
 * "hoje", em que dia uma conclusão entra no heatmap e onde a agenda desenha
 * cada bloco. O fuso é detectado no cadastro, mas a detecção pode falhar (cai
 * no padrão) e a pessoa pode simplesmente mudar de país — sem esta escrita, um
 * fuso errado ficaria errado para sempre.
 *
 * A validação acontece ANTES da requisição porque um IANA inválido só voltaria
 * do Postgres como erro de função, sem mensagem aproveitável; o CHECK do banco
 * (`profiles_time_zone_not_blank`) continua sendo a garantia final.
 *
 * O `id` VAI no filtro, ao contrário do que acontece na leitura. Não é
 * desconfiança da policy — é que o PostgREST recusa `UPDATE` sem cláusula
 * `WHERE` ("UPDATE requires a WHERE clause"), uma trava contra a atualização
 * acidental de uma tabela inteira. A autorização continua sendo da policy: o id
 * de outra pessoa passa pelo filtro e não encontra linha nenhuma.
 */
export async function updateTimeZone(id: string, timeZone: string): Promise<Profile> {
  const trimmed = timeZone.trim();

  if (!isValidTimeZone(trimmed)) {
    throw validationError(
      "Fuso horário inválido. Use um identificador IANA, como America/Sao_Paulo.",
    );
  }

  const row = unwrap(
    await supabase
      .from("profiles")
      .update({ time_zone: trimmed })
      .eq("id", id)
      .select("id, display_name, time_zone")
      .single(),
  );

  return { id: row.id, displayName: row.display_name, timeZone: row.time_zone };
}
