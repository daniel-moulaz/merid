import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useAuth } from "@/modules/auth/auth-context";
import { useTimeZone, useToday } from "@/modules/profile/profile-queries";

import { indexActivityByDate } from "../domain/activity";
import { heatmapInstantRange, HEATMAP_HISTORY_WEEKS } from "../domain/heatmap";
import { fetchDailyActivity } from "./progress-repository";

/**
 * Estado de servidor do progresso.
 *
 * ## Por que a chave mora debaixo de `["tasks", userId]`
 *
 * O progresso não é uma fonte de dados nova: é a MESMA tabela `tasks`, lida de
 * outro ângulo. Pendurar a chave sob o prefixo de tarefas faz o
 * `invalidateTasks` que já existe alcançá-la sem nenhuma linha nova — concluir
 * uma tarefa na Inbox, em Hoje ou na Agenda atualiza o heatmap pelo mesmo
 * caminho que já atualiza as outras telas.
 *
 * O contrário — um sistema de invalidação próprio para o progresso — seria
 * infraestrutura para um problema que a nomenclatura já resolve.
 */
export const progressKeys = {
  activity: (userId: string, from: string, to: string) =>
    ["tasks", userId, "activity", from, to] as const,
};

/**
 * Atividade diária da janela de histórico.
 *
 * O intervalo NÃO acompanha o tamanho da tela: ele é sempre o mesmo (ver
 * `HEATMAP_HISTORY_WEEKS`). Se encolhesse junto com a largura, a "melhor
 * sequência" da pessoa mudaria ao girar o telefone, e o cache seria refeito a
 * cada mudança de layout.
 */
export function useDailyActivity() {
  const { userId } = useAuth();
  const timeZone = useTimeZone();
  const today = useToday();

  const range = useMemo(
    () => heatmapInstantRange(today, timeZone, HEATMAP_HISTORY_WEEKS),
    [today, timeZone],
  );

  const query = useQuery({
    queryKey: progressKeys.activity(
      userId ?? "anonymous",
      range.start.toISOString(),
      range.endExclusive.toISOString(),
    ),
    queryFn: () => fetchDailyActivity(range, timeZone),
    enabled: userId !== null,
  });

  const days = query.data;
  const activity = useMemo(() => indexActivityByDate(days ?? []), [days]);

  return { ...query, activity };
}
