import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Canvas, DiagramEdge, DiagramNode } from 'domain';

interface PlacedNode extends DiagramNode {
  readonly x: number;
  readonly y: number;
}

interface PlacedEdge {
  readonly path: string;
  readonly label?: string | null;
  readonly labelX: number;
  readonly labelY: number;
}

interface Bar {
  readonly label: string;
  readonly value: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const WIDTH = 720;
const NODE_WIDTH = 150;
const NODE_HEIGHT = 46;
const LAYER_GAP = 92;

/**
 * The board.
 *
 * Everything here is driven by one number: how far through the current turn the tutor has
 * spoken. Points arrive as they are said, a diagram settles in, a chart grows. Keying the
 * illustration to the same offset the speech is at is what stops the words and the picture
 * drifting apart, and what lets an interrupted turn resume with its drawing where it was.
 */
@Component({
  selector: 'lumen-tutor-canvas',
  templateUrl: './tutor-canvas.html',
  styleUrl: './tutor-canvas.scss',
})
export class TutorCanvas {
  readonly canvas = input.required<Canvas>();
  /** 0 to 1 through the turn being spoken. */
  readonly progress = input(0);

  readonly tool = computed(() => this.canvas()?.tool ?? null);

  // One narrowed view per shape. A signal read cannot be narrowed across two calls — each is a
  // fresh read — so the discriminated union is resolved once, here, and the template binds to
  // an already-typed value.
  readonly statement = computed(() => this.shape('show_statement'));
  readonly stepsBoard = computed(() => this.shape('show_steps'));
  readonly codeBoard = computed(() => this.shape('show_code'));
  readonly diagramBoard = computed(() => this.shape('show_diagram'));
  readonly chartBoard = computed(() => this.shape('show_chart'));
  readonly mathBoard = computed(() => this.shape('show_math'));

  private shape<T extends NonNullable<Canvas>['tool']>(
    tool: T,
  ): Extract<NonNullable<Canvas>, { tool: T }> | null {
    const canvas = this.canvas();
    return canvas?.tool === tool ? (canvas as Extract<NonNullable<Canvas>, { tool: T }>) : null;
  }

  // ---- code -------------------------------------------------------------
  readonly codeLines = computed(() => {
    const code = this.codeBoard();
    if (!code) return [];
    return code.source.split('\n').map((text, index) => ({ text, line: index + 1 }));
  });

  readonly activeLine = computed(() => this.codeBoard()?.highlightLine ?? 0);

  // ---- steps ------------------------------------------------------------
  readonly steps = computed(() => this.stepsBoard()?.items ?? []);

  /** A point arrives when the speech reaches its share of the turn. */
  revealed(index: number): boolean {
    const total = this.steps().length;
    if (total === 0) return false;
    // The first is up from the start; a canvas that opens empty reads as broken.
    return index === 0 || this.progress() >= index / total;
  }

  // ---- diagram ----------------------------------------------------------
  private readonly layout = computed(() => {
    const canvas = this.diagramBoard();
    if (!canvas) return { nodes: [] as PlacedNode[], edges: [] as PlacedEdge[], height: 0 };

    const layers = layerNodes(canvas.nodes, canvas.edges);
    const placed: PlacedNode[] = [];

    layers.forEach((row, depth) => {
      const span = WIDTH / (row.length + 1);
      row.forEach((node, index) => {
        placed.push({ ...node, x: span * (index + 1), y: 40 + depth * LAYER_GAP });
      });
    });

    const at = new Map(placed.map((node) => [node.id, node]));
    const edges: PlacedEdge[] = [];

    for (const edge of canvas.edges) {
      const from = at.get(edge.from);
      const to = at.get(edge.to);
      if (!from || !to) continue;

      const y1 = from.y + NODE_HEIGHT / 2;
      const y2 = to.y - NODE_HEIGHT / 2;
      const midY = (y1 + y2) / 2;

      edges.push({
        path: `M ${from.x} ${y1} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${y2}`,
        label: edge.label,
        labelX: (from.x + to.x) / 2,
        labelY: midY,
      });
    }

    return { nodes: placed, edges, height: 40 + layers.length * LAYER_GAP + 20 };
  });

  readonly diagramNodes = computed(() => this.layout().nodes);
  readonly diagramEdges = computed(() => this.layout().edges);
  readonly diagramHeight = computed(() => this.layout().height);
  readonly viewBox = computed(() => `0 0 ${WIDTH} ${this.diagramHeight()}`);
  readonly nodeWidth = NODE_WIDTH;
  readonly nodeHeight = NODE_HEIGHT;

  // ---- chart ------------------------------------------------------------
  private readonly chartHeight = 260;

  readonly bars = computed<Bar[]>(() => {
    const canvas = this.chartBoard();
    if (!canvas) return [];

    const points = canvas.points;
    const peak = Math.max(...points.map((point) => Math.abs(point.value)), 1);
    const slot = WIDTH / points.length;
    const shown = Math.max(1, Math.ceil(points.length * Math.max(this.progress(), 0.15)));

    return points.slice(0, shown).map((point, index) => {
      // A series that spans orders of magnitude — which is exactly what a lesson about
      // exponential cost will produce — renders its small values as nothing at all on a linear
      // scale. The floor keeps them visible as present-but-small rather than absent.
      const height = Math.max(3, (Math.abs(point.value) / peak) * (this.chartHeight - 48));
      return {
        label: point.label,
        value: point.value,
        x: slot * index + slot * 0.2,
        y: this.chartHeight - 28 - height,
        width: slot * 0.6,
        height,
      };
    });
  });

  readonly chartViewBox = `0 0 ${WIDTH} ${this.chartHeight}`;
  readonly chartBaseline = this.chartHeight - 28;
  readonly chartWidth = WIDTH;

  /** The value the tallest bar stands for, so the scale is stated rather than guessed at. */
  readonly chartPeak = computed(() => {
    const canvas = this.chartBoard();
    return canvas ? Math.max(...canvas.points.map((point) => Math.abs(point.value))) : 0;
  });

  readonly linePath = computed(() => {
    const bars = this.bars();
    if (bars.length === 0) return '';
    return bars
      .map((bar, index) => `${index === 0 ? 'M' : 'L'} ${bar.x + bar.width / 2} ${bar.y}`)
      .join(' ');
  });

  // ---- math -------------------------------------------------------------
  /**
   * The typesetter is fetched the first time an equation actually appears. Most courses never
   * show one, and making every student download a maths renderer for a lesson about loops is a
   * cost with no return. Until it arrives the equation shows as its own source, which is
   * readable and honest rather than blank.
   */
  private readonly sanitizer = inject(DomSanitizer);
  private readonly typeset = signal<SafeHtml | null>(null);
  readonly renderedMath = this.typeset.asReadonly();

  constructor() {
    effect(() => {
      const board = this.mathBoard();
      if (!board) {
        this.typeset.set(null);
        return;
      }
      void this.render(board.latex);
    });
  }

  private async render(latex: string): Promise<void> {
    try {
      const katex = await import('katex');

      // `trust: false` is KaTeX's default and is left explicit because this LaTeX came from a
      // model: it disables \href, \url and the other commands that can emit real links.
      const html = katex.default.renderToString(latex, {
        throwOnError: false,
        displayMode: true,
        trust: false,
      });

      // KaTeX positions every superscript, fraction bar and radical with an inline `style`
      // attribute, and Angular's innerHTML sanitizer strips those — the equation renders with
      // its exponents sitting on the baseline. The markup is KaTeX's own output from a string
      // it has already escaped, not raw input, so it is trusted here and nowhere else.
      this.typeset.set(this.sanitizer.bypassSecurityTrustHtml(html));
    } catch {
      // A malformed equation, or a typesetter that would not load: show the source instead of
      // taking the lesson down over a rendering detail.
      this.typeset.set(null);
    }
  }
}

/**
 * Puts each box below everything it depends on, so arrows read downward. A cycle would make
 * that impossible — the backend refuses those at upload, so anything left over is laid out in
 * whatever order it arrived rather than looping forever.
 */
function layerNodes(nodes: readonly DiagramNode[], edges: readonly DiagramEdge[]): DiagramNode[][] {
  const incoming = new Map<string, number>(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    if (incoming.has(edge.to)) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }

  const layers: DiagramNode[][] = [];
  const placed = new Set<string>();
  let remaining = [...nodes];

  while (remaining.length > 0) {
    const row = remaining.filter((node) => (incoming.get(node.id) ?? 0) === 0);
    if (row.length === 0) {
      layers.push(remaining);
      break;
    }

    layers.push(row);
    for (const node of row) placed.add(node.id);

    for (const edge of edges) {
      if (placed.has(edge.from) && !placed.has(edge.to)) {
        incoming.set(edge.to, Math.max(0, (incoming.get(edge.to) ?? 1) - 1));
      }
    }

    remaining = remaining.filter((node) => !placed.has(node.id));
  }

  return layers;
}
