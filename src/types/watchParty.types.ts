export interface PartyMember {
    id: string;
    username: string;
    avatarUrl?: string;
    isHost: boolean;
}

export interface WatchPartyState {
    /**
     * @description The active room ID, null if the user is not in a party
     */
    roomId: string | null;
    /**
     * @description List of active members currently in the watch party
     */
    members: PartyMember[];
    /**
     * @description Whether the WebSocket connection to the sync server is currently active
     */
    isConnected: boolean;
    /**
     * @description ID of the member who is currently buffering (to pause others)
     */
    bufferingUserId: string | null;
}
