/**
 * @description
 * Unit tests for the action plan parser module.
 * 
 * These tests focus on edge cases and parsing robustness, particularly
 * the concatenated bullet points bug that was discovered during Step 12
 * integration testing. Tests the parser in isolation without requiring
 * database setup or API endpoints.
 */

import { describe, it, expect } from 'vitest';
import { parseActionPlanStreamedText, parseMilestoneSection } from './action-plan.parser.js';

describe('Action Plan Parser', () => {
  describe('parseMilestoneSection', () => {
    it('should parse milestone with newline-separated actions', () => {
      const milestoneText = `
        [TITLE]Build Your Foundation[/TITLE]
        [TIMELINE]Weeks 1-2[/TIMELINE]
        [ACTIONS]
• Set up your development environment with latest tools
• Create your first React project using modern best practices
• Deploy a simple "Hello World" app to production
        [/ACTIONS]
        [SKILLS]
        [SKILL]React fundamentals[/SKILL]
        [SKILL]Modern JavaScript[/SKILL]
        [/SKILLS]
      `;

      const result = parseMilestoneSection(milestoneText);

      expect(result).toBeDefined();
      expect(result!.title).toBe('Build Your Foundation');
      expect(result!.timeline).toBe('Weeks 1-2');
      expect(result!.actions).toHaveLength(3);
      expect(result!.actions[0]).toBe('Set up your development environment with latest tools');
      expect(result!.actions[1]).toBe('Create your first React project using modern best practices');
      expect(result!.actions[2]).toBe('Deploy a simple "Hello World" app to production');
      expect(result!.skills).toHaveLength(2);
      expect(result!.skills[0].skill).toBe('React fundamentals');
    });

    it('should parse milestone with concatenated bullet points (streaming bug fix)', () => {
      // This tests the fix for the bug discovered in Step 12 where streaming
      // concatenated bullet points without newlines caused parsing failures
      const concatenatedActionsText = `
        [TITLE]Build Your Foundation[/TITLE]
        [TIMELINE]Weeks 1-2[/TIMELINE]
        [ACTIONS]• Set up development environment • Create React project • Deploy to production[/ACTIONS]
        [SKILLS]
        [SKILL]React fundamentals[/SKILL]
        [/SKILLS]
      `;

      const result = parseMilestoneSection(concatenatedActionsText);

      expect(result).toBeDefined();
      expect(result!.title).toBe('Build Your Foundation');
      expect(result!.actions).toHaveLength(3);
      expect(result!.actions[0]).toBe('Set up development environment');
      expect(result!.actions[1]).toBe('Create React project');
      expect(result!.actions[2]).toBe('Deploy to production');
    });

    it('should handle mixed bullet types (•, -, *)', () => {
      const mixedBulletsText = `
        [TITLE]Learn Multiple Skills[/TITLE]
        [TIMELINE]Week 1[/TIMELINE]
        [ACTIONS]
• First action with bullet
- Second action with dash
* Third action with asterisk
        [/ACTIONS]
        [SKILLS][SKILL]Test skill[/SKILL][/SKILLS]
      `;

      const result = parseMilestoneSection(mixedBulletsText);

      expect(result).toBeDefined();
      expect(result!.actions).toHaveLength(3);
      expect(result!.actions[0]).toBe('First action with bullet');
      expect(result!.actions[1]).toBe('Second action with dash');
      expect(result!.actions[2]).toBe('Third action with asterisk');
    });

    it('should handle concatenated mixed bullet types', () => {
      const concatenatedMixedText = `
        [TITLE]Mixed Bullets Test[/TITLE]
        [TIMELINE]Week 1[/TIMELINE]
        [ACTIONS]• First action - Second action * Third action[/ACTIONS]
        [SKILLS][SKILL]Test skill[/SKILL][/SKILLS]
      `;

      const result = parseMilestoneSection(concatenatedMixedText);

      expect(result).toBeDefined();
      expect(result!.actions).toHaveLength(3);
      expect(result!.actions[0]).toBe('First action');
      expect(result!.actions[1]).toBe('Second action');
      expect(result!.actions[2]).toBe('Third action');
    });

    it('should return null when required fields are missing', () => {
      const missingTitleText = `
        [TIMELINE]Weeks 1-2[/TIMELINE]
        [ACTIONS]• Some action[/ACTIONS]
      `;

      const missingTimelineText = `
        [TITLE]Some Title[/TITLE]
        [ACTIONS]• Some action[/ACTIONS]
      `;

      const missingActionsText = `
        [TITLE]Some Title[/TITLE]
        [TIMELINE]Weeks 1-2[/TIMELINE]
      `;

      expect(parseMilestoneSection(missingTitleText)).toBeNull();
      expect(parseMilestoneSection(missingTimelineText)).toBeNull();
      expect(parseMilestoneSection(missingActionsText)).toBeNull();
    });

    it('should handle milestone without skills section', () => {
      const noSkillsText = `
        [TITLE]Basic Milestone[/TITLE]
        [TIMELINE]Week 1[/TIMELINE]
        [ACTIONS]• Complete basic task[/ACTIONS]
      `;

      const result = parseMilestoneSection(noSkillsText);

      expect(result).toBeDefined();
      expect(result!.title).toBe('Basic Milestone');
      expect(result!.skills).toHaveLength(0);
    });

    it('should handle empty skills section', () => {
      const emptySkillsText = `
        [TITLE]Basic Milestone[/TITLE]
        [TIMELINE]Week 1[/TIMELINE]
        [ACTIONS]• Complete basic task[/ACTIONS]
        [SKILLS][/SKILLS]
      `;

      const result = parseMilestoneSection(emptySkillsText);

      expect(result).toBeDefined();
      expect(result!.skills).toHaveLength(0);
    });

    it('should handle extra whitespace in all fields', () => {
      const whitespaceText = `
        [TITLE]   Build Your Foundation   [/TITLE]
        [TIMELINE]   Weeks 1-2   [/TIMELINE]
        [ACTIONS]
• Set up development environment   
• Create React project   
        [/ACTIONS]
        [SKILLS]
        [SKILL]   React fundamentals   [/SKILL]
        [/SKILLS]
      `;

      const result = parseMilestoneSection(whitespaceText);

      expect(result).toBeDefined();
      expect(result!.title).toBe('Build Your Foundation');
      expect(result!.timeline).toBe('Weeks 1-2');
      expect(result!.actions[0]).toBe('Set up development environment');
      expect(result!.actions[1]).toBe('Create React project');
      expect(result!.skills[0].skill).toBe('React fundamentals');
    });
  });

  describe('parseActionPlanStreamedText', () => {
    it('should parse complete action plan with multiple milestones', () => {
      const validActionPlanText = `
        [SECTION:MILESTONE_1]
        [TITLE]Build Foundation[/TITLE]
        [TIMELINE]Weeks 1-2[/TIMELINE]
        [ACTIONS]
        • Set up development environment
        • Create first React project
        [/ACTIONS]
        [SKILLS]
        [SKILL]React fundamentals[/SKILL]
        [SKILL]JavaScript[/SKILL]
        [/SKILLS]
        [END_SECTION]
        
        [SECTION:MILESTONE_2]
        [TITLE]Master Core Concepts[/TITLE]
        [TIMELINE]Weeks 3-6[/TIMELINE]
        [ACTIONS]• Build complex projects • Learn state management[/ACTIONS]
        [SKILLS]
        [SKILL]State management[/SKILL]
        [/SKILLS]
        [END_SECTION]
      `;

      const result = parseActionPlanStreamedText(validActionPlanText);

      expect(result).toBeDefined();
      expect(result!.milestones).toHaveLength(2);
      
      const milestone1 = result!.milestones[0];
      expect(milestone1.title).toBe('Build Foundation');
      expect(milestone1.timeline).toBe('Weeks 1-2');
      expect(milestone1.actions).toHaveLength(2);
      expect(milestone1.skills).toHaveLength(2);

      const milestone2 = result!.milestones[1];
      expect(milestone2.title).toBe('Master Core Concepts');
      expect(milestone2.actions).toHaveLength(2); // Tests concatenated parsing
      expect(milestone2.actions[0]).toBe('Build complex projects');
      expect(milestone2.actions[1]).toBe('Learn state management');
    });

    it('should handle single milestone', () => {
      const singleMilestoneText = `
        [SECTION:MILESTONE_1]
        [TITLE]Quick Start[/TITLE]
        [TIMELINE]Week 1[/TIMELINE]
        [ACTIONS]• Complete setup[/ACTIONS]
        [SKILLS][SKILL]Setup skills[/SKILL][/SKILLS]
        [END_SECTION]
      `;

      const result = parseActionPlanStreamedText(singleMilestoneText);

      expect(result).toBeDefined();
      expect(result!.milestones).toHaveLength(1);
      expect(result!.milestones[0].title).toBe('Quick Start');
    });

    it('should return null for empty or invalid text', () => {
      expect(parseActionPlanStreamedText('')).toBeNull();
      expect(parseActionPlanStreamedText('   ')).toBeNull();
      expect(parseActionPlanStreamedText('Random text without structure')).toBeNull();
    });

    it('should return null when no valid milestones found', () => {
      const invalidMilestonesText = `
        [SECTION:MILESTONE_1]
        [TITLE]Incomplete Milestone[/TITLE]
        [END_SECTION]
        
        [SECTION:MILESTONE_2]
        [TIMELINE]Week 2[/TIMELINE]
        [ACTIONS]• Some action[/ACTIONS]
        [END_SECTION]
      `;

      const result = parseActionPlanStreamedText(invalidMilestonesText);
      expect(result).toBeNull(); // No complete milestones
    });

    it('should skip invalid milestones but include valid ones', () => {
      const mixedValidityText = `
        [SECTION:MILESTONE_1]
        [TITLE]Incomplete Milestone[/TITLE]
        [END_SECTION]
        
        [SECTION:MILESTONE_2]
        [TITLE]Complete Milestone[/TITLE]
        [TIMELINE]Week 2[/TIMELINE]
        [ACTIONS]• Valid action[/ACTIONS]
        [SKILLS][SKILL]Valid skill[/SKILL][/SKILLS]
        [END_SECTION]
      `;

      const result = parseActionPlanStreamedText(mixedValidityText);

      expect(result).toBeDefined();
      expect(result!.milestones).toHaveLength(1);
      expect(result!.milestones[0].title).toBe('Complete Milestone');
    });

    it('should stop at first gap in milestone numbering (sequential parser)', () => {
      const nonSequentialText = `
        [SECTION:MILESTONE_1]
        [TITLE]First Milestone[/TITLE]
        [TIMELINE]Week 1[/TIMELINE]
        [ACTIONS]• First action[/ACTIONS]
        [END_SECTION]
        
        [SECTION:MILESTONE_3]
        [TITLE]Third Milestone[/TITLE]
        [TIMELINE]Week 3[/TIMELINE]
        [ACTIONS]• Third action[/ACTIONS]
        [END_SECTION]
        
        [SECTION:MILESTONE_5]
        [TITLE]Fifth Milestone[/TITLE]
        [TIMELINE]Week 5[/TIMELINE]
        [ACTIONS]• Fifth action[/ACTIONS]
        [END_SECTION]
      `;

      const result = parseActionPlanStreamedText(nonSequentialText);

      expect(result).toBeDefined();
      // Parser stops at first gap (no MILESTONE_2), so only gets MILESTONE_1
      expect(result!.milestones).toHaveLength(1);
      expect(result!.milestones[0].title).toBe('First Milestone');
    });

    it('should handle malformed section delimiters', () => {
      const malformedText = `
        [SECTION:MILESTONE_1]
        [TITLE]Test Milestone[TITLE]
        [TIMELINE]Week 1[/TIMELINE]
        [ACTIONS]• Test action[/ACTIONS]
        [END_SECTION]
      `;

      const result = parseActionPlanStreamedText(malformedText);
      expect(result).toBeNull(); // Should fail due to malformed title delimiter
    });

    it('should handle multiline content within sections', () => {
      const multilineText = `
        [SECTION:MILESTONE_1]
        [TITLE]Complex
        Multi-line Title[/TITLE]
        [TIMELINE]Weeks 1-2
        Extended period[/TIMELINE]
        [ACTIONS]
        • Set up comprehensive development environment
          with all necessary tools and configurations
        • Create and deploy multiple React projects
          using industry best practices
        [/ACTIONS]
        [SKILLS]
        [SKILL]Advanced React
        and modern JavaScript[/SKILL]
        [/SKILLS]
        [END_SECTION]
      `;

      const result = parseActionPlanStreamedText(multilineText);

      expect(result).toBeDefined();
      expect(result!.milestones).toHaveLength(1);
      
      const milestone = result!.milestones[0];
      expect(milestone.title).toContain('Complex');
      expect(milestone.title).toContain('Multi-line Title');
      expect(milestone.timeline).toContain('Weeks 1-2');
      expect(milestone.timeline).toContain('Extended period');
      expect(milestone.actions[0]).toContain('comprehensive development environment');
      expect(milestone.skills[0].skill).toContain('Advanced React');
    });

    it('should initialize empty youtubeLinks for all skills', () => {
      const textWithSkills = `
        [SECTION:MILESTONE_1]
        [TITLE]Skills Test[/TITLE]
        [TIMELINE]Week 1[/TIMELINE]
        [ACTIONS]• Learn skills[/ACTIONS]
        [SKILLS]
        [SKILL]React[/SKILL]
        [SKILL]JavaScript[/SKILL]
        [SKILL]Node.js[/SKILL]
        [/SKILLS]
        [END_SECTION]
      `;

      const result = parseActionPlanStreamedText(textWithSkills);

      expect(result).toBeDefined();
      expect(result!.milestones[0].skills).toHaveLength(3);
      
      result!.milestones[0].skills.forEach(skill => {
        expect(skill.youtubeLinks).toEqual([]);
        expect(Array.isArray(skill.youtubeLinks)).toBe(true);
      });
    });
  });
});