import { TierId } from './types';

export type RoomInviteStatus = 'WAITING' | 'STARTED' | 'FULL' | 'CANCELLED' | 'EXPIRED';

export interface RoomInviteSeat {
  seatIndex: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  avatarFrameId?: string;
  country?: string;
  betAmountTokens: number;
  isBot?: boolean;
}

export interface RoomInvite {
  id: string;
  boardId: string;
  tierId: TierId;
  tierLabel: string;
  roomLabel: string;
  tableNumber: number;
  hostUserId: string;
  hostUsername: string;
  hostDisplayName: string;
  hostAvatarUrl?: string;
  hostAvatarFrameId?: string;
  hostCountry?: string;
  betAmountTokens: number;
  currentMinBet: number;
  minBetTokens: number;
  maxBetTokens: number;
  occupiedCount: number;
  maxSeats: number;
  seats: RoomInviteSeat[];
  status: RoomInviteStatus;
  createdAt: number;
  updatedAt: number;
  lastBroadcastAt: number;
  lobbyEndsAt: number;
}

export interface RoomInvitePreferences {
  muted: boolean;
  enabledTierIds: TierId[];
}

export const ALL_INVITE_TIER_IDS: readonly TierId[] = [
  TierId.TIER_1,
  TierId.TIER_2,
  TierId.TIER_3,
  TierId.TIER_4,
  TierId.TIER_5,
  TierId.TIER_6,
];

export const DEFAULT_INVITE_PREFERENCES: RoomInvitePreferences = {
  muted: false,
  enabledTierIds: [...ALL_INVITE_TIER_IDS],
};
