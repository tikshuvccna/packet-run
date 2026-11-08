export type Level = 'easy' | 'medium' | 'hard';
export const LEVELS: readonly Level[] = ['easy', 'medium', 'hard'];

export interface Check { q: string; options: string[]; correct: number; explain: string }

export type Widget =
  | { type: 'explore'; title: string; cards: { label: string; text: string }[] }
  | { type: 'match'; title: string; pairs: { a: string; b: string }[] }
  | { type: 'toggle'; title: string; base: string; okText: string; switches: { id: string; label: string; effect: string }[] }
  | { type: 'order'; title: string; prompt: string; items: string[] }
  | { type: 'split'; title: string; total: number; capacities: number[]; unit: string }
  | { type: 'beam'; title: string; ships: number; modes: { id: string; label: string; count: number; text: string }[] }
  | { type: 'sort'; title: string; buckets: { id: string; label: string }[]; items: { label: string; bucket: string; why: string }[] }
  | { type: 'wrap'; title: string; core: string; layers: { label: string; adds: string }[] }
  | { type: 'msglab'; title: string; message: string }
  | { type: 'encode'; title: string; words: string[] }
  | { type: 'cast'; title: string; hosts: number }
  | { type: 'flowsim'; title: string; cap: number; buf: number; secs: number }
  | { type: 'journey'; title: string; core: string; layers: { label: string; adds: string; detail: string }[] }
  | { type: 'tcpudp'; title: string; total: number };

export interface LessonStep { id: string; title: string; html: string; widget: Widget; check: Check }
export interface LessonData {
  id: string; leg: 1 | 2 | 3; title: string; keeper: string; where: string; estimatedMinutes: number;
  source?: string; needsTeacher?: string[]; steps: LessonStep[];
}

export interface QuizQuestion {
  id: string; type: 'mcq' | 'tf' | 'order'; q: string; options: string[];
  correct: number | number[]; explain: string;
}
export interface QuizData { id: string; title: string; pass: number; questions: QuizQuestion[] }

export interface LevelCfg {
  rounds?: number; items?: number; lives: number; timer?: number; fallSec?: number;
  mix?: string[]; layers?: string[]; pass: number;
}
export interface GameData {
  id: string; kind: 'beam' | 'tower' | 'crane'; title: string; story: string;
  levels: Record<Level, LevelCfg>;
  [k: string]: unknown;
}
