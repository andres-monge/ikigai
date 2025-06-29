/**
 * @file pdf-export.ts
 *
 * @description
 * This library contains functions for exporting application data to PDF format
 * using the jsPDF library. It handles the generation of both the initial
 * ikigai analysis results and the final, detailed action plan.
 *
 * ✨ **New in Step 24** ✨
 * - Added the `exportActionPlanToPDF` function.
 * - This new function generates a multi-page PDF for the user's chosen action plan.
 * - It uses the i18n `t` function for proper localization of headers.
 * - It formats the plan into sections: Side Projects, Skills, and Networking.
 * - YouTube video URLs in the "Skills" section are rendered as clickable links.
 * - Includes automatic pagination and a consistent footer.
 *
 * @dependencies
 * - jspdf: The core library for creating PDF documents.
 * - @/types/assessment: For the `AssessmentResults` type.
 * - @/shared/schema: For the `ActionPlan` type.
 * - @/lib/i18n: For the translation function `t` and `Language` type.
 */
import jsPDF from 'jspdf';
import type { FullAssessment, PurposePathWithSalary } from '@/types/assessment';
import type { ActionPlan } from '@/types/assessment';
import { t, type Language } from '@/lib/i18n';

export function exportToPDF(
  results: FullAssessment,
  language: 'en' | 'es' = 'en',
) {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let currentY = 20;

  // Title
  pdf.setFontSize(24);
  pdf.setTextColor(37, 99, 235); // Primary color
  const title = language === 'en' ? 'Your Ikigai Analysis' : 'Tu Análisis Ikigai';
  pdf.text(title, pageWidth / 2, currentY, { align: 'center' });
  currentY += 20;

  // Subtitle
  pdf.setFontSize(12);
  pdf.setTextColor(100, 100, 100);
  const subtitle =
    language === 'en'
      ? 'Discover your reason for being with AI-powered career guidance'
      : 'Descubre tu razón de ser con orientación profesional impulsada por IA';
  pdf.text(subtitle, pageWidth / 2, currentY, { align: 'center' });
  currentY += 30;

  // Core Drivers Section
  pdf.setFontSize(18);
  pdf.setTextColor(0, 0, 0);
  const driversTitle =
    language === 'en' ? 'Core Drivers' : 'Impulsores Principales';
  pdf.text(driversTitle, 20, currentY);
  currentY += 15;

  // Safely handle potential null value returned from the backend for
  // `coreDriversAnalysis` by falling back to empty strings. This guarantees
  // the PDF generation never crashes and still renders the rest of the
  // document.
  const drivers = results.coreDriversAnalysis ?? {
    energy: '',
    edge: '',
    impact: '',
    economicReality: '',
  };

  // Energy
  pdf.setFontSize(14);
  pdf.setTextColor(37, 99, 235);
  const energyTitle =
    language === 'en' ? '🌟 Energy (What You Love)' : '🌟 Energía (Lo Que Amas)';
  pdf.text(energyTitle, 20, currentY);
  currentY += 8;

  pdf.setFontSize(10);
  pdf.setTextColor(60, 60, 60);
  const energyText = pdf.splitTextToSize(
    drivers.energy,
    pageWidth - 40,
  );
  pdf.text(energyText, 20, currentY);
  currentY += energyText.length * 5 + 10;

  // Edge
  pdf.setFontSize(14);
  pdf.setTextColor(124, 58, 237); // Secondary color
  const edgeTitle =
    language === 'en'
      ? "⚡ Edge (What You're Good At)"
      : '⚡ Ventaja (En Lo Que Eres Bueno)';
  pdf.text(edgeTitle, 20, currentY);
  currentY += 8;

  pdf.setFontSize(10);
  pdf.setTextColor(60, 60, 60);
  const edgeText = pdf.splitTextToSize(drivers.edge, pageWidth - 40);
  pdf.text(edgeText, 20, currentY);
  currentY += edgeText.length * 5 + 10;

  // Impact
  pdf.setFontSize(14);
  pdf.setTextColor(16, 185, 129); // Success color
  const impactTitle =
    language === 'en'
      ? '🌍 Impact (What the World Needs)'
      : '🌍 Impacto (Lo Que El Mundo Necesita)';
  pdf.text(impactTitle, 20, currentY);
  currentY += 8;

  pdf.setFontSize(10);
  pdf.setTextColor(60, 60, 60);
  const impactText = pdf.splitTextToSize(
    drivers.impact,
    pageWidth - 40,
  );
  pdf.text(impactText, 20, currentY);
  currentY += impactText.length * 5 + 10;

  // Economic Reality
  pdf.setFontSize(14);
  pdf.setTextColor(245, 158, 11); // Accent color
  const economicTitle =
    language === 'en' ? '💰 Economic Reality' : '💰 Realidad Económica';
  pdf.text(economicTitle, 20, currentY);
  currentY += 8;

  pdf.setFontSize(10);
  pdf.setTextColor(60, 60, 60);
  const economicText = pdf.splitTextToSize(
    drivers.economicReality,
    pageWidth - 40,
  );
  pdf.text(economicText, 20, currentY);
  currentY += economicText.length * 5 + 20;

  // Check if we need a new page
  if (currentY > pageHeight - 100) {
    pdf.addPage();
    currentY = 20;
  }

  // Purpose Paths Section
  pdf.setFontSize(18);
  pdf.setTextColor(0, 0, 0);
  const pathsTitle =
    language === 'en' ? 'Your Purpose Paths' : 'Tus Caminos de Propósito';
  pdf.text(pathsTitle, 20, currentY);
  currentY += 15;

  results.purposePaths.forEach((path: PurposePathWithSalary, index: number) => {
    // Check if we need a new page
    if (currentY > pageHeight - 80) {
      pdf.addPage();
      currentY = 20;
    }

    pdf.setFontSize(14);
    pdf.setTextColor(37, 99, 235);
    pdf.text(`${index + 1}. ${path.title}`, 20, currentY);
    currentY += 10;

    pdf.setFontSize(10);
    pdf.setTextColor(60, 60, 60);
    const descText = pdf.splitTextToSize(path.description, pageWidth - 40);
    pdf.text(descText, 20, currentY);
    currentY += descText.length * 5 + 8;

    const strategyText = pdf.splitTextToSize(
      `Action Strategy: ${path.actionStrategy}`,
      pageWidth - 40,
    );
    pdf.text(strategyText, 20, currentY);
    currentY += strategyText.length * 5 + 15;
  });

  // Footer
  pdf.setFontSize(8);
  pdf.setTextColor(150, 150, 150);
  const footer =
    language === 'en'
      ? 'Generated by Purpose Finder - Powered by Nami AI'
      : 'Generado por Buscador de Propósito - Desarrollado por Nami AI';
  pdf.text(footer, pageWidth / 2, pageHeight - 10, { align: 'center' });

  // Save the PDF
  const filename =
    language === 'en' ? 'ikigai-analysis.pdf' : 'analisis-ikigai.pdf';
  pdf.save(filename);
}

/**
 * Generates and exports a PDF document for the user's action plan.
 * @param {ActionPlan} actionPlan - The action plan object.
 * @param {string} chosenPathTitle - The title of the chosen career path.
 * @param {Language} language - The selected language for localization.
 */
export function exportActionPlanToPDF(
  actionPlan: ActionPlan,
  chosenPathTitle: string,
  language: Language,
) {
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageMargin = 20;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - pageMargin * 2;
  let currentY = 20;

  // --- Title ---
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.setTextColor('#0f172a'); // slate-900
  pdf.text(t('actionPlan.title', language), pageWidth / 2, currentY, {
    align: 'center',
  });
  currentY += 10;

  // --- Subtitle (Chosen Path) ---
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(12);
  pdf.setTextColor('#475569'); // slate-600
  const subtitle = `${t('actionPlan.chosenPath', language)}: ${chosenPathTitle}`;
  pdf.text(subtitle, pageWidth / 2, currentY, { align: 'center' });
  currentY += 20;

  /**
   * Helper function to draw a section with a title and a list of items.
   * Handles page breaks automatically.
   * @param {string} sectionKey - The i18n key for the section title.
   * @param {Array<string | object>} items - The array of items to render.
   */
  const drawSection = (sectionKey: string, items: (string | any)[]) => {
    if (currentY > pageHeight - 40) {
      pdf.addPage();
      currentY = pageMargin;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.setTextColor('#1e293b'); // slate-800
    pdf.text(t(sectionKey, language), pageMargin, currentY);
    currentY += 10;
    pdf.setFont('helvetica', 'normal');

    items.forEach((item) => {
      if (currentY > pageHeight - 25) {
        pdf.addPage();
        currentY = pageMargin;
      }

      if (typeof item === 'string') {
        pdf.setFontSize(10);
        pdf.setTextColor('#334155'); // slate-700
        const itemText = pdf.splitTextToSize(`• ${item}`, contentWidth - 5);
        pdf.text(itemText, pageMargin + 5, currentY);
        currentY += itemText.length * 4 + 3;
      } else {
        // This is a skill item from the action plan
        pdf.setFontSize(11);
        pdf.setTextColor('#1e293b'); // slate-800
        const skillText = pdf.splitTextToSize(item.skill, contentWidth - 5);
        pdf.text(skillText, pageMargin + 5, currentY);
        currentY += skillText.length * 4.5 + 4;

        item.youtubeLinks.forEach((link: { title: string; url: string }) => {
          if (currentY > pageHeight - 20) {
            pdf.addPage();
            currentY = pageMargin;
          }
          pdf.setFontSize(9);
          pdf.setTextColor('#334155');
          const linkTitleText = pdf.splitTextToSize(
            `- ${link.title}`,
            contentWidth - 10,
          );
          pdf.text(linkTitleText, pageMargin + 10, currentY);
          currentY += linkTitleText.length * 3.5 + 2;

          pdf.setFontSize(8);
          pdf.setTextColor('#2563eb'); // blue-600
          // Make the URL clickable
          pdf.textWithLink(link.url, pageMargin + 10, currentY, {
            url: link.url,
          });
          currentY += 8;
        });
      }
    });
    currentY += 10; // Space after section
  };

  // --- Render Milestones ---
  actionPlan.milestones.forEach((ms, idx) => {
    if (currentY > pageHeight - 40) {
      pdf.addPage();
      currentY = pageMargin;
    }

    // Milestone Header
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor('#1e293b'); // slate-800
    pdf.text(`${idx + 1}. ${ms.title}  (${ms.timeline})`, pageMargin, currentY);
    currentY += 8;

    // Actions
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor('#334155');
    ms.actions.forEach((act) => {
      const lines = pdf.splitTextToSize(`• ${act}`, contentWidth - 5);
      pdf.text(lines, pageMargin + 5, currentY);
      currentY += lines.length * 4 + 2;
    });

    // Skills
    if (ms.skills && ms.skills.length > 0) {
      currentY += 2;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor('#1e293b');
      pdf.text(t('actionPlan.skills', language), pageMargin + 2, currentY);
      currentY += 6;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor('#334155');
      ms.skills.forEach((skill) => {
        const skillLines = pdf.splitTextToSize(`- ${skill.skill}`, contentWidth - 10);
        pdf.text(skillLines, pageMargin + 8, currentY);
        currentY += skillLines.length * 4 + 2;

        skill.youtubeLinks.forEach((link) => {
          const linkLines = pdf.splitTextToSize(`   • ${link.title}`, contentWidth - 12);
          pdf.text(linkLines, pageMargin + 12, currentY);
          currentY += linkLines.length * 3 + 1;
          pdf.setTextColor('#2563eb');
          pdf.textWithLink(link.url, pageMargin + 12, currentY, { url: link.url });
          pdf.setTextColor('#334155');
          currentY += 6;
        });
      });
    }

    currentY += 8; // spacing after milestone
  });

  // --- Footer ---
  const pageCount = (pdf.internal as any).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor('#94a3b8'); // slate-400
    const footerText = `${t('header.title', language)} - ${t('header.poweredBy', language)}`;
    pdf.text(
      footerText,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' },
    );
    pdf.text(
      `${t('common.page', 'en')} ${i} / ${pageCount}`, // Using 'en' for "Page" to keep it simple
      pageWidth - pageMargin,
      pageHeight - 10,
      { align: 'right' },
    );
  }

  // --- Save the PDF ---
  const filename =
    language === 'en'
      ? 'purpose-finder-action-plan.pdf'
      : 'purpose-finder-plan-de-accion.pdf';
  pdf.save(filename);
}