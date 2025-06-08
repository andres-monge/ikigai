export interface QuestionnaireResponses {
  passions: {
    activities: string;
    topics: string[];
    energizing: string;
  };
  skills: {
    strengths: string[];
    achievements: string;
    feedback: string;
  };
  values: {
    workValues: string[];
    impact: string;
    environment: string;
  };
  economic: {
    salaryExpectation: string;
    timeline: string;
    stability: string;
  };
}

export interface CoreDrivers {
  energy: string;
  edge: string;
  impact: string;
  economic: string;
}

export interface IkigaiAlignment {
  love: string;
  goodAt: string;
  worldNeeds: string;
  pay: string;
}

export interface PurposePath {
  title: string;
  description: string;
  ikigaiAlignment: IkigaiAlignment;
  actionStrategy: string;
}

export interface SalaryData {
  title: string;
  entryLevel: string;
  midLevel: string;
  seniorLevel: string;
  location: string;
  sources: string[];
}

export interface AssessmentResults {
  analysis: CoreDrivers;
  purposePaths: PurposePath[];
  salaryData: SalaryData[];
}

export interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}
