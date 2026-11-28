import { getFontEmbedCSS, toCanvas } from "html-to-image";
import jsPDF from "jspdf";
import { translate, uiLocaleTag } from "@/i18n/ui";

/** Rows a table chart contributes to the PDF; the rest are scrolled out of view anyway. */
const MAX_TABLE_ROWS = 25;

/**
 * Dashboard → PDF (landscape A4). A text header (title, description, date), then the charts laid
 * out the way they sit on screen: each card is captured on its own and placed row by row, so a
 * chart is never sliced across two pages.
 *
 * Capture uses html-to-image (the browser renders the DOM itself; html2canvas couldn't parse the
 * oklch()/color-mix() colours Tailwind v4 uses). Capturing the whole grid in one go froze the tab
 * on dashboards with big tables, hence: one card at a time, table rows capped, fonts embedded once,
 * and a pause between cards so the page stays responsive.
 */
export async function downloadDashboardPdf(
  chartsContainer: HTMLElement,
  title: string,
  description: string | null,
  filename: string,
  lowBandwidth = false
) {
  const box = chartsContainer.getBoundingClientRect();
  const found = Array.from(chartsContainer.querySelectorAll<HTMLElement>(".react-grid-item"));
  const cards = (found.length ? found : [chartsContainer])
    .map((el) => ({ el, rect: el.getBoundingClientRect() }))
    .filter((c) => c.rect.width > 0 && c.rect.height > 0)
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);

  // Group cards that start at (about) the same height into rows.
  const rows: (typeof cards)[] = [];
  for (const card of cards) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].rect.top - card.rect.top) < 12) row.push(card);
    else rows.push([card]);
  }

  const background = getComputedStyle(document.body).backgroundColor || "#ffffff";
  const fontEmbedCSS = await getFontEmbedCSS(chartsContainer).catch(() => "");
  const options = {
    pixelRatio: lowBandwidth ? 1 : 1.6,
    backgroundColor: background,
    fontEmbedCSS,
    filter: (node: Node) => {
      if (!(node instanceof HTMLElement)) return true;
      if (node.dataset.exportIgnore === "true") return false;
      if (node.tagName === "TR" && node.parentElement?.tagName === "TBODY") {
        return Array.prototype.indexOf.call(node.parentElement.children, node) < MAX_TABLE_ROWS;
      }
      return true;
    },
  };

  const pdf = new jsPDF("l", "pt", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 32;
  const gap = 8;

  // Header.
  pdf.setFontSize(18);
  pdf.setTextColor(20);
  pdf.text(title, margin, margin + 8);
  let y = margin + 22;
  if (description) {
    pdf.setFontSize(10);
    pdf.setTextColor(110);
    const lines = pdf.splitTextToSize(description, pageWidth - margin * 2);
    pdf.text(lines, margin, y + 4);
    y += lines.length * 12 + 4;
  }
  pdf.setFontSize(8);
  pdf.setTextColor(150);
  pdf.text(translate("Exported {when}", { when: new Date().toLocaleString(uiLocaleTag()) }), margin, y + 6);
  y += 18;

  const contentWidth = pageWidth - margin * 2;
  const scale = contentWidth / Math.max(1, box.width);
  const imgFormat = lowBandwidth ? "JPEG" : "PNG";

  for (const row of rows) {
    let rowScale = scale;
    let rowHeight = Math.max(...row.map((c) => c.rect.height)) * rowScale;
    const usable = pageHeight - margin * 2;
    if (rowHeight > usable) {
      // A very tall card shrinks to fit one page rather than being cut.
      rowScale *= usable / rowHeight;
      rowHeight = usable;
    }
    if (y + rowHeight > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }

    for (const { el, rect } of row) {
      const canvas = await toCanvas(el, options);
      const data = lowBandwidth ? canvas.toDataURL("image/jpeg", 0.7) : canvas.toDataURL("image/png");
      const x = margin + (rect.left - box.left) * rowScale;
      pdf.addImage(data, imgFormat, x, y, rect.width * rowScale, rect.height * rowScale);
      // Let the page breathe between cards (keeps the "Exporting…" state and scrolling responsive).
      await new Promise((r) => setTimeout(r, 0));
    }
    y += rowHeight + gap;
  }

  pdf.save(filename);
}
