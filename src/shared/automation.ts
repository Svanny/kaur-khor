export type AutomationChannel = 'telegram';

export type AutomationConnectionStatus =
  | 'disconnected'
  | 'connected'
  | 'paused'
  | 'error';

export type AutomationExposureEntityType = 'sku' | 'service';

export type AutomationAvailabilityStatus =
  | 'available'
  | 'limited'
  | 'unavailable'
  | 'hidden'
  | 'unknown';

export type AutomationIntakeStatus =
  | 'new'
  | 'needs_review'
  | 'quoted'
  | 'ticketed'
  | 'completed'
  | 'canceled'
  | 'failed';

export type AutomationParseConfidence = 'high' | 'medium' | 'low';

export interface AutomationChannelConnection {
  channel: AutomationChannel;
  status: AutomationConnectionStatus;
  hasBotToken: boolean;
  botDisplayName: string | null;
  botUsername: string | null;
  externalLink: string | null;
  connectedAt: string | null;
  pausedAt: string | null;
  lastWebhookAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
}

export interface AutomationExposureRow {
  entityType: AutomationExposureEntityType;
  entityId: string;
  label: string;
  imagePath?: string | null;
  supplierName?: string | null;
  archived: boolean;
  exposed: boolean;
  price: number | null;
  availabilityStatus: AutomationAvailabilityStatus;
  availabilityLabel: string;
  alias: string | null;
  sortOrder: number;
}

export interface AutomationConversationSummary {
  conversationId: string;
  channel: AutomationChannel;
  externalConversationKey: string;
  customerDisplayName: string | null;
  customerHandle: string | null;
  phone: string | null;
  lastMessageAt: string;
  messageCount: number;
  latestIntakeStatus: AutomationIntakeStatus | null;
  latestTicketId: string | null;
}

export interface AutomationMessageRecord {
  messageId: string;
  conversationId: string;
  externalMessageKey: string;
  direction: 'inbound' | 'outbound';
  sentAt: string;
  rawText: string;
  normalizedText: string | null;
  parseConfidence: AutomationParseConfidence | null;
}

export interface AutomationIntakeLine {
  lineId: string;
  entityType: AutomationExposureEntityType;
  entityId: string | null;
  requestedLabel: string;
  resolvedLabel: string | null;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
  availabilityStatus: AutomationAvailabilityStatus;
  ambiguityReason: string | null;
}

export interface AutomationOrderIntake {
  intakeId: string;
  conversationId: string;
  channel: AutomationChannel;
  status: AutomationIntakeStatus;
  parseConfidence: AutomationParseConfidence;
  customerDisplayName: string | null;
  customerHandle: string | null;
  phone: string | null;
  notes: string | null;
  quotedSubtotal: number | null;
  currencyCode: 'USD' | 'KHR';
  deliveryFee: number | null;
  quotedTotal: number | null;
  createdAt: string;
  updatedAt: string;
  promotedTicketId: string | null;
  lines: AutomationIntakeLine[];
}

export interface AutomationOverviewMetrics {
  ordersToday: number;
  needsReview: number;
  quotedToday: number;
  ticketedToday: number;
  completedToday: number;
  exposedSellables: number;
}

export interface AutomationWorkspace {
  connection: AutomationChannelConnection;
  metrics: AutomationOverviewMetrics;
  exposures: AutomationExposureRow[];
  conversations: AutomationConversationSummary[];
  intakes: AutomationOrderIntake[];
}

export interface PromoteAutomationIntakePayload {
  intakeId: string;
  mode: 'create_ticket' | 'append_ticket';
  ticketId?: string | null;
  customerIdentityOverride?: {
    customerName?: string | null;
    phone?: string | null;
  };
  note?: string | null;
}

export interface PromoteAutomationIntakeResult {
  intake: AutomationOrderIntake;
  ticketEvent: import('./sena').SenaTicketEvent;
  commercialEvents: import('./sena').SenaCommercialEvent[];
}
