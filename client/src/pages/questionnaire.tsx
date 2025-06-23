import { useState, useEffect } from 'react';
import { QuestionCard } from '@/components/questionnaire/question-card';
import { t, type Language } from '@/lib/i18n';
import type { QuestionnaireResponses } from '@/types/assessment';

interface QuestionnaireProps {
  onComplete: (responses: QuestionnaireResponses) => void;
  language: Language;
}

export function Questionnaire({ onComplete, language }: QuestionnaireProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [responses, setResponses] = useState<Record<string, any>>({});

  const steps = [
    {
      title: t('step1.title', language),
      description: t('step1.description', language),
      questions: [
        {
          id: 'passions.activities',
          type: 'textarea' as const,
          title: language === 'en' 
            ? 'What specific activities make you forget to check the clock because you\'re so into them?'
            : '¿Qué actividades específicas te absorben tanto que pierdes la noción del tiempo?',
          required: true
        },
        {
          id: 'passions.topics',
          type: 'textarea' as const,
          title: language === 'en'
            ? 'What topics or problems get you excited enough to talk someone\'s ear off?'
            : '¿Qué temas o problemas te emocionan tanto que podrías hablar de ellos sin parar?',
          required: true
        }
      ]
    },
    {
      title: t('step2.title', language),
      description: t('step2.description', language),
      questions: [
        {
          id: 'skills.strengths',
          type: 'textarea' as const,
          title: language === 'en'
            ? 'Which skills or talents do people compliment you on?'
            : '¿Qué habilidades o talentos te elogian las personas?',
          required: true
        },
        {
          id: 'skills.experience',
          type: 'textarea' as const,
          title: language === 'en'
            ? 'Any track record of these skills — projects, jobs, experiences?'
            : '¿Tienes experiencia con estas habilidades — proyectos, trabajos, experiencias?',
          required: true
        }
      ]
    },
    {
      title: t('step3.title', language),
      description: t('step3.description', language),
      questions: [
        {
          id: 'values.frustrations',
          type: 'textarea' as const,
          title: language === 'en'
            ? 'What issues in your community, industry, or the planet frustrate you so much you\'d gladly tackle them?'
            : '¿Qué problemas en tu comunidad, industria o el planeta te frustran tanto que estarías dispuesto a abordarlos?',
          required: true
        },
        {
          id: 'values.impact',
          type: 'textarea' as const,
          title: language === 'en'
            ? 'If you could fast-forward ten years, what meaningful change would you be proud you helped create?'
            : 'Si pudieras avanzar diez años, ¿qué cambio significativo te enorgullecería haber ayudado a crear?',
          required: true
        }
      ]
    },
    {
      title: t('step4.title', language),
      description: t('step4.description', language),
      questions: [
        {
          id: 'economic.preferences',
          type: 'textarea' as const,
          title: language === 'en'
            ? 'What are your preferences on: where you\'d like to live, hours of work per week, remote work, working for others versus being self-employed?'
            : '¿Cuáles son tus preferencias sobre: dónde te gustaría vivir, horas de trabajo por semana, trabajo remoto, trabajar para otros versus ser autónomo?',
          required: true
        },
        {
          id: 'economic.constraints',
          type: 'textarea' as const,
          title: language === 'en'
            ? 'What are your main financial responsibilities or constraints we should consider? E.g. Family, health, savings.'
            : '¿Cuáles son tus principales responsabilidades financieras o limitaciones que deberíamos considerar? Ej. Familia, salud, ahorros.',
          required: true
        }
      ]
    }
  ];

  const currentStepData = steps[currentStep - 1];

  const handleResponseChange = (questionId: string, value: any) => {
    setResponses(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(prev => prev + 1);
    } else {
      // Transform responses to match expected structure
      const formattedResponses: QuestionnaireResponses = {
        passions: {
          activities: responses['passions.activities'] || '',
          topics: responses['passions.topics'] || ''
        },
        skills: {
          strengths: responses['skills.strengths'] || '',
          experience: responses['skills.experience'] || ''
        },
        values: {
          frustrations: responses['values.frustrations'] || '',
          impact: responses['values.impact'] || ''
        },
        economic: {
          preferences: responses['economic.preferences'] || '',
          constraints: responses['economic.constraints'] || ''
        }
      };
      onComplete(formattedResponses);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  return (
    <QuestionCard
      step={currentStep}
      totalSteps={steps.length}
      title={currentStepData.title}
      description={currentStepData.description}
      questions={currentStepData.questions}
      responses={responses}
      onResponseChange={handleResponseChange}
      onNext={handleNext}
      onPrevious={handlePrevious}
      language={language}
    />
  );
}