/**
 * @description
 * Unit tests for the purpose discovery parser module.
 * 
 * These tests focus on edge cases and parsing robustness that might not
 * be covered by integration tests. They test the parser in isolation
 * without requiring database setup or API endpoints.
 */

import { describe, it, expect } from 'vitest';
import { parsePurposeDiscoveryStreamedText } from './purpose-discovery.parser.js';

describe('Purpose Discovery Parser', () => {
  describe('parsePurposeDiscoveryStreamedText', () => {
    it('should parse complete valid streamed text with all sections', () => {
      const validText = `
        [SECTION:CORE_DRIVERS]
        [STATEMENT]You are driven by the desire to create meaningful software that solves real problems.[/STATEMENT]
        [THREADS]Key themes: Problem-solving, technical excellence, user impact, continuous learning.[/THREADS]
        [END_SECTION]
        
        [SECTION:PATH_1]
        [TITLE]Senior Full-Stack Developer[/TITLE]
        [DESCRIPTION]Lead development of complex web applications with focus on user experience.[/DESCRIPTION]
        [IKIGAI]
        [LOVE]Building elegant user interfaces[/LOVE]
        [GOOD_AT]Full-stack development and architecture[/GOOD_AT]
        [WORLD_NEEDS]Better software experiences[/WORLD_NEEDS]
        [PAY]$120,000-$150,000 annually with consulting opportunities[/PAY]
        [/IKIGAI]
        [ACTION_STRATEGY]Focus on mastering modern frameworks and building a portfolio of impactful projects.[/ACTION_STRATEGY]
        [END_SECTION]
        
        [SECTION:PATH_2]
        [TITLE]Technical Architect[/TITLE]
        [DESCRIPTION]Design and oversee technical solutions for enterprise applications.[/DESCRIPTION]
        [IKIGAI]
        [LOVE]Designing elegant system architectures[/LOVE]
        [GOOD_AT]Technical leadership and architecture design[/GOOD_AT]
        [WORLD_NEEDS]Scalable, maintainable software systems[/WORLD_NEEDS]
        [PAY]$140,000-$180,000 with leadership bonuses[/PAY]
        [/IKIGAI]
        [ACTION_STRATEGY]Develop expertise in system design patterns and cloud architecture.[/ACTION_STRATEGY]
        [END_SECTION]
        
        [SECTION:PATH_3]
        [TITLE]Product Engineering Lead[/TITLE]
        [DESCRIPTION]Bridge technical and product teams to deliver user-focused solutions.[/DESCRIPTION]
        [IKIGAI]
        [LOVE]Translating user needs into technical solutions[/LOVE]
        [GOOD_AT]Product thinking and technical execution[/GOOD_AT]
        [WORLD_NEEDS]Products that truly serve user needs[/WORLD_NEEDS]
        [PAY]$130,000-$170,000 plus equity opportunities[/PAY]
        [/IKIGAI]
        [ACTION_STRATEGY]Build strong product intuition while maintaining technical depth.[/ACTION_STRATEGY]
        [END_SECTION]
      `;

      const result = parsePurposeDiscoveryStreamedText(validText);

      expect(result).toBeDefined();
      expect(result!.coreDriversAnalysis.statementSentence).toBe('You are driven by the desire to create meaningful software that solves real problems.');
      expect(result!.coreDriversAnalysis.coreThreads).toBe('Key themes: Problem-solving, technical excellence, user impact, continuous learning.');
      
      expect(result!.purposePaths).toHaveLength(3);
      expect(result!.purposePaths[0].title).toBe('Senior Full-Stack Developer');
      expect(result!.purposePaths[0].ikigaiAlignment.love).toBe('Building elegant user interfaces');
      expect(result!.purposePaths[0].ikigaiAlignment.pay).toBe('$120,000-$150,000 annually with consulting opportunities');
    });

    it('should return null when CORE_DRIVERS section is missing', () => {
      const textWithoutCoreDrivers = `
        [SECTION:PATH_1]
        [TITLE]Senior Full-Stack Developer[/TITLE]
        [DESCRIPTION]Lead development of complex web applications.[/DESCRIPTION]
        [IKIGAI]
        [LOVE]Building elegant user interfaces[/LOVE]
        [GOOD_AT]Full-stack development[/GOOD_AT]
        [WORLD_NEEDS]Better software experiences[/WORLD_NEEDS]
        [PAY]$120,000-$150,000[/PAY]
        [/IKIGAI]
        [ACTION_STRATEGY]Focus on modern frameworks.[/ACTION_STRATEGY]
        [END_SECTION]
      `;

      const result = parsePurposeDiscoveryStreamedText(textWithoutCoreDrivers);
      expect(result).toBeNull();
    });

    it('should return null when no purpose paths are found', () => {
      const textWithoutPaths = `
        [SECTION:CORE_DRIVERS]
        [STATEMENT]You are driven by the desire to create meaningful software.[/STATEMENT]
        [THREADS]Key themes: Problem-solving, technical excellence.[/THREADS]
        [END_SECTION]
      `;

      const result = parsePurposeDiscoveryStreamedText(textWithoutPaths);
      expect(result).toBeNull();
    });

    it('should handle missing statement in core drivers section', () => {
      const textWithoutStatement = `
        [SECTION:CORE_DRIVERS]
        [THREADS]Key themes: Problem-solving, technical excellence.[/THREADS]
        [END_SECTION]
        
        [SECTION:PATH_1]
        [TITLE]Senior Full-Stack Developer[/TITLE]
        [DESCRIPTION]Lead development of complex web applications.[/DESCRIPTION]
        [IKIGAI]
        [LOVE]Building elegant user interfaces[/LOVE]
        [GOOD_AT]Full-stack development[/GOOD_AT]
        [WORLD_NEEDS]Better software experiences[/WORLD_NEEDS]
        [PAY]$120,000-$150,000[/PAY]
        [/IKIGAI]
        [ACTION_STRATEGY]Focus on modern frameworks.[/ACTION_STRATEGY]
        [END_SECTION]
      `;

      const result = parsePurposeDiscoveryStreamedText(textWithoutStatement);
      expect(result).toBeNull(); // Should fail validation because statement is empty
    });

    it('should handle missing threads in core drivers section', () => {
      const textWithoutThreads = `
        [SECTION:CORE_DRIVERS]
        [STATEMENT]You are driven by the desire to create meaningful software.[/STATEMENT]
        [END_SECTION]
        
        [SECTION:PATH_1]
        [TITLE]Senior Full-Stack Developer[/TITLE]
        [DESCRIPTION]Lead development of complex web applications.[/DESCRIPTION]
        [IKIGAI]
        [LOVE]Building elegant user interfaces[/LOVE]
        [GOOD_AT]Full-stack development[/GOOD_AT]
        [WORLD_NEEDS]Better software experiences[/WORLD_NEEDS]
        [PAY]$120,000-$150,000[/PAY]
        [/IKIGAI]
        [ACTION_STRATEGY]Focus on modern frameworks.[/ACTION_STRATEGY]
        [END_SECTION]
      `;

      const result = parsePurposeDiscoveryStreamedText(textWithoutThreads);
      expect(result).toBeNull(); // Should fail validation because threads is empty
    });

    it('should handle incomplete ikigai alignment data but still require 3 paths total', () => {
      const textWithIncompleteIkigai = `
        [SECTION:CORE_DRIVERS]
        [STATEMENT]You are driven by the desire to create meaningful software.[/STATEMENT]
        [THREADS]Key themes: Problem-solving, technical excellence.[/THREADS]
        [END_SECTION]
        
        [SECTION:PATH_1]
        [TITLE]Senior Full-Stack Developer[/TITLE]
        [DESCRIPTION]Lead development of complex web applications.[/DESCRIPTION]
        [IKIGAI]
        [LOVE]Building elegant user interfaces[/LOVE]
        [GOOD_AT]Full-stack development[/GOOD_AT]
        [/IKIGAI]
        [ACTION_STRATEGY]Focus on modern frameworks.[/ACTION_STRATEGY]
        [END_SECTION]
        
        [SECTION:PATH_2]
        [TITLE]Technical Architect[/TITLE]
        [DESCRIPTION]Design systems.[/DESCRIPTION]
        [IKIGAI]
        [LOVE]System design[/LOVE]
        [GOOD_AT]Architecture[/GOOD_AT]
        [WORLD_NEEDS]Better systems[/WORLD_NEEDS]
        [PAY]$150,000[/PAY]
        [/IKIGAI]
        [ACTION_STRATEGY]Learn architecture.[/ACTION_STRATEGY]
        [END_SECTION]
        
        [SECTION:PATH_3]
        [TITLE]Product Lead[/TITLE]
        [DESCRIPTION]Lead products.[/DESCRIPTION]
        [IKIGAI]
        [LOVE]Product thinking[/LOVE]
        [GOOD_AT]Leadership[/GOOD_AT]
        [WORLD_NEEDS]Better products[/WORLD_NEEDS]
        [PAY]$140,000[/PAY]
        [/IKIGAI]
        [ACTION_STRATEGY]Build product skills.[/ACTION_STRATEGY]
        [END_SECTION]
      `;

      const result = parsePurposeDiscoveryStreamedText(textWithIncompleteIkigai);

      expect(result).toBeDefined();
      expect(result!.purposePaths).toHaveLength(3);
      expect(result!.purposePaths[0].ikigaiAlignment.love).toBe('Building elegant user interfaces');
      expect(result!.purposePaths[0].ikigaiAlignment.goodAt).toBe('Full-stack development');
      expect(result!.purposePaths[0].ikigaiAlignment.worldNeeds).toBe(''); // Missing field should be empty
      expect(result!.purposePaths[0].ikigaiAlignment.pay).toBe(''); // Missing field should be empty
    });

    it('should handle missing required path fields', () => {
      const textWithIncompletePathFields = `
        [SECTION:CORE_DRIVERS]
        [STATEMENT]You are driven by the desire to create meaningful software.[/STATEMENT]
        [THREADS]Key themes: Problem-solving, technical excellence.[/THREADS]
        [END_SECTION]
        
        [SECTION:PATH_1]
        [TITLE]Senior Full-Stack Developer[/TITLE]
        [IKIGAI]
        [LOVE]Building elegant user interfaces[/LOVE]
        [GOOD_AT]Full-stack development[/GOOD_AT]
        [WORLD_NEEDS]Better software experiences[/WORLD_NEEDS]
        [PAY]$120,000-$150,000[/PAY]
        [/IKIGAI]
        [ACTION_STRATEGY]Focus on modern frameworks.[/ACTION_STRATEGY]
        [END_SECTION]
      `;

      const result = parsePurposeDiscoveryStreamedText(textWithIncompletePathFields);
      
      // Should not include this path since DESCRIPTION is missing
      expect(result).toBeNull(); // Should fail validation because no complete paths found
    });

    it('should handle extra whitespace and normalize content with 3 paths', () => {
      const textWithExtraWhitespace = `
        [SECTION:CORE_DRIVERS]
        [STATEMENT]   You are driven by the desire to create meaningful software.   [/STATEMENT]
        [THREADS]   Key themes: Problem-solving, technical excellence.   [/THREADS]
        [END_SECTION]
        
        [SECTION:PATH_1]
        [TITLE]   Senior Full-Stack Developer   [/TITLE]
        [DESCRIPTION]   Lead development of complex web applications.   [/DESCRIPTION]
        [IKIGAI]
        [LOVE]   Building elegant user interfaces   [/LOVE]
        [GOOD_AT]   Full-stack development   [/GOOD_AT]
        [WORLD_NEEDS]   Better software experiences   [/WORLD_NEEDS]
        [PAY]   $120,000-$150,000   [/PAY]
        [/IKIGAI]
        [ACTION_STRATEGY]   Focus on modern frameworks.   [/ACTION_STRATEGY]
        [END_SECTION]
        
        [SECTION:PATH_2]
        [TITLE]   Technical Architect   [/TITLE]
        [DESCRIPTION]   Design systems.   [/DESCRIPTION]
        [IKIGAI]
        [LOVE]   System design   [/LOVE]
        [GOOD_AT]   Architecture   [/GOOD_AT]
        [WORLD_NEEDS]   Better systems   [/WORLD_NEEDS]
        [PAY]   $150,000   [/PAY]
        [/IKIGAI]
        [ACTION_STRATEGY]   Learn architecture.   [/ACTION_STRATEGY]
        [END_SECTION]
        
        [SECTION:PATH_3]
        [TITLE]   Product Lead   [/TITLE]
        [DESCRIPTION]   Lead products.   [/DESCRIPTION]
        [IKIGAI]
        [LOVE]   Product thinking   [/LOVE]
        [GOOD_AT]   Leadership   [/GOOD_AT]
        [WORLD_NEEDS]   Better products   [/WORLD_NEEDS]
        [PAY]   $140,000   [/PAY]
        [/IKIGAI]
        [ACTION_STRATEGY]   Build product skills.   [/ACTION_STRATEGY]
        [END_SECTION]
      `;

      const result = parsePurposeDiscoveryStreamedText(textWithExtraWhitespace);

      expect(result).toBeDefined();
      expect(result!.coreDriversAnalysis.statementSentence).toBe('You are driven by the desire to create meaningful software.');
      expect(result!.coreDriversAnalysis.coreThreads).toBe('Key themes: Problem-solving, technical excellence.');
      expect(result!.purposePaths[0].title).toBe('Senior Full-Stack Developer');
      expect(result!.purposePaths[0].ikigaiAlignment.love).toBe('Building elegant user interfaces');
    });

    it('should handle malformed delimiters gracefully', () => {
      const textWithMalformedDelimiters = `
        [SECTION:CORE_DRIVERS]
        [STATEMENT]You are driven by the desire to create meaningful software.[STATEMENT]
        [THREADS]Key themes: Problem-solving, technical excellence.[/THREADS]
        [END_SECTION]
        
        [SECTION:PATH_1]
        [TITLE]Senior Full-Stack Developer[/TITLE]
        [DESCRIPTION]Lead development of complex web applications.[/DESCRIPTION]
        [IKIGAI]
        [LOVE]Building elegant user interfaces[/LOVE]
        [GOOD_AT]Full-stack development[/GOOD_AT]
        [WORLD_NEEDS]Better software experiences[/WORLD_NEEDS]
        [PAY]$120,000-$150,000[/PAY]
        [/IKIGAI]
        [ACTION_STRATEGY]Focus on modern frameworks.[/ACTION_STRATEGY]
        [END_SECTION]
      `;

      const result = parsePurposeDiscoveryStreamedText(textWithMalformedDelimiters);
      
      // Should fail because malformed statement delimiter prevents proper parsing
      expect(result).toBeNull();
    });

    it('should return null when only 1 or 2 paths provided (requires exactly 3)', () => {
      const textWithTwoPaths = `
        [SECTION:CORE_DRIVERS]
        [STATEMENT]You are driven by the desire to create meaningful software.[/STATEMENT]
        [THREADS]Key themes: Problem-solving, technical excellence.[/THREADS]
        [END_SECTION]
        
        [SECTION:PATH_1]
        [TITLE]Senior Full-Stack Developer[/TITLE]
        [DESCRIPTION]Lead development of complex web applications.[/DESCRIPTION]
        [IKIGAI]
        [LOVE]Building elegant user interfaces[/LOVE]
        [GOOD_AT]Full-stack development[/GOOD_AT]
        [WORLD_NEEDS]Better software experiences[/WORLD_NEEDS]
        [PAY]$120,000-$150,000[/PAY]
        [/IKIGAI]
        [ACTION_STRATEGY]Focus on modern frameworks.[/ACTION_STRATEGY]
        [END_SECTION]
        
        [SECTION:PATH_2]
        [TITLE]Technical Architect[/TITLE]
        [DESCRIPTION]Design and oversee technical solutions.[/DESCRIPTION]
        [IKIGAI]
        [LOVE]Designing system architectures[/LOVE]
        [GOOD_AT]Technical leadership[/GOOD_AT]
        [WORLD_NEEDS]Scalable software systems[/WORLD_NEEDS]
        [PAY]$140,000-$180,000[/PAY]
        [/IKIGAI]
        [ACTION_STRATEGY]Develop system design expertise.[/ACTION_STRATEGY]
        [END_SECTION]
      `;

      const result = parsePurposeDiscoveryStreamedText(textWithTwoPaths);

      // Parser requires exactly 3 paths for validation
      expect(result).toBeNull();
    });

    it('should return null for completely empty or invalid text', () => {
      expect(parsePurposeDiscoveryStreamedText('')).toBeNull();
      expect(parsePurposeDiscoveryStreamedText('   ')).toBeNull();
      expect(parsePurposeDiscoveryStreamedText('Random text without any structure')).toBeNull();
      expect(parsePurposeDiscoveryStreamedText('[INVALID_SECTION]Some content[/INVALID_SECTION]')).toBeNull();
    });

    it('should handle multiline content within sections with 3 complete paths', () => {
      const textWithMultilineContent = `
        [SECTION:CORE_DRIVERS]
        [STATEMENT]You are driven by the desire to create meaningful software
        that solves real problems and makes a positive impact.[/STATEMENT]
        [THREADS]Key themes:
        - Problem-solving and technical excellence
        - User impact and continuous learning
        - Innovation and collaboration[/THREADS]
        [END_SECTION]
        
        [SECTION:PATH_1]
        [TITLE]Senior Full-Stack Developer[/TITLE]
        [DESCRIPTION]Lead development of complex web applications
        with a focus on user experience and performance.[/DESCRIPTION]
        [IKIGAI]
        [LOVE]Building elegant user interfaces
        that delight users[/LOVE]
        [GOOD_AT]Full-stack development and architecture[/GOOD_AT]
        [WORLD_NEEDS]Better software experiences[/WORLD_NEEDS]
        [PAY]$120,000-$150,000 annually
        with consulting opportunities[/PAY]
        [/IKIGAI]
        [ACTION_STRATEGY]Focus on mastering modern frameworks
        and building a portfolio of impactful projects.[/ACTION_STRATEGY]
        [END_SECTION]
        
        [SECTION:PATH_2]
        [TITLE]Technical Architect[/TITLE]
        [DESCRIPTION]Design and oversee technical solutions.[/DESCRIPTION]
        [IKIGAI]
        [LOVE]System design[/LOVE]
        [GOOD_AT]Architecture[/GOOD_AT]
        [WORLD_NEEDS]Better systems[/WORLD_NEEDS]
        [PAY]$150,000[/PAY]
        [/IKIGAI]
        [ACTION_STRATEGY]Learn architecture.[/ACTION_STRATEGY]
        [END_SECTION]
        
        [SECTION:PATH_3]
        [TITLE]Product Lead[/TITLE]
        [DESCRIPTION]Lead products.[/DESCRIPTION]
        [IKIGAI]
        [LOVE]Product thinking[/LOVE]
        [GOOD_AT]Leadership[/GOOD_AT]
        [WORLD_NEEDS]Better products[/WORLD_NEEDS]
        [PAY]$140,000[/PAY]
        [/IKIGAI]
        [ACTION_STRATEGY]Build product skills.[/ACTION_STRATEGY]
        [END_SECTION]
      `;

      const result = parsePurposeDiscoveryStreamedText(textWithMultilineContent);

      expect(result).toBeDefined();
      expect(result!.coreDriversAnalysis.statementSentence).toContain('You are driven by the desire');
      expect(result!.coreDriversAnalysis.statementSentence).toContain('makes a positive impact.');
      expect(result!.coreDriversAnalysis.coreThreads).toContain('Key themes:');
      expect(result!.coreDriversAnalysis.coreThreads).toContain('Innovation and collaboration');
      
      expect(result!.purposePaths[0].ikigaiAlignment.love).toContain('Building elegant user interfaces');
      expect(result!.purposePaths[0].ikigaiAlignment.love).toContain('that delight users');
    });
  });
});