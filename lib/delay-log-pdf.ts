import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { roleLabel } from "@/lib/roles";
import type { DelayLogReport } from "@/lib/order-messages";

// A4 landscape, in points.
const PAGE = { w: 842, h: 595 };
const MARGIN = 36;
const ROW_PAD = 8;
const LINE = 12;

// Column widths must sum to the content width (842 - 2*36 = 770).
const COLUMNS = [
  { key: "dept", label: "Department", width: 130 },
  { key: "target", label: "Target date", width: 90 },
  { key: "logged", label: "Logged on", width: 130 },
  { key: "reason", label: "Reason", width: 300 },
  { key: "by", label: "Logged by", width: 120 },
] as const;

// Which SO target date each department works to — mirrors the on-screen table.
const TARGET_BY_ROLE: Record<string, string> = {
  drawing: "drg_target_date",
  purchase: "purchase_target_date",
  qc: "qc_doc_target_date",
  dispatch: "dispatch_team_target_date",
};
const FALLBACK_TARGET = "dispatch_target_date";

function dayOnly(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })} ${d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })}`;
}

/**
 * Replace only the characters the standard font cannot encode. WinAnsi
 * covers Latin-1 plus the common punctuation (em dash, curly quotes), so a
 * blanket ASCII filter would mangle text the font renders perfectly well.
 */
function sanitize(text: string, font: PDFFont): string {
  let out = "";
  for (const ch of text) {
    try {
      font.widthOfTextAtSize(ch, 9);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

/** Greedy word wrap to a pixel width, so long reasons don't run off the page. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = sanitize(text, font).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    // A single word longer than the column is split character by character.
    if (font.widthOfTextAtSize(word, size) > width) {
      let chunk = "";
      for (const ch of word) {
        if (font.widthOfTextAtSize(chunk + ch, size) > width) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
    } else {
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}


/**
 * Render one SO's delay log as an A4-landscape PDF. Takes an already
 * lane-filtered report, so it cannot widen what the caller may see.
 */
export async function buildDelayLogPdf(
  report: DelayLogReport
): Promise<Uint8Array> {
  const soLabel = report.so_no ?? `#${report.sl_no}`;

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Delay logs — ${soLabel}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.09, 0.11, 0.15);
  const muted = rgb(0.42, 0.45, 0.5);
  const rule = rgb(0.85, 0.87, 0.9);
  const contentWidth = PAGE.w - MARGIN * 2;

  let page = pdf.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - MARGIN;

  function drawHeaderBand() {
    page.drawText(`Delay logs — ${soLabel}`, {
      x: MARGIN,
      y: y - 14,
      size: 14,
      font: bold,
      color: ink,
    });
    page.drawText(
      `${report.logs.length} ${report.logs.length === 1 ? "entry" : "entries"} · generated ${stamp(new Date().toISOString())} UTC`,
      { x: MARGIN, y: y - 28, size: 8, font, color: muted }
    );
    y -= 48;

    let x = MARGIN;
    for (const col of COLUMNS) {
      page.drawText(col.label.toUpperCase(), {
        x,
        y,
        size: 7.5,
        font: bold,
        color: muted,
      });
      x += col.width;
    }
    y -= 6;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: MARGIN + contentWidth, y },
      thickness: 0.75,
      color: rule,
    });
    y -= ROW_PAD + 4;
  }

  drawHeaderBand();

  if (report.logs.length === 0) {
    page.drawText("No delays logged on this order.", {
      x: MARGIN,
      y,
      size: 10,
      font,
      color: muted,
    });
  }

  for (const log of report.logs) {
    const column = TARGET_BY_ROLE[log.dept_role] ?? FALLBACK_TARGET;
    const cells = [
      wrap(roleLabel(log.dept_role), font, 9, COLUMNS[0].width - 10),
      wrap(dayOnly(report.targets[column] ?? null), font, 9, COLUMNS[1].width - 10),
      wrap(stamp(log.created_at), font, 9, COLUMNS[2].width - 10),
      wrap(log.body, font, 9, COLUMNS[3].width - 10),
      wrap(log.author_name, font, 9, COLUMNS[4].width - 10),
    ];
    const height = Math.max(...cells.map((c) => c.length)) * LINE + ROW_PAD;

    // Start a new page when this row would cross the bottom margin.
    if (y - height < MARGIN) {
      page = pdf.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - MARGIN;
      drawHeaderBand();
    }

    let x = MARGIN;
    cells.forEach((lines, i) => {
      lines.forEach((line, n) => {
        page.drawText(line, {
          x,
          y: y - n * LINE,
          size: 9,
          font,
          color: i === 2 ? muted : ink,
        });
      });
      x += COLUMNS[i].width;
    });

    y -= height;
    page.drawLine({
      start: { x: MARGIN, y: y + ROW_PAD - 4 },
      end: { x: MARGIN + contentWidth, y: y + ROW_PAD - 4 },
      thickness: 0.5,
      color: rule,
    });
  }

  return pdf.save();
}
