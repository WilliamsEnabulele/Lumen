import { applyToCanvas, Canvas } from './canvas';

describe('canvas', () => {
  const code = { tool: 'show_code', language: 'python', source: 'a\nb\nc', highlightLine: 1 } as const;

  it('a highlight moves the line rather than redrawing the board', () => {
    const after = applyToCanvas(code, { tool: 'highlight_code', line: 3 });

    expect(after).toEqual({ ...code, highlightLine: 3 });
  });

  it('a highlight with no code up changes nothing', () => {
    const statement = { tool: 'show_statement', text: 'Nesting multiplies.' } as const;

    expect(applyToCanvas(statement, { tool: 'highlight_code', line: 2 })).toBe(statement);
  });

  it('clearing empties it', () => {
    expect(applyToCanvas(code, { tool: 'clear_canvas' })).toBeNull();
  });

  it('anything else replaces what was there', () => {
    const before: Canvas = code;
    const diagram = { tool: 'show_diagram', nodes: [], edges: [] } as const;

    expect(applyToCanvas(before, diagram)).toBe(diagram);
  });
});
