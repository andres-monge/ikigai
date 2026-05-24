/**
 * @file clipboard-export.ts
 *
 * @description
 * This library contains functions for exporting application data to the clipboard
 * in dual format (HTML + Markdown). This allows users to paste content into
 * rich text destinations (Google Docs) or plain text destinations (ChatGPT, Claude).
 *
 * The clipboard API writes both formats simultaneously, and the destination
 * application picks the most appropriate format.
 *
 * @dependencies
 * - @/types/assessment: For type definitions
 * - @/lib/i18n: For localization
 */
import type { FullAssessment, ActionPlan, PurposePath } from '@/types/assessment';
import { t, type Language } from '@/lib/i18n';

/* -------------------------------------------------------------------------- */
/* RESULTS FORMATTING                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Formats the ikigai results as Markdown for LLM-friendly pasting.
 */
function formatResultsAsMarkdown(results: FullAssessment, language: Language): string {
  const drivers = results.coreDriversAnalysis ?? {
    statementSentence: '',
    coreThreads: '',
  };

  let md = `# ${t('results.title', language)}\n\n`;
  md += `**${drivers.statementSentence}**\n\n`;
  md += `${drivers.coreThreads}\n\n`;
  md += `---\n\n`;
  md += `## ${t('results.purposePaths', language)}\n\n`;

  results.purposePaths.forEach((path, index) => {
    md += `### ${index + 1}. ${path.title}\n\n`;
    md += `${path.description}\n\n`;
    md += `#### ${t('ikigai.alignment', language)}\n\n`;
    md += `- **${t('ikigai.love', language)}:** ${path.ikigaiAlignment.love}\n`;
    md += `- **${t('ikigai.goodAt', language)}:** ${path.ikigaiAlignment.goodAt}\n`;
    md += `- **${t('ikigai.meaning', language)}:** ${path.ikigaiAlignment.meaning}\n`;
    md += `- **${t('ikigai.pay', language)}:** ${path.ikigaiAlignment.pay}\n\n`;
    md += `#### ${t('results.actionStrategy', language)}\n\n`;
    md += `${path.actionStrategy}\n\n`;

    if (index < results.purposePaths.length - 1) {
      md += `---\n\n`;
    }
  });

  return md;
}

/**
 * Formats the ikigai results as HTML for rich text pasting (Google Docs, etc.).
 */
function formatResultsAsHTML(results: FullAssessment, language: Language): string {
  const drivers = results.coreDriversAnalysis ?? {
    statementSentence: '',
    coreThreads: '',
  };

  let html = `<h1>${t('results.title', language)}</h1>`;
  html += `<p><strong>${drivers.statementSentence}</strong></p>`;
  html += `<p>${drivers.coreThreads}</p>`;
  html += `<hr>`;
  html += `<h2>${t('results.purposePaths', language)}</h2>`;

  results.purposePaths.forEach((path, index) => {
    html += `<h3>${index + 1}. ${path.title}</h3>`;
    html += `<p>${path.description}</p>`;
    html += `<h4>${t('ikigai.alignment', language)}</h4>`;
    html += `<ul>`;
    html += `<li><strong>${t('ikigai.love', language)}:</strong> ${path.ikigaiAlignment.love}</li>`;
    html += `<li><strong>${t('ikigai.goodAt', language)}:</strong> ${path.ikigaiAlignment.goodAt}</li>`;
    html += `<li><strong>${t('ikigai.meaning', language)}:</strong> ${path.ikigaiAlignment.meaning}</li>`;
    html += `<li><strong>${t('ikigai.pay', language)}:</strong> ${path.ikigaiAlignment.pay}</li>`;
    html += `</ul>`;
    html += `<h4>${t('results.actionStrategy', language)}</h4>`;
    html += `<p>${path.actionStrategy}</p>`;

    if (index < results.purposePaths.length - 1) {
      html += `<hr>`;
    }
  });

  return html;
}

/* -------------------------------------------------------------------------- */
/* ACTION PLAN FORMATTING                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Formats the action plan as Markdown for LLM-friendly pasting.
 */
function formatActionPlanAsMarkdown(
  actionPlan: ActionPlan,
  chosenPath: PurposePath,
  language: Language,
): string {
  let md = `# ${t('actionPlan.title', language)}\n\n`;
  md += `**${t('actionPlan.chosenPath', language)}:** ${chosenPath.title}\n\n`;
  md += `---\n\n`;

  actionPlan.milestones.forEach((milestone, index) => {
    md += `## ${index + 1}. ${milestone.title} (${milestone.timeline})\n\n`;

    md += `### ${t('actionPlan.actions', language)}\n\n`;
    milestone.actions.forEach((action) => {
      md += `- ${action}\n`;
    });
    md += `\n`;

    md += `### ${t('actionPlan.checkpoint', language)}\n\n`;
    md += `${milestone.checkpoint}\n\n`;

    if (milestone.skills && milestone.skills.length > 0) {
      md += `### ${t('actionPlan.skills', language)}\n\n`;
      milestone.skills.forEach((skill) => {
        md += `- ${skill.skill}\n`;
      });
      md += `\n`;
    }

    if (index < actionPlan.milestones.length - 1) {
      md += `---\n\n`;
    }
  });

  return md;
}

/**
 * Formats the action plan as HTML for rich text pasting (Google Docs, etc.).
 */
function formatActionPlanAsHTML(
  actionPlan: ActionPlan,
  chosenPath: PurposePath,
  language: Language,
): string {
  let html = `<h1>${t('actionPlan.title', language)}</h1>`;
  html += `<p><strong>${t('actionPlan.chosenPath', language)}:</strong> ${chosenPath.title}</p>`;
  html += `<hr>`;

  actionPlan.milestones.forEach((milestone, index) => {
    html += `<h2>${index + 1}. ${milestone.title} (${milestone.timeline})</h2>`;

    html += `<h3>${t('actionPlan.actions', language)}</h3>`;
    html += `<ul>`;
    milestone.actions.forEach((action) => {
      html += `<li>${action}</li>`;
    });
    html += `</ul>`;

    html += `<h3>${t('actionPlan.checkpoint', language)}</h3>`;
    html += `<p>${milestone.checkpoint}</p>`;

    if (milestone.skills && milestone.skills.length > 0) {
      html += `<h3>${t('actionPlan.skills', language)}</h3>`;
      html += `<ul>`;
      milestone.skills.forEach((skill) => {
        html += `<li>${skill.skill}</li>`;
      });
      html += `</ul>`;
    }

    if (index < actionPlan.milestones.length - 1) {
      html += `<hr>`;
    }
  });

  return html;
}

/* -------------------------------------------------------------------------- */
/* CLIPBOARD API                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Writes both HTML and plain text to the clipboard using the ClipboardItem API.
 * Falls back to writeText if ClipboardItem is not supported.
 *
 * @param html - The HTML content for rich text destinations
 * @param markdown - The plain text/markdown content for text destinations
 * @throws Error if clipboard access is denied or fails
 */
async function writeToClipboard(html: string, markdown: string): Promise<void> {
  // Modern API with dual format support
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      const htmlBlob = new Blob([html], { type: 'text/html' });
      const textBlob = new Blob([markdown], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob,
        }),
      ]);
      return;
    } catch {
      // Fall through to fallback if ClipboardItem fails
    }
  }

  // Fallback: text only using writeText
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(markdown);
    return;
  }

  // Last resort: deprecated execCommand (still widely supported)
  const textarea = document.createElement('textarea');
  textarea.value = markdown;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.select();
  const success = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!success) {
    throw new Error('Clipboard access denied');
  }
}

/* -------------------------------------------------------------------------- */
/* EXPORTED FUNCTIONS                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Copies the ikigai results to the clipboard in dual format (HTML + Markdown).
 *
 * @param results - The full assessment session data
 * @param language - The current language for localized headers
 * @throws Error if clipboard access is denied or copy fails
 */
export async function copyResultsToClipboard(
  results: FullAssessment,
  language: Language,
): Promise<void> {
  const markdown = formatResultsAsMarkdown(results, language);
  const html = formatResultsAsHTML(results, language);
  await writeToClipboard(html, markdown);
}

/**
 * Copies the action plan to the clipboard in dual format (HTML + Markdown).
 *
 * @param actionPlan - The action plan with milestones
 * @param chosenPath - The chosen purpose path for context
 * @param language - The current language for localized headers
 * @throws Error if clipboard access is denied or copy fails
 */
export async function copyActionPlanToClipboard(
  actionPlan: ActionPlan,
  chosenPath: PurposePath,
  language: Language,
): Promise<void> {
  const markdown = formatActionPlanAsMarkdown(actionPlan, chosenPath, language);
  const html = formatActionPlanAsHTML(actionPlan, chosenPath, language);
  await writeToClipboard(html, markdown);
}
