// Curriculum « structures de lecture » : 12 unités, ≈ 1 par week-end d'ici janvier.
// Chaque unité enseigne à RECONNAÎTRE une structure en lisant (pas à la produire) : une fiche d'un
// écran, des phrases-clés à décortiquer dans le Lecteur, et des étiquettes (StructureTag) qui
// guident la génération des textes et repèrent la structure dans l'analyse.
import type { StructureTag } from "./types";

export interface UnitTable {
  head: string[];
  rows: string[][];
}

export interface ReadingUnit {
  id: string;
  n: number;
  title: string;
  /** Une ligne : ce qu'on apprend à repérer. */
  goal: string;
  tags: StructureTag[];
  /** L'idée centrale, en 2-3 phrases. */
  idea: string;
  /** Les repères concrets à guetter en lisant. */
  points: string[];
  table?: UnitTable;
  /** Le piège typique d'un francophone. */
  pitfall: string;
  /** Phrases-clés (analysées une fois, partagées) — de la plus simple à la plus dense. */
  keySentences: string[];
  /** Consigne de génération : ce que les textes de l'unité doivent faire apparaître. */
  generationFocus: string;
}

export const UNITS: ReadingUnit[] = [
  {
    id: "u01-nom-acc",
    n: 1,
    title: "Qui fait quoi : nominatif et accusatif",
    goal: "Trouver le sujet et le COD grâce aux terminaisons, quel que soit l'ordre des mots.",
    tags: ["acc-object", "free-word-order"],
    idea:
      "En russe, ce n'est pas la place du mot qui dit qui agit, c'est sa terminaison. Le sujet est au nominatif, l'objet direct à l'accusatif. On peut donc dire « Машу любит Петя » : c'est quand même Petia qui aime Macha.",
    points: [
      "Trouve d'abord le VERBE conjugué : il s'accorde avec le sujet (читает → il/elle, читают → ils).",
      "Féminin en -а/-я : accusatif en -у/-ю (мама → маму, Таня → Таню). C'est le repère le plus visible.",
      "Masculin inanimé et neutre : accusatif = nominatif (стол, окно). Le contexte et le verbe tranchent.",
      "Masculin animé : accusatif = génitif (брат → брата, отец → отца).",
    ],
    table: {
      head: ["", "Nominatif (sujet)", "Accusatif (COD)"],
      rows: [
        ["fém. -а", "мама", "маму"],
        ["fém. -я", "Таня", "Таню"],
        ["masc. animé", "брат", "брата"],
        ["masc. inanimé", "дом", "дом"],
        ["pronoms", "я · ты · он · она · мы · они", "меня · тебя · его · её · нас · их"],
      ],
    },
    pitfall: "Lire dans l'ordre français : « Машу любит Петя » n'est pas « Macha aime Petia ».",
    keySentences: [
      "Мама читает книгу.",
      "Книгу читает мама.",
      "Брата видит сестра.",
      "Сестру видит брат.",
      "Эту песню поёт мой отец.",
      "Его любит вся семья.",
    ],
    generationFocus:
      "des sujets au nominatif et des COD à l'accusatif bien visibles (féminins en -у/-ю, masculins animés en -а), avec plusieurs phrases où le COD est placé AVANT le verbe ou le sujet après le verbe",
  },
  {
    id: "u02-genitif",
    n: 2,
    title: "Le génitif : « de », quantité, absence",
    goal: "Reconnaître le génitif et ses trois grands emplois.",
    tags: ["genitive", "negation-genitive", "u-menya-est"],
    idea:
      "Le génitif est le cas le plus fréquent après le nominatif. Il dit « de » (le livre du frère), il suit les quantités (много, мало, нет, сколько, les nombres ≥ 5) et beaucoup de prépositions (у, из, от, до, без, для, после).",
    points: [
      "Nom + nom au génitif = « de » : книга брата (le livre du frère), центр города.",
      "нет / не было / не будет + génitif = absence : нет времени, не было денег.",
      "у + génitif (+ есть) = « avoir » : у меня есть сестра = j'ai une sœur.",
      "Terminaisons : -а/-я (masc./neutre), -ы/-и (fém.) ; au pluriel souvent -ов/-ев ou rien (книг, мам).",
    ],
    table: {
      head: ["", "Nominatif", "Génitif sg.", "Génitif pl."],
      rows: [
        ["masc.", "брат", "брата", "братьев"],
        ["neutre", "окно", "окна", "окон"],
        ["fém.", "книга", "книги", "книг"],
        ["pronoms", "я · он · она", "меня · его · её", "—"],
      ],
    },
    pitfall: "книги peut être génitif singulier OU nominatif/accusatif pluriel : regarde ce qui précède (нет, у, без, много…).",
    keySentences: [
      "У меня есть брат.",
      "У брата нет машины.",
      "Это дом моего друга.",
      "В городе много парков.",
      "Я пришёл без книги.",
      "После урока у студентов не было времени.",
    ],
    generationFocus:
      "des génitifs variés : possession (nom + nom au génitif), у кого есть, нет + génitif, quantités (много, мало, сколько, nombres), prépositions из/от/до/без/для/после",
  },
  {
    id: "u03-prep-dat",
    n: 3,
    title: "Où et à qui : prépositionnel et datif",
    goal: "Repérer le lieu (в/на + prépositionnel) et le destinataire (datif).",
    tags: ["prepositional-place", "dative"],
    idea:
      "Le prépositionnel n'apparaît qu'après une préposition : в/на (où ?) et о (à propos de). Le datif répond à « à qui ? / pour qui ? » et sert aussi aux sensations et aux goûts : мне нравится, ему нужно.",
    points: [
      "в/на + -е = lieu : в школе, на работе, в Москве. о + -е = « à propos de » : о брате.",
      "Datif singulier : -у/-ю (masc./neutre : брату), -е (fém. : маме). Pluriel : -ам/-ям.",
      "Datif des pronoms : мне, тебе, ему, ей, нам, вам, им.",
      "мне нравится X = X me plaît : X est le SUJET (nominatif), la personne est au datif.",
    ],
    table: {
      head: ["", "Prépositionnel (où, de quoi)", "Datif (à qui)"],
      rows: [
        ["masc.", "в доме, о брате", "брату"],
        ["fém.", "в школе, о маме", "маме"],
        ["fém. -ия / -ь", "в России, о дочери", "России, дочери"],
        ["pluriel", "в домах", "братьям"],
      ],
    },
    pitfall: "« Мне нравится музыка » : le sujet est музыка. Le français « j'aime » inverse les rôles.",
    keySentences: [
      "Мы живём в большом доме.",
      "Папа работает на заводе.",
      "Я дал брату книгу.",
      "Маме нравится эта песня.",
      "Мы говорили о новом фильме.",
      "Друзьям я написал длинное письмо о нашей поездке.",
    ],
    generationFocus:
      "des lieux en в/на + prépositionnel, des « à propos de » (о + prépositionnel), des destinataires au datif (давать, писать, звонить, помогать кому), et la tournure мне нравится / мне нужно",
  },
  {
    id: "u04-instrumental",
    n: 4,
    title: "L'instrumental : avec, par, en tant que",
    goal: "Reconnaître l'instrumental (-ом/-ой/-ами) et ce qu'il signifie.",
    tags: ["instrumental"],
    idea:
      "L'instrumental dit l'outil (писать ручкой = écrire AU stylo), l'accompagnement avec с (с другом), la fonction avec быть/стать/работать (стать врачом = devenir médecin) et certains lieux (над, под, перед, за, между).",
    points: [
      "Terminaisons très visibles : -ом/-ем (masc./neutre), -ой/-ей (fém.), -ами/-ями (pluriel).",
      "с + instrumental = avec : чай с молоком, с братом.",
      "стать / быть (au passé, au futur) / работать / заниматься + instrumental.",
      "Pronoms : мной, тобой, им, ей, нами, вами, ими (с ним = avec lui).",
    ],
    table: {
      head: ["", "Nominatif", "Instrumental"],
      rows: [
        ["masc.", "друг", "другом"],
        ["fém.", "сестра", "сестрой"],
        ["neutre", "письмо", "письмом"],
        ["pluriel", "друзья", "друзьями"],
      ],
    },
    pitfall: "Le masculin en -ом de l'instrumental ressemble au prépositionnel -ом des adjectifs (в новом доме). Regarde la préposition.",
    keySentences: [
      "Я пью чай с молоком.",
      "Брат пишет ручкой.",
      "Моя сестра стала врачом.",
      "Мы гуляли в парке с друзьями.",
      "Отец работает инженером.",
      "Над городом летели птицы.",
    ],
    generationFocus:
      "des instrumentaux : с + compagnon, outil sans préposition, стать/работать/быть кем, prépositions над/под/перед/за/между",
  },
  {
    id: "u05-impersonnel",
    n: 5,
    title: "Phrases sans sujet : l'impersonnel",
    goal: "Comprendre les phrases où la personne est au datif et où il n'y a pas de nominatif.",
    tags: ["impersonal", "dative"],
    idea:
      "Beaucoup de phrases russes n'ont pas de sujet : l'état est décrit par un mot en -о (холодно, скучно, можно, нельзя, надо) et la personne concernée est au datif. Мне холодно = « à moi il fait froid » = j'ai froid.",
    points: [
      "Datif + mot en -о : мне холодно, ему скучно, нам весело.",
      "Datif + надо / нужно / можно / нельзя + infinitif : тебе надо спать.",
      "Au passé : было ; au futur : будет (мне было холодно).",
      "Verbes impersonnels : кажется (il semble), хочется (on a envie), не спится.",
    ],
    pitfall: "Chercher un sujet au nominatif qui n'existe pas. La personne est au datif et c'est normal.",
    keySentences: [
      "Мне холодно.",
      "Тебе надо отдохнуть.",
      "Здесь нельзя курить.",
      "Детям было весело.",
      "Мне кажется, что он прав.",
      "Вечером нам захотелось погулять.",
    ],
    generationFocus:
      "des tournures impersonnelles : datif + mot en -о (холодно, скучно, весело, трудно), надо/нужно/можно/нельзя + infinitif, кажется, хочется, au présent, passé (было) et futur (будет)",
  },
  {
    id: "u06-aspect",
    n: 6,
    title: "L'aspect : processus ou résultat",
    goal: "Lire la différence entre imperfectif et perfectif, et le futur perfectif.",
    tags: ["aspect"],
    idea:
      "Presque chaque verbe existe en paire : imperfectif (le processus, l'habitude : читать) et perfectif (le résultat, l'action unique accomplie : прочитать). La forme « présent » d'un perfectif est un FUTUR : прочитаю = je lirai (jusqu'au bout).",
    points: [
      "Perfectif souvent = imperfectif + préfixe : делать → сделать, писать → написать.",
      "Ou changement de suffixe : решать → решить, давать → дать.",
      "Perfectif au « présent » = futur : я сделаю. Imperfectif au futur = буду + infinitif.",
      "Imperfectif au passé = « je lisais / j'ai lu (pendant un temps, souvent) » ; perfectif au passé = « j'ai lu (fini) ».",
    ],
    table: {
      head: ["Imperfectif (processus)", "Perfectif (résultat)", "Futur perfectif"],
      rows: [
        ["читать", "прочитать", "прочитаю"],
        ["писать", "написать", "напишу"],
        ["решать", "решить", "решу"],
        ["говорить", "сказать", "скажу"],
      ],
    },
    pitfall: "Lire « он напишет » comme un présent. C'est un futur : il écrira.",
    keySentences: [
      "Я долго читал эту книгу.",
      "Вчера я прочитал эту книгу.",
      "Завтра я напишу письмо.",
      "Каждый день он решал задачи.",
      "Он решил задачу и пошёл гулять.",
      "Когда я буду читать, не говори со мной.",
    ],
    generationFocus:
      "des paires aspectuelles en contraste : imperfectif pour les habitudes et les actions en cours, perfectif pour les résultats et les enchaînements d'actions, futur perfectif (forme de présent) et futur imperfectif (буду + infinitif)",
  },
  {
    id: "u07-mouvement",
    n: 7,
    title: "Verbes de mouvement et préfixes",
    goal: "Lire идти/ходить, ехать/ездить et leurs préfixes (при-, у-, вы-, в-, за-).",
    tags: ["motion-verb"],
    idea:
      "Le russe distingue aller à pied (идти) et en véhicule (ехать), un trajet unique dans une direction (идти, ехать) et des allers-retours ou habitudes (ходить, ездить). Les préfixes ajoutent la direction : при- arriver, у- partir, вы- sortir, в- entrer, за- passer chez.",
    points: [
      "идти / ехать = un trajet en cours dans une direction ; ходить / ездить = habitude, aller-retour.",
      "Avec préfixe, la paire devient imperfectif/perfectif : приходить / прийти, уезжать / уехать.",
      "в/на + accusatif = direction (в школу), из/с + génitif = d'où (из школы), к + datif = vers quelqu'un.",
      "Passé irrégulier : шёл, шла, шли (идти) ; пошёл = il est parti, il s'est mis en route.",
    ],
    table: {
      head: ["Préfixe", "Sens", "Exemple"],
      rows: [
        ["при-", "arriver", "пришёл домой"],
        ["у-", "partir", "уехал в Москву"],
        ["вы-", "sortir", "вышел из дома"],
        ["в-", "entrer", "вошёл в комнату"],
        ["за-", "passer (chez)", "зашёл к другу"],
        ["по-", "se mettre en route", "пошёл в магазин"],
      ],
    },
    pitfall: "« в школу » (direction, accusatif) n'est pas « в школе » (lieu, prépositionnel).",
    keySentences: [
      "Я иду в школу.",
      "Каждый день я хожу в школу.",
      "Летом мы ездили на море.",
      "Отец пришёл домой поздно.",
      "Она вышла из комнаты.",
      "По дороге домой я зашёл к другу.",
    ],
    generationFocus:
      "des verbes de mouvement (идти/ходить, ехать/ездить) et leurs formes préfixées (пришёл, ушёл, вышел, вошёл, зашёл, поехал), avec des directions en в/на + accusatif, из/с + génitif, к + datif",
  },
  {
    id: "u08-subordonnees",
    n: 8,
    title: "Subordonnées : который, что, чтобы, если",
    goal: "Découper une phrase longue et trouver de quoi parle chaque proposition.",
    tags: ["relative-kotoryj", "subordinate"],
    idea:
      "Les phrases longues se découpent aux virgules : en russe, chaque subordonnée est encadrée de virgules. который (« qui/que ») prend le genre et le nombre du nom qu'il remplace, mais son CAS vient de sa fonction dans la relative.",
    points: [
      "который : genre/nombre = le nom qu'il remplace ; cas = son rôle dans la relative (которую = COD, которой = à qui, о котором = dont on parle).",
      "что = que (он сказал, что…) ; чтобы + passé/infinitif = pour que / pour.",
      "если = si (condition réelle) ; если бы + passé = si (irréel), бы = conditionnel.",
      "когда (quand), потому что (parce que), хотя (bien que) ouvrent aussi une proposition.",
    ],
    table: {
      head: ["Forme de который", "Rôle dans la relative", "Sens"],
      rows: [
        ["который / которая", "sujet", "qui"],
        ["которого / которую", "COD", "que"],
        ["которому / которой", "datif", "à qui"],
        ["о котором / о которой", "prépositionnel", "dont (on parle)"],
        ["с которым / с которой", "instrumental", "avec qui"],
      ],
    },
    pitfall: "Croire que которой a le cas du nom qu'il remplace. Девушка, которой я помог : девушка est au nominatif, которой au datif (j'ai aidé À elle).",
    keySentences: [
      "Это книга, которую я читаю.",
      "Я знаю девушку, которая живёт в этом доме.",
      "Друг, которому я звонил, не ответил.",
      "Он сказал, что придёт завтра.",
      "Я пришёл, чтобы помочь тебе.",
      "Если бы у меня было время, я бы поехал к вам.",
    ],
    generationFocus:
      "des propositions relatives avec который à des cas variés (которую, которому, о котором, с которым), des complétives en что, des buts en чтобы, des conditions en если et если бы, des temporelles en когда",
  },
  {
    id: "u09-court-comparatif",
    n: 9,
    title: "Adjectifs courts et comparatifs",
    goal: "Reconnaître рад, должен, готов, открыт et больше, лучше, чем, самый.",
    tags: ["short-adjective", "comparative"],
    idea:
      "L'adjectif court (sans terminaison de cas : рад, готов, должен, занят) est toujours un ATTRIBUT : « il est content », jamais « le content ». Le comparatif en -ее ou irrégulier (больше, лучше) se construit avec чем ou avec le génitif.",
    points: [
      "Formes courtes : он рад, она рада, оно радо, они рады ; должен = doit.",
      "Comparatif : -ее (быстрее, интереснее) ou irrégulier : больше, меньше, лучше, хуже, старше, моложе.",
      "« plus grand que » : больше, чем брат OU больше брата (génitif).",
      "Superlatif : самый + adjectif (самый большой) ou -ейший.",
    ],
    table: {
      head: ["Forme longue", "Forme courte", "Comparatif"],
      rows: [
        ["хороший", "хорош", "лучше"],
        ["большой", "велик", "больше"],
        ["интересный", "интересен", "интереснее"],
        ["готовый", "готов", "—"],
      ],
    },
    pitfall: "« Он старше брата » : брата est au génitif de comparaison, pas un génitif de possession.",
    keySentences: [
      "Я рад тебя видеть.",
      "Ты должен прийти вовремя.",
      "Магазин уже закрыт.",
      "Моя сестра старше меня.",
      "Этот фильм интереснее, чем книга.",
      "Это самый большой город в стране.",
    ],
    generationFocus:
      "des adjectifs courts attributs (рад, готов, должен, занят, закрыт, прав) et des comparaisons (comparatif + чем ou + génitif, самый)",
  },
  {
    id: "u10-participes-actifs",
    n: 10,
    title: "Participes actifs : « qui fait / qui a fait »",
    goal: "Reconnaître -щий (qui fait) et -вший (qui a fait) et les ramener au verbe.",
    tags: ["active-participle"],
    idea:
      "Le participe actif est un adjectif fabriqué à partir d'un verbe : читающий = « qui lit », читавший = « qui lisait/qui a lu ». Il s'accorde avec son nom comme un adjectif. Typique de l'écrit (presse, littérature) : il remplace une relative avec который.",
    points: [
      "Présent : -ющий / -ащий / -ящий (читающий, говорящий) = который читает.",
      "Passé : -вший / -ший (читавший, принёсший) = который читал.",
      "Il porte les terminaisons d'adjectif : читающего, читающей, читающие…",
      "Pour le comprendre : enlève la terminaison, retrouve le verbe, traduis par « qui… ».",
    ],
    table: {
      head: ["Verbe", "Participe présent", "Participe passé"],
      rows: [
        ["читать", "читающий", "читавший"],
        ["говорить", "говорящий", "говоривший"],
        ["жить", "живущий", "живший"],
        ["учиться", "учащийся", "учившийся"],
      ],
    },
    pitfall: "Lire учащийся comme un nom inconnu : c'est « qui étudie » (= élève).",
    keySentences: [
      "Девочка, читающая книгу, — моя сестра.",
      "Я видел человека, говорящего по-русски.",
      "Студенты, живущие в общежитии, учатся хорошо.",
      "Мужчина, сидевший рядом со мной, спал.",
      "Мы встретили туристов, приехавших из Франции.",
      "Учащиеся нашей школы победили в конкурсе.",
    ],
    generationFocus:
      "des participes actifs présents (-ющий/-ащий) et passés (-вший), déclinés à plusieurs cas, souvent en apposition après le nom entre virgules, dans un style de récit ou de presse simple",
  },
  {
    id: "u11-passifs",
    n: 11,
    title: "Le passif : -нный, -тый, -емый et -ся",
    goal: "Comprendre qui subit l'action : построен, открытый, строится.",
    tags: ["passive-participle", "reflexive-passive", "short-adjective"],
    idea:
      "Le participe passif dit ce qui a subi l'action : построенный = « construit », открытый = « ouvert ». En forme courte, c'est le passif : дом построен = la maison est/a été construite. Avec un imperfectif, -ся fait aussi un passif : дом строится = la maison est en construction. L'agent est à l'instrumental : построен рабочими.",
    points: [
      "Passé passif : -анный/-янный, -енный, -тый (написанный, решённый, открытый).",
      "Forme courte = passif : письмо написано, магазин открыт, задача решена.",
      "Présent passif : -емый / -имый (любимый = aimé, уважаемый = respecté).",
      "Agent à l'instrumental : роман написан Толстым. Verbe imperfectif + -ся : здесь продаются книги.",
    ],
    table: {
      head: ["Verbe", "Participe passif", "Forme courte (passif)"],
      rows: [
        ["написать", "написанный", "написан, -а, -о, -ы"],
        ["построить", "построенный", "построен"],
        ["открыть", "открытый", "открыт"],
        ["любить", "любимый", "—"],
      ],
    },
    pitfall: "« Здесь продаются книги » n'est pas « les livres se vendent eux-mêmes » : c'est « on vend des livres ici ».",
    keySentences: [
      "Магазин открыт до девяти.",
      "Письмо было написано вчера.",
      "Этот дом построен в прошлом веке.",
      "Роман «Война и мир» написан Толстым.",
      "Здесь продаются свежие газеты.",
      "Мы долго смотрели на картину, нарисованную моим дедом.",
    ],
    generationFocus:
      "des participes passifs passés en forme longue (построенный, написанный, открытый) et courte (построен, написано, открыт), des passifs en -ся avec des verbes imperfectifs (строится, продаются), l'agent à l'instrumental",
  },
  {
    id: "u12-gerondifs",
    n: 12,
    title: "Gérondifs, puis un vrai texte",
    goal: "Reconnaître -я / -в(ши) et lire un texte authentique de bout en bout.",
    tags: ["gerund"],
    idea:
      "Le gérondif (деепричастие) est invariable et décrit une action secondaire du MÊME sujet : читая = en lisant ; прочитав = après avoir lu. Il est toujours séparé par des virgules. Avec cette unité, tu as toutes les briques : la lecture guidée finit sur un texte original non adapté.",
    points: [
      "Imperfectif : -я / -а (читая, говоря, слыша) = « en faisant », simultané.",
      "Perfectif : -в / -вши / -вшись (прочитав, вернувшись) = « après avoir fait ».",
      "Le sujet du gérondif = le sujet du verbe principal.",
      "Découpe aux virgules : [gérondive], proposition principale.",
    ],
    table: {
      head: ["Verbe", "Gérondif", "Sens"],
      rows: [
        ["читать", "читая", "en lisant"],
        ["прочитать", "прочитав", "après avoir lu"],
        ["вернуться", "вернувшись", "une fois revenu"],
        ["улыбаться", "улыбаясь", "en souriant"],
      ],
    },
    pitfall: "Chercher un sujet à « вернувшись » : c'est celui du verbe principal.",
    keySentences: [
      "Читая книгу, я пил чай.",
      "Прочитав письмо, она заплакала.",
      "Вернувшись домой, отец сел ужинать.",
      "Он шёл по улице, улыбаясь прохожим.",
      "Закончив работу, мы пошли в кафе.",
      "Не зная дороги, туристы долго ходили по городу.",
    ],
    generationFocus:
      "des gérondifs imperfectifs (-я/-а) et perfectifs (-в, -вшись) en tête ou en fin de phrase, mêlés à toutes les structures précédentes (cas, aspect, relatives, participes) — niveau proche d'un texte authentique",
  },
];

export function findUnit(id: string | null | undefined): ReadingUnit | undefined {
  return UNITS.find((u) => u.id === id);
}

/** Étiquettes de toutes les unités jusqu'à n inclus (structures « débloquées »). */
export function tagsUpTo(n: number): StructureTag[] {
  return [...new Set(UNITS.filter((u) => u.n <= n).flatMap((u) => u.tags))];
}
