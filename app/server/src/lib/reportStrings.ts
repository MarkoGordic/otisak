export type ReportLocale = 'en' | 'sr-Latn' | 'sr-Cyrl' | 'bs';

export interface ReportStrings {
  // BCP-47 locale for Date.toLocaleDateString/TimeString
  dateLocale: string;
  // header
  subtitle: string;
  generated: string;
  // student / exam cards
  student: string;
  exam: string;
  durationLabel: string;
  // score box
  passed: string;
  notPassed: string;
  thresholdLabel: string;
  timeLabel: string;
  // activity stats
  activityStats: string;
  statTotalEvents: string;
  statKeystrokes: string;
  statAnswerChanges: string;
  statWindowBlur: string;
  statCopyAttempts: string;
  statRightClicks: string;
  // suspicious
  suspiciousActivity: string;
  noSuspicious: string;
  // questions
  answersPerQuestion: string;
  questionWord: string;
  pointsShort: string;
  yourAnswerTag: string;
  correctTag: string;
  correctAnswerLabel: string;
  openAnswerLabel: string;
  noAnswerText: string;
  // timeline
  timelineTitle: string;
  eventsWord: string;
  andMoreEvents: string;
  colTime: string;
  colEvent: string;
  colDetails: string;
  // footer
  footerAuto: string;
  footerConfidential: string;
  // results table (landscape summary pdf)
  resultsSubtitle: string;
  studentsWord: string;
  passedWord: string;
  averageWord: string;
  colName: string;
  colIndex: string;
  colEmail: string;
  colPoints: string;
  colStatus: string;
  colSuspicious: string;
  statusPassed: string;
  statusNot: string;
  resultsFooterAuto: string;
  // activity event-type labels
  events: Record<string, string>;
}

export const REPORT_STRINGS: Record<ReportLocale, ReportStrings> = {
  en: {
    dateLocale: 'en-GB',
    subtitle: 'Detailed student activity report',
    generated: 'Generated',
    student: 'Student',
    exam: 'Exam',
    durationLabel: 'Duration',
    passed: 'PASSED',
    notPassed: 'NOT PASSED',
    thresholdLabel: 'Threshold',
    timeLabel: 'Time',
    activityStats: 'Activity statistics',
    statTotalEvents: 'Total events',
    statKeystrokes: 'Keystrokes',
    statAnswerChanges: 'Answer changes',
    statWindowBlur: 'Window blur',
    statCopyAttempts: 'Copy attempts',
    statRightClicks: 'Right clicks',
    suspiciousActivity: 'Suspicious activity',
    noSuspicious: 'No suspicious activity detected',
    answersPerQuestion: 'Answers per question',
    questionWord: 'Question',
    pointsShort: 'pts',
    yourAnswerTag: 'Your answer',
    correctTag: 'Correct',
    correctAnswerLabel: 'Correct answer',
    openAnswerLabel: 'Answer',
    noAnswerText: 'No answer',
    timelineTitle: 'Activity timeline',
    eventsWord: 'events',
    andMoreEvents: 'and',
    colTime: 'Time',
    colEvent: 'Event',
    colDetails: 'Details',
    footerAuto: 'Report generated automatically',
    footerConfidential: 'This document is confidential and intended for authorized staff only.',
    resultsSubtitle: 'Exam results table',
    studentsWord: 'Students',
    passedWord: 'Passed',
    averageWord: 'Average',
    colName: 'Name',
    colIndex: 'Index',
    colEmail: 'Email',
    colPoints: 'Points',
    colStatus: 'Status',
    colSuspicious: 'Suspicious',
    statusPassed: 'PASSED',
    statusNot: 'NO',
    resultsFooterAuto: 'Table generated automatically',
    events: {
      exam_view_started: 'Exam review started',
      exam_submit: 'Exam submitted',
      answer_selected: 'Answer selected',
      answer_deselected: 'Answer deselected',
      question_next: 'Next question',
      question_prev: 'Previous question',
      keystroke_batch: 'Keyboard input',
      key_combo: 'Key combination',
      special_key: 'Special key',
      copy_attempt: 'Copy attempt',
      cut_attempt: 'Cut attempt',
      paste_attempt: 'Paste attempt',
      right_click: 'Right click',
      page_blur: 'Window left',
      page_focus: 'Returned to window',
      visibility_change: 'Visibility change',
      tab_switch: 'Tab switch',
      window_resize: 'Window resize',
      mouse_leave_window: 'Mouse left window',
      print_attempt: 'Print attempt',
      devtools_attempt: 'DevTools open attempt',
      text_typed: 'Text typed',
    },
  },
  'sr-Latn': {
    dateLocale: 'sr-RS',
    subtitle: 'Detaljan izveštaj o aktivnosti studenta',
    generated: 'Generisano',
    student: 'Student',
    exam: 'Ispit',
    durationLabel: 'Trajanje',
    passed: 'POLOŽENO',
    notPassed: 'NIJE POLOŽENO',
    thresholdLabel: 'Prag',
    timeLabel: 'Vreme',
    activityStats: 'Statistika aktivnosti',
    statTotalEvents: 'Ukupno događaja',
    statKeystrokes: 'Unosi tastature',
    statAnswerChanges: 'Promena odgovora',
    statWindowBlur: 'Napuštanje prozora',
    statCopyAttempts: 'Pokušaji kopiranja',
    statRightClicks: 'Desni klikovi',
    suspiciousActivity: 'Sumnjiva aktivnost',
    noSuspicious: 'Nije detektovana sumnjiva aktivnost',
    answersPerQuestion: 'Odgovori po pitanjima',
    questionWord: 'Pitanje',
    pointsShort: 'bod.',
    yourAnswerTag: 'Vaš odgovor',
    correctTag: 'Tačan',
    correctAnswerLabel: 'Tačan odgovor',
    openAnswerLabel: 'Odgovor',
    noAnswerText: 'Bez odgovora',
    timelineTitle: 'Hronologija aktivnosti',
    eventsWord: 'događaja',
    andMoreEvents: 'i još',
    colTime: 'Vreme',
    colEvent: 'Događaj',
    colDetails: 'Detalji',
    footerAuto: 'Izveštaj generisan automatski',
    footerConfidential: 'Ovaj dokument je poverljiv i namenjen isključivo ovlašćenom osoblju.',
    resultsSubtitle: 'Tabela rezultata ispita',
    studentsWord: 'Studenata',
    passedWord: 'Položeno',
    averageWord: 'Prosek',
    colName: 'Ime',
    colIndex: 'Indeks',
    colEmail: 'Email',
    colPoints: 'Bodovi',
    colStatus: 'Status',
    colSuspicious: 'Sumnjivo',
    statusPassed: 'POLOŽENO',
    statusNot: 'NIJE',
    resultsFooterAuto: 'Tabela generisana automatski',
    events: {
      exam_view_started: 'Početak pregleda ispita',
      exam_submit: 'Predaja ispita',
      answer_selected: 'Odgovor izabran',
      answer_deselected: 'Odgovor poništen',
      question_next: 'Sledeće pitanje',
      question_prev: 'Prethodno pitanje',
      keystroke_batch: 'Unos tastaturom',
      key_combo: 'Kombinacija tastera',
      special_key: 'Specijalan taster',
      copy_attempt: 'Pokušaj kopiranja',
      cut_attempt: 'Pokušaj isecanja',
      paste_attempt: 'Pokušaj lepljenja',
      right_click: 'Desni klik',
      page_blur: 'Napuštanje prozora',
      page_focus: 'Povratak u prozor',
      visibility_change: 'Promena vidljivosti',
      tab_switch: 'Promena taba',
      window_resize: 'Promena veličine prozora',
      mouse_leave_window: 'Miš napustio prozor',
      print_attempt: 'Pokušaj štampanja',
      devtools_attempt: 'Pokušaj otvaranja DevTools',
      text_typed: 'Unos teksta',
    },
  },
  'sr-Cyrl': {
    dateLocale: 'sr-RS',
    subtitle: 'Детаљан извештај о активности студента',
    generated: 'Генерисано',
    student: 'Студент',
    exam: 'Испит',
    durationLabel: 'Трајање',
    passed: 'ПОЛОЖЕНО',
    notPassed: 'НИЈЕ ПОЛОЖЕНО',
    thresholdLabel: 'Праг',
    timeLabel: 'Време',
    activityStats: 'Статистика активности',
    statTotalEvents: 'Укупно догађаја',
    statKeystrokes: 'Уноси тастатуре',
    statAnswerChanges: 'Промена одговора',
    statWindowBlur: 'Напуштање прозора',
    statCopyAttempts: 'Покушаји копирања',
    statRightClicks: 'Десни кликови',
    suspiciousActivity: 'Сумњива активност',
    noSuspicious: 'Није детектована сумњива активност',
    answersPerQuestion: 'Одговори по питањима',
    questionWord: 'Питање',
    pointsShort: 'бод.',
    yourAnswerTag: 'Ваш одговор',
    correctTag: 'Тачан',
    correctAnswerLabel: 'Тачан одговор',
    openAnswerLabel: 'Одговор',
    noAnswerText: 'Без одговора',
    timelineTitle: 'Хронологија активности',
    eventsWord: 'догађаја',
    andMoreEvents: 'и још',
    colTime: 'Време',
    colEvent: 'Догађај',
    colDetails: 'Детаљи',
    footerAuto: 'Извештај генерисан аутоматски',
    footerConfidential: 'Овај документ је поверљив и намењен искључиво овлашћеном особљу.',
    resultsSubtitle: 'Табела резултата испита',
    studentsWord: 'Студената',
    passedWord: 'Положено',
    averageWord: 'Просек',
    colName: 'Име',
    colIndex: 'Индекс',
    colEmail: 'Email',
    colPoints: 'Бодови',
    colStatus: 'Статус',
    colSuspicious: 'Сумњиво',
    statusPassed: 'ПОЛОЖЕНО',
    statusNot: 'НИЈЕ',
    resultsFooterAuto: 'Табела генерисана аутоматски',
    events: {
      exam_view_started: 'Почетак прегледа испита',
      exam_submit: 'Предаја испита',
      answer_selected: 'Одговор изабран',
      answer_deselected: 'Одговор поништен',
      question_next: 'Следеће питање',
      question_prev: 'Претходно питање',
      keystroke_batch: 'Унос тастатуром',
      key_combo: 'Комбинација тастера',
      special_key: 'Специјалан тастер',
      copy_attempt: 'Покушај копирања',
      cut_attempt: 'Покушај исецања',
      paste_attempt: 'Покушај лепљења',
      right_click: 'Десни клик',
      page_blur: 'Напуштање прозора',
      page_focus: 'Повратак у прозор',
      visibility_change: 'Промена видљивости',
      tab_switch: 'Промена таба',
      window_resize: 'Промена величине прозора',
      mouse_leave_window: 'Миш напустио прозор',
      print_attempt: 'Покушај штампања',
      devtools_attempt: 'Покушај отварања DevTools',
      text_typed: 'Унос текста',
    },
  },
  bs: {
    dateLocale: 'sr-RS',
    subtitle: 'Детаљан извјештај о активности студента',
    generated: 'Генерисано',
    student: 'Студент',
    exam: 'Испит',
    durationLabel: 'Трајање',
    passed: 'ПОЛОЖЕНО',
    notPassed: 'НИЈЕ ПОЛОЖЕНО',
    thresholdLabel: 'Праг',
    timeLabel: 'Вријеме',
    activityStats: 'Статистика активности',
    statTotalEvents: 'Укупно догађаја',
    statKeystrokes: 'Уноси тастатуре',
    statAnswerChanges: 'Промјена одговора',
    statWindowBlur: 'Напуштање прозора',
    statCopyAttempts: 'Покушаји копирања',
    statRightClicks: 'Десни кликови',
    suspiciousActivity: 'Сумњива активност',
    noSuspicious: 'Није детектована сумњива активност',
    answersPerQuestion: 'Одговори по питањима',
    questionWord: 'Питање',
    pointsShort: 'бод.',
    yourAnswerTag: 'Ваш одговор',
    correctTag: 'Тачан',
    correctAnswerLabel: 'Тачан одговор',
    openAnswerLabel: 'Одговор',
    noAnswerText: 'Без одговора',
    timelineTitle: 'Хронологија активности',
    eventsWord: 'догађаја',
    andMoreEvents: 'и још',
    colTime: 'Вријеме',
    colEvent: 'Догађај',
    colDetails: 'Детаљи',
    footerAuto: 'Извјештај генерисан аутоматски',
    footerConfidential: 'Овај документ је повјерљив и намијењен искључиво овлашћеном особљу.',
    resultsSubtitle: 'Табела резултата испита',
    studentsWord: 'Студената',
    passedWord: 'Положено',
    averageWord: 'Просјек',
    colName: 'Име',
    colIndex: 'Индекс',
    colEmail: 'Email',
    colPoints: 'Бодови',
    colStatus: 'Статус',
    colSuspicious: 'Сумњиво',
    statusPassed: 'ПОЛОЖЕНО',
    statusNot: 'НИЈЕ',
    resultsFooterAuto: 'Табела генерисана аутоматски',
    events: {
      exam_view_started: 'Почетак прегледа испита',
      exam_submit: 'Предаја испита',
      answer_selected: 'Одговор изабран',
      answer_deselected: 'Одговор поништен',
      question_next: 'Сљедеће питање',
      question_prev: 'Претходно питање',
      keystroke_batch: 'Унос тастатуром',
      key_combo: 'Комбинација тастера',
      special_key: 'Специјалан тастер',
      copy_attempt: 'Покушај копирања',
      cut_attempt: 'Покушај исецања',
      paste_attempt: 'Покушај лепљења',
      right_click: 'Десни клик',
      page_blur: 'Напуштање прозора',
      page_focus: 'Повратак у прозор',
      visibility_change: 'Промјена видљивости',
      tab_switch: 'Промјена таба',
      window_resize: 'Промјена величине прозора',
      mouse_leave_window: 'Миш напустио прозор',
      print_attempt: 'Покушај штампања',
      devtools_attempt: 'Покушај отварања DevTools',
      text_typed: 'Унос текста',
    },
  },
};

// Map any incoming string to a supported locale, defaulting to Serbian Latin.
export function reportStrings(locale: string | undefined | null): ReportStrings {
  if (locale === 'en' || locale === 'sr-Latn' || locale === 'sr-Cyrl' || locale === 'bs') return REPORT_STRINGS[locale];
  if (locale === 'sr') return REPORT_STRINGS['sr-Latn'];
  return REPORT_STRINGS['sr-Latn'];
}
