import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  DEFAULT_TIME_ZONE,
  isValidTimeZone,
  todayInTimeZone,
  type CalendarDate,
} from "@/lib/time";
import { unauthorizedError } from "@/lib/errors";
import { useAuth } from "@/modules/auth/auth-context";

import { fetchProfile, updateTimeZone } from "./profile-repository";

export const profileKeys = {
  detail: (userId: string) => ["profile", userId] as const,
};

export function useProfile() {
  const { userId } = useAuth();

  return useQuery({
    queryKey: profileKeys.detail(userId ?? "anonymous"),
    queryFn: fetchProfile,
    enabled: userId !== null,
    // O timezone muda raramente; evita refetch a cada foco de tela.
    staleTime: 5 * 60_000,
  });
}

/**
 * O fuso do usuário — a autoridade sobre fronteiras de dia e sobre a leitura
 * de qualquer instante da agenda.
 *
 * Enquanto o perfil não carrega usa o padrão. Nenhum componente deve ler o
 * fuso do dispositivo: um bloco criado em viagem precisa continuar aparecendo
 * no horário em que foi planejado.
 */
export function useTimeZone(): string {
  const { data: profile } = useProfile();
  return profile?.timeZone ?? DEFAULT_TIME_ZONE;
}

/**
 * O dia de hoje NO CALENDÁRIO DO USUÁRIO.
 *
 * Enquanto o perfil não carrega, usa o padrão — a alternativa seria não exibir
 * nada, e o único efeito de um fuso temporariamente diferente é o rótulo
 * "atrasada" aparecer com alguns instantes de atraso.
 */
export function useToday(): CalendarDate {
  return todayInTimeZone(useTimeZone());
}

/**
 * Trocar o fuso.
 *
 * Depois da escrita TUDO é invalidado, e não só o perfil: o fuso é a origem das
 * fronteiras de dia, então "hoje", os intervalos consultados pela agenda e o
 * recorte do heatmap mudam de significado junto com ele. Invalidar só o perfil
 * deixaria as telas mostrando os dias antigos com o fuso novo.
 *
 * É a única invalidação total do aplicativo, e ela se justifica porque a
 * operação é rara e realmente muda o significado de todo dado em cache.
 */
export function useUpdateTimeZone() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  return useMutation({
    mutationFn: (timeZone: string) => {
      if (userId === null) throw unauthorizedError();
      return updateTimeZone(userId, timeZone);
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(profileKeys.detail(profile.id), profile);
      return queryClient.invalidateQueries();
    },
  });
}

/** O fuso que o aparelho informa, ou `null` se o runtime não souber dizer. */
export function deviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isValidTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}
