import { useCallback, useEffect, useRef } from 'react';

/**
 * Custom hook that plays short audio clips (sound effects) when called.
 *
 * This hook uses a hybrid approach:
 * - Preloads audio once for instant playback (eliminates delay)
 * - Creates detached audio elements for playback (survives component unmounts)
 *
 * This ensures sounds play instantly AND complete even during navigation.
 *
 * @param soundPath - Path to the audio file (e.g., '/sounds/click-primary.mp3')
 * @returns Object with a `play` function that triggers audio playback
 *
 * @example
 * ```tsx
 * const { play } = useSoundEffect('/sounds/click-primary.mp3');
 *
 * <Button onPointerDown={play} onClick={handleNavigate}>
 *   Navigate
 * </Button>
 * ```
 */
export function useSoundEffect(soundPath: string) {
  const preloadedAudioRef = useRef<HTMLAudioElement | null>(null);

  // Preload the audio file once to prime browser cache and decode audio
  useEffect(() => {
    const preloadAudio = new Audio(soundPath);
    preloadAudio.preload = 'auto';
    preloadAudio.load(); // Explicitly trigger loading
    preloadedAudioRef.current = preloadAudio;

    return () => {
      // Clean up preloaded audio on unmount
      if (preloadedAudioRef.current) {
        preloadedAudioRef.current.src = '';
        preloadedAudioRef.current = null;
      }
    };
  }, [soundPath]);

  /**
   * Plays the sound effect using a detached audio element.
   * The audio element is not stored in component state, so it survives
   * component unmounts (critical for sounds that play during navigation).
   *
   * Thanks to preloading, the browser has already fetched and decoded the audio,
   * so creating a new Audio(soundPath) is nearly instant.
   */
  const play = useCallback(() => {
    // Create a new, detached audio element for each playback
    // Browser will use cached + decoded audio from preloading (instant)
    const audio = new Audio(soundPath);
    audio.volume = 0.3; // Set volume to 30%

    // Play the sound - this is "fire and forget"
    audio.play().catch((error) => {
      // Gracefully handle play failures (e.g., browser autoplay restrictions)
      console.warn('[SoundEffect] Failed to play sound effect:', error);
    });

    // Clean up the audio element after it finishes playing
    audio.addEventListener('ended', () => {
      audio.src = ''; // Release the audio buffer
    });
  }, [soundPath]);

  return { play };
}

