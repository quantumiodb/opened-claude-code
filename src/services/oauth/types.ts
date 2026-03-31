/**
 * Stub: services/oauth/types.ts — missing from source map extraction.
 */

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  [key: string]: unknown;
}

export type SubscriptionType = 'free' | 'pro' | 'max' | 'team' | 'enterprise' | string;
export type BillingType = 'direct' | 'api' | string;

export interface OAuthProfileResponse {
  [key: string]: unknown;
}

export interface ReferralRedemptionsResponse {
  [key: string]: unknown;
}

export interface ReferrerRewardInfo {
  [key: string]: unknown;
}

export interface ReferralCampaign {
  [key: string]: unknown;
}

export interface ReferralEligibilityResponse {
  [key: string]: unknown;
}
