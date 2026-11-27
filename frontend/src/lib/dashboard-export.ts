import { toCanvas } from "html-to-image";
import jsPDF from "jspdf";

/**
 * Page 1 is a real text cover (title/description/date — selectable, not rasterized). The charts
 * grid is captured once as a single tall image and sliced across as many following pages as it
 * needs, using the same margins on every page so the slicing math never has to special-case page 1.
 *
 * The capture uses html-to-image, which has the browser itself render the DOM (via SVG
 * foreignObject). html2canvas re-implemented CSS and choked on modern colour functions
 * (oklch(), color-mix()) that Tailwind v4 and the chart tiles use, so every export failed.
 */
export async function downloadDashboardPdf(
  chartsContainer: HTMLElement,
  title: string,
  description: string | null,
  filename: string,
  lowBandwidth = false
) {
  const background = getComputedStyle(document.body).backgroundColor || "#ffffff";
  // Browsers cap canvas size (~16k px a side in Chrome); keep a very long dashboard under it.
  const height = chartsContainer.scrollHeight;
  const ratio = Math.min(lowBandwidth ? 1 : 2, 14000 / Math.max(1, height));

  const canvas = await toCanvas(chartsContainer, {
    pixelRatio: ratio,
    backgroundColor: background,
    cacheBust: true,
    // On-card controls (drag grips, menus) are for the screen, not the page.
    filter: (node) => !(node instanceof HTMLElement && node.dataset.exportIgnore === "true"),
  });

  const pdf = new jsPDF("p", "pt", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 40;

  pdf.setFontSize(20);
  pdf.text(title, margin, margin + 10);

  if (description) {
    pdf.setFontSize(11);
    pdf.setTextColor(110);
    const lines = pdf.splitTextToSize(description, pageWidth - margin * 2);
    pdf.text(lines, margin, margin + 34);
    pdf.setTextColor(20);
  }

  pdf.setFontSize(9);
  pdf.setTextColor(150);
  pdf.text(`Exported ${new Date().toLocaleDateString()}`, margin, pageHeight - margin);
  pdf.setTextColor(20);

  pdf.addPage();

  const imgWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgFormat = lowBandwidth ? "JPEG" : "PNG";
  const imgData = lowBandwidth ? canvas.toDataURL("image/jpeg", 0.6) : canvas.toDataURL("image/png");
  const pageContentHeight = pageHeight - margin * 2;

  pdf.addImage(imgData, imgFormat, margin, margin, imgWidth, imgHeight);
  let shown = pageContentHeight;

  while (shown < imgHeight) {
    pdf.addPage();
    pdf.addImage(imgData, imgFormat, margin, margin - shown, imgWidth, imgHeight);
    shown += pageContentHeight;
  }

  pdf.save(filename);
}
