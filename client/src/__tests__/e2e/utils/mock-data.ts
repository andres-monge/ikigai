/**
 * @file mock-data.ts
 * @description Mock data for e2e testing based on shared schemas
 */

import type { 
  FullAssessment,
  QuestionnaireResponses,
  CoreDrivers,
  PurposePathWithSalary,
  ActionPlan
} from '@/types/assessment';

/**
 * Sample questionnaire responses for testing
 */
export const mockQuestionnaireResponses: QuestionnaireResponses = {
  passions: [
    {
      question: "What activities make you lose track of time?",
      answer: "Building web applications and solving complex coding problems. I love the challenge of turning ideas into working software."
    },
    {
      question: "What topics do you find yourself reading about in your free time?",
      answer: "Technology trends, user experience design, and artificial intelligence. I'm constantly curious about how technology can solve real problems."
    }
  ],
  skills: [
    {
      question: "What are you naturally good at?",
      answer: "Problem-solving, logical thinking, and learning new technologies quickly. People often come to me for help with technical challenges."
    },
    {
      question: "What skills have you developed through work or education?",
      answer: "JavaScript programming, project management, and data analysis. I've completed several online courses in web development."
    }
  ],
  values: [
    {
      question: "What kind of impact do you want to have on the world?",
      answer: "I want to create technology that makes people's lives easier and more productive. I believe good software can solve meaningful problems."
    },
    {
      question: "What work environment brings out your best?",
      answer: "Collaborative teams where I can both learn from others and share my knowledge. I thrive in environments that value innovation and continuous learning."
    }
  ],
  economic: [
    {
      question: "What are your financial goals and constraints?",
      answer: "I need to earn at least $70,000 to support my family, but I'm more interested in growth potential than immediate high salary."
    },
    {
      question: "How important is job security vs. entrepreneurial risk?",
      answer: "I'm willing to take calculated risks if there's significant upside potential. I prefer stability but not at the cost of growth opportunities."
    }
  ]
};

/**
 * Mock core drivers analysis response
 */
export const mockCoreDriversAnalysis: CoreDrivers = {
  statementSentence: "You're a technology enthusiast who thrives on solving complex problems while creating meaningful impact through collaborative innovation.",
  coreThreads: "Your passion for web development and AI, combined with strong technical aptitude and desire to help others, points toward roles where you can build impactful software while mentoring and growing with a team."
};

/**
 * Mock purpose paths for testing
 */
export const mockPurposePaths: PurposePathWithSalary[] = [
  {
    id: 1,
    title: "Full-Stack Developer at Tech Startup",
    description: "Join a fast-growing startup as a full-stack developer, building innovative web applications while learning from experienced mentors in a collaborative environment.",
    ikigaiAlignment: {
      love: "Perfect match for your love of web development and problem-solving. You'll work on diverse technical challenges daily.",
      goodAt: "Leverages your JavaScript skills and logical thinking. Startup environment rewards rapid learning and adaptability.",
      worldNeeds: "Build products that directly impact thousands of users. Your code will solve real problems for real people.",
      pay: "Entry-level full-stack developers earn $75,000-$95,000 annually, with significant growth potential as you gain experience. Many startups also offer equity compensation with substantial upside potential. Sources: Glassdoor.com salary data for full-stack developers, PayScale.com startup compensation reports."
    },
    actionStrategy: "Start with modern JavaScript frameworks, contribute to open source projects, and network within the startup community to land your first role.",
    salaryData: [
      {
        entryLevel: "$75,000 - $85,000",
        midLevel: "$85,000 - $95,000",
        seniorLevel: "$95,000 - $120,000",
        location: "Remote/US",
        sources: ["Glassdoor.com", "PayScale.com"]
      }
    ]
  },
  {
    id: 2,
    title: "Technical Product Manager",
    description: "Bridge the gap between technology and business by managing product development, working closely with engineering teams while driving strategic product decisions.",
    ikigaiAlignment: {
      love: "Combines your technical interests with strategic thinking. You'll solve complex problems at the intersection of technology and user needs.",
      goodAt: "Perfect use of your project management skills and technical background. Your ability to learn quickly will help you understand both business and technical requirements.",
      worldNeeds: "Shape products that improve millions of users' lives. Your decisions will directly influence how technology solves real-world problems.",
      pay: "Technical product managers typically earn $85,000-$120,000 annually, with senior roles reaching $150,000+. Many companies offer significant stock options and performance bonuses. Sources: Levels.fyi product manager compensation data, Glassdoor.com salary reports."
    },
    actionStrategy: "Develop product management skills through online courses, gain experience managing technical projects, and build a portfolio showcasing your ability to bridge technical and business requirements.",
    salaryData: [
      {
        entryLevel: "$85,000 - $100,000",
        midLevel: "$100,000 - $120,000",
        seniorLevel: "$120,000 - $150,000",
        location: "Remote/US",
        sources: ["Levels.fyi", "Glassdoor.com"]
      }
    ]
  },
  {
    id: 3,
    title: "Technology Consultant & Trainer",
    description: "Help organizations implement new technologies while training their teams, combining your technical expertise with your passion for teaching and knowledge sharing.",
    ikigaiAlignment: {
      love: "Perfect outlet for your love of learning and sharing knowledge. You'll constantly work with new technologies and help others grow.",
      goodAt: "Utilizes your technical skills, problem-solving abilities, and natural teaching inclination. Your collaborative nature is essential for consulting success.",
      worldNeeds: "Multiply your impact by helping entire organizations improve their technical capabilities. Train the next generation of tech professionals.",
      pay: "Technology consultants earn $70,000-$110,000 annually, with experienced consultants commanding $150+ per hour for specialized training. Independent consultants often earn significantly more. Sources: Robert Half Technology Salary Guide, Consulting.com industry compensation reports."
    },
    actionStrategy: "Build expertise in high-demand technologies, develop training materials and courses, obtain relevant certifications, and start with small consulting projects to build your reputation.",
    salaryData: [
      {
        entryLevel: "$70,000 - $85,000",
        midLevel: "$85,000 - $110,000",
        seniorLevel: "$110,000 - $150,000",
        location: "Remote/US",
        sources: ["Robert Half", "Consulting.com"]
      }
    ]
  }
];

/**
 * Mock action plan for testing
 */
export const mockActionPlan: ActionPlan = {
  milestones: [
    {
      title: "Foundation Building",
      timeline: "Weeks 1-4",
      actions: [
        "Set up development environment with modern JavaScript tools (Node.js, npm, Git)",
        "Complete JavaScript ES6+ fundamentals course",
        "Build your first full-stack application (simple todo app with backend API)",
        "Create GitHub profile and start committing code daily"
      ],
      skills: [
        {
          skill: "Modern JavaScript (ES6+)",
          youtubeLinks: [
            {
              title: "JavaScript ES6+ Features - Complete Course",
              url: "https://www.youtube.com/watch?v=NCwa_xi0Uuc",
              thumbnailUrl: "https://img.youtube.com/vi/NCwa_xi0Uuc/mqdefault.jpg"
            },
            {
              title: "Async/Await JavaScript Tutorial",
              url: "https://www.youtube.com/watch?v=V_Kr9OSfDeU",
              thumbnailUrl: "https://img.youtube.com/vi/V_Kr9OSfDeU/mqdefault.jpg"
            },
            {
              title: "JavaScript Promises in 10 Minutes",
              url: "https://www.youtube.com/watch?v=DHvZLI7Db8E",
              thumbnailUrl: "https://img.youtube.com/vi/DHvZLI7Db8E/mqdefault.jpg"
            }
          ]
        }
      ]
    },
    {
      title: "Framework Mastery",
      timeline: "Weeks 5-8",
      actions: [
        "Learn React.js fundamentals and build 3 practice projects",
        "Master Node.js and Express for backend development",
        "Build a full-stack application with user authentication",
        "Deploy your first application to a cloud platform"
      ],
      skills: [
        {
          skill: "React.js Development",
          youtubeLinks: [
            {
              title: "React Tutorial for Beginners",
              url: "https://www.youtube.com/watch?v=dGcsHMXbSOA",
              thumbnailUrl: "https://img.youtube.com/vi/dGcsHMXbSOA/mqdefault.jpg"
            },
            {
              title: "React Hooks Complete Guide",
              url: "https://www.youtube.com/watch?v=TNhaISOUy6Q",
              thumbnailUrl: "https://img.youtube.com/vi/TNhaISOUy6Q/mqdefault.jpg"
            },
            {
              title: "React State Management",
              url: "https://www.youtube.com/watch?v=35lXWvCuM8o",
              thumbnailUrl: "https://img.youtube.com/vi/35lXWvCuM8o/mqdefault.jpg"
            }
          ]
        }
      ]
    }
  ]
};

/**
 * Complete mock assessment session for testing
 */
export const mockFullAssessment: FullAssessment = {
  id: 1,
  sessionId: "test-session-12345",
  language: "en",
  responses: mockQuestionnaireResponses,
  coreDriversAnalysis: mockCoreDriversAnalysis,
  purposePaths: mockPurposePaths,
  chosenPathId: 1,
  actionPlan: mockActionPlan,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

/**
 * API response for successful assessment analysis
 */
export const mockAnalyzeResponse = {
  id: mockFullAssessment.id,
  sessionId: mockFullAssessment.sessionId,
  language: mockFullAssessment.language,
  responses: mockFullAssessment.responses,
  coreDriversAnalysis: mockFullAssessment.coreDriversAnalysis,
  purposePaths: mockFullAssessment.purposePaths,
  chosenPathId: null,
  actionPlan: null,
  createdAt: mockFullAssessment.createdAt,
  updatedAt: mockFullAssessment.updatedAt
};

/**
 * API response for successful action plan generation
 */
export const mockActionPlanResponse = {
  ...mockFullAssessment,
  chosenPathId: 1,
  actionPlan: mockActionPlan,
  updatedAt: new Date().toISOString()
};