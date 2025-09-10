/**
 * @description
 * This file contains all Gemini Function Calling tool definitions used by the AI chains.
 * Extracted from chains.ts to make it easier to manage the tools the AI can use.
 * 
 * @dependencies
 * - None (pure tool definitions)
 */

// ========= AI FUNCTION CALLING TOOL DEFINITIONS =========


export const getYoutubeVideosForSkillsTool = {
  functionDeclarations: [
    {
      name: 'getYoutubeVideosForSkills',
      description:
        'Gets the top 3 most relevant YouTube video links (including `thumbnailUrl`) for learning a list of specific skills. Must be called before returning the final action plan.',
      parameters: {
        type: 'OBJECT',
        properties: {
          skills: {
            type: 'ARRAY',
            items: {
              type: 'STRING',
              description:
                "A specific, concrete skill to search for, e.g., 'React Hooks' or 'Product Management fundamentals'.",
            },
          },
        },
        required: ['skills'],
      },
    },
  ],
};