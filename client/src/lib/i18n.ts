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
 * ✨ **File Status (Step 25)** ✨
 * - Reviewed and confirmed that all keys required for the Action Plan feature
 * are present for both English and Spanish.
 * - This file is up-to-date with all current UI features.
 *
 * @dependencies
 * - None
 */

export const translations: Record<string, Record<string, string>> = {
  en: {
    // Header
    'header.title': 'Ikigai Finder',
    'header.poweredBy': 'Powered by Nami AI',

    // Welcome Section
    'welcome.title': 'Find Your Ikigai',
    'welcome.subtitle':
      'Discover your reason for being with AI-powered career guidance',
    'welcome.description':
      "Join thousands who've discovered their perfect career path through our comprehensive assessment. Let Nami, our AI guide, help you uncover the intersection of what you love, what you're good at, what the world needs, and what you can be paid for.",
    'welcome.duration': '10-15 minutes',
    'welcome.noAccount': 'No account required',
    'welcome.pdfExport': 'PDF export available',

    // Home
    'home.questionnaireIntro': 'Please answer the questions below',
    'home.submit': 'Submit',

    // Questionnaire
    'questionnaire.progress': 'Progress',
    'questionnaire.stepOf': 'of',
    'questionnaire.previous': 'Previous',
    'questionnaire.next': 'Next Step',
    'questionnaire.complete': 'Complete Assessment',

    // TODO: remove step*.title keys when wizard is deleted
    // Questionnaire Steps
    'step1.title': 'Discover Your Passions',
    'step1.description':
      "Let's start by understanding what truly energizes and excites you. Think about activities that make you lose track of time.",
    'step2.title': 'Identify Your Skills',
    'step2.description':
      "Now let's explore your natural abilities and strengths. What do you excel at?",
    'step3.title': 'Define Your Values',
    'step3.description':
      'Understanding your core values helps align your career with what matters most to you.',
    'step4.title': 'Economic Considerations',
    'step4.description':
      "Let's discuss your financial goals and practical considerations for your career path.",

    // Results
    'results.title': 'Your Ikigai',
    'results.subtitle':
      'Nami has analyzed your responses and discovered your unique purpose paths',
    'results.coreDrivers': "What's Popping Out of Your Answers",
    'results.yourIkigai': 'Your Ikigai',
    'results.purposePaths': 'Your Three Purpose Paths',
    'results.salaryBenchmarks': 'Salary Benchmarks',
    'results.exportPdf': 'Export as PDF',
    'results.refineWithNami': 'Ask Follow-Up',
    'results.startOver': 'Start Over',
    'results.choosePathAndGetPlan': 'Choose this Path & Get Plan',
    'results.actionStrategy': 'Action Strategy',
    'results.refine': 'Refine',
    'results.actionPlanError':
      'Could not generate an action plan. Please try again.',

    // Action Plan
    'actionPlan.title': 'Your Action Plan',
    'actionPlan.subtitle':
      'Steps to get you started on your new path.',
    'actionPlan.chosenPath': 'Chosen Path',
    'actionPlan.sideProjects': 'Side Project Ideas',
    'actionPlan.sideProjectsDescription':
      'Build one of these to test the waters and build your portfolio.',
    'actionPlan.skillsToLearn': 'Skills to Learn',
    'actionPlan.skillsToLearnDescription':
      'Focus on these skills and use the recommended videos to start.',
    'actionPlan.peopleToNetworkWith': 'Where to Find Your People',
    'actionPlan.peopleToNetworkWithDescription':
      'Find communities and individuals in these spaces to learn from.',
    'actionPlan.exportPdf': 'Export as PDF',
    'actionPlan.refineWithNami': 'Ask Follow-Up',
    'actionPlan.watchOnYouTube': 'Watch on YouTube',
    'actionPlan.backToPaths': 'Back to Paths',
    'actionPlan.actions': 'Actions',
    'actionPlan.skills': 'Skills & Resources',

    // Ikigai
    'ikigai.alignment': 'Ikigai Alignment',
    'ikigai.love': 'Love',
    'ikigai.goodAt': 'Good at',
    'ikigai.worldNeeds': 'World needs',
    'ikigai.pay': 'Pay',

    // Core Drivers
    'drivers.energy': 'Energy (What You Love)',
    'drivers.edge': "Edge (What You're Good At)",
    'drivers.impact': 'Impact (What the World Needs)',
    'drivers.economic': 'Economic Reality (What You Can Be Paid For)',

    // Chat
    'chat.title': 'Nami',
    'chat.subtitle': 'Your AI Career Guide',
    'chat.placeholder': 'Ask Nami anything...',
    'chat.poweredBy': 'Powered by Gemini 2.5 Flash',

    // Loading
    'loading.title': 'AIs are cooking',
    'loading.description': 'This will only take a minute.',

    // Common
    'common.loading': 'Loading...',
    'common.error': 'Something went wrong. Please try again.',
    'common.page': 'Page',
  },
  es: {
    // Header
    'header.title': 'Buscador de Propósito',
    'header.poweredBy': 'Desarrollado por Nami AI',

    // Welcome Section
    'welcome.title': 'Encuentra Tu Ikigai',
    'welcome.subtitle':
      'Descubre tu razón de ser con orientación profesional impulsada por IA',
    'welcome.description':
      'Únete a miles que han descubierto su trayectoria profesional perfecta a través de nuestra evaluación integral. Deja que Nami, nuestra guía de IA, te ayude a descubrir la intersección de lo que amas, en lo que eres bueno, lo que el mundo necesita y por lo que te pueden pagar.',
    'welcome.duration': '10-15 minutos',
    'welcome.noAccount': 'No se requiere cuenta',
    'welcome.pdfExport': 'Exportación PDF disponible',

    // Home
    'home.questionnaireIntro': 'Por favor responde las preguntas a continuación',
    'home.submit': 'Enviar',

    // Questionnaire
    'questionnaire.progress': 'Progreso',
    'questionnaire.stepOf': 'de',
    'questionnaire.previous': 'Anterior',
    'questionnaire.next': 'Siguiente Paso',
    'questionnaire.complete': 'Completar Evaluación',

    // TODO: remove step*.title keys when wizard is deleted
    // Questionnaire Steps
    'step1.title': 'Descubre Tus Pasiones',
    'step1.description':
      'Comencemos entendiendo qué te energiza y emociona realmente. Piensa en actividades que te hacen perder la noción del tiempo.',
    'step2.title': 'Identifica Tus Habilidades',
    'step2.description':
      'Ahora exploremos tus habilidades naturales y fortalezas. ¿En qué sobresales?',
    'step3.title': 'Define Tus Valores',
    'step3.description':
      'Entender tus valores fundamentales ayuda a alinear tu carrera con lo que más te importa.',
    'step4.title': 'Consideraciones Económicas',
    'step4.description':
      'Hablemos de tus objetivos financieros y consideraciones prácticas para tu trayectoria profesional.',

    // Results
    'results.title': 'Tu Ikigai',
    'results.subtitle':
      'Nami ha analizado tus respuestas y descubierto tus caminos únicos de propósito',
    'results.coreDrivers': 'Lo Que Destaca de Tus Respuestas',
    'results.yourIkigai': 'Tu Ikigai',
    'results.purposePaths': 'Tus Tres Caminos de Propósito',
    'results.salaryBenchmarks': 'Referencias Salariales',
    'results.exportPdf': 'Exportar como PDF',
    'results.refineWithNami': 'Hacer Preguntas de Seguimiento',
    'results.startOver': 'Comenzar de Nuevo',
    'results.choosePathAndGetPlan': 'Elegir este Camino y Obtener Plan',
    'results.actionStrategy': 'Estrategia de Acción',
    'results.refine': 'Refinar',
    'results.actionPlanError':
      'No se pudo generar un plan de acción. Por favor, inténtalo de nuevo.',

    // Action Plan
    'actionPlan.title': 'Tu Plan de Acción',
    'actionPlan.subtitle':
      'Pasos para empezar en tu nuevo camino.',
    'actionPlan.chosenPath': 'Camino Elegido',
    'actionPlan.sideProjects': 'Ideas de Proyectos Paralelos',
    'actionPlan.sideProjectsDescription':
      'Construye uno de estos para probar las aguas y armar tu portafolio.',
    'actionPlan.skillsToLearn': 'Habilidades a Aprender',
    'actionPlan.skillsToLearnDescription':
      'Enfócate en estas habilidades y usa los videos recomendados para empezar.',
    'actionPlan.peopleToNetworkWith': 'Dónde Encontrar a Tu Gente',
    'actionPlan.peopleToNetworkWithDescription':
      'Encuentra comunidades e individuos en estos espacios para aprender de ellos.',
    'actionPlan.exportPdf': 'Exportar como PDF',
    'actionPlan.refineWithNami': 'Hacer Preguntas de Seguimiento',
    'actionPlan.watchOnYouTube': 'Ver en YouTube',
    'actionPlan.backToPaths': 'Volver a los Caminos',
    'actionPlan.actions': 'Acciones',
    'actionPlan.skills': 'Habilidades y Recursos',

    // Ikigai
    'ikigai.alignment': 'Alineación Ikigai',
    'ikigai.love': 'Amor',
    'ikigai.goodAt': 'Bueno en',
    'ikigai.worldNeeds': 'El mundo necesita',
    'ikigai.pay': 'Pago',

    // Core Drivers
    'drivers.energy': 'Energía (Lo Que Amas)',
    'drivers.edge': 'Ventaja (En Lo Que Eres Bueno)',
    'drivers.impact': 'Impacto (Lo Que El Mundo Necesita)',
    'drivers.economic': 'Realidad Económica (Por Lo Que Te Pueden Pagar)',

    // Chat
    'chat.title': 'Nami',
    'chat.subtitle': 'Tu Guía Profesional IA',
    'chat.placeholder': 'Pregúntale cualquier cosa a Nami...',
    'chat.poweredBy': 'Desarrollado por Gemini 2.5 Flash',

    // Loading
    'loading.title': 'Las IAs están cocinando',
    'loading.description': 'Esto solo tomará un minuto.',

    // Common
    'common.loading': 'Cargando...',
    'common.error': 'Algo salió mal. Por favor inténtalo de nuevo.',
    'common.page': 'Página',
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