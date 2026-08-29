import { useQuery } from "@tanstack/react-query";

import { DEFAULT_TIME_ZONE, todayInTimeZone, type CalendarDate } from "@/lib/time";
import { useAuth } from "@/modules/auth/auth-context";

import { fetchProfile } from "./profile-repository";

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
