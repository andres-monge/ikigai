import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TextareaAutosize from 'react-textarea-autosize';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { t, type Language } from '@/lib/i18n';

interface Question {
  id: string;
  type: 'textarea' | 'checkbox' | 'radio';
  title: string;
  description?: string;
  options?: string[];
  required?: boolean;
}

interface QuestionCardProps {
  step: number;
  totalSteps: number;
  title: string;
  description: string;
  questions: Question[];
  responses: Record<string, any>;
  onResponseChange: (questionId: string, value: any) => void;
  onNext: () => void;
  onPrevious: () => void;
  language: Language;
}

export function QuestionCard({
  step,
  totalSteps,
  title,
  description,
  questions,
  responses,
  onResponseChange,
  onNext,
  onPrevious,
  language
}: QuestionCardProps) {
  const progressPercentage = (step / totalSteps) * 100;

  const handleCheckboxChange = (questionId: string, option: string, checked: boolean) => {
    const currentValues = responses[questionId] || [];
    if (checked) {
      onResponseChange(questionId, [...currentValues, option]);
    } else {
      onResponseChange(questionId, currentValues.filter((v: string) => v !== option));
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-600">
            {t('questionnaire.progress', language)}
          </span>
          <span className="text-sm font-medium text-slate-600">
            {step} {t('questionnaire.stepOf', language)} {totalSteps}
          </span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-2">
          <div 
            className="gradient-primary h-2 rounded-full transition-all duration-300" 
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Question Card */}
      <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
        <div className="mb-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 gradient-primary rounded-full flex items-center justify-center text-white font-semibold mr-4">
              {step}
            </div>
            <h3 className="text-2xl font-bold text-slate-900">{title}</h3>
          </div>
          <p className="text-slate-600 leading-relaxed">{description}</p>
        </div>

        <div className="space-y-6">
          {questions.map((question) => (
            <div key={question.id} className="border-l-4 border-accent pl-6">
              <Label className="block text-lg font-medium text-slate-900 mb-3">
                {question.title}
                {question.required && <span className="text-red-500 ml-1">*</span>}
              </Label>
              
              {question.description && (
                <p className="text-sm text-slate-600 mb-3">{question.description}</p>
              )}

              {question.type === 'textarea' && (
                <TextareaAutosize
                  value={responses[question.id] || ''}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onResponseChange(question.id, e.target.value)}
                  placeholder={question.description}
                  minRows={3}
                  maxRows={10}
                  className="w-full resize-none border rounded-md p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              )}

              {question.type === 'checkbox' && question.options && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {question.options.map((option) => (
                    <div key={option} className="flex items-center space-x-2">
                      <Checkbox
                        id={`${question.id}-${option}`}
                        checked={(responses[question.id] || []).includes(option)}
                        onCheckedChange={(checked) => 
                          handleCheckboxChange(question.id, option, checked as boolean)
                        }
                      />
                      <Label
                        htmlFor={`${question.id}-${option}`}
                        className="text-slate-700 cursor-pointer"
                      >
                        {option}
                      </Label>
                    </div>
                  ))}
                </div>
              )}

              {question.type === 'radio' && question.options && (
                <RadioGroup
                  value={responses[question.id] || ''}
                  onValueChange={(value) => onResponseChange(question.id, value)}
                >
                  {question.options.map((option) => (
                    <div key={option} className="flex items-center space-x-2">
                      <RadioGroupItem value={option} id={`${question.id}-${option}`} />
                      <Label htmlFor={`${question.id}-${option}`} className="text-slate-700">
                        {option}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-between mt-8">
          <Button
            variant="outline"
            onClick={onPrevious}
            disabled={step === 1}
            className="px-6 py-3"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('questionnaire.previous', language)}
          </Button>
          
          <Button
            onClick={onNext}
            variant="secondary"
            className="px-6 py-3 hover:shadow-lg transition-all duration-200"
          >
            {step === totalSteps ? t('questionnaire.complete', language) : t('questionnaire.next', language)}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
