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
    'header.title': 'Ikigai Finder',

    // Welcome Section
    'welcome.title': 'Find Your Purpose',
    'welcome.description':
      'Do something you love. Stop living for the weekend.',
    'welcome.noAccount': 'No account required',

    // Home
    'home.questionnaireTitle': 'Answer 8 questions, let our AI change your life.',

    // Questionnaire
    'questionnaire.complete': 'Show Me My Purpose',



    // Results
    'results.title': 'Your Ikigai',
    'results.purposePaths': 'Your 3 Purpose Paths',
    'results.exportPdf': 'Export as PDF',
    'results.startOver': 'Start Over',
    'results.choosePathAndGetPlan': 'Get Action Plan',
    'results.actionStrategy': 'Action Strategy',
    'results.actionPlanError':
      'Could not generate an action plan. Please try again.',
    'results.loadingSession': 'Loading your session...',
    'results.loadSessionError': 'Failed to load your session. Please try again.',
    'results.saveAnalysisError': 'Failed to save analysis results.',
    'results.analysisFailedError': 'Analysis failed. Please try again.',

    // Action Plan
    'actionPlan.title': 'Your Action Plan',
    'actionPlan.subtitle':
      'Steps to get you started on your new path.',
    'actionPlan.chosenPath': 'Chosen Path',
    'actionPlan.exportPdf': 'Export as PDF',
    'actionPlan.backToPaths': 'Back to Paths',
    'actionPlan.actions': 'Actions',
    'actionPlan.skills': 'Skills You\'ll Develop',

    // Ikigai
    'ikigai.alignment': 'Ikigai Alignment',
    'ikigai.love': 'Love',
    'ikigai.goodAt': 'Good At',
    'ikigai.worldNeeds': 'Meaningful',
    'ikigai.pay': 'Pay',



    // Loading
    'loading.title': 'Our AIs are cooking.',
    'loading.description': 'This will only take a minute.',

    // Common
    'common.error': 'Something went wrong. Please try again.',
  },
  es: {
    // Header
    'header.title': 'Ikigai Finder',

    // Welcome Section
    'welcome.title': 'Encuentra tu propósito',
    'welcome.description':
      'Haz algo que te encante. Deja de vivir esperando al finde.',
    'welcome.noAccount': 'No requiere cuenta',

    // Home
    'home.questionnaireTitle': 'Responde 8 preguntas, deja que nuestra IA cambie tu vida.',

    // Questionnaire
    'questionnaire.complete': 'Enséñame mi propósito',



    // Results
    'results.title': 'Tu Ikigai',
    'results.purposePaths': 'Tus 3 Caminos',
    'results.exportPdf': 'Exportar como PDF',
    'results.startOver': 'Volver al inicio',
    'results.choosePathAndGetPlan': 'Ver Plan de acción',
    'results.actionStrategy': 'Plan de acción',
    'results.actionPlanError':
      'No se pudo generar un plan de acción. Por favor, inténtalo de nuevo.',
    'results.loadingSession': 'Cargando tu sesión...',
    'results.loadSessionError': 'No se pudo cargar tu sesión. Por favor, inténtalo de nuevo.',
    'results.saveAnalysisError': 'No se pudieron guardar los resultados del análisis.',
    'results.analysisFailedError': 'El análisis falló. Por favor, inténtalo de nuevo.',

    // Action Plan
    'actionPlan.title': 'Tu Plan de acción',
    'actionPlan.subtitle':
      'Pasos para empezar en tu nuevo camino.',
    'actionPlan.chosenPath': 'Camino elegido',
    'actionPlan.exportPdf': 'Exportar como PDF',
    'actionPlan.backToPaths': 'Volver a los caminos',
    'actionPlan.actions': 'Acciones',
    'actionPlan.skills': 'Habilidades que desarrollarás',

    // Ikigai
    'ikigai.alignment': 'Encaje Ikigai',
    'ikigai.love': 'Te encanta',
    'ikigai.goodAt': 'Se te da bien',
    'ikigai.worldNeeds': 'Gratificante',
    'ikigai.pay': 'Paga',



    // Loading
    'loading.title': 'Las IAs están cocinando',
    'loading.description': 'Tardará un minuto.',

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