import { Injectable } from '@angular/core';
import { LessonScript, ScriptNode, toLessonScript } from 'domain';

export interface GroundedAnswer {
  readonly text: string;
  /** The node the answer came from, or null when the question is outside the lesson. */
  readonly sourceNodeId: string | null;
}

/**
 * Where the lesson comes from.
 *
 * Both methods are stand-ins for endpoints the backend does not serve yet, and they are
 * written to fail the same way the real ones will: `answer` matches against this lesson's own
 * content and says so when nothing matches, rather than producing something plausible. A
 * tutor that guesses is worse than one that says it does not know, and wiring the honest
 * behaviour in now means it is not a thing to remember to add later.
 */
@Injectable({ providedIn: 'root' })
export class LessonGateway {
  private static node(
    id: string,
    ordinal: number,
    kind: ScriptNode['kind'],
    text: string,
    extras: Partial<ScriptNode> = {},
  ): ScriptNode {
    return {
      id,
      lessonId: 'les_loops_01',
      ordinal,
      kind,
      conceptKey: 'nesting',
      text,
      pauseAfterMs: 400,
      carriesDefinition: false,
      interjectionSlots: [],
      ...extras,
    };
  }

  /** TODO: GET /api/lessons/{id}/script once the backend serves it. */
  loadLesson(): LessonScript {
    const n = LessonGateway.node;
    return toLessonScript('les_loops_01', [
      n('n01', 1, 'speech',
        'Let us talk about loops. Not what they look like — you have seen the syntax — but what they actually cost you when you run them.'),
      n('n02', 2, 'speech',
        'A loop is a promise to do the same work more than once. The interesting question is never what the work is. It is how many times the promise gets kept.'),
      n('n03', 3, 'codeplayground',
        'Here is the simplest case. The body of this loop runs five times, printing one number each time.',
        { visualRef: 'one-loop', carriesDefinition: true, sourceRef: 'ch4:p61' }),
      n('n04', 4, 'speech',
        'If you change five to a thousand, the body runs a thousand times. Double the number, double the work. That is a straight line.'),
      n('n05', 5, 'checkforunderstanding',
        'Quick check. If that range said two hundred instead of five, how many times does the print run?',
        { sourceRef: 'ch4:p62' }),
      n('n06', 6, 'speech',
        'Now here is where it stops being a straight line. Watch what happens when one loop goes inside another.'),
      n('n07', 7, 'codeplayground',
        'The outer loop takes ten turns. But for every single one of those turns, the inner loop runs all the way through — ten more turns of its own.',
        { visualRef: 'loops-nested', carriesDefinition: true, sourceRef: 'ch4:p63' }),
      n('n08', 8, 'speech',
        'So the counts do not add. They multiply. Ten outer turns times ten inner turns is one hundred printed lines, from two lines of code that both say ten.'),
      n('n09', 9, 'checkforunderstanding',
        'So if both of those said one thousand instead of ten, how many lines come out?'),
      n('n10', 10, 'speech',
        'This is why nesting is the thing to look for when something is slow. The loop that is killing you is almost never the one you are reading. It is the one above it.'),
      n('n11', 11, 'codeplayground',
        'This is that same shape, wearing a business suit. A thousand rows compared against a thousand rows is a million comparisons — and nobody wrote the number a million anywhere.',
        { visualRef: 'rows-compare', sourceRef: 'ch4:p65' }),
      n('n12', 12, 'speech',
        'So when you read code looking for the slow part, do not count lines. Count how deep the nesting goes, and multiply.'),
    ]);
  }

  /** The canvas asset for a node's visualRef. TODO: served from object storage. */
  visual(visualRef: string): string {
    const visuals: Record<string, string> = {
      'one-loop': 'for i in range(5):\n    print(i)',
      'loops-nested': 'for i in range(10):\n    for j in range(10):\n        print(i, j)',
      'rows-compare':
        'for row in rows:        # 1,000 rows\n    for other in rows:  # x 1,000 again\n        compare(row, other)',
    };
    return visuals[visualRef] ?? '';
  }

  checkOptions(nodeId: string): { readonly options: readonly string[]; readonly correct: number; readonly reteach: string } | null {
    const checks: Record<string, { options: string[]; correct: number; reteach: string }> = {
      n05: { options: ['5 times', '200 times', 'Depends on the body'], correct: 1, reteach: 'n04' },
      n09: { options: ['Two thousand', 'One million', 'A thousand'], correct: 1, reteach: 'n08' },
    };
    return checks[nodeId] ?? null;
  }

  /** TODO: POST /api/sessions/{id}/ask — grounded retrieval over the lesson, then the course. */
  answer(question: string): GroundedAnswer {
    const asked = question.toLowerCase();
    const grounded: { keys: string[]; source: string; text: string }[] = [
      {
        keys: ['why', 'multiply', 'not add'],
        source: 'n08',
        text: 'Because the inner loop restarts completely on every turn of the outer one. It does not carry on from where it was — it runs its full course again. So ten by ten is ten times ten, not ten plus ten.',
      },
      {
        keys: ['nest', 'inside', 'inner', 'outer'],
        source: 'n07',
        text: 'Nesting means putting one loop inside the body of another. The outer loop takes its turns, and every one of those turns runs the entire inner loop from the start.',
      },
      {
        keys: ['slow', 'fast', 'cost', 'performance', 'expensive'],
        source: 'n10',
        text: 'Nesting depth is what to look for. A single loop grows in a straight line with its input, so it is rarely the problem. Two nested loops grow by multiplication, and that is where the time goes.',
      },
      {
        keys: ['range', 'index', 'counter', 'variable'],
        source: 'n03',
        text: 'The i is the counter — it holds which turn you are on. With range of five it takes the values zero through four, one per turn.',
      },
      {
        keys: ['million', 'thousand', 'scale', 'big'],
        source: 'n11',
        text: 'A thousand rows compared against a thousand rows is a million comparisons. That is the point of the example: nobody wrote the number a million anywhere.',
      },
    ];

    const hit = grounded.find((candidate) => candidate.keys.some((key) => asked.includes(key)));
    if (hit) return { text: hit.text, sourceNodeId: hit.source };

    return {
      text: 'That is outside this lesson — it is not in the material I have for loops and nesting. I can come back to it, but I would be guessing if I answered now.',
      sourceNodeId: null,
    };
  }
}
