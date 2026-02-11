"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  AlertCircle,
  VideoOff,
} from "lucide-react";

interface VideoPlayerProps {
  /** Signed S3 URL for the video */
  src?: string | null;
  /** Poster image URL */
  poster?: string;
  /** Additional CSS classes */
  className?: string;
  /** Callback when time updates */
  onTimeUpdate?: (currentTime: number) => void;
  /** Callback when video metadata is loaded */
  onLoadedMetadata?: (duration: number) => void;
  /** Callback to seek to a specific time (controlled from parent) */
  seekTo?: number | null;
}

type VideoError = "unsupported" | "unavailable" | "network" | null;

/**
 * VideoPlayer component - HTML5 video player with custom controls
 *
 * Features:
 * - Play/pause with button and spacebar
 * - Clickable progress bar for seeking
 * - Volume slider with mute toggle
 * - Current time / duration display
 * - Error handling for unsupported formats and unavailable videos
 */
export function VideoPlayer({
  src,
  poster,
  className,
  onTimeUpdate,
  onLoadedMetadata,
  seekTo,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<VideoError>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Format time in MM:SS or HH:MM:SS
  const formatTime = useCallback((seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return "00:00";

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }, []);

  // Handle play/pause toggle
  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video || error) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(() => {
        // Handle autoplay restriction gracefully
      });
    }
  }, [isPlaying, error]);

  // Handle volume change
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      setIsMuted(newVolume === 0);
    }
  }, []);

  // Handle mute toggle
  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isMuted) {
      video.muted = false;
      video.volume = volume > 0 ? volume : 0.5;
      setIsMuted(false);
      if (volume === 0) setVolume(0.5);
    } else {
      video.muted = true;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  // Handle progress bar click for seeking
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const progressBar = progressRef.current;
    if (!video || !progressBar || error) return;

    const rect = progressBar.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    const newTime = clickPosition * duration;
    video.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration, error]);

  // Handle video events
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    setCurrentTime(video.currentTime);
    onTimeUpdate?.(video.currentTime);
  }, [onTimeUpdate]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    setDuration(video.duration);
    setIsLoading(false);
    setError(null);
    onLoadedMetadata?.(video.duration);
  }, [onLoadedMetadata]);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleError = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    setIsLoading(false);

    // Determine error type
    const mediaError = video.error;
    if (mediaError) {
      switch (mediaError.code) {
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          setError("unsupported");
          break;
        case MediaError.MEDIA_ERR_NETWORK:
          setError("network");
          break;
        case MediaError.MEDIA_ERR_DECODE:
          setError("unsupported");
          break;
        default:
          setError("unavailable");
      }
    } else {
      setError("unavailable");
    }
  }, []);

  const handleWaiting = useCallback(() => {
    setIsLoading(true);
  }, []);

  const handleCanPlay = useCallback(() => {
    setIsLoading(false);
  }, []);

  // Handle external seek command
  useEffect(() => {
    const video = videoRef.current;
    if (video && seekTo !== null && seekTo !== undefined && isFinite(seekTo)) {
      video.currentTime = seekTo;
      setCurrentTime(seekTo);
    }
  }, [seekTo]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if video player is focused or no input is focused
      const target = e.target as HTMLElement;
      const isInputFocused =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (isInputFocused) return;

      switch (e.key) {
        case " ": // Spacebar for play/pause
          e.preventDefault();
          togglePlayPause();
          break;
        case "m": // M for mute
        case "M":
          toggleMute();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [togglePlayPause, toggleMute]);

  // Calculate progress percentage
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Error display component
  const renderError = () => {
    let message = "";
    let Icon = AlertCircle;

    switch (error) {
      case "unsupported":
        message = "Format vidéo non supporté";
        Icon = VideoOff;
        break;
      case "unavailable":
        message = "Vidéo indisponible";
        Icon = VideoOff;
        break;
      case "network":
        message = "Erreur de chargement";
        Icon = AlertCircle;
        break;
      default:
        message = "Erreur inconnue";
    }

    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-white">
        <Icon className="h-12 w-12 mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    );
  };

  // No source provided
  if (!src) {
    return (
      <div
        className={cn(
          "relative aspect-video bg-black rounded-lg overflow-hidden",
          className
        )}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50">
          <VideoOff className="h-12 w-12 mb-2" />
          <p className="text-sm">Aucune vidéo</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative aspect-video bg-black rounded-lg overflow-hidden group",
        className
      )}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="w-full h-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={handlePlay}
        onPause={handlePause}
        onError={handleError}
        onWaiting={handleWaiting}
        onCanPlay={handleCanPlay}
        playsInline
        preload="metadata"
      />

      {/* Loading overlay */}
      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-white border-t-transparent" />
        </div>
      )}

      {/* Error overlay */}
      {error && renderError()}

      {/* Controls overlay - visible on hover */}
      {!error && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Progress bar */}
          <div
            ref={progressRef}
            className="relative h-1 bg-white/30 rounded-full cursor-pointer mb-3 group/progress"
            onClick={handleProgressClick}
          >
            {/* Progress filled */}
            <div
              className="absolute h-full bg-primary rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
            {/* Progress handle */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity"
              style={{ left: `calc(${progressPercent}% - 6px)` }}
            />
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-3">
            {/* Play/Pause button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={togglePlayPause}
              aria-label={isPlaying ? "Pause" : "Lecture"}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5" />
              )}
            </Button>

            {/* Time display */}
            <span className="text-white text-xs font-mono min-w-[80px]">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Volume controls */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={toggleMute}
                aria-label={isMuted ? "Activer le son" : "Couper le son"}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </Button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-20 h-1 bg-white/30 rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-3
                  [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-white
                  [&::-moz-range-thumb]:w-3
                  [&::-moz-range-thumb]:h-3
                  [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-white
                  [&::-moz-range-thumb]:border-0"
                aria-label="Volume"
              />
            </div>
          </div>
        </div>
      )}

      {/* Big play button in center when paused */}
      {!isPlaying && !error && !isLoading && (
        <button
          onClick={togglePlayPause}
          className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Lecture"
        >
          <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
            <Play className="h-8 w-8 text-black ml-1" />
          </div>
        </button>
      )}
    </div>
  );
}

export default VideoPlayer;
