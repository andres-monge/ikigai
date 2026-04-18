/**
 * @file i18n.ts
 *
 * @description
 * This file contains the internationalization (i18n) configuration for the
 * Purpose Finder application. It centralizes all user-facing strings for
 * both English ('en') and Spanish ('es'), allowing for easy translation and
 * management of UI text.
 *
 * The `translations` object holds the nested structure of keys, and the `t`
 * function is a simple utility to retrieve a specific string for a given
 * language, falling back to the key itself if a translation is not found.
 *
 * @dependencies
 * - None
 */

export const translations: Record<string, Record<string, string>> = {
  en: {
    // Header
    'header.title': 'Revela',

    // Welcome Section
    'welcome.title': 'Not sure what you want to do next?',
    'welcome.title2': '',
    'welcome.problem':
      'Everyone asks what you want to be. Nobody teaches you how to figure that out.',
    'welcome.credibility':
      "A framework to do something fulfilling: what you love, what you're good at, what the world needs, and what pays.",
    'welcome.noAccount': 'Free. No signup required.',

    // Home
    'home.questionnaireTitle': 'Answer 8 questions. Find your thing.',
    'home.questionnaireTitle2': 'Then pick a path to start.',
    'home.returnToPaths': 'Return to Your Paths',

    // Questionnaire
    'questionnaire.complete': 'Show Me My 3 Paths',
    'questionnaire.saving': 'Saving...',



    // Results
    'results.title': "What You're About",
    'results.purposePaths': 'Your 3 Paths',
    'results.exportPdf': 'Export as PDF',
    'results.startOver': 'Start Over',
    'results.choosePathAndGetPlan': 'Get Action Plan',
    'results.actionStrategy': 'Action Strategy',
    'results.actionPlanError':
      'Could not generate an Action Plan. Please try again.',
    'results.loadingSession': 'Loading your session...',
    'results.loadSessionError': 'No results found. Please complete the questionnaire first.',
    'results.saveAnalysisError': 'Failed to save analysis results.',
    'results.analysisFailedError': 'Analysis failed. Please try again.',
    'results.streaming': 'Enjoy some music while we read through your answers...',
    'results.copyToClipboard': 'Copy to Clipboard',
    'results.copiedSuccess': 'Copied to clipboard!',
    'results.copyError': 'Failed to copy. Please try again.',

    // Action Plan
    'actionPlan.title': 'Your Action Plan',
    'actionPlan.subtitle':
      "Here's how to start exploring this path.",
    'actionPlan.chosenPath': 'Chosen Path',
    'actionPlan.exportPdf': 'Export as PDF',
    'actionPlan.backToPaths': 'Back to Paths',
    'actionPlan.actions': 'Actions',
    'actionPlan.skills': 'Skills You\'ll Develop',
    'actionPlan.checkpoint': 'How You\'ll Know You\'re Onto Something',
    'actionPlan.streaming': 'Scheming...a goal without a plan is just a wish.',
    'actionPlan.copyToClipboard': 'Copy to Clipboard',
    'actionPlan.copiedSuccess': 'Copied to clipboard!',
    'actionPlan.copyError': 'Failed to copy. Please try again.',

    // Ikigai
    'ikigai.alignment': 'Why This Fits You',
    'ikigai.love': 'Love',
    'ikigai.goodAt': 'Good At',
    'ikigai.worldNeeds': 'Meaningful',
    'ikigai.pay': 'Pay',

    // Common
    'common.error': 'Something went wrong. Please try again.',
  },
  es: {
    // Header
    'header.title': 'Revela',

    // Welcome Section
    'welcome.title': '¿No tienes claro qué quieres hacer después?',
    'welcome.title2': '',
    'welcome.problem':
      'Todos te preguntan qué quieres ser. Nadie te enseña cómo descubrirlo.',
    'welcome.credibility':
      'Un método para hacer algo que te llene: lo que amas, lo que se te da bien, lo que el mundo necesita y lo que paga.',
    'welcome.noAccount': 'Gratis. Sin registros.',

    // Home
    'home.questionnaireTitle': 'Responde 8 preguntas. Descubre qué te motiva.',
    'home.questionnaireTitle2': 'Luego elige un camino para empezar.',
    'home.returnToPaths': 'Volver a tus caminos',

    // Questionnaire
    'questionnaire.complete': 'Muéstrame mis 3 caminos',
    'questionnaire.saving': 'Guardando...',



    // Results
    'results.title': 'Lo que te define',
    'results.purposePaths': 'Tus 3 caminos',
    'results.exportPdf': 'Exportar como PDF',
    'results.startOver': 'Volver al inicio',
    'results.choosePathAndGetPlan': 'Ver Plan de acción',
    'results.actionStrategy': 'Plan de acción',
    'results.actionPlanError':
      'No se pudo generar un plan de acción. Por favor, inténtalo de nuevo.',
    'results.loadingSession': 'Cargando tu sesión...',
    'results.loadSessionError': 'No se encontraron resultados. Por favor, completa el cuestionario primero.',
    'results.saveAnalysisError': 'No se pudieron guardar los resultados del análisis.',
    'results.analysisFailedError': 'El análisis tuvo un error. Por favor, inténtalo de nuevo.',
    'results.streaming': 'Disfruta de la música mientras analizamos tus respuestas...',
    'results.copyToClipboard': 'Copiar al portapapeles',
    'results.copiedSuccess': 'Copiado al portapapeles!',
    'results.copyError': 'Error al copiar. Intente de nuevo.',

    // Action Plan
    'actionPlan.title': 'Tu Plan de acción',
    'actionPlan.subtitle':
      'Así puedes empezar a explorar este camino.',
    'actionPlan.chosenPath': 'Camino elegido',
    'actionPlan.exportPdf': 'Exportar como PDF',
    'actionPlan.backToPaths': 'Volver a los caminos',
    'actionPlan.actions': 'Acciones',
    'actionPlan.skills': 'Habilidades que desarrollarás',
    'actionPlan.checkpoint': 'Cómo sabrás que vas por buen camino',
    'actionPlan.streaming': 'Pensando...un objetivo sin un plan es solo un deseo.',
    'actionPlan.copyToClipboard': 'Copiar al portapapeles',
    'actionPlan.copiedSuccess': 'Copiado al portapapeles!',
    'actionPlan.copyError': 'Error al copiar. Intente de nuevo.',

    // Ikigai
    'ikigai.alignment': 'Por qué encaja contigo',
    'ikigai.love': 'Te encanta',
    'ikigai.goodAt': 'Se te da bien',
    'ikigai.worldNeeds': 'Gratificante',
    'ikigai.pay': 'Paga',

    // Common
    'common.error': 'Algo salió mal. Por favor inténtalo de nuevo.',
  },
};

/**
 * The supported languages for the application.
 */
export type Language = 'en' | 'es';

/**
 * Retrieves a translated string for a given key and language.
 *
 * @param key The key of the string to retrieve (e.g., 'header.title').
 * @param language The target language ('en' or 'es'). Defaults to 'en'.
 * @returns The translated string, or the key itself if no translation is found.
 */
export function t(key: string, language: Language = 'en'): string {
  // Use the provided language, but default to 'en' if it's null or undefined.
  const lang = language || 'en';

  // Directly look up the flat key (e.g., 'header.title') and return the key itself on failure.
  return translations[lang]?.[key] ?? key;
}