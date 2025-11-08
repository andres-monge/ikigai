import { useRef, useEffect } from 'react';

/**
 * Custom hook that plays short audio clips (sound effects) when called.
 * 
 * The hook caches an HTMLAudioElement instance to avoid recreating it on each render.
 * The play() function will ignore calls if audio is already playing to prevent
 * overlapping sounds.
 * 
 * @param soundPath - Path to the audio file (e.g., '/sounds/click-primary.mp3')
 * @returns Object with a `play` function that triggers audio playback
 * 
 * @example
 * ```tsx
 * const { play } = useSoundEffect('/sounds/click-primary.mp3');
 * 
 * <Button onClick={() => { play(); handleSubmit(); }}>
 *   Submit
 * </Button>
 * ```
 */
export function useSoundEffect(soundPath: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio element once when hook is created
  useEffect(() => {
    // Create audio element and configure it
    const audio = new Audio(soundPath);
    audio.volume = 0.5; // Set volume to 50%
    audio.preload = 'auto'; // Preload audio for immediate playback
    
    audioRef.current = audio;

    // Cleanup: pause and remove reference when component unmounts
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [soundPath]);

  /**
   * Plays the sound effect. If audio is already playing, the call is ignored
   * to prevent overlapping sounds.
   */
  const play = () => {
    if (!audioRef.current) {
      return;
    }

    // Ignore if audio is already playing
    if (!audioRef.current.paused) {
      return;
    }

    // Reset to beginning and play
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch((error) => {
      // Gracefully handle play failures (e.g., browser autoplay restrictions)
      console.warn('Failed to play sound effect:', error);
    });
  };

  return { play };
}

