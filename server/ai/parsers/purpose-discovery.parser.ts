/**
 * @description
 * Parser for purpose discovery streaming responses. Extracts structured data
 * from AI-generated text that uses section delimiters for core drivers analysis
 * and purpose paths.
 */

/**
 * Parses delimited streaming text from purpose discovery AI into structured database format.
 * 
 * Expected format uses section delimiters like:
 * [SECTION:CORE_DRIVERS]...[END_SECTION]
 * [SECTION:PATH_1]...[END_SECTION]
 * 
 * @param text The complete streamed text from AI generation
 * @returns Structured data ready for database storage, or null if parsing fails
 */
export function parsePurposeDiscoveryStreamedText(text: string) {
  try {
    const result = {
      coreDriversAnalysis: {
        statementSentence: '',
        coreThreads: '',
      },
      purposePaths: [] as Array<{
        title: string;
        description: string;
        ikigaiAlignment: {
          love: string;
          goodAt: string;
          worldNeeds: string;
          pay: string;
        };
        actionStrategy: string;
      }>,
    };

    // Parse Core Drivers section
    const coreDriversMatch = text.match(/\[SECTION:CORE_DRIVERS\]([\s\S]*?)\[END_SECTION\]/);
    if (coreDriversMatch) {
      const coreSection = coreDriversMatch[1];
      
      const statementMatch = coreSection.match(/\[STATEMENT\]([\s\S]*?)\[\/STATEMENT\]/);
      if (statementMatch) {
        result.coreDriversAnalysis.statementSentence = statementMatch[1].trim();
      }
      
      const threadsMatch = coreSection.match(/\[THREADS\]([\s\S]*?)\[\/THREADS\]/);
      if (threadsMatch) {
        result.coreDriversAnalysis.coreThreads = threadsMatch[1].trim();
      }
    }

    // Parse each path section
    for (let i = 1; i <= 3; i++) {
      const pathRegex = new RegExp(`\\[SECTION:PATH_${i}\\]([\\s\\S]*?)\\[END_SECTION\\]`);
      const pathMatch = text.match(pathRegex);
      
      if (pathMatch) {
        const pathSection = pathMatch[1];
        
        const titleMatch = pathSection.match(/\[TITLE\]([\s\S]*?)\[\/TITLE\]/);
        const descriptionMatch = pathSection.match(/\[DESCRIPTION\]([\s\S]*?)\[\/DESCRIPTION\]/);
        const actionStrategyMatch = pathSection.match(/\[ACTION_STRATEGY\]([\s\S]*?)\[\/ACTION_STRATEGY\]/);
        
        // Parse ikigai alignment
        const ikigaiMatch = pathSection.match(/\[IKIGAI\]([\s\S]*?)\[\/IKIGAI\]/);
        let ikigaiAlignment = {
          love: '',
          goodAt: '',
          worldNeeds: '',
          pay: '',
        };
        
        if (ikigaiMatch) {
          const ikigaiSection = ikigaiMatch[1];
          const loveMatch = ikigaiSection.match(/\[LOVE\]([\s\S]*?)\[\/LOVE\]/);
          const goodAtMatch = ikigaiSection.match(/\[GOOD_AT\]([\s\S]*?)\[\/GOOD_AT\]/);
          const worldNeedsMatch = ikigaiSection.match(/\[WORLD_NEEDS\]([\s\S]*?)\[\/WORLD_NEEDS\]/);
          const payMatch = ikigaiSection.match(/\[PAY\]([\s\S]*?)\[\/PAY\]/);
          
          if (loveMatch) ikigaiAlignment.love = loveMatch[1].trim();
          if (goodAtMatch) ikigaiAlignment.goodAt = goodAtMatch[1].trim();
          if (worldNeedsMatch) ikigaiAlignment.worldNeeds = worldNeedsMatch[1].trim();
          if (payMatch) ikigaiAlignment.pay = payMatch[1].trim();
        }
        
        if (titleMatch && descriptionMatch && actionStrategyMatch) {
          result.purposePaths.push({
            title: titleMatch[1].trim(),
            description: descriptionMatch[1].trim(),
            ikigaiAlignment,
            actionStrategy: actionStrategyMatch[1].trim(),
          });
        }
      }
    }

    // Validate that we got all required data
    if (result.coreDriversAnalysis.statementSentence && 
        result.coreDriversAnalysis.coreThreads && 
        result.purposePaths.length === 3) {
      return result;
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing streamed text:', error);
    return null;
  }
}