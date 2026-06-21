import type { ReportLocale } from './reportStrings';

// Labels for the printable (paper) blank-exam PDF. Kept separate from the dark
// results report strings so the two layouts can evolve independently. The locale
// resolver mirrors reportStrings(): unknown -> Serbian Latin.
export interface ExamPrintStrings {
  name: string;
  index: string;
  group: string;
  date: string;
  signature: string;
  forGrader: string;
  points: string;
  duration: string;
  minutesShort: string;
  questions: string;
  totalPoints: string;
  instructions: string;
  pointsShort: string;
  multiSelectHint: string;
  orderingHint: string;
  matchingHint: string;
  page: string;
}

export const EXAM_PRINT_STRINGS: Record<ReportLocale, ExamPrintStrings> = {
  'en': {
    name: 'Full name',
    index: 'Student ID',
    group: 'Group',
    date: 'Date',
    signature: 'Signature',
    forGrader: 'For the examiner',
    points: 'Points',
    duration: 'Duration',
    minutesShort: 'min',
    questions: 'Questions',
    totalPoints: 'Total points',
    instructions: 'Read each question carefully and mark your answers clearly. Write legibly in blue or black ink.',
    pointsShort: 'pts',
    multiSelectHint: 'Select all correct answers',
    orderingHint: 'Write the order number (1, 2, 3, ...) in the box before each item.',
    matchingHint: 'Write the letter of the matching item in the box.',
    page: 'Page',
  },
  'sr-Latn': {
    name: 'Ime i prezime',
    index: 'Broj indeksa',
    group: 'Grupa',
    date: 'Datum',
    signature: 'Potpis',
    forGrader: 'Za ocenjivača',
    points: 'Bodovi',
    duration: 'Trajanje',
    minutesShort: 'min',
    questions: 'Pitanja',
    totalPoints: 'Ukupno bodova',
    instructions: 'Pažljivo pročitajte svako pitanje i jasno označite odgovore. Pišite čitko, plavom ili crnom hemijskom.',
    pointsShort: 'bod.',
    multiSelectHint: 'Označite sve tačne odgovore',
    orderingHint: 'Upišite redni broj (1, 2, 3, ...) u kvadratić ispred svake stavke.',
    matchingHint: 'Upišite slovo odgovarajućeg para u kvadratić.',
    page: 'Strana',
  },
  'sr-Cyrl': {
    name: 'Име и презиме',
    index: 'Број индекса',
    group: 'Група',
    date: 'Датум',
    signature: 'Потпис',
    forGrader: 'За оцењивача',
    points: 'Бодови',
    duration: 'Трајање',
    minutesShort: 'мин',
    questions: 'Питања',
    totalPoints: 'Укупно бодова',
    instructions: 'Пажљиво прочитајте свако питање и јасно означите одговоре. Пишите читко, плавом или црном хемијском.',
    pointsShort: 'бод.',
    multiSelectHint: 'Означите све тачне одговоре',
    orderingHint: 'Упишите редни број (1, 2, 3, ...) у квадратић испред сваке ставке.',
    matchingHint: 'Упишите слово одговарајућег пара у квадратић.',
    page: 'Страна',
  },
  'bs': {
    name: 'Име и презиме',
    index: 'Број индекса',
    group: 'Група',
    date: 'Датум',
    signature: 'Потпис',
    forGrader: 'За оцјењивача',
    points: 'Бодови',
    duration: 'Трајање',
    minutesShort: 'мин',
    questions: 'Питања',
    totalPoints: 'Укупно бодова',
    instructions: 'Пажљиво прочитајте свако питање и јасно означите одговоре. Пишите читко, плавом или црном хемијском.',
    pointsShort: 'бод.',
    multiSelectHint: 'Означите све тачне одговоре',
    orderingHint: 'Упишите редни број (1, 2, 3, ...) у квадратић испред сваке ставке.',
    matchingHint: 'Упишите слово одговарајућег пара у квадратић.',
    page: 'Страна',
  },
};

export function examPrintStrings(locale: string | undefined | null): ExamPrintStrings {
  if (locale === 'en' || locale === 'sr-Latn' || locale === 'sr-Cyrl' || locale === 'bs') return EXAM_PRINT_STRINGS[locale];
  if (locale === 'sr') return EXAM_PRINT_STRINGS['sr-Latn'];
  return EXAM_PRINT_STRINGS['sr-Latn'];
}
