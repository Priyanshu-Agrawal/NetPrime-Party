import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { PlayerState, OmssSource } from "@/src/types/player.types";

const initialState: PlayerState = {
    activeSource: null,
    isPlaying: false,
    currentTime: 0,
    error: null,
};

const playerSlice = createSlice({
    name: 'player',
    initialState,
    reducers: {
        setActiveSource: (state, action: PayloadAction<OmssSource | null>) => {
            state.activeSource = action.payload;
            state.error = null; // Clear any previous errors on new source
        },
        setPlayingStatus: (state, action: PayloadAction<boolean>) => {
            state.isPlaying = action.payload;
        },
        setCurrentTime: (state, action: PayloadAction<number>) => {
            state.currentTime = action.payload;
        },
        setPlayerError: (state, action: PayloadAction<string>) => {
            state.error = action.payload;
        },
    },
});

export const { 
    setActiveSource, 
    setPlayingStatus, 
    setCurrentTime, 
    setPlayerError 
} = playerSlice.actions;

export default playerSlice.reducer;
