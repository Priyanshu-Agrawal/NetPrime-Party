import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { WatchPartyState, PartyMember } from "@/src/types/watchParty.types";

const initialState: WatchPartyState = {
    roomId: null,
    members: [],
    isConnected: false,
    bufferingUserId: null,
};

const watchPartySlice = createSlice({
    name: 'watchParty',
    initialState,
    reducers: {
        setRoomId: (state, action: PayloadAction<string | null>) => {
            state.roomId = action.payload;
        },
        setMembers: (state, action: PayloadAction<PartyMember[]>) => {
            state.members = action.payload;
        },
        setConnectionStatus: (state, action: PayloadAction<boolean>) => {
            state.isConnected = action.payload;
        },
        setBufferingUser: (state, action: PayloadAction<string | null>) => {
            state.bufferingUserId = action.payload;
        },
        resetWatchParty: () => {
            return initialState;
        },
    },
});

export const { 
    setRoomId, 
    setMembers, 
    setConnectionStatus, 
    setBufferingUser,
    resetWatchParty 
} = watchPartySlice.actions;

export default watchPartySlice.reducer;
