// Open Russian webradio streams (Radio Record — public Icecast AAC feeds). "Русский микс" is
// Russian-language music, great for passive immersion; the others add variety.
export interface RadioStation {
  id: string;
  label: string;
  title: string;
  url: string;
}

export const RADIO_STATIONS: RadioStation[] = [
  {
    id: "rus",
    label: "Русский микс",
    title: "Radio Record · Русский микс",
    url: "https://radiorecord.hostingradio.ru/rus96.aacp",
  },
  {
    id: "russiangold",
    label: "Russian Gold",
    title: "Radio Record · Russian Gold",
    url: "https://radiorecord.hostingradio.ru/russiangold96.aacp",
  },
];
