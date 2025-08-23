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
import type { FullAssessment, PurposePath } from '@/types/assessment';
import type { ActionPlan } from '@/types/assessment';
import { t, type Language } from '@/lib/i18n';

export function exportToPDF(
  results: FullAssessment,
  language: 'en' | 'es' = 'en',
) {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let currentY = 30;

  // Add custom font if available (Inter)
  pdf.setFont('helvetica');

  // Header background
  pdf.setFillColor(59, 130, 246); // Primary blue
  pdf.rect(0, 0, pageWidth, 50, 'F');

  // Title
  pdf.setFontSize(28);
  pdf.setTextColor(255, 255, 255); // White
  pdf.setFont('helvetica', 'bold');
  const title = language === 'en' ? 'Your Ikigai Analysis' : 'Tu Análisis Ikigai';
  pdf.text(title, pageWidth / 2, 25, { align: 'center' });

  // Subtitle
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'normal');
  const subtitle =
    language === 'en'
      ? 'Discover your reason for being with AI-powered career guidance'
      : 'Descubre tu razón de ser con orientación profesional impulsada por IA';
  pdf.text(subtitle, pageWidth / 2, 37, { align: 'center' });
  
  currentY = 70;

  // Your Ikigai Section
  pdf.setFontSize(20);
  pdf.setTextColor(31, 41, 55); // Gray 800
  pdf.setFont('helvetica', 'bold');
  const driversTitle =
    language === 'en' ? 'Your Ikigai' : 'Tu Ikigai';
  pdf.text(driversTitle, 20, currentY);
  
  currentY += 20;

  // Safely handle potential null value
  const drivers = results.coreDriversAnalysis ?? {
    statementSentence: '',
    coreThreads: '',
  };

  // Statement Sentence (Bold)
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(31, 41, 55);
  const statementText = pdf.splitTextToSize(
    drivers.statementSentence,
    pageWidth - 40,
  );
  pdf.text(statementText, 20, currentY);
  currentY += statementText.length * 6 + 15;

  // Core Threads (Regular)
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(75, 85, 99); // Gray 600
  const threadsText = pdf.splitTextToSize(drivers.coreThreads, pageWidth - 40);
  pdf.text(threadsText, 20, currentY);
  currentY += threadsText.length * 6 + 30;

  // Check if we need a new page
  if (currentY > pageHeight - 100) {
    pdf.addPage();
    currentY = 20;
  }

  // Purpose Paths Section
  pdf.setFontSize(20);
  pdf.setTextColor(31, 41, 55);
  pdf.setFont('helvetica', 'bold');
  const pathsTitle =
    language === 'en' ? 'Your Purpose Paths' : 'Tus Caminos de Propósito';
  pdf.text(pathsTitle, 20, currentY);
  
  currentY += 20;

  results.purposePaths.forEach((path: PurposePath, index: number) => {
    // Check if we need a new page
    if (currentY > pageHeight - 120) {
      pdf.addPage();
      currentY = 20;
    }

    // Path title
    pdf.setFontSize(16);
    pdf.setTextColor(31, 41, 55);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${index + 1}. ${path.title}`, 20, currentY);
    currentY += 15;

    // Description
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(75, 85, 99);
    const descText = pdf.splitTextToSize(path.description, pageWidth - 40);
    pdf.text(descText, 20, currentY);
    currentY += descText.length * 5 + 15;

    // Ikigai Alignment - Simple list format
    const columnWidth = (pageWidth - 40) / 2;
    
    // What You Love
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(59, 130, 246);
    pdf.text(language === 'en' ? 'What You Love' : 'Lo Que Amas', 20, currentY);
    currentY += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(75, 85, 99);
    const loveText = pdf.splitTextToSize(path.ikigaiAlignment.love, pageWidth - 40);
    pdf.text(loveText, 20, currentY);
    currentY += loveText.length * 5 + 10;
    
    // What You're Good At
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(139, 92, 246); // Purple
    pdf.text(language === 'en' ? "What You're Good At" : 'En Lo Que Eres Bueno', 20, currentY);
    currentY += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(75, 85, 99);
    const goodAtText = pdf.splitTextToSize(path.ikigaiAlignment.goodAt, pageWidth - 40);
    pdf.text(goodAtText, 20, currentY);
    currentY += goodAtText.length * 5 + 10;
    
    // What the World Needs
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(16, 185, 129); // Green
    pdf.text(language === 'en' ? 'What the World Needs' : 'Lo Que El Mundo Necesita', 20, currentY);
    currentY += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(75, 85, 99);
    const worldNeedsText = pdf.splitTextToSize(path.ikigaiAlignment.worldNeeds, pageWidth - 40);
    pdf.text(worldNeedsText, 20, currentY);
    currentY += worldNeedsText.length * 5 + 10;

    // What You Can Be Paid For
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(245, 158, 11); // Amber
    pdf.text(language === 'en' ? 'What You Can Be Paid For' : 'Por Lo Que Te Pueden Pagar', 20, currentY);
    currentY += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(75, 85, 99);
    const payText = pdf.splitTextToSize(path.ikigaiAlignment.pay, pageWidth - 40);
    pdf.text(payText, 20, currentY);
    currentY += payText.length * 5 + 10;

    // Action Strategy
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(31, 41, 55);
    pdf.text(language === 'en' ? 'Action Strategy' : 'Estrategia de Acción', 20, currentY);
    currentY += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(75, 85, 99);
    const strategyText = pdf.splitTextToSize(path.actionStrategy, pageWidth - 40);
    pdf.text(strategyText, 20, currentY);
    currentY += strategyText.length * 5 + 25;
  });

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
  let currentY = 30;

  // Header background
  pdf.setFillColor(59, 130, 246); // Primary blue
  pdf.rect(0, 0, pageWidth, 50, 'F');

  // --- Title ---
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(24);
  pdf.setTextColor(255, 255, 255); // White
  pdf.text(t('actionPlan.title', language), pageWidth / 2, 25, {
    align: 'center',
  });

  // --- Subtitle (Chosen Path) ---
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(14);
  const subtitle = `${t('actionPlan.chosenPath', language)}: ${chosenPathTitle}`;
  pdf.text(subtitle, pageWidth / 2, 37, { align: 'center' });
  
  currentY = 70;

  // --- Render Milestones ---
  actionPlan.milestones.forEach((ms, idx) => {
    if (currentY > pageHeight - 60) {
      pdf.addPage();
      currentY = pageMargin;
    }

    // Milestone Header
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.setTextColor(31, 41, 55); // slate-800
    pdf.text(`${idx + 1}. ${ms.title} (${ms.timeline})`, pageMargin, currentY);
    
    currentY += 15;

    // Actions
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(75, 85, 99);
    ms.actions.forEach((act) => {
      const lines = pdf.splitTextToSize(`• ${act}`, contentWidth);
      pdf.text(lines, pageMargin, currentY);
      currentY += lines.length * 5 + 3;
    });

    // Skills
    if (ms.skills && ms.skills.length > 0) {
      currentY += 10;
      
      // Skills header
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(31, 41, 55);
      pdf.text(t('actionPlan.skills', language), pageMargin, currentY);
      
      currentY += 10;

      pdf.setFont('helvetica', 'normal');
      ms.skills.forEach((skill) => {
        // Skill name
        pdf.setFontSize(11);
        pdf.setTextColor(31, 41, 55);
        pdf.setFont('helvetica', 'bold');
        const skillLines = pdf.splitTextToSize(`• ${skill.skill}`, contentWidth);
        pdf.text(skillLines, pageMargin + 5, currentY);
        currentY += skillLines.length * 5 + 5;

        // YouTube videos
        skill.youtubeLinks.forEach((link) => {
          if (currentY > pageHeight - 30) {
            pdf.addPage();
            currentY = pageMargin;
          }
          
          // Video title
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(10);
          pdf.setTextColor(75, 85, 99);
          const linkLines = pdf.splitTextToSize(`  - ${link.title}`, contentWidth - 10);
          pdf.text(linkLines, pageMargin + 10, currentY);
          currentY += linkLines.length * 4 + 3;
          
          // Video URL as link
          pdf.setTextColor(59, 130, 246); // Blue for links
          pdf.setFontSize(9);
          const urlText = link.url.length > 60 ? link.url.substring(0, 57) + '...' : link.url;
          pdf.textWithLink(urlText, pageMargin + 15, currentY, { url: link.url });
          currentY += 7;
        });
        currentY += 3;
      });
    }

    currentY += 15; // spacing after milestone
  });

  // --- Save the PDF ---
  const filename =
    language === 'en'
      ? 'purpose-finder-action-plan.pdf'
      : 'purpose-finder-plan-de-accion.pdf';
  pdf.save(filename);
}