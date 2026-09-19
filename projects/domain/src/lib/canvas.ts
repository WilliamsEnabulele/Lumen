/**
 * What the tutor has put on the canvas.
 *
 * These mirror the display tools the model calls while it explains, so the names match the
 * tool names on the wire exactly. The canvas is not rendered from the document — it is
 * rendered from teaching decisions the tutor made mid-sentence.
 */
export type CanvasTool =
  | 'show_statement'
  | 'show_steps'
  | 'show_code'
  | 'highlight_code'
  | 'show_diagram'
  | 'show_chart'
  | 'show_math'
  | 'clear_canvas';

export interface ShowStatement {
  readonly tool: 'show_statement';
  readonly text: string;
}

export interface ShowSteps {
  readonly tool: 'show_steps';
  readonly title?: string | null;
  readonly items: readonly string[];
}

export interface ShowCode {
  readonly tool: 'show_code';
  readonly language: string;
  readonly source: string;
  readonly highlightLine?: number | null;
}

export interface HighlightCode {
  readonly tool: 'highlight_code';
  readonly line: number;
}

export interface DiagramNode {
  readonly id: string;
  readonly label: string;
}

export interface DiagramEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string | null;
}

export interface ShowDiagram {
  readonly tool: 'show_diagram';
  readonly title?: string | null;
  readonly nodes: readonly DiagramNode[];
  readonly edges: readonly DiagramEdge[];
}

export interface ChartPoint {
  readonly label: string;
  readonly value: number;
}

export interface ShowChart {
  readonly tool: 'show_chart';
  readonly kind: 'bar' | 'line' | 'scatter';
  readonly title?: string | null;
  readonly points: readonly ChartPoint[];
}

export interface ShowMath {
  readonly tool: 'show_math';
  readonly latex: string;
  readonly caption?: string | null;
}

export interface ClearCanvas {
  readonly tool: 'clear_canvas';
}

export type CanvasCommand =
  | ShowStatement
  | ShowSteps
  | ShowCode
  | HighlightCode
  | ShowDiagram
  | ShowChart
  | ShowMath
  | ClearCanvas;

/**
 * What is currently drawn. A highlight moves the line on the code already up rather than
 * replacing it, which is the whole point of having it as a separate tool — the tutor points at
 * the board instead of redrawing it.
 */
export type Canvas = Exclude<CanvasCommand, HighlightCode | ClearCanvas> | null;

export function applyToCanvas(canvas: Canvas, command: CanvasCommand): Canvas {
  switch (command.tool) {
    case 'clear_canvas':
      return null;
    case 'highlight_code':
      return canvas?.tool === 'show_code' ? { ...canvas, highlightLine: command.line } : canvas;
    default:
      return command;
  }
}
