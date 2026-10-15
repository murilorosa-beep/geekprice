/** Rótulos de apresentação; os identificadores gravados no catálogo são preservados. */
const conditions: Record<string, string> = {
  new: "Nova", near_mint: "Near Mint", lightly_played: "Lightly Played",
  moderately_played: "Moderately Played", heavily_played: "Heavily Played",
  played: "Usada", damaged: "Danificada",
};
const finishes: Record<string, string> = {
  standard: "Padrão", normal: "Padrão", foil: "Foil", holo: "Holo",
  reverse: "Reverse Holo", reverse_holo: "Reverse Holo", non_foil: "Não foil",
};
const languages: Record<string, string> = {
  "pt-br": "Português (BR)", pt: "Português", en: "Inglês",
  ja: "Japonês", de: "Alemão", es: "Espanhol", fr: "Francês",
};
export const cardConditionLabel = (value: string) => conditions[value.toLowerCase()] ?? value.replaceAll("_", " ");
export const cardFinishLabel = (value: string) => finishes[value.toLowerCase()] ?? value.replaceAll("_", " ");
export const cardLanguageLabel = (value: string) => languages[value.toLowerCase()] ?? value;
