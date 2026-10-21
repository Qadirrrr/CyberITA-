import { describe, it, expect } from 'vitest';
import { extraCourses } from '../src/db/seedCatalog.js';

describe('Extended catalog seed data', () => {
  it('defines eight unique published courses with coherent taxonomy', () => {
    expect(extraCourses).toHaveLength(8);
    expect(new Set(extraCourses.map((course) => course.slug)).size).toBe(extraCourses.length);
    expect(new Set(extraCourses.map((course) => course.title)).size).toBe(extraCourses.length);

    for (const course of extraCourses) {
      expect(course.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(course.title.trim()).not.toBe('');
      expect(course.category.trim()).not.toBe('');
      expect(course.subcategory.trim()).not.toBe('');
      expect(['beginner', 'intermediate', 'advanced']).toContain(course.level);
      expect(course.modules.length).toBeGreaterThan(0);
      expect(course.instructor).toMatch(/^(linux|net)$/);
    }
  });

  it('includes lessons, quizzes and complete labs for every course', () => {
    for (const course of extraCourses) {
      const lessonTitles = course.modules.flatMap((module) => module.lessons.map((lesson) => lesson.title));
      expect(lessonTitles.length).toBeGreaterThanOrEqual(2);
      expect(new Set(lessonTitles).size).toBe(lessonTitles.length);

      expect(lessonTitles).toContain(course.quiz.lessonTitle);
      expect(course.quiz.questions.length).toBeGreaterThanOrEqual(3);
      for (const question of course.quiz.questions) {
        expect(question.options.length).toBeGreaterThanOrEqual(2);
        expect(question.correct).toBeGreaterThanOrEqual(0);
        expect(question.correct).toBeLessThan(question.options.length);
      }

      expect(lessonTitles).toContain(course.lab.lessonTitle);
      expect(course.lab.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(course.lab.steps.length).toBeGreaterThanOrEqual(4);
      if (course.lab.files) {
        expect(course.lab.files['/'].type).toBe('dir');
      }
      expect(course.lab.steps.some((step) => step.command)).toBe(true);
    }
  });

  it('uses unique lab slugs and supported mock-shell commands', () => {
    const labs = extraCourses.map((course) => course.lab);
    expect(new Set(labs.map((lab) => lab.slug)).size).toBe(labs.length);

    const commandSteps = labs.flatMap((lab) =>
      lab.steps.filter((step) => step.command).map((step) => step.command)
    );
    expect(commandSteps.length).toBeGreaterThan(0);
    for (const command of commandSteps) {
      expect(typeof command).toBe('string');
      expect(command.trim()).not.toBe('');
      expect(command).not.toContain('&&');
      expect(command).not.toContain('||');
    }
  });
});
