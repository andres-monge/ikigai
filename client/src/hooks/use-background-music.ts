import { useRef, useCallback, useEffect } from 'react';

/**
 * Custom hook that plays background music selected randomly during waiting periods.
 * 
 * Unlike sound effects, this hook creates a new HTMLAudioElement each time play() is called,
 * allowing different tracks to be played on each invocation. The selected track will loop
 * continuously until stop() is called or the component unmounts.
 * 
 * @param tracks - Array of paths to audio files (e.g., ['/sounds/music-wait-1.mp3', ...])
 * @returns Object with `play` and `stop` functions to control music playback
 * ```
 */
export function useBackgroundMusic(tracks: string[]) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /**
   * Stops any currently playing music and clears the audio reference.
   * Memoized with useCallback to prevent unnecessary re-renders.
   */
  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  }, []);

  /**
   * Gradually fades out the currently playing music over the specified duration.
   * Uses smooth volume reduction with 20 steps for imperceptible transitions.
   * After fade completes, pauses and clears the audio reference.
   * Memoized with useCallback to prevent unnecessary re-renders.
   *
   * @param duration - Fade duration in milliseconds (default: 1000ms)
   */
  const fadeOut = useCallback((duration = 1000) => {
    if (!audioRef.current) return;

    const audio = audioRef.current;
    const startVolume = audio.volume;
    const fadeSteps = 20; // Smooth fade with 20 steps
    const stepDuration = duration / fadeSteps;
    const volumeStep = startVolume / fadeSteps;

    const fadeInterval = setInterval(() => {
      if (audio.volume > volumeStep) {
        audio.volume -= volumeStep;
      } else {
        // Fade complete - stop the music
        audio.pause();
        audio.currentTime = 0;
        clearInterval(fadeInterval);
        audioRef.current = null;
      }
    }, stepDuration);
  }, []);

  /**
   * Randomly selects a track from the array and starts playing it.
   * If music is already playing, it stops the current track first.
   * The selected track will loop continuously until stop() is called.
   * Memoized with useCallback to prevent unnecessary re-renders.
   */
  const play = useCallback(() => {
    // Handle empty tracks array gracefully
    if (!tracks || tracks.length === 0) {
      console.warn('useBackgroundMusic: No tracks provided, music will not play');
      return;
    }

    // Stop any currently playing music before starting new track
    stop();

    // Randomly select a track from the array
    const randomIndex = Math.floor(Math.random() * tracks.length);
    const selectedTrack = tracks[randomIndex];

    // Create new audio element with selected track
    const audio = new Audio(selectedTrack);
    audio.volume = 0.3; // Set volume to 30% (quieter than sound effects at 50%)
    audio.loop = true; // Loop continuously until stopped

    // Start playback with error handling
    audio.play().catch((error) => {
      // Gracefully handle play failures (e.g., browser autoplay restrictions)
      console.warn('Failed to play background music:', error);
      // Clear reference on failure to allow retry
      audioRef.current = null;
    });

    // Store reference to current audio element
    audioRef.current = audio;
  }, [tracks, stop]);

  // Cleanup: stop music when component unmounts
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { play, stop, fadeOut };
}

