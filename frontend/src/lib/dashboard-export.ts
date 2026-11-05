import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Page 1 is a real text cover (title/description/date — selectable, not rasterized). The charts
 * grid is captured once as a single tall image and sliced across as many following pages as it
 * needs, using the same margins on every page so the slicing math never has to special-case page 1.
 */
export async function downloadDashboardPdf(
  chartsContainer: HTMLElement,
  title: string,
  description: string | null,
  filename: string,
  lowBandwidth = false
) {
  const canvas = await html2canvas(chartsContainer, {
    scale: lowBandwidth ? 1 : 2,
    backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
    useCORS: true,
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
