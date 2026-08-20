export interface AudioTrack {
    language: string;
    label: string;
}

export interface OmssSource {
    url: string;
    type: 'hls' | 'mp4' | 'dash';
    quality: string;
    audioTracks: AudioTrack[];
    provider: {
        id: string;
        name: string;
    };
}

export interface PlayerState {
    /**
     * @description The active OMSS stream source extracted from the provider
     */
    activeSource: OmssSource | null;
    /**
     * @description Whether the video is currently playing
     */
    isPlaying: boolean;
    /**
     * @description The current playback position in seconds
     */
    currentTime: number;
    /**
     * @description Any error message encountered during stream sniffing or playback
     */
    error: string | null;
}
