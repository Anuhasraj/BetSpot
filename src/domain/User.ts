import { BaseEntity } from '../core/BaseEntity';
import { AVATAR_FRAME_STYLES } from './constants';
import { KycStatus, SavedBankDetails, UserRole, UserStatus } from './types';
import { Wallet } from './Wallet';

function svgAvatar(bg1: string, bg2: string, accent: string, label: string, symbol: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${bg1}"/><stop offset="100%" stop-color="${bg2}"/></linearGradient></defs><rect width="120" height="120" fill="url(#g)"/><circle cx="60" cy="48" r="26" fill="${accent}" fill-opacity="0.22" stroke="${accent}" stroke-width="3"/><text x="60" y="57" text-anchor="middle" font-family="Arial,sans-serif" font-size="26" font-weight="bold" fill="${accent}">${symbol}</text><rect x="18" y="84" width="84" height="22" rx="11" fill="#000000" fill-opacity="0.45" stroke="${accent}" stroke-opacity="0.55" stroke-width="1.5"/><text x="60" y="99" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" font-weight="bold" fill="#FEF3C7">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const PRESET_AVATARS = [
  '/src/assets/images/avatar_player_knight_1795382328046.jpg',
  '/src/assets/images/avatar_player_queen_1795382312425.jpg',
  '/src/assets/images/avatar_player_challenger_1795382313024.jpg',
  '/src/assets/images/avatar_player_ace_1795382312741.jpg',
  svgAvatar('#78350F', '#271005', '#FBBF24', 'CROWN', 'K'),
  svgAvatar('#064E3B', '#022C22', '#34D399', 'VIPER', 'V'),
  svgAvatar('#1E3A8A', '#0F172A', '#38BDF8', 'FROST', 'F'),
  svgAvatar('#7F1D1D', '#2A0808', '#FB7185', 'BLAZE', 'B'),
  svgAvatar('#4C1D95', '#1E1038', '#C084FC', 'MYSTIC', 'M'),
  svgAvatar('#3F3F46', '#09090B', '#FDE047', 'TITAN', 'T'),
] as const;

export interface UserProps {
  id: string;
  username: string;
  displayName: string;
  email: string;
  passwordHash: string;
  avatarUrl?: string;
  avatarFrameId?: string;
  role: UserRole;
  status: UserStatus;
  initialBalance: number;
  initialHeld?: number;
  isBot?: boolean;
  createdAt?: number;
  country?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  ageVerified?: boolean;
  kycStatus?: KycStatus;
  kycDocumentName?: string;
  kycDocumentDataUrl?: string;
  kycSubmittedAt?: number;
  kycLastDecision?: 'APPROVED' | 'REJECTED';
  kycReviewNote?: string;
  kycReviewedAt?: number;
  kycReviewedBy?: string;
  savedCryptoAddress?: string;
  savedBankDetails?: SavedBankDetails;
  dailyBetLimitTokens?: number;
  referralCode?: string;
  referredByCode?: string;
  referredByUserId?: string;
  referredByUsername?: string;
  welcomeBonusClaimed?: boolean;
  welcomeBonusTokens?: number;
}

export interface SerializedUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  passwordHash: string;
  avatarUrl?: string;
  avatarFrameId?: string;
  role: UserRole;
  status: UserStatus;
  availableBalance: number;
  heldBalance: number;
  isBot: boolean;
  createdAt: number;
  country?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  ageVerified?: boolean;
  kycStatus?: KycStatus;
  kycDocumentName?: string;
  kycDocumentDataUrl?: string;
  kycSubmittedAt?: number;
  kycLastDecision?: 'APPROVED' | 'REJECTED';
  kycReviewNote?: string;
  kycReviewedAt?: number;
  kycReviewedBy?: string;
  savedCryptoAddress?: string;
  savedBankDetails?: SavedBankDetails;
  dailyBetLimitTokens?: number;
  referralCode?: string;
  referredByCode?: string;
  referredByUserId?: string;
  referredByUsername?: string;
  welcomeBonusClaimed?: boolean;
  welcomeBonusTokens?: number;
  transactions?: import('./types').WalletTransaction[];
}

export class User extends BaseEntity<SerializedUser> {
  public username: string;
  public displayName: string;
  public email: string;
  public passwordHash: string;
  public avatarUrl: string;
  public avatarFrameId: string;
  public role: UserRole;
  public status: UserStatus;
  public readonly isBot: boolean;
  public readonly wallet: Wallet;

  public country: string;
  public phoneNumber: string;
  public dateOfBirth: string;
  public ageVerified: boolean;
  public kycStatus: KycStatus;
  public kycDocumentName?: string;
  public kycDocumentDataUrl?: string;
  public kycSubmittedAt?: number;
  public kycLastDecision?: 'APPROVED' | 'REJECTED';
  public kycReviewNote?: string;
  public kycReviewedAt?: number;
  public kycReviewedBy?: string;
  public savedCryptoAddress: string;
  public savedBankDetails?: SavedBankDetails;
  public dailyBetLimitTokens: number;
  public referralCode: string;
  public referredByCode?: string;
  public referredByUserId?: string;
  public referredByUsername?: string;
  public welcomeBonusClaimed: boolean;
  public welcomeBonusTokens: number;

  constructor(props: UserProps) {
    super(props.id, props.createdAt);
    this.assertInvariant(Boolean(props.username && props.username.trim().length > 0), 'Username is required.');
    this.username = props.username;
    this.displayName = props.displayName;
    this.email = props.email;
    this.passwordHash = props.passwordHash;
    this.avatarUrl = props.avatarUrl || PRESET_AVATARS[0];
    this.avatarFrameId = props.avatarFrameId || AVATAR_FRAME_STYLES[0].id;
    this.role = props.role;
    this.status = props.status;
    this.isBot = Boolean(props.isBot);
    this.wallet = new Wallet(props.id, props.initialBalance, props.initialHeld ?? 0);
    this.country = props.country ?? '';
    this.phoneNumber = props.phoneNumber ?? '';
    this.dateOfBirth = props.dateOfBirth ?? '';
    this.ageVerified = Boolean(props.ageVerified);
    this.kycStatus = props.kycStatus ?? KycStatus.UNVERIFIED;
    this.kycDocumentName = props.kycDocumentName;
    this.kycDocumentDataUrl = props.kycDocumentDataUrl;
    this.kycSubmittedAt = props.kycSubmittedAt;
    this.kycLastDecision = props.kycLastDecision;
    this.kycReviewNote = props.kycReviewNote;
    this.kycReviewedAt = props.kycReviewedAt;
    this.kycReviewedBy = props.kycReviewedBy;
    this.savedCryptoAddress = props.savedCryptoAddress ?? '';
    this.savedBankDetails = props.savedBankDetails;
    this.dailyBetLimitTokens = Math.max(0, Math.round(props.dailyBetLimitTokens ?? 0));
    this.referralCode =
      (props.referralCode && props.referralCode.trim()) ||
      Array.from({ length: 8 }, () => '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 32)]).join('');
    this.referredByCode = props.referredByCode;
    this.referredByUserId = props.referredByUserId;
    this.referredByUsername = props.referredByUsername;
    this.welcomeBonusClaimed = Boolean(props.welcomeBonusClaimed);
    this.welcomeBonusTokens = Math.max(0, Math.round(props.welcomeBonusTokens ?? 0));
  }

  public get isActive(): boolean {
    return this.status === UserStatus.ACTIVE;
  }

  public get isAdmin(): boolean {
    return this.role === UserRole.ADMIN;
  }

  public get isKycVerified(): boolean {
    return this.kycStatus === KycStatus.VERIFIED;
  }

  public touchRecord(): void {
    this.touch();
  }

  public toJSON(): SerializedUser {
    return {
      id: this.id,
      username: this.username,
      displayName: this.displayName,
      email: this.email,
      passwordHash: this.passwordHash,
      avatarUrl: this.avatarUrl,
      avatarFrameId: this.avatarFrameId,
      role: this.role,
      status: this.status,
      availableBalance: this.wallet.availableBalance,
      heldBalance: this.wallet.heldBalance,
      isBot: this.isBot,
      createdAt: this.createdAt,
      country: this.country,
      phoneNumber: this.phoneNumber,
      dateOfBirth: this.dateOfBirth,
      ageVerified: this.ageVerified,
      kycStatus: this.kycStatus,
      kycDocumentName: this.kycDocumentName,
      kycDocumentDataUrl: this.kycDocumentDataUrl,
      kycSubmittedAt: this.kycSubmittedAt,
      kycLastDecision: this.kycLastDecision,
      kycReviewNote: this.kycReviewNote,
      kycReviewedAt: this.kycReviewedAt,
      kycReviewedBy: this.kycReviewedBy,
      savedCryptoAddress: this.savedCryptoAddress,
      savedBankDetails: this.savedBankDetails,
      dailyBetLimitTokens: this.dailyBetLimitTokens,
      referralCode: this.referralCode,
      referredByCode: this.referredByCode,
      referredByUserId: this.referredByUserId,
      referredByUsername: this.referredByUsername,
      welcomeBonusClaimed: this.welcomeBonusClaimed,
      welcomeBonusTokens: this.welcomeBonusTokens,
      transactions: [...this.wallet.transactions],
    };
  }

  public static fromJSON(data: SerializedUser): User {
    const user = new User({
      id: data.id,
      username: data.username,
      displayName: data.displayName,
      email: data.email,
      passwordHash: data.passwordHash,
      avatarUrl: data.avatarUrl || PRESET_AVATARS[0],
      avatarFrameId: data.avatarFrameId || AVATAR_FRAME_STYLES[0].id,
      role: data.role,
      status: data.status,
      initialBalance: data.availableBalance,
      initialHeld: Math.max(0, Math.round(data.heldBalance ?? 0)),
      isBot: data.isBot,
      createdAt: data.createdAt,
      country: data.country,
      phoneNumber: data.phoneNumber,
      dateOfBirth: data.dateOfBirth,
      ageVerified: data.ageVerified,
      kycStatus: data.kycStatus,
      kycDocumentName: data.kycDocumentName,
      kycDocumentDataUrl: data.kycDocumentDataUrl,
      kycSubmittedAt: data.kycSubmittedAt,
      kycLastDecision: data.kycLastDecision,
      kycReviewNote: data.kycReviewNote,
      kycReviewedAt: data.kycReviewedAt,
      kycReviewedBy: data.kycReviewedBy,
      savedCryptoAddress: data.savedCryptoAddress,
      savedBankDetails: data.savedBankDetails,
      dailyBetLimitTokens: data.dailyBetLimitTokens,
      referralCode: data.referralCode,
      referredByCode: data.referredByCode,
      referredByUserId: data.referredByUserId,
      referredByUsername: data.referredByUsername,
      welcomeBonusClaimed: data.welcomeBonusClaimed,
      welcomeBonusTokens: data.welcomeBonusTokens,
    });
    if (Array.isArray(data.transactions) && data.transactions.length > 0) {
      user.wallet.restoreTransactions(data.transactions);
    }
    return user;
  }
}
