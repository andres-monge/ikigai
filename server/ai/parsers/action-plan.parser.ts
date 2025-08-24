/**
 * @description
 * Parser for action plan streaming responses. Extracts structured milestone data
 * from AI-generated text that uses section delimiters for each milestone.
 */

/**
 * Parses individual milestone sections from delimited text.
 * 
 * @param milestoneSection Raw milestone section text between delimiters
 * @returns Parsed milestone data or null if required fields are missing
 */
export function parseMilestoneSection(milestoneSection: string) {
  const titleMatch = milestoneSection.match(/\[TITLE\]([\s\S]*?)\[\/TITLE\]/);
  const timelineMatch = milestoneSection.match(/\[TIMELINE\]([\s\S]*?)\[\/TIMELINE\]/);
  const actionsMatch = milestoneSection.match(/\[ACTIONS\]([\s\S]*?)\[\/ACTIONS\]/);
  const skillsMatch = milestoneSection.match(/\[SKILLS\]([\s\S]*?)\[\/SKILLS\]/);
  
  if (!titleMatch || !timelineMatch || !actionsMatch) {
    return null; // Required fields missing
  }
  
  // Parse actions - handle both newline-separated and concatenated bullet points
  const actionsText = actionsMatch[1].trim();
  let actions: string[];
  
  // First try splitting by newlines (normal case)
  const lineActions = actionsText
    .split('\n')
    .map(line => line.replace(/^[•\-\*]\s*/, '').trim())
    .filter(line => line.length > 0);
  
  // If we only got one action but it contains bullet points, it's likely concatenated
  if (lineActions.length === 1 && /[•\-\*]/.test(actionsText)) {
    // Split by bullet points and clean up
    actions = actionsText
      .split(/[•\-\*]/)
      .map(action => action.trim())
      .filter(action => action.length > 0);
  } else {
    actions = lineActions;
  }
  
  // Parse skills
  const skills: Array<{ skill: string; youtubeLinks: any[] }> = [];
  if (skillsMatch) {
    const skillsText = skillsMatch[1];
    const skillMatches = skillsText.matchAll(/\[SKILL\]([\s\S]*?)\[\/SKILL\]/g);
    
    for (const skillMatch of skillMatches) {
      const skill = skillMatch[1].trim();
      if (skill) {
        skills.push({
          skill,
          youtubeLinks: [], // Will be populated during enrichment
        });
      }
    }
  }
  
  return {
    title: titleMatch[1].trim(),
    timeline: timelineMatch[1].trim(),
    actions,
    skills,
  };
}

/**
 * Parses delimited streaming text from action plan AI into structured ActionPlan format.
 * 
 * Expected format uses milestone section delimiters like:
 * [SECTION:MILESTONE_1]...[END_SECTION]
 * [SECTION:MILESTONE_2]...[END_SECTION]
 * 
 * @param text The complete streamed text from AI generation
 * @returns Structured action plan data ready for database storage, or null if parsing fails
 */
export function parseActionPlanStreamedText(text: string) {
  try {
    const result = {
      milestones: [] as Array<{
        title: string;
        timeline: string;
        actions: string[];
        skills: Array<{
          skill: string;
          youtubeLinks: Array<{
            title: string;
            url: string;
            thumbnailUrl: string;
          }>;
        }>;
      }>,
    };
    
    // Parse each milestone section
    let milestoneIndex = 1;
    while (true) {
      const milestoneRegex = new RegExp(`\\[SECTION:MILESTONE_${milestoneIndex}\\]([\\s\\S]*?)\\[END_SECTION\\]`);
      const milestoneMatch = text.match(milestoneRegex);
      
      if (!milestoneMatch) {
        break; // No more milestones found
      }
      
      const milestone = parseMilestoneSection(milestoneMatch[1]);
      if (milestone) {
        result.milestones.push(milestone);
      } else {
        console.warn(`Failed to parse milestone ${milestoneIndex}, skipping`);
      }
      
      milestoneIndex++;
    }
    
    // Validate that we got at least one milestone
    if (result.milestones.length > 0) {
      return result;
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing action plan streamed text:', error);
    return null;
  }
}