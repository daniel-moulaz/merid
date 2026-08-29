/** Perfil do usuário. O `timeZone` define as fronteiras de dia do produto. */
export type Profile = {
  readonly id: string;
  readonly displayName: string | null;
  /** Timezone IANA, ex.: "America/Sao_Paulo". */
  readonly timeZone: string;
};
