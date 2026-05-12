use crate::lead_time::{
    derive_variability_class, validate_lead_time_range, SenaLeadTimeVariabilityClass,
};
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use time::OffsetDateTime;

pub const SENA_SCHEMA_VERSION: i32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaCatalog {
    pub schema_version: i32,
    pub skus: Vec<SenaSku>,
    pub services: Vec<SenaService>,
    #[serde(default)]
    pub bundles: Vec<SenaBundle>,
    #[serde(default)]
    pub sharing_mask: Vec<SenaServiceSkuMaskEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaSku {
    pub sku_id: String,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub image_path: Option<String>,
    #[serde(default)]
    pub supplier_name: Option<String>,
    pub cost_per_unit: f64,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub sold_as_product: bool,
    pub product_price: Option<f64>,
    pub lead_time_mean_days_hint: Option<f64>,
    pub lead_time_std_days_hint: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaService {
    pub service_id: String,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub image_path: Option<String>,
    pub price: f64,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub bundle: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaBundle {
    pub bundle_id: String,
    pub service_id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaServiceSkuMaskEntry {
    pub service_id: String,
    pub sku_id: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub usage_probability: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaObservationInput {
    pub observed_at: String,
    pub stock_snapshot: Vec<SenaStockSnapshot>,
    #[serde(default)]
    pub retail_sales_snapshot: Vec<SenaRetailSalesSnapshot>,
    #[serde(default)]
    pub service_sales_snapshot: Vec<SenaServiceSalesSnapshot>,
    #[serde(default)]
    pub service_rankings: Vec<String>,
    #[serde(default)]
    pub retail_rankings: Vec<String>,
    #[serde(default)]
    pub service_stockouts: Vec<String>,
    #[serde(default)]
    pub retail_stockouts: Vec<String>,
    #[serde(default)]
    pub order_signals: Vec<SenaOrderSignal>,
    #[serde(default)]
    pub service_prices: Vec<SenaServicePriceObservation>,
    #[serde(default)]
    pub retail_prices: Vec<SenaRetailPriceObservation>,
    #[serde(default)]
    pub lead_time_hints: Vec<SenaLeadTimeHint>,
    #[serde(default)]
    pub regime_hint: Option<SenaObservationRegimeHint>,
    #[serde(default)]
    pub adjustment_signals: Vec<SenaAdjustmentSignal>,
    #[serde(default)]
    pub commercial_events: Vec<SenaCommercialEvent>,
    #[serde(default)]
    pub ticket_events: Vec<SenaTicketEvent>,
    #[serde(default)]
    pub recipe_usage_hints: Vec<SenaRecipeUsageHint>,
    #[serde(default)]
    pub delivery_fee: Option<SenaDeliveryFeeMetadata>,
    #[serde(default)]
    pub discount: Option<SenaDiscountMetadata>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaStockSnapshot {
    pub sku_id: String,
    pub units_in_stock: f64,
    pub cost_per_unit: Option<f64>,
    pub product_price: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaRetailSalesSnapshot {
    pub sku_id: String,
    pub units_sold: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaServiceSalesSnapshot {
    pub service_id: String,
    pub units_sold: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaOrderSignal {
    pub sku_id: String,
    #[serde(default)]
    pub order_placed: bool,
    #[serde(default)]
    pub receipt_arrived: bool,
    pub approximate_order_quantity: Option<f64>,
    pub approximate_receipt_quantity: Option<f64>,
    #[serde(default)]
    pub placement_timestamp: Option<String>,
    #[serde(default)]
    pub receipt_timestamp: Option<String>,
    #[serde(default)]
    pub lead_time_days_hint: Option<f64>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SenaCommercialParty {
    Customer,
    Supplier,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SenaCommercialStage {
    Pending,
    Realized,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SenaCommercialEntityType {
    Sku,
    Service,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SenaCommercialFlow {
    Scheduled,
    Immediate,
    Reversal,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaCommercialEvent {
    pub party: SenaCommercialParty,
    pub entity_type: SenaCommercialEntityType,
    pub entity_id: String,
    pub stage: SenaCommercialStage,
    pub quantity_delta: f64,
    pub flow: SenaCommercialFlow,
    #[serde(default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SenaTicketFamily {
    Customer,
    Supplier,
    Adjustment,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SenaTicketLifecycle {
    Open,
    Resolved,
    Canceled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SenaDeliveryFeePayer {
    Customer,
    Merchant,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SenaDeliveryFeeBucket {
    Supplier,
    CustomerOrder,
    ImmediateSale,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SenaDiscountMode {
    Amount,
    Percent,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaDeliveryFeeMetadata {
    pub fee_usd: Option<f64>,
    pub payer: SenaDeliveryFeePayer,
    pub bucket: SenaDeliveryFeeBucket,
    pub subtotal_usd: Option<f64>,
    pub display_delivery_usd: Option<f64>,
    pub display_total_usd: Option<f64>,
    pub net_settlement_usd: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaDiscountMetadata {
    pub mode: SenaDiscountMode,
    pub amount_usd: Option<f64>,
    pub percent: Option<f64>,
    pub subtotal_usd: Option<f64>,
    pub display_discount_usd: Option<f64>,
    pub discounted_subtotal_usd: Option<f64>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SenaTicketStage {
    Pending,
    Ready,
    FulfilledImmediate,
    ToOrder,
    OrderedWaiting,
    PartialReceived,
    Received,
    Draft,
    Applied,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SenaTicketEventType {
    Created,
    Revised,
    NoteAdded,
    ReadyMarked,
    FulfilledImmediate,
    EtaUpdated,
    FollowupLogged,
    PartialReceived,
    FullyReceived,
    Applied,
    Canceled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaTicketPartyMetadata {
    pub role: String,
    #[serde(default)]
    pub channel_key: Option<String>,
    #[serde(default)]
    pub channel_label: Option<String>,
    #[serde(default)]
    pub customer_name: Option<String>,
    #[serde(default)]
    pub customer_name_key: Option<String>,
    #[serde(default)]
    pub phone: Option<String>,
    #[serde(default)]
    pub phone_key: Option<String>,
    #[serde(default)]
    pub supplier_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaTicketLine {
    pub entity_type: SenaCommercialEntityType,
    pub entity_id: String,
    #[serde(default)]
    pub quantity_delta: Option<f64>,
    #[serde(default)]
    pub ordered_quantity: Option<f64>,
    #[serde(default)]
    pub received_quantity: Option<f64>,
    #[serde(default)]
    pub promised_at: Option<String>,
    #[serde(default)]
    pub expected_arrival_at: Option<String>,
    #[serde(default)]
    pub unit_cost: Option<f64>,
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaTicketEvent {
    pub ticket_id: String,
    pub ticket_family: SenaTicketFamily,
    pub lifecycle: SenaTicketLifecycle,
    pub stage: SenaTicketStage,
    pub revision: i32,
    pub event_type: SenaTicketEventType,
    pub occurred_at: String,
    #[serde(default)]
    pub next_touch_at: Option<String>,
    #[serde(default)]
    pub party: Option<SenaTicketPartyMetadata>,
    pub lines: Vec<SenaTicketLine>,
    #[serde(default)]
    pub delivery_fee: Option<SenaDeliveryFeeMetadata>,
    #[serde(default)]
    pub discount: Option<SenaDiscountMetadata>,
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SenaOrderBatchStatus {
    Open,
    AwaitingReceipt,
    FollowUp,
    PartialReceipt,
    Received,
    Reviewed,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SenaOrderChildStatus {
    Open,
    AwaitingReceipt,
    FollowUp,
    Received,
    Reviewed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SenaOrderFieldValues {
    pub supplier_name: Option<String>,
    pub supplier_note: Option<String>,
    pub ordered_quantity: Option<f64>,
    pub received_quantity: Option<f64>,
    pub cost_per_unit: Option<f64>,
    pub expected_arrival_at: Option<String>,
    pub placement_timestamp: Option<String>,
    pub receipt_timestamp: Option<String>,
    pub lead_time_days_hint: Option<f64>,
    pub lead_time_variability: Option<SenaLeadTimeVariabilityClass>,
    #[serde(default)]
    pub delivery_fee: Option<SenaDeliveryFeeMetadata>,
    #[serde(default)]
    pub discount: Option<SenaDiscountMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaOrderChildRecord {
    pub child_order_id: String,
    pub sku_id: String,
    pub status: SenaOrderChildStatus,
    pub created_at: String,
    pub updated_at: String,
    pub inherited_from_batch: bool,
    pub effective: SenaOrderFieldValues,
    #[serde(default)]
    pub overrides: SenaOrderFieldValues,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaOrderBatchRecord {
    pub batch_order_id: String,
    pub owner_sub: String,
    pub supplier_name: Option<String>,
    pub status: SenaOrderBatchStatus,
    pub created_at: String,
    pub updated_at: String,
    pub shared: SenaOrderFieldValues,
    pub children: Vec<SenaOrderChildRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaOrderBatchCreateChildInput {
    pub sku_id: String,
    #[serde(default)]
    pub overrides: Option<SenaOrderFieldValues>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaCreateOrderBatchPayload {
    #[serde(default)]
    pub supplier_name: Option<String>,
    pub shared: SenaOrderFieldValues,
    pub children: Vec<SenaOrderBatchCreateChildInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaUpdateOrderBatchPayload {
    pub batch_order_id: String,
    #[serde(default)]
    pub shared: Option<SenaOrderFieldValues>,
    #[serde(default)]
    pub supplier_name: Option<String>,
    #[serde(default)]
    pub status: Option<SenaOrderBatchStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaUpdateOrderChildPayload {
    pub child_order_id: String,
    #[serde(default)]
    pub sku_id: Option<String>,
    #[serde(default)]
    pub overrides: Option<SenaOrderFieldValues>,
    #[serde(default)]
    pub status: Option<SenaOrderChildStatus>,
    #[serde(default)]
    pub append_supplier_note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaSplitOrderChildPayload {
    pub child_order_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SenaOrderLookupPayload {
    #[serde(default)]
    pub batch_order_id: Option<String>,
    #[serde(default)]
    pub child_order_id: Option<String>,
    #[serde(default)]
    pub sku_id: Option<String>,
    #[serde(default)]
    pub supplier_name: Option<String>,
    #[serde(default)]
    pub status: Option<SenaOrderBatchStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaServicePriceObservation {
    pub service_id: String,
    pub price: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaRetailPriceObservation {
    pub sku_id: String,
    pub price: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaLeadTimeHint {
    pub sku_id: String,
    pub typical_days: Option<f64>,
    pub low_days: Option<f64>,
    pub high_days: Option<f64>,
    pub variability_class: Option<SenaLeadTimeVariabilityClass>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SenaObservationRegimeHint {
    Normal,
    Spike,
    Lull,
    StockoutConstrained,
    Promo,
    Correction,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaAdjustmentSignal {
    pub sku_id: String,
    pub quantity_delta: f64,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaRecipeUsageHint {
    pub service_id: String,
    pub sku_id: String,
    pub usage_probability: f64,
    pub typical_units_per_instance: f64,
    pub variability: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaObservationRecord {
    pub observation_id: String,
    pub owner_sub: String,
    pub input: SenaObservationInput,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SenaObservationFingerprint {
    pub count: usize,
    pub latest_observed_at: Option<String>,
    pub latest_observation_id: Option<String>,
    #[serde(default)]
    pub content_fingerprint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SenaObservationPageRequest {
    #[serde(default)]
    pub before_observed_at: Option<String>,
    #[serde(default)]
    pub before_observation_id: Option<String>,
    #[serde(default)]
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SenaObservationPageCursor {
    pub observed_at: String,
    pub observation_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaObservationPage {
    pub observations: Vec<SenaObservationRecord>,
    pub next_cursor: Option<SenaObservationPageCursor>,
    pub has_older: bool,
    pub total_count: usize,
    pub latest_observed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaRecordUpdateAnchor<T> {
    pub observation_id: String,
    pub observed_at: String,
    pub value: T,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaTicketSummary {
    pub ticket_id: String,
    pub ticket_family: SenaTicketFamily,
    pub lifecycle: SenaTicketLifecycle,
    pub stage: SenaTicketStage,
    pub revision: i32,
    pub event_type: SenaTicketEventType,
    pub occurred_at: String,
    #[serde(default)]
    pub next_touch_at: Option<String>,
    #[serde(default)]
    pub party: Option<SenaTicketPartyMetadata>,
    pub lines: Vec<SenaTicketLine>,
    #[serde(default)]
    pub delivery_fee: Option<SenaDeliveryFeeMetadata>,
    #[serde(default)]
    pub discount: Option<SenaDiscountMetadata>,
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaRecordUpdateOpenTickets {
    pub customer: Vec<SenaTicketSummary>,
    pub supplier: Vec<SenaTicketSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SenaRecordActivityType {
    Stock,
    RetailSale,
    ServiceSale,
    Order,
    Receipt,
    Ticket,
    DeliveryFee,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaRecordActivityEntry {
    pub activity_id: String,
    pub activity_type: SenaRecordActivityType,
    pub observation_id: String,
    pub observed_at: String,
    pub entity_id: String,
    #[serde(default)]
    pub ticket_id: Option<String>,
    #[serde(default)]
    pub ticket_family: Option<SenaTicketFamily>,
    #[serde(default)]
    pub lifecycle: Option<SenaTicketLifecycle>,
    #[serde(default)]
    pub event_type: Option<SenaTicketEventType>,
    pub summary: String,
    #[serde(default)]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaRecordUpdateContext {
    pub observation_fingerprint: SenaObservationFingerprint,
    pub latest_observed_at: Option<String>,
    pub latest_stock_by_sku: BTreeMap<String, SenaRecordUpdateAnchor<SenaStockSnapshot>>,
    pub latest_retail_sale_by_sku:
        BTreeMap<String, SenaRecordUpdateAnchor<SenaRetailSalesSnapshot>>,
    pub latest_service_sale_by_service:
        BTreeMap<String, SenaRecordUpdateAnchor<SenaServiceSalesSnapshot>>,
    pub latest_order_by_sku: BTreeMap<String, SenaRecordUpdateAnchor<SenaOrderSignal>>,
    pub latest_receipt_by_sku: BTreeMap<String, SenaRecordUpdateAnchor<SenaOrderSignal>>,
    pub open_tickets_by_family: SenaRecordUpdateOpenTickets,
    pub latest_tickets_by_id: BTreeMap<String, SenaRecordUpdateAnchor<SenaTicketSummary>>,
    pub latest_delivery_fee_by_bucket:
        BTreeMap<String, SenaRecordUpdateAnchor<SenaDeliveryFeeMetadata>>,
    pub recent_activity: Vec<SenaRecordActivityEntry>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SenaRunStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaAnalysisRunRecord {
    pub run_id: String,
    pub owner_sub: String,
    pub algorithm_version: String,
    pub status: SenaRunStatus,
    pub observation_count: usize,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub summary: Option<SenaWorkspaceSummary>,
    pub diagnostics: Option<SenaDiagnostics>,
    pub primary_artifact_key: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaWorkspaceSummary {
    pub owner_sub: String,
    pub run_id: String,
    pub latest_observed_at: Option<String>,
    pub sku_count: usize,
    pub service_count: usize,
    pub interval_count: usize,
    pub pending_reorder_count: usize,
    pub top_regime: String,
    pub high_risk_sku_ids: Vec<String>,
    pub sku_summaries: Vec<SenaSkuSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaSkuSummary {
    pub sku_id: String,
    pub latest_posterior_units: f64,
    pub credible_interval_low: f64,
    pub credible_interval_high: f64,
    pub demand_per_day_mean: f64,
    pub stockout_risk: f64,
    pub days_of_cover: Option<f64>,
    pub expected_lead_time_demand: f64,
    pub safety_stock: f64,
    pub reorder_point: f64,
    pub reorder_trigger_probability: f64,
    #[serde(default)]
    pub reorder_quantity: SenaReorderQuantityRecommendation,
    pub lead_time_mean_days: f64,
    pub lead_time_std_days: f64,
    pub regime_probabilities: BTreeMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaReorderQuantityRecommendation {
    pub recommended_units: f64,
    pub ungated_recommended_units: f64,
    pub likely_range_low: f64,
    pub likely_range_high: f64,
    pub need_probability: f64,
    pub recommendation_issued: bool,
    pub recommendation_quantile: f64,
    pub interval_low_quantile: f64,
    pub interval_high_quantile: f64,
    pub need_probability_gate: f64,
    pub review_delay_days: f64,
}

impl Default for SenaReorderQuantityRecommendation {
    fn default() -> Self {
        Self {
            recommended_units: 0.0,
            ungated_recommended_units: 0.0,
            likely_range_low: 0.0,
            likely_range_high: 0.0,
            need_probability: 0.0,
            recommendation_issued: false,
            recommendation_quantile: 0.70,
            interval_low_quantile: 0.10,
            interval_high_quantile: 0.90,
            need_probability_gate: 0.50,
            review_delay_days: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaSkuDetail {
    pub summary: SenaSkuSummary,
    pub inventory_posterior: Vec<SenaTrajectoryPoint>,
    pub demand_posterior: Vec<SenaIntervalPosterior>,
    pub pipeline_posterior: Vec<SenaPipelinePosteriorPoint>,
    pub lead_time_posterior: Vec<SenaLeadTimePosteriorPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaServiceDetail {
    pub service_id: String,
    pub activity_mean: f64,
    pub activity_interval_low: f64,
    pub activity_interval_high: f64,
    pub bottleneck_probability: f64,
    pub contributors: Vec<SenaServiceContributor>,
    pub regime_timeline: Vec<SenaRegimePosteriorPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaServiceContributor {
    pub sku_id: String,
    pub usage_probability: f64,
    pub bottleneck_probability: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reorder_quantity: Option<SenaReorderQuantityRecommendation>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaDiagnostics {
    pub effective_sample_size_mean: f64,
    pub resampling_count: usize,
    pub smoothing_enabled: bool,
    pub change_point_probability: f64,
    pub latest_change_point_probability: f64,
    pub seasonality_active: bool,
    pub posterior_predictive_error_mean: f64,
    pub coverage_estimate: f64,
    pub regime_history: Vec<SenaRegimePosteriorPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaRegimePosteriorPoint {
    pub interval_index: usize,
    pub start_at: String,
    pub end_at: String,
    pub dominant_regime: String,
    pub regime_probabilities: BTreeMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaTrajectoryPoint {
    pub at: String,
    pub mean: f64,
    pub low: f64,
    pub high: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaIntervalPosterior {
    pub interval_index: usize,
    pub start_at: String,
    pub end_at: String,
    pub delta_days: f64,
    pub service_demand_mean: f64,
    pub retail_demand_mean: f64,
    pub unconstrained_demand_mean: f64,
    pub realized_consumption_mean: f64,
    pub lost_demand_mean: f64,
    pub adjustments_mean: f64,
    pub receipts_mean: f64,
    pub pre_clamp_inventory_mean: f64,
    pub inventory_position_mean: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaPipelinePosteriorPoint {
    pub interval_index: usize,
    pub in_transit_mean: f64,
    pub order_probability: f64,
    pub order_quantity_mean: f64,
    pub receipt_quantity_mean: f64,
    pub age_days_mean: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaLeadTimePosteriorPoint {
    pub interval_index: usize,
    pub log_mean_days: f64,
    pub log_std_days: f64,
    pub log_variance_days_squared: f64,
    pub mean_days: f64,
    pub std_days: f64,
    pub variance_days_squared: f64,
    pub shape_sigma: f64,
    pub observed_variability_class: Option<SenaLeadTimeVariabilityClass>,
    pub observed_relative_width: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaAnalysisResult {
    pub workspace_summary: SenaWorkspaceSummary,
    pub sku_details: Vec<SenaSkuDetail>,
    pub service_details: Vec<SenaServiceDetail>,
    pub diagnostics: SenaDiagnostics,
}

fn default_true() -> bool {
    true
}

impl SenaCatalog {
    pub fn validate(&self) -> Result<()> {
        if self.schema_version != SENA_SCHEMA_VERSION {
            return Err(anyhow!("schemaVersion must be {}", SENA_SCHEMA_VERSION));
        }
        if self.skus.is_empty() {
            return Err(anyhow!("catalog must include at least one sku"));
        }
        let mut sku_ids = HashSet::new();
        for sku in &self.skus {
            validate_identifier("skuId", &sku.sku_id)?;
            validate_non_empty("sku name", &sku.name)?;
            if !sku_ids.insert(sku.sku_id.clone()) {
                return Err(anyhow!("duplicate skuId '{}'", sku.sku_id));
            }
        }
        let mut service_ids = HashSet::new();
        for service in &self.services {
            validate_identifier("serviceId", &service.service_id)?;
            validate_non_empty("service name", &service.name)?;
            if !service_ids.insert(service.service_id.clone()) {
                return Err(anyhow!("duplicate serviceId '{}'", service.service_id));
            }
            if sku_ids.contains(&service.service_id) {
                return Err(anyhow!(
                    "serviceId '{}' conflicts with existing skuId",
                    service.service_id
                ));
            }
        }
        for entry in &self.sharing_mask {
            if !service_ids.contains(&entry.service_id) {
                return Err(anyhow!(
                    "sharingMask references unknown serviceId '{}'",
                    entry.service_id
                ));
            }
            if !sku_ids.contains(&entry.sku_id) {
                return Err(anyhow!(
                    "sharingMask references unknown skuId '{}'",
                    entry.sku_id
                ));
            }
            if let Some(probability) = entry.usage_probability {
                if !(0.0..=1.0).contains(&probability) {
                    return Err(anyhow!("usageProbability must be between 0 and 1"));
                }
            }
        }
        Ok(())
    }
}

impl SenaObservationInput {
    pub fn has_structured_signal(&self) -> bool {
        !self.stock_snapshot.is_empty()
            || !self.retail_sales_snapshot.is_empty()
            || !self.service_sales_snapshot.is_empty()
            || !self.service_rankings.is_empty()
            || !self.retail_rankings.is_empty()
            || !self.service_stockouts.is_empty()
            || !self.retail_stockouts.is_empty()
            || !self.order_signals.is_empty()
            || !self.service_prices.is_empty()
            || !self.retail_prices.is_empty()
            || !self.lead_time_hints.is_empty()
            || self.regime_hint.is_some()
            || !self.adjustment_signals.is_empty()
            || !self.commercial_events.is_empty()
            || !self.ticket_events.is_empty()
            || !self.recipe_usage_hints.is_empty()
            || self.delivery_fee.is_some()
            || self.discount.is_some()
    }

    pub fn validate(&self) -> Result<()> {
        if !self.has_structured_signal() {
            return Err(anyhow!(
                "observation must include at least one structured signal"
            ));
        }
        OffsetDateTime::parse(
            &self.observed_at,
            &time::format_description::well_known::Rfc3339,
        )
        .map_err(|err| anyhow!("observedAt must be RFC3339: {err}"))?;
        let mut seen = HashSet::new();
        for snapshot in &self.stock_snapshot {
            validate_identifier("skuId", &snapshot.sku_id)?;
            if snapshot.units_in_stock < 0.0 {
                return Err(anyhow!("unitsInStock must be >= 0"));
            }
            if let Some(cost) = snapshot.cost_per_unit {
                if !cost.is_finite() || cost < 0.0 {
                    return Err(anyhow!("costPerUnit must be >= 0"));
                }
            }
            if let Some(price) = snapshot.product_price {
                if !price.is_finite() || price < 0.0 {
                    return Err(anyhow!("productPrice must be >= 0"));
                }
            }
            if !seen.insert(snapshot.sku_id.clone()) {
                return Err(anyhow!(
                    "duplicate stockSnapshot skuId '{}'",
                    snapshot.sku_id
                ));
            }
        }
        let mut seen_retail_sales = HashSet::new();
        for snapshot in &self.retail_sales_snapshot {
            validate_identifier("retailSalesSnapshot[].skuId", &snapshot.sku_id)?;
            if !snapshot.units_sold.is_finite() || snapshot.units_sold < 0.0 {
                return Err(anyhow!("retailSalesSnapshot[].unitsSold must be >= 0"));
            }
            if !seen_retail_sales.insert(snapshot.sku_id.clone()) {
                return Err(anyhow!(
                    "duplicate retailSalesSnapshot skuId '{}'",
                    snapshot.sku_id
                ));
            }
        }
        let mut seen_service_sales = HashSet::new();
        for snapshot in &self.service_sales_snapshot {
            validate_identifier("serviceSalesSnapshot[].serviceId", &snapshot.service_id)?;
            if !snapshot.units_sold.is_finite() || snapshot.units_sold < 0.0 {
                return Err(anyhow!("serviceSalesSnapshot[].unitsSold must be >= 0"));
            }
            if !seen_service_sales.insert(snapshot.service_id.clone()) {
                return Err(anyhow!(
                    "duplicate serviceSalesSnapshot serviceId '{}'",
                    snapshot.service_id
                ));
            }
        }
        for service_id in &self.service_rankings {
            validate_identifier("serviceRankings[]", service_id)?;
        }
        for sku_id in &self.retail_rankings {
            validate_identifier("retailRankings[]", sku_id)?;
        }
        for service_id in &self.service_stockouts {
            validate_identifier("serviceStockouts[]", service_id)?;
        }
        for sku_id in &self.retail_stockouts {
            validate_identifier("retailStockouts[]", sku_id)?;
        }
        for price in &self.service_prices {
            validate_identifier("servicePrices[].serviceId", &price.service_id)?;
            if !price.price.is_finite() || price.price < 0.0 {
                return Err(anyhow!("servicePrices[].price must be >= 0"));
            }
        }
        for price in &self.retail_prices {
            validate_identifier("retailPrices[].skuId", &price.sku_id)?;
            if !price.price.is_finite() || price.price < 0.0 {
                return Err(anyhow!("retailPrices[].price must be >= 0"));
            }
        }
        for hint in &self.lead_time_hints {
            validate_identifier("leadTimeHints[].skuId", &hint.sku_id)?;
            if let Some(days) = hint.typical_days {
                if !days.is_finite() || days < 0.0 {
                    return Err(anyhow!("leadTimeHints[].typicalDays must be >= 0"));
                }
            }
            if let Some(days) = hint.low_days {
                if !days.is_finite() || days < 0.0 {
                    return Err(anyhow!("leadTimeHints[].lowDays must be >= 0"));
                }
            }
            if let Some(days) = hint.high_days {
                if !days.is_finite() || days < 0.0 {
                    return Err(anyhow!("leadTimeHints[].highDays must be >= 0"));
                }
            }
            validate_lead_time_range(hint.low_days, hint.high_days)?;
            if hint.variability_class.is_none()
                && derive_variability_class(None, hint.low_days, hint.high_days).is_none()
                && hint.typical_days.is_none()
            {
                return Err(anyhow!(
                    "leadTimeHints[] must include typicalDays, variabilityClass, or low/high range"
                ));
            }
        }
        for signal in &self.order_signals {
            validate_identifier("orderSignals[].skuId", &signal.sku_id)?;
            if let Some(quantity) = signal.approximate_order_quantity {
                if !quantity.is_finite() || quantity < 0.0 {
                    return Err(anyhow!(
                        "orderSignals[].approximateOrderQuantity must be >= 0"
                    ));
                }
            }
            if let Some(quantity) = signal.approximate_receipt_quantity {
                if !quantity.is_finite() || quantity < 0.0 {
                    return Err(anyhow!(
                        "orderSignals[].approximateReceiptQuantity must be >= 0"
                    ));
                }
            }
            if let Some(days) = signal.lead_time_days_hint {
                if !days.is_finite() || days < 0.0 {
                    return Err(anyhow!("orderSignals[].leadTimeDaysHint must be >= 0"));
                }
            }
            if let Some(timestamp) = &signal.placement_timestamp {
                OffsetDateTime::parse(timestamp, &time::format_description::well_known::Rfc3339)
                    .map_err(|err| {
                        anyhow!("orderSignals[].placementTimestamp must be RFC3339: {err}")
                    })?;
            }
            if let Some(timestamp) = &signal.receipt_timestamp {
                OffsetDateTime::parse(timestamp, &time::format_description::well_known::Rfc3339)
                    .map_err(|err| {
                        anyhow!("orderSignals[].receiptTimestamp must be RFC3339: {err}")
                    })?;
            }
        }
        for signal in &self.adjustment_signals {
            validate_identifier("adjustmentSignals[].skuId", &signal.sku_id)?;
            validate_non_empty("adjustmentSignals[].reason", &signal.reason)?;
            if !signal.quantity_delta.is_finite() {
                return Err(anyhow!("adjustmentSignals[].quantityDelta must be finite"));
            }
        }
        for event in &self.commercial_events {
            validate_identifier("commercialEvents[].entityId", &event.entity_id)?;
            if !event.quantity_delta.is_finite() {
                return Err(anyhow!("commercialEvents[].quantityDelta must be finite"));
            }
            if let Some(reason) = &event.reason {
                validate_non_empty("commercialEvents[].reason", reason)?;
            }
        }
        for event in &self.ticket_events {
            validate_ticket_event(event)?;
        }
        for hint in &self.recipe_usage_hints {
            validate_identifier("recipeUsageHints[].serviceId", &hint.service_id)?;
            validate_identifier("recipeUsageHints[].skuId", &hint.sku_id)?;
            if !hint.usage_probability.is_finite() || !(0.0..=1.0).contains(&hint.usage_probability)
            {
                return Err(anyhow!(
                    "recipeUsageHints[].usageProbability must be between 0 and 1"
                ));
            }
            if !hint.typical_units_per_instance.is_finite() || hint.typical_units_per_instance < 0.0
            {
                return Err(anyhow!(
                    "recipeUsageHints[].typicalUnitsPerInstance must be >= 0"
                ));
            }
            if !hint.variability.is_finite() || hint.variability < 0.0 {
                return Err(anyhow!("recipeUsageHints[].variability must be >= 0"));
            }
        }
        if let Some(delivery_fee) = &self.delivery_fee {
            validate_delivery_fee_metadata(delivery_fee)?;
        }
        if let Some(discount) = &self.discount {
            validate_discount_metadata(discount)?;
        }
        Ok(())
    }
}

fn validate_ticket_event(event: &SenaTicketEvent) -> Result<()> {
    validate_identifier("ticketEvents[].ticketId", &event.ticket_id)?;
    if event.revision < 0 {
        return Err(anyhow!("ticketEvents[].revision must be >= 0"));
    }
    validate_ticket_family_stage_event(event)?;
    validate_rfc3339("ticketEvents[].occurredAt", &event.occurred_at)?;
    if let Some(timestamp) = &event.next_touch_at {
        validate_rfc3339("ticketEvents[].nextTouchAt", timestamp)?;
    }
    if let Some(party) = &event.party {
        validate_ticket_party_metadata(party)?;
    }
    if event.lines.is_empty() {
        return Err(anyhow!("ticketEvents[].lines must not be empty"));
    }
    for line in &event.lines {
        validate_ticket_line(line)?;
    }
    if let Some(delivery_fee) = &event.delivery_fee {
        validate_delivery_fee_metadata(delivery_fee)?;
    }
    if let Some(discount) = &event.discount {
        validate_discount_metadata(discount)?;
    }
    Ok(())
}

fn validate_ticket_family_stage_event(event: &SenaTicketEvent) -> Result<()> {
    let valid = match event.ticket_family {
        SenaTicketFamily::Customer => match event.stage {
            SenaTicketStage::Pending => matches!(
                event.event_type,
                SenaTicketEventType::Created
                    | SenaTicketEventType::Revised
                    | SenaTicketEventType::NoteAdded
                    | SenaTicketEventType::EtaUpdated
                    | SenaTicketEventType::FollowupLogged
                    | SenaTicketEventType::Canceled
            ),
            SenaTicketStage::Ready => matches!(
                event.event_type,
                SenaTicketEventType::ReadyMarked
                    | SenaTicketEventType::Revised
                    | SenaTicketEventType::NoteAdded
                    | SenaTicketEventType::EtaUpdated
                    | SenaTicketEventType::FollowupLogged
                    | SenaTicketEventType::Canceled
            ),
            SenaTicketStage::FulfilledImmediate => {
                event.event_type == SenaTicketEventType::FulfilledImmediate
            }
            _ => false,
        },
        SenaTicketFamily::Supplier => match event.stage {
            SenaTicketStage::ToOrder => matches!(
                event.event_type,
                SenaTicketEventType::Created
                    | SenaTicketEventType::Revised
                    | SenaTicketEventType::NoteAdded
                    | SenaTicketEventType::Canceled
            ),
            SenaTicketStage::OrderedWaiting => matches!(
                event.event_type,
                SenaTicketEventType::Created
                    | SenaTicketEventType::Revised
                    | SenaTicketEventType::NoteAdded
                    | SenaTicketEventType::EtaUpdated
                    | SenaTicketEventType::FollowupLogged
                    | SenaTicketEventType::PartialReceived
                    | SenaTicketEventType::FullyReceived
                    | SenaTicketEventType::Canceled
            ),
            SenaTicketStage::PartialReceived => matches!(
                event.event_type,
                SenaTicketEventType::PartialReceived
                    | SenaTicketEventType::Revised
                    | SenaTicketEventType::NoteAdded
                    | SenaTicketEventType::EtaUpdated
                    | SenaTicketEventType::FollowupLogged
                    | SenaTicketEventType::FullyReceived
                    | SenaTicketEventType::Canceled
            ),
            SenaTicketStage::Received => matches!(
                event.event_type,
                SenaTicketEventType::FullyReceived
                    | SenaTicketEventType::Revised
                    | SenaTicketEventType::NoteAdded
            ),
            _ => false,
        },
        SenaTicketFamily::Adjustment => match event.stage {
            SenaTicketStage::Draft => matches!(
                event.event_type,
                SenaTicketEventType::Created
                    | SenaTicketEventType::Revised
                    | SenaTicketEventType::NoteAdded
                    | SenaTicketEventType::Canceled
            ),
            SenaTicketStage::Applied => matches!(
                event.event_type,
                SenaTicketEventType::Applied
                    | SenaTicketEventType::Revised
                    | SenaTicketEventType::NoteAdded
            ),
            _ => false,
        },
    };
    if !valid {
        return Err(anyhow!(
            "ticketEvents[] family, stage, and eventType are incompatible"
        ));
    }
    if event.lifecycle == SenaTicketLifecycle::Canceled
        && event.event_type != SenaTicketEventType::Canceled
    {
        return Err(anyhow!(
            "ticketEvents[] canceled lifecycle requires canceled eventType"
        ));
    }
    if event.event_type == SenaTicketEventType::Canceled
        && event.lifecycle != SenaTicketLifecycle::Canceled
    {
        return Err(anyhow!(
            "ticketEvents[] canceled eventType requires canceled lifecycle"
        ));
    }
    Ok(())
}

fn validate_ticket_party_metadata(metadata: &SenaTicketPartyMetadata) -> Result<()> {
    validate_non_empty("ticketEvents[].party.role", &metadata.role)?;
    for (label, value) in [
        (
            "ticketEvents[].party.channelKey",
            metadata.channel_key.as_deref(),
        ),
        (
            "ticketEvents[].party.channelLabel",
            metadata.channel_label.as_deref(),
        ),
        (
            "ticketEvents[].party.customerName",
            metadata.customer_name.as_deref(),
        ),
        (
            "ticketEvents[].party.customerNameKey",
            metadata.customer_name_key.as_deref(),
        ),
        ("ticketEvents[].party.phone", metadata.phone.as_deref()),
        (
            "ticketEvents[].party.phoneKey",
            metadata.phone_key.as_deref(),
        ),
        (
            "ticketEvents[].party.supplierName",
            metadata.supplier_name.as_deref(),
        ),
    ] {
        if let Some(value) = value {
            validate_non_empty(label, value)?;
        }
    }
    Ok(())
}

fn validate_ticket_line(line: &SenaTicketLine) -> Result<()> {
    validate_identifier("ticketEvents[].lines[].entityId", &line.entity_id)?;
    if let Some(quantity) = line.quantity_delta {
        if !quantity.is_finite() {
            return Err(anyhow!(
                "ticketEvents[].lines[].quantityDelta must be finite"
            ));
        }
    }
    for (label, value) in [
        (
            "ticketEvents[].lines[].orderedQuantity",
            line.ordered_quantity,
        ),
        (
            "ticketEvents[].lines[].receivedQuantity",
            line.received_quantity,
        ),
        ("ticketEvents[].lines[].unitCost", line.unit_cost),
    ] {
        if let Some(value) = value {
            if !value.is_finite() || value < 0.0 {
                return Err(anyhow!("{label} must be >= 0"));
            }
        }
    }
    if let Some(timestamp) = &line.promised_at {
        validate_rfc3339("ticketEvents[].lines[].promisedAt", timestamp)?;
    }
    if let Some(timestamp) = &line.expected_arrival_at {
        validate_rfc3339("ticketEvents[].lines[].expectedArrivalAt", timestamp)?;
    }
    if let Some(note) = &line.note {
        validate_non_empty("ticketEvents[].lines[].note", note)?;
    }
    Ok(())
}

fn validate_rfc3339(label: &str, value: &str) -> Result<()> {
    OffsetDateTime::parse(value, &time::format_description::well_known::Rfc3339)
        .map_err(|err| anyhow!("{label} must be RFC3339: {err}"))?;
    Ok(())
}

fn validate_delivery_fee_metadata(metadata: &SenaDeliveryFeeMetadata) -> Result<()> {
    if let Some(value) = metadata.fee_usd {
        if !value.is_finite() || value < 0.0 {
            return Err(anyhow!("deliveryFee.feeUsd must be >= 0"));
        }
    }
    for (label, value, allow_negative) in [
        ("deliveryFee.subtotalUsd", metadata.subtotal_usd, false),
        (
            "deliveryFee.displayDeliveryUsd",
            metadata.display_delivery_usd,
            false,
        ),
        (
            "deliveryFee.displayTotalUsd",
            metadata.display_total_usd,
            false,
        ),
        (
            "deliveryFee.netSettlementUsd",
            metadata.net_settlement_usd,
            true,
        ),
    ] {
        if let Some(value) = value {
            if !value.is_finite() || (!allow_negative && value < 0.0) {
                return Err(anyhow!("{label} must be a finite number"));
            }
        }
    }
    Ok(())
}

fn validate_discount_metadata(metadata: &SenaDiscountMetadata) -> Result<()> {
    if let Some(value) = metadata.amount_usd {
        if !value.is_finite() || value < 0.0 {
            return Err(anyhow!("discount.amountUsd must be >= 0"));
        }
    }
    if let Some(value) = metadata.percent {
        if !value.is_finite() || !(0.0..=100.0).contains(&value) {
            return Err(anyhow!("discount.percent must be between 0 and 100"));
        }
    }
    for (label, value) in [
        ("discount.subtotalUsd", metadata.subtotal_usd),
        ("discount.displayDiscountUsd", metadata.display_discount_usd),
        (
            "discount.discountedSubtotalUsd",
            metadata.discounted_subtotal_usd,
        ),
    ] {
        if let Some(value) = value {
            if !value.is_finite() || value < 0.0 {
                return Err(anyhow!("{label} must be a finite non-negative number"));
            }
        }
    }
    Ok(())
}

pub fn validate_identifier(label: &str, value: &str) -> Result<()> {
    validate_non_empty(label, value)?;
    if value.len() > 80 {
        return Err(anyhow!("{label} must be <= 80 chars"));
    }
    Ok(())
}

pub fn validate_non_empty(label: &str, value: &str) -> Result<()> {
    if value.trim().is_empty() {
        return Err(anyhow!("{label} must not be empty"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        SenaCatalog, SenaLeadTimeHint, SenaObservationInput, SenaService, SenaSku,
        SenaStockSnapshot, SenaTicketEventType, SenaTicketFamily, SenaTicketLifecycle,
        SenaTicketStage, SENA_SCHEMA_VERSION,
    };
    use crate::lead_time::SenaLeadTimeVariabilityClass;
    use serde_json::{json, Value};

    #[test]
    fn catalog_validation_rejects_cross_type_id_overlap() {
        let catalog = SenaCatalog {
            schema_version: SENA_SCHEMA_VERSION,
            skus: vec![SenaSku {
                sku_id: "shared-id".to_string(),
                name: "SKU".to_string(),
                description: String::new(),
                image_path: None,
                supplier_name: Some("Test supplier".to_string()),
                cost_per_unit: 2.0,
                archived: false,
                sold_as_product: false,
                product_price: None,
                lead_time_mean_days_hint: None,
                lead_time_std_days_hint: None,
            }],
            services: vec![SenaService {
                service_id: "shared-id".to_string(),
                name: "Service".to_string(),
                description: String::new(),
                image_path: None,
                price: 10.0,
                archived: false,
                bundle: false,
            }],
            bundles: Vec::new(),
            sharing_mask: Vec::new(),
        };

        let error = catalog.validate().expect_err("validation should fail");
        assert!(error.to_string().contains("conflicts with existing skuId"));
    }

    #[test]
    fn catalog_serde_defaults_missing_supplier_name() {
        let catalog: SenaCatalog = serde_json::from_str(
            r#"{
                "schemaVersion": 1,
                "skus": [{
                    "skuId": "sku-legacy",
                    "name": "Legacy SKU",
                    "description": "",
                    "costPerUnit": 2.0,
                    "archived": false,
                    "soldAsProduct": false,
                    "productPrice": null,
                    "leadTimeMeanDaysHint": null,
                    "leadTimeStdDaysHint": null
                }],
                "services": [],
                "bundles": [],
                "sharingMask": []
            }"#,
        )
        .expect("legacy catalog should deserialize");

        assert_eq!(catalog.skus[0].supplier_name, None);
    }

    #[test]
    fn observation_validation_accepts_explicit_variability_class() {
        let observation = SenaObservationInput {
            observed_at: "2026-04-03T00:00:00Z".to_string(),
            stock_snapshot: vec![SenaStockSnapshot {
                sku_id: "sku-1".to_string(),
                units_in_stock: 10.0,
                cost_per_unit: Some(2.0),
                product_price: Some(4.0),
            }],
            retail_sales_snapshot: Vec::new(),
            service_sales_snapshot: Vec::new(),
            service_rankings: Vec::new(),
            retail_rankings: Vec::new(),
            service_stockouts: Vec::new(),
            retail_stockouts: Vec::new(),
            order_signals: Vec::new(),
            service_prices: Vec::new(),
            retail_prices: Vec::new(),
            lead_time_hints: vec![SenaLeadTimeHint {
                sku_id: "sku-1".to_string(),
                typical_days: Some(4.0),
                low_days: None,
                high_days: None,
                variability_class: Some(SenaLeadTimeVariabilityClass::Wide),
            }],
            regime_hint: None,
            adjustment_signals: Vec::new(),
            commercial_events: Vec::new(),
            ticket_events: Vec::new(),
            delivery_fee: None,
            discount: None,
            recipe_usage_hints: Vec::new(),
            notes: None,
        };

        observation.validate().expect("observation should validate");
    }

    #[test]
    fn observation_validation_rejects_notes_only_payload() {
        let observation = SenaObservationInput {
            observed_at: "2026-04-03T00:00:00Z".to_string(),
            stock_snapshot: Vec::new(),
            retail_sales_snapshot: Vec::new(),
            service_sales_snapshot: Vec::new(),
            service_rankings: Vec::new(),
            retail_rankings: Vec::new(),
            service_stockouts: Vec::new(),
            retail_stockouts: Vec::new(),
            order_signals: Vec::new(),
            service_prices: Vec::new(),
            retail_prices: Vec::new(),
            lead_time_hints: Vec::new(),
            regime_hint: None,
            adjustment_signals: Vec::new(),
            commercial_events: Vec::new(),
            ticket_events: Vec::new(),
            delivery_fee: None,
            discount: None,
            recipe_usage_hints: Vec::new(),
            notes: Some("operator note only".to_string()),
        };

        let error = observation.validate().expect_err("validation should fail");
        assert!(error
            .to_string()
            .contains("observation must include at least one structured signal"));
    }

    #[test]
    fn observation_validation_accepts_signal_only_payload() {
        let observation = serde_json::from_str::<SenaObservationInput>(
            r#"{
              "observedAt": "2026-04-03T00:00:00Z",
              "stockSnapshot": [],
              "serviceRankings": ["service-1"],
              "retailRankings": ["sku-1"],
              "serviceStockouts": ["service-1"],
              "retailStockouts": ["sku-1"],
              "orderSignals": [{
                "skuId": "sku-1",
                "orderPlaced": true,
                "receiptArrived": false,
                "approximateOrderQuantity": 8,
                "approximateReceiptQuantity": null
              }],
              "servicePrices": [{"serviceId": "service-1", "price": 15}],
              "retailPrices": [{"skuId": "sku-1", "price": 9}],
              "leadTimeHints": [],
              "adjustmentSignals": [{"skuId": "sku-1", "quantityDelta": -1, "reason": "write_off"}],
              "recipeUsageHints": [],
              "notes": "Signal-only sparse update"
            }"#,
        )
        .expect("observation should parse");

        observation.validate().expect("observation should validate");
    }

    #[test]
    fn observation_validation_accepts_ticket_only_payload() {
        let observation = serde_json::from_str::<SenaObservationInput>(
            r#"{
              "observedAt": "2026-04-03T00:00:00Z",
              "stockSnapshot": [],
              "ticketEvents": [{
                "ticketId": "ticket:customer:1",
                "ticketFamily": "customer",
                "lifecycle": "open",
                "stage": "pending",
                "revision": 1,
                "eventType": "created",
                "occurredAt": "2026-04-03T00:00:00Z",
                "nextTouchAt": null,
                "party": {
                  "role": "customer",
                  "channelKey": "walk-in",
                  "channelLabel": "Walk-in",
                  "customerName": "Dara",
                  "customerNameKey": "dara",
                  "phone": null,
                  "phoneKey": null
                },
                "lines": [{
                  "entityType": "sku",
                  "entityId": "sku-1",
                  "quantityDelta": 2
                }],
                "deliveryFee": {
                  "feeUsd": 2.5,
                  "payer": "customer",
                  "bucket": "customer_order",
                  "subtotalUsd": 25,
                  "displayDeliveryUsd": 2.5,
                  "displayTotalUsd": 27.5,
                  "netSettlementUsd": 27.5
                },
                "discount": {
                  "mode": "amount",
                  "amountUsd": 1.5,
                  "percent": null,
                  "subtotalUsd": 25,
                  "displayDiscountUsd": 1.5,
                  "discountedSubtotalUsd": 23.5
                },
                "note": null
              }],
              "notes": null
            }"#,
        )
        .expect("observation should parse");

        observation.validate().expect("observation should validate");
    }

    #[test]
    fn observation_validation_rejects_malformed_ticket_events() {
        for (label, update, expected_error) in [
            (
                "blank ticket id",
                json!({"ticketId": "   "}),
                "ticketEvents[].ticketId must not be empty",
            ),
            (
                "negative revision",
                json!({"revision": -1}),
                "ticketEvents[].revision must be >= 0",
            ),
            (
                "bad occurred at",
                json!({"occurredAt": "not-a-date"}),
                "ticketEvents[].occurredAt must be RFC3339",
            ),
            (
                "bad next touch at",
                json!({"nextTouchAt": "not-a-date"}),
                "ticketEvents[].nextTouchAt must be RFC3339",
            ),
            (
                "blank party key",
                json!({"party": {"customerNameKey": " "}}),
                "ticketEvents[].party.customerNameKey must not be empty",
            ),
            (
                "empty ticket lines",
                json!({"lines": []}),
                "ticketEvents[].lines must not be empty",
            ),
            (
                "blank line entity",
                json!({"lines": [{"entityType": "sku", "entityId": ""}]}),
                "ticketEvents[].lines[].entityId must not be empty",
            ),
            (
                "negative line quantity",
                json!({"lines": [{"entityType": "sku", "entityId": "sku-1", "orderedQuantity": -1}]}),
                "ticketEvents[].lines[].orderedQuantity must be >= 0",
            ),
            (
                "bad line timestamp",
                json!({"lines": [{"entityType": "sku", "entityId": "sku-1", "expectedArrivalAt": "tomorrow"}]}),
                "ticketEvents[].lines[].expectedArrivalAt must be RFC3339",
            ),
            (
                "negative nested delivery fee",
                json!({"deliveryFee": {"feeUsd": -1}}),
                "deliveryFee.feeUsd must be >= 0",
            ),
            (
                "invalid nested discount",
                json!({"discount": {"percent": 101}}),
                "discount.percent must be between 0 and 100",
            ),
        ] {
            let mut observation = valid_ticket_observation_value();
            merge_json(&mut observation["ticketEvents"][0], update);
            let observation = serde_json::from_value::<SenaObservationInput>(observation)
                .unwrap_or_else(|err| panic!("{label} should deserialize: {err}"));

            let error = observation
                .validate()
                .expect_err(&format!("{label} should fail validation"));
            assert!(
                error.to_string().contains(expected_error),
                "{label} returned unexpected error: {error}"
            );
        }
    }

    #[test]
    fn observation_validation_rejects_incompatible_ticket_state() {
        for (label, family, lifecycle, stage, event_type, expected_error) in [
            (
                "customer cannot enter supplier stage",
                SenaTicketFamily::Customer,
                SenaTicketLifecycle::Open,
                SenaTicketStage::OrderedWaiting,
                SenaTicketEventType::Created,
                "ticketEvents[] family, stage, and eventType are incompatible",
            ),
            (
                "supplier cannot use customer fulfillment event",
                SenaTicketFamily::Supplier,
                SenaTicketLifecycle::Open,
                SenaTicketStage::OrderedWaiting,
                SenaTicketEventType::FulfilledImmediate,
                "ticketEvents[] family, stage, and eventType are incompatible",
            ),
            (
                "canceled lifecycle requires canceled event",
                SenaTicketFamily::Customer,
                SenaTicketLifecycle::Canceled,
                SenaTicketStage::Pending,
                SenaTicketEventType::Revised,
                "ticketEvents[] canceled lifecycle requires canceled eventType",
            ),
            (
                "canceled event requires canceled lifecycle",
                SenaTicketFamily::Customer,
                SenaTicketLifecycle::Open,
                SenaTicketStage::Pending,
                SenaTicketEventType::Canceled,
                "ticketEvents[] canceled eventType requires canceled lifecycle",
            ),
        ] {
            let mut observation = valid_ticket_observation_value();
            observation["ticketEvents"][0]["ticketFamily"] = json!(family);
            observation["ticketEvents"][0]["lifecycle"] = json!(lifecycle);
            observation["ticketEvents"][0]["stage"] = json!(stage);
            observation["ticketEvents"][0]["eventType"] = json!(event_type);
            let observation = serde_json::from_value::<SenaObservationInput>(observation)
                .unwrap_or_else(|err| panic!("{label} should deserialize: {err}"));

            let error = observation
                .validate()
                .expect_err(&format!("{label} should fail validation"));
            assert!(
                error.to_string().contains(expected_error),
                "{label} returned unexpected error: {error}"
            );
        }
    }

    fn valid_ticket_observation_value() -> Value {
        json!({
            "observedAt": "2026-04-03T00:00:00Z",
            "stockSnapshot": [],
            "ticketEvents": [{
                "ticketId": "ticket:customer:1",
                "ticketFamily": "customer",
                "lifecycle": "open",
                "stage": "pending",
                "revision": 1,
                "eventType": "created",
                "occurredAt": "2026-04-03T00:00:00Z",
                "nextTouchAt": "2026-04-04T00:00:00Z",
                "party": {
                    "role": "customer",
                    "channelKey": "walk-in",
                    "channelLabel": "Walk-in",
                    "customerName": "Dara",
                    "customerNameKey": "dara",
                    "phone": "012345678",
                    "phoneKey": "012345678",
                    "supplierName": null
                },
                "lines": [{
                    "entityType": "sku",
                    "entityId": "sku-1",
                    "quantityDelta": 2,
                    "orderedQuantity": 2,
                    "receivedQuantity": 0,
                    "promisedAt": "2026-04-05T00:00:00Z",
                    "expectedArrivalAt": "2026-04-06T00:00:00Z",
                    "unitCost": 3.5,
                    "note": "line note"
                }],
                "deliveryFee": {
                    "feeUsd": 2.5,
                    "payer": "customer",
                    "bucket": "customer_order",
                    "subtotalUsd": 25,
                    "displayDeliveryUsd": 2.5,
                    "displayTotalUsd": 27.5,
                    "netSettlementUsd": 27.5
                },
                "discount": {
                    "mode": "amount",
                    "amountUsd": 1.5,
                    "percent": null,
                    "subtotalUsd": 25,
                    "displayDiscountUsd": 1.5,
                    "discountedSubtotalUsd": 23.5
                },
                "note": null
            }],
            "notes": null
        })
    }

    fn merge_json(target: &mut Value, update: Value) {
        match (target, update) {
            (Value::Object(target), Value::Object(update)) => {
                for (key, value) in update {
                    match target.get_mut(&key) {
                        Some(target_value) => merge_json(target_value, value),
                        None => {
                            target.insert(key, value);
                        }
                    }
                }
            }
            (target, update) => {
                *target = update;
            }
        }
    }

    #[test]
    fn observation_validation_accepts_delivery_fee_only_payload() {
        let observation = serde_json::from_str::<SenaObservationInput>(
            r#"{
              "observedAt": "2026-04-03T00:00:00Z",
              "stockSnapshot": [],
              "deliveryFee": {
                "feeUsd": 2.5,
                "payer": "customer",
                "bucket": "customer_order",
                "subtotalUsd": 25,
                "displayDeliveryUsd": 2.5,
                "displayTotalUsd": 27.5,
                "netSettlementUsd": 27.5
              },
              "notes": null
            }"#,
        )
        .expect("observation should parse");

        observation.validate().expect("observation should validate");
    }

    #[test]
    fn observation_validation_rejects_empty_lead_time_hint() {
        let observation = SenaObservationInput {
            observed_at: "2026-04-03T00:00:00Z".to_string(),
            stock_snapshot: vec![SenaStockSnapshot {
                sku_id: "sku-1".to_string(),
                units_in_stock: 10.0,
                cost_per_unit: Some(2.0),
                product_price: Some(4.0),
            }],
            retail_sales_snapshot: Vec::new(),
            service_sales_snapshot: Vec::new(),
            service_rankings: Vec::new(),
            retail_rankings: Vec::new(),
            service_stockouts: Vec::new(),
            retail_stockouts: Vec::new(),
            order_signals: Vec::new(),
            service_prices: Vec::new(),
            retail_prices: Vec::new(),
            lead_time_hints: vec![SenaLeadTimeHint {
                sku_id: "sku-1".to_string(),
                typical_days: None,
                low_days: None,
                high_days: None,
                variability_class: None,
            }],
            regime_hint: None,
            adjustment_signals: Vec::new(),
            commercial_events: Vec::new(),
            ticket_events: Vec::new(),
            delivery_fee: None,
            discount: None,
            recipe_usage_hints: Vec::new(),
            notes: None,
        };

        let error = observation.validate().expect_err("validation should fail");
        assert!(error.to_string().contains(
            "leadTimeHints[] must include typicalDays, variabilityClass, or low/high range"
        ));
    }

    #[test]
    fn observation_validation_accepts_rich_optional_signals() {
        let observation = serde_json::from_str::<SenaObservationInput>(
            r#"{
              "observedAt": "2026-04-03T00:00:00Z",
              "stockSnapshot": [{"skuId": "sku-1", "unitsInStock": 10, "costPerUnit": 2, "productPrice": 4}],
              "serviceRankings": ["service-1"],
              "retailRankings": ["sku-1"],
              "serviceStockouts": [],
              "retailStockouts": [],
              "orderSignals": [{
                "skuId": "sku-1",
                "orderPlaced": true,
                "receiptArrived": false,
                "approximateOrderQuantity": 8,
                "approximateReceiptQuantity": null,
                "placementTimestamp": "2026-04-02T12:00:00Z",
                "receiptTimestamp": null,
                "leadTimeDaysHint": 4
              }],
              "servicePrices": [],
              "retailPrices": [],
              "leadTimeHints": [],
              "regimeHint": "promo",
              "adjustmentSignals": [{"skuId": "sku-1", "quantityDelta": -1.5, "reason": "write_off"}],
              "recipeUsageHints": [{
                "serviceId": "service-1",
                "skuId": "sku-1",
                "usageProbability": 0.85,
                "typicalUnitsPerInstance": 1.4,
                "variability": 0.22
              }],
              "notes": "Synthetic promo interval"
            }"#,
        )
        .expect("observation should parse");

        observation.validate().expect("observation should validate");
    }

    #[test]
    fn observation_validation_rejects_invalid_recipe_usage_probability() {
        let observation = serde_json::from_str::<SenaObservationInput>(
            r#"{
              "observedAt": "2026-04-03T00:00:00Z",
              "stockSnapshot": [{"skuId": "sku-1", "unitsInStock": 10, "costPerUnit": 2, "productPrice": 4}],
              "serviceRankings": [],
              "retailRankings": [],
              "serviceStockouts": [],
              "retailStockouts": [],
              "orderSignals": [],
              "servicePrices": [],
              "retailPrices": [],
              "leadTimeHints": [],
              "adjustmentSignals": [],
              "recipeUsageHints": [{
                "serviceId": "service-1",
                "skuId": "sku-1",
                "usageProbability": 1.4,
                "typicalUnitsPerInstance": 1.4,
                "variability": 0.22
              }],
              "notes": null
            }"#,
        )
        .expect("observation should parse");

        let error = observation.validate().expect_err("validation should fail");
        assert!(error
            .to_string()
            .contains("recipeUsageHints[].usageProbability must be between 0 and 1"));
    }
}
