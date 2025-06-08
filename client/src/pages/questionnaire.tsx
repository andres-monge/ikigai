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
            ? 'What activities make you feel most alive and energized?'
            : '¿Qué actividades te hacen sentir más vivo y con energía?',
          description: language === 'en'
            ? 'Describe the activities, hobbies, or work that genuinely excite you...'
            : 'Describe las actividades, pasatiempos o trabajo que realmente te emocionan...',
          required: true
        },
        {
          id: 'passions.topics',
          type: 'checkbox' as const,
          title: language === 'en'
            ? 'What topics could you talk about for hours?'
            : '¿De qué temas podrías hablar durante horas?',
          options: language === 'en'
            ? ['Technology', 'Education', 'Healthcare', 'Creative Arts', 'Business', 'Environment', 'Sports', 'Science', 'Social Impact', 'Finance']
            : ['Tecnología', 'Educación', 'Salud', 'Artes Creativas', 'Negocios', 'Medio Ambiente', 'Deportes', 'Ciencia', 'Impacto Social', 'Finanzas'],
          required: true
        },
        {
          id: 'passions.energizing',
          type: 'textarea' as const,
          title: language === 'en'
            ? 'Describe a time when you were so engaged in something that you lost track of time.'
            : 'Describe una vez cuando estuviste tan involucrado en algo que perdiste la noción del tiempo.',
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
          type: 'checkbox' as const,
          title: language === 'en'
            ? 'Which of these best describe your natural strengths?'
            : '¿Cuáles de estas describen mejor tus fortalezas naturales?',
          options: language === 'en'
            ? ['Problem Solving', 'Communication', 'Leadership', 'Creativity', 'Analysis', 'Organization', 'Teaching', 'Technical Skills', 'Collaboration', 'Innovation']
            : ['Resolución de Problemas', 'Comunicación', 'Liderazgo', 'Creatividad', 'Análisis', 'Organización', 'Enseñanza', 'Habilidades Técnicas', 'Colaboración', 'Innovación'],
          required: true
        },
        {
          id: 'skills.achievements',
          type: 'textarea' as const,
          title: language === 'en'
            ? 'What are you most proud of accomplishing in your career or studies?'
            : '¿De qué te sientes más orgulloso de haber logrado en tu carrera o estudios?',
          required: true
        },
        {
          id: 'skills.feedback',
          type: 'textarea' as const,
          title: language === 'en'
            ? 'What do others consistently say you\'re good at?'
            : '¿Qué dicen otros consistentemente que haces bien?',
          required: true
        }
      ]
    },
    {
      title: t('step3.title', language),
      description: t('step3.description', language),
      questions: [
        {
          id: 'values.workValues',
          type: 'checkbox' as const,
          title: language === 'en'
            ? 'What matters most to you in your work environment?'
            : '¿Qué es lo más importante para ti en tu ambiente de trabajo?',
          options: language === 'en'
            ? ['Work-Life Balance', 'Intellectual Challenge', 'Social Impact', 'Financial Reward', 'Autonomy', 'Team Collaboration', 'Innovation', 'Stability', 'Recognition', 'Growth Opportunities']
            : ['Balance Trabajo-Vida', 'Desafío Intelectual', 'Impacto Social', 'Recompensa Financiera', 'Autonomía', 'Colaboración en Equipo', 'Innovación', 'Estabilidad', 'Reconocimiento', 'Oportunidades de Crecimiento'],
          required: true
        },
        {
          id: 'values.impact',
          type: 'textarea' as const,
          title: language === 'en'
            ? 'How do you want to make a positive difference in the world?'
            : '¿Cómo quieres hacer una diferencia positiva en el mundo?',
          required: true
        },
        {
          id: 'values.environment',
          type: 'radio' as const,
          title: language === 'en'
            ? 'What type of work environment energizes you most?'
            : '¿Qué tipo de ambiente de trabajo te da más energía?',
          options: language === 'en'
            ? ['Fast-paced startup', 'Established corporation', 'Non-profit organization', 'Government/Public sector', 'Academia/Research', 'Consulting', 'Remote/Freelance', 'Small business']
            : ['Startup acelerado', 'Corporación establecida', 'Organización sin fines de lucro', 'Gobierno/Sector público', 'Academia/Investigación', 'Consultoría', 'Remoto/Freelance', 'Pequeña empresa'],
          required: true
        }
      ]
    },
    {
      title: t('step4.title', language),
      description: t('step4.description', language),
      questions: [
        {
          id: 'economic.salaryExpectation',
          type: 'radio' as const,
          title: language === 'en'
            ? 'What salary range aligns with your financial goals?'
            : '¿Qué rango salarial se alinea con tus objetivos financieros?',
          options: language === 'en'
            ? ['$30K-$50K', '$50K-$75K', '$75K-$100K', '$100K-$150K', '$150K+', 'Varies by opportunity']
            : ['$30K-$50K', '$50K-$75K', '$75K-$100K', '$100K-$150K', '$150K+', 'Varía según la oportunidad'],
          required: true
        },
        {
          id: 'economic.timeline',
          type: 'radio' as const,
          title: language === 'en'
            ? 'What is your timeline for making a career change?'
            : '¿Cuál es tu cronograma para hacer un cambio de carrera?',
          options: language === 'en'
            ? ['Immediately', 'Within 6 months', '6-12 months', '1-2 years', '2+ years', 'Just exploring options']
            : ['Inmediatamente', 'Dentro de 6 meses', '6-12 meses', '1-2 años', '2+ años', 'Solo explorando opciones'],
          required: true
        },
        {
          id: 'economic.stability',
          type: 'textarea' as const,
          title: language === 'en'
            ? 'What are your main financial responsibilities or constraints we should consider?'
            : '¿Cuáles son tus principales responsabilidades financieras o limitaciones que deberíamos considerar?',
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
          topics: responses['passions.topics'] || [],
          energizing: responses['passions.energizing'] || ''
        },
        skills: {
          strengths: responses['skills.strengths'] || [],
          achievements: responses['skills.achievements'] || '',
          feedback: responses['skills.feedback'] || ''
        },
        values: {
          workValues: responses['values.workValues'] || [],
          impact: responses['values.impact'] || '',
          environment: responses['values.environment'] || ''
        },
        economic: {
          salaryExpectation: responses['economic.salaryExpectation'] || '',
          timeline: responses['economic.timeline'] || '',
          stability: responses['economic.stability'] || ''
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
