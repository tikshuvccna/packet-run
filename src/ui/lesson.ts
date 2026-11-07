import { LESSONS, QUIZZES, SPEAKERS } from '../content';
import { isCorrect, score, shuffleOptions } from '../learn/quizLogic';
import type { QuizQuestion } from '../learn/types';
import { btn, clear, flash, h, overlay } from './dom';
import { type Ctx, portraitImg } from './ctx';
import { renderWidget } from './widgets';

/** Runs the whole lesson as a full-screen player. Resolves true when every step was passed. */
export function runLesson(ctx: Ctx, lessonId: string): Promise<boolean> {
  const lesson = LESSONS[lessonId];
  if (!lesson) return Promise.resolve(false);
  const { root, close } = overlay('lesson-screen');
  ctx.audio.mood('lesson');
  return new Promise((resolve) => {
    let i = 0;
    const prog = ctx.save.lesson(lessonId);

    const head = h('div', 'lhead');
    const bar = h('div', 'lbar');
    const fill = h('div', 'lbar-fill');
    bar.appendChild(fill);
    const title = h('div', 'ltitle', lesson.title);
    const quit = btn('יציאה', () => { close(); resolve(false); }, 'btn small ghost');
    head.append(portraitImg(lesson.keeper, 'neutral', 'portrait small'), title, quit);
    const body = h('div', 'lbody');
    root.append(head, bar, body);

    const step = (): void => {
      clear(body);
      const s = lesson.steps[i];
      if (!s) { close(); resolve(true); return; }
      fill.style.width = `${(i / lesson.steps.length) * 100}%`;
      const card = h('div', 'lcard');
      card.appendChild(h('h2', null, s.title));
      const text = h('div', 'ltext');
      text.innerHTML = s.html;
      card.appendChild(text);
      let widgetDone = false;
      const toCheck = btn('לשאלה', () => showCheck(), 'btn primary');
      toCheck.disabled = true;
      const wEl = renderWidget(s.widget, {
        sfx: (n) => ctx.audio.sfx(n),
        done: () => { widgetDone = true; toCheck.disabled = false; toCheck.classList.add('pulse'); },
      }, i + 1);
      card.appendChild(wEl);
      const foot = h('div', 'lfoot');
      foot.append(h('span', 'step', `${i + 1} / ${lesson.steps.length}`), toCheck);
      card.appendChild(foot);
      body.appendChild(card);
      void widgetDone;
    };

    const showCheck = (): void => {
      const s = lesson.steps[i];
      if (!s) return;
      clear(body);
      const c = s.check;
      const card = h('div', 'lcard check');
      card.appendChild(h('div', 'qlabel', 'שאלה'));
      card.appendChild(h('h2', null, c.q));
      const opts = h('div', 'options');
      const fb = h('div', 'feedback');
      const next = btn(i === lesson.steps.length - 1 ? 'סיום' : 'הבא', () => { i++; step(); }, 'btn primary');
      next.disabled = true;
      c.options.forEach((o, k) => {
        const b = btn(o, () => {
          if (k === c.correct) {
            b.classList.add('ok');
            opts.querySelectorAll('button').forEach((x) => ((x as HTMLButtonElement).disabled = true));
            fb.textContent = c.explain;
            fb.className = 'feedback good';
            prog.checks[s.id] = true;
            ctx.save.save();
            ctx.audio.sfx('good');
            next.disabled = false;
            next.classList.add('pulse');
          } else {
            flash(b, 'bad');
            b.disabled = true;
            fb.textContent = 'כמעט. נסו שוב.';
            fb.className = 'feedback bad';
            ctx.audio.sfx('bad');
          }
        }, 'btn option');
        opts.appendChild(b);
      });
      card.append(opts, fb, h('div', 'lfoot'));
      (card.lastChild as HTMLElement).appendChild(next);
      body.appendChild(card);
    };

    step();
  });
}

/** Runs the summary quiz. Resolves with the result; passing is recorded in the save. */
export function runQuiz(ctx: Ctx, lessonId: string, quizId: string): Promise<{ passed: boolean; score: number; max: number }> {
  const quiz = QUIZZES[quizId];
  const { root, close } = overlay('lesson-screen quiz-screen');
  ctx.audio.mood('lesson');
  if (!quiz) { close(); return Promise.resolve({ passed: false, score: 0, max: 0 }); }
  return new Promise((resolve) => {
    const seed = Math.floor(Math.random() * 1e6);
    const qs: QuizQuestion[] = quiz.questions.map((q, k) => shuffleOptions(q, seed + k));
    const results: boolean[] = [];
    let i = 0;
    const head = h('div', 'lhead');
    const title = h('div', 'ltitle', `חידון: ${quiz.title}`);
    const quit = btn('יציאה', () => { close(); resolve({ passed: false, score: 0, max: qs.length }); }, 'btn small ghost');
    head.append(title, quit);
    const bar = h('div', 'lbar');
    const fill = h('div', 'lbar-fill');
    bar.appendChild(fill);
    const body = h('div', 'lbody');
    root.append(head, bar, body);

    const finish = (): void => {
      clear(body);
      const r = score(quiz, results);
      const prog = ctx.save.lesson(lessonId);
      prog.quizBest = Math.max(prog.quizBest, r.score);
      let coinNote = '';
      if (r.passed && !prog.quizPassed) { prog.quizPassed = true; ctx.save.data.coins += 15; coinNote = '+15 מטבעות'; }
      ctx.save.save();
      ctx.audio.sfx(r.passed ? 'win' : 'bad');
      fill.style.width = '100%';
      const card = h('div', 'lcard result');
      card.appendChild(h('h2', null, r.passed ? 'עברתם!' : 'עוד קצת'));
      card.appendChild(h('div', 'bignum', `${r.score} / ${r.max}`));
      card.appendChild(h('div', 'panel', r.passed ? `המשחקון נפתח. ${coinNote}`.trim() : `צריך ${quiz.pass} כדי לעבור. אפשר לנסות שוב.`));
      const row = h('div', 'lfoot');
      row.appendChild(btn(r.passed ? 'להמשך' : 'ניסיון נוסף', () => {
        close();
        if (r.passed) resolve(r);
        else runQuiz(ctx, lessonId, quizId).then(resolve);
      }, 'btn primary'));
      if (!r.passed) row.appendChild(btn('יציאה', () => { close(); resolve(r); }, 'btn ghost'));
      card.appendChild(row);
      body.appendChild(card);
    };

    const show = (): void => {
      clear(body);
      const q = qs[i];
      if (!q) { finish(); return; }
      fill.style.width = `${(i / qs.length) * 100}%`;
      const card = h('div', 'lcard');
      card.appendChild(h('div', 'qlabel', `שאלה ${i + 1} מתוך ${qs.length}`));
      card.appendChild(h('h2', null, q.q));
      const fb = h('div', 'feedback');
      const foot = h('div', 'lfoot');
      const next = btn(i === qs.length - 1 ? 'לתוצאה' : 'הבא', () => { i++; show(); }, 'btn primary');
      next.disabled = true;
      const answered = (ok: boolean): void => {
        results.push(ok);
        fb.textContent = ok ? q.explain : `${q.explain}`;
        fb.className = ok ? 'feedback good' : 'feedback bad';
        ctx.audio.sfx(ok ? 'good' : 'bad');
        next.disabled = false;
        next.classList.add('pulse');
      };
      if (q.type === 'order') {
        const slots = h('div', 'slots');
        const pool = h('div', 'pool');
        const picked: number[] = [];
        q.options.forEach((_, k) => slots.appendChild(h('div', 'slot', String(k + 1))));
        const idx = shuffleOptionsOrder(q.options.length, seed + i);
        for (const k of idx) {
          const b = btn(q.options[k] as string, () => {
            if (b.disabled) return;
            const slot = slots.children[picked.length] as HTMLElement;
            slot.textContent = q.options[k] as string;
            slot.classList.add('filled');
            picked.push(k);
            b.disabled = true;
            ctx.audio.sfx('click');
            if (picked.length === q.options.length) {
              const ok = isCorrect(q, picked);
              slots.classList.add(ok ? 'good' : 'bad');
              answered(ok);
            }
          }, 'btn item');
          pool.appendChild(b);
        }
        card.append(slots, pool);
      } else {
        const opts = h('div', 'options');
        q.options.forEach((o, k) => {
          const b = btn(o, () => {
            const ok = isCorrect(q, k);
            opts.querySelectorAll('button').forEach((x, n) => {
              (x as HTMLButtonElement).disabled = true;
              if (n === q.correct) x.classList.add('ok');
            });
            if (!ok) b.classList.add('bad');
            answered(ok);
          }, 'btn option');
          opts.appendChild(b);
        });
        card.appendChild(opts);
      }
      card.append(fb, foot);
      foot.appendChild(next);
      body.appendChild(card);
    };
    show();
  });
}

function shuffleOptionsOrder(n: number, seed: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  let s = seed >>> 0;
  for (let i = n - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j] as number, a[i] as number];
  }
  // never hand the player the already-solved order
  if (a.every((v, i) => v === i) && n > 1) [a[0], a[1]] = [a[1] as number, a[0] as number];
  return a;
}

export function keeperName(id: string): string { return SPEAKERS[id] ?? id; }
