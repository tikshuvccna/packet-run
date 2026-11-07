import type { QuizData, QuizQuestion } from './types';
import { rng, shuffle } from './rng';

export function isCorrect(q: QuizQuestion, answer: number | number[]): boolean {
  if (q.type === 'order') {
    const a = answer as number[];
    const c = q.correct as number[];
    return a.length === c.length && a.every((v, i) => v === c[i]);
  }
  return answer === q.correct;
}

/** Shuffles the options of an mcq (the correct index follows). Order and tf questions are left alone. */
export function shuffleOptions(q: QuizQuestion, seed: number): QuizQuestion {
  if (q.type !== 'mcq') return q;
  const idx = shuffle(q.options.map((_, i) => i), rng(seed));
  return { ...q, options: idx.map((i) => q.options[i] as string), correct: idx.indexOf(q.correct as number) };
}

export function score(quiz: QuizData, results: boolean[]): { score: number; max: number; passed: boolean } {
  const s = results.filter(Boolean).length;
  return { score: s, max: quiz.questions.length, passed: s >= quiz.pass };
}
