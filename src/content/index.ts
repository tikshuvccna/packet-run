import type { GameData, LessonData, QuizData } from '../learn/types';
import type { QuizGate } from '../drive/contract';
import { rng, shuffle } from '../learn/rng';
import lesson06 from '../../content/he/lesson06.json';
import lesson07 from '../../content/he/lesson07.json';
import lesson08 from '../../content/he/lesson08.json';
import quiz06 from '../../content/he/quiz06.json';
import quiz07 from '../../content/he/quiz07.json';
import quiz08 from '../../content/he/quiz08.json';
import game06 from '../../content/he/game06.json';
import game07 from '../../content/he/game07.json';
import game08 from '../../content/he/game08.json';
import linesJson from '../../content/he/lines.json';

export const LESSONS: Record<string, LessonData> = {
  lesson06: lesson06 as unknown as LessonData,
  lesson07: lesson07 as unknown as LessonData,
  lesson08: lesson08 as unknown as LessonData,
};
export const QUIZZES: Record<string, QuizData> = {
  quiz06: quiz06 as unknown as QuizData,
  quiz07: quiz07 as unknown as QuizData,
  quiz08: quiz08 as unknown as QuizData,
};
export const GAMES: Record<string, GameData> = {
  game06: game06 as unknown as GameData,
  game07: game07 as unknown as GameData,
  game08: game08 as unknown as GameData,
};
export const LESSON_IDS = ['lesson06', 'lesson07', 'lesson08'] as const;
export type LessonId = (typeof LESSON_IDS)[number];

/** The garage (lesson POI) of each lesson, in the city. */
export const LESSON_GARAGE: Record<string, { name: string }> = {
  lesson06: { name: 'מוסך החוקים' },
  lesson07: { name: 'מגדל האקדמיה' },
  lesson08: { name: 'מחסן המכולות' },
};

/** Quick questions for the quiz boxes in races, made from the multiple-choice questions of the learned lessons. */
export function gatesFor(lessonIds: readonly string[], seed = 7): QuizGate[] {
  const r = rng(seed);
  const out: QuizGate[] = [];
  for (const lid of lessonIds) {
    const quiz = QUIZZES[lid.replace('lesson', 'quiz')];
    if (!quiz) continue;
    for (const q of quiz.questions) {
      if (q.type !== 'mcq' || q.options.length < 3) continue;
      const correctText = q.options[q.correct as number] as string;
      const others = shuffle(q.options.filter((_, i) => i !== q.correct), r).slice(0, 2);
      const opts = shuffle([correctText, ...others], r);
      if (opts.some((o) => o.length > 22)) continue;   // answers must fit on a box
      out.push({ id: `${lid}.${q.id}`, q: q.q, options: opts as [string, string, string], correct: opts.indexOf(correctText) as 0 | 1 | 2, lesson: lid });
    }
  }
  return out;
}

export type LineMap = Record<string, { who: string; text: string }>;
export const LINES = linesJson as unknown as LineMap;
export function line(id: string): { who: string; text: string } {
  return LINES[id] ?? { who: 'narrator', text: id };
}

export const SPEAKERS: Record<string, string> = {
  dina: 'דינה', gee: 'ג׳י', uri: 'אורי', talia: 'טליה', barak: 'ברק', noise: 'הרעש', narrator: '', player: '',
};
