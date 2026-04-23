#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import random
import sqlite3
import subprocess
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any


DEFAULT_OWNER = "desktop-owner"
DEFAULT_YEARS = 5
DEFAULT_INTERVAL_DAYS = 3.5
DEV_HISTORY_VERSION = "current-sena-history-v2"


@dataclass
class SkuState:
    sku_id: str
    sold_as_product: bool
    current_units: float
    current_cost: float
    current_price: float | None
    lead_mean_days: float
    lead_std_days: float
    service_links: int
    stock: float
    cost: float
    price: float | None
    base_daily_demand: float
    reorder_point: float
    reorder_target: float
    reorder_batch: float
    phase: float
    trend_slope: float
    trend_bias: float
    reorder_strategy: str
    reorder_discipline: float
    review_period_days: float
    promo_affinity: float
    pending_orders: list["PendingOrder"] = field(default_factory=list)
    last_order_report: int | None = None
    recent_lead_days: float = 0.0


@dataclass
class ServiceState:
    service_id: str
    sku_ids: list[str]
    price: float
    base_activity: float
    phase: float
    promo_affinity: float


@dataclass(frozen=True)
class RegimeWindow:
    start: int
    end: int
    regime: str
    intensity: float


@dataclass(frozen=True)
class PendingOrder:
    arrival_index: int
    quantity: float
    lead_time_days: float
    placement_timestamp: str


def stable_seed(*parts: object) -> int:
    digest = hashlib.sha256("::".join(map(str, parts)).encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big")


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def round_money(value: float) -> float:
    return round(value + 1e-9, 2)


def parse_iso(value: str) -> datetime:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value).astimezone(UTC)


def isoformat_z(value: datetime) -> str:
    return value.astimezone(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def derive_variability_class(typical_days: float, std_days: float) -> str:
    relative_width = (std_days / typical_days) if typical_days > 0 else 0.0
    if relative_width <= 0.12:
        return "very_tight"
    if relative_width <= 0.2:
        return "tight"
    if relative_width <= 0.35:
        return "normal"
    if relative_width <= 0.5:
        return "wide"
    return "very_wide"


def load_store(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def save_store(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n")


def choose_reorder_strategy(rng: random.Random) -> str:
    roll = rng.random()
    if roll < 0.28:
        return "lean"
    if roll < 0.7:
        return "balanced"
    return "bulk"


def build_regime_windows(report_count: int, rng: random.Random) -> list[RegimeWindow]:
    windows: list[RegimeWindow] = []
    cursor = 0
    regimes = [
        ("normal", 1.0),
        ("spike", 1.32),
        ("promo", 1.24),
        ("lull", 0.72),
        ("correction", 0.9),
    ]
    while cursor < report_count:
        span = min(report_count - cursor, rng.randint(6, 22))
        regime, baseline = regimes[rng.randrange(len(regimes))]
        intensity = baseline * rng.uniform(0.9, 1.12)
        windows.append(RegimeWindow(start=cursor, end=cursor + span, regime=regime, intensity=intensity))
        cursor += span
    return windows


def regime_for_report(report_index: int, windows: list[RegimeWindow]) -> RegimeWindow:
    for window in windows:
        if window.start <= report_index < window.end:
            return window
    return windows[-1]


def round_units(value: float) -> float:
    return round(value + 1e-9, 4)


def regime_multiplier(regime: str) -> float:
    return {
        "normal": 1.0,
        "spike": 1.3,
        "lull": 0.72,
        "promo": 1.24,
        "correction": 0.92,
        "stockout_constrained": 1.08,
    }.get(regime, 1.0)


def interval_timestamp(day_at: datetime, hour: int) -> str:
    return isoformat_z(day_at.replace(hour=hour, minute=0, second=0, microsecond=0))


def recipe_profiles_for_service(
    service: dict[str, Any],
    report_index: int,
    regime: str,
) -> list[dict[str, Any]]:
    profiles: list[dict[str, Any]] = []
    for link_index, sku_id in enumerate(service.get("skuIds", [])):
        rng = random.Random(stable_seed("recipe", service["serviceId"], report_index, link_index))
        base_probability = clamp(0.82 - link_index * 0.12 + rng.uniform(-0.04, 0.05), 0.22, 0.96)
        if service.get("bundle"):
            base_probability = clamp(base_probability + 0.08, 0.22, 0.98)
        if regime == "promo" and service.get("bundle"):
            base_probability = clamp(base_probability + 0.07, 0.22, 0.98)
        if regime == "lull":
            base_probability = clamp(base_probability - 0.05, 0.18, 0.98)
        typical_units = max(
            0.12,
            0.55 + link_index * 0.18 + (0.28 if service.get("bundle") else 0.08) + rng.uniform(-0.05, 0.1),
        )
        if regime == "promo":
            typical_units += 0.1
        variability = clamp(0.18 + link_index * 0.04 + rng.uniform(0.0, 0.08), 0.08, 0.48)
        profiles.append(
            {
                "serviceId": service["serviceId"],
                "skuId": sku_id,
                "usageProbability": round(clamp(base_probability, 0.18, 0.98), 2),
                "typicalUnitsPerInstance": round(typical_units, 2),
                "variability": round(variability, 2),
            }
        )
    return profiles


def reorder_policy_for_strategy(
    strategy: str,
    opening_units: float,
    base_daily: float,
    lead_mean: float,
    rng: random.Random,
) -> tuple[float, float, float, float, float]:
    if strategy == "lean":
        reorder_point = max(6.0, base_daily * (lead_mean + 3.5) * rng.uniform(0.72, 0.95))
        reorder_target = max(reorder_point + 8.0, opening_units * rng.uniform(0.55, 0.85))
        review_period_days = rng.uniform(3.0, 7.0)
        discipline = rng.uniform(0.62, 0.82)
    elif strategy == "bulk":
        reorder_point = max(12.0, base_daily * (lead_mean + 10.5) * rng.uniform(1.05, 1.38))
        reorder_target = max(reorder_point + 20.0, opening_units * rng.uniform(1.15, 1.55))
        review_period_days = rng.uniform(7.0, 14.0)
        discipline = rng.uniform(0.88, 0.98)
    else:
        reorder_point = max(8.0, base_daily * (lead_mean + 7.0) * rng.uniform(0.9, 1.18))
        reorder_target = max(reorder_point + 14.0, opening_units * rng.uniform(0.82, 1.18))
        review_period_days = rng.uniform(4.0, 10.0)
        discipline = rng.uniform(0.76, 0.92)

    reorder_batch = max(10.0, reorder_target - reorder_point)
    return reorder_point, reorder_target, reorder_batch, discipline, review_period_days


def build_report_note(regime: str, restock_count: int, retail_stockout_count: int, service_stockout_count: int, adjustment_count: int) -> str:
    regime_note = {
        "normal": "baseline trading flow",
        "spike": "event-driven demand spike",
        "lull": "quiet demand lull",
        "promo": "promotion-led mix shift",
        "correction": "inventory reconciliation window",
        "stockout_constrained": "stockout-constrained selling window",
    }.get(regime, "baseline trading flow")
    fragments = [f"Synthetic Phnom Penh operating interval with {regime_note}."]
    if restock_count >= 2:
        fragments.append("Receipts and replenishment decisions shaped the interval.")
    if retail_stockout_count >= 1 or service_stockout_count >= 1:
        fragments.append("Stock pressure surfaced across linked selling paths.")
    if adjustment_count >= 1:
        fragments.append("Cycle-count adjustments were recorded.")
    return " ".join(fragments)


def build_sku_states(skus: list[dict[str, Any]], services: list[dict[str, Any]]) -> list[SkuState]:
    service_link_counts = {
        sku["skuId"]: sum(1 for service in services if sku["skuId"] in service.get("skuIds", []))
        for sku in skus
    }
    states: list[SkuState] = []
    for index, sku in enumerate(skus):
        rng = random.Random(stable_seed("sku", sku["skuId"], index))
        lead_mean = float(sku.get("leadTimeMeanDays") or 7.0)
        lead_std = float(sku.get("leadTimeStdDays") or max(1.0, lead_mean * 0.25))
        current_units = float(sku.get("unitsInStock") or 0.0)
        opening_units = max(
            18.0,
            current_units * rng.uniform(1.3, 1.9) + rng.uniform(8.0, 28.0),
        )
        service_links = service_link_counts.get(sku["skuId"], 0)
        base_daily = (
            0.3
            + service_links * 0.55
            + (0.65 if sku.get("soldAsProduct") and sku.get("productPrice") is not None else 0.2)
            + min(max(current_units, 0.0), 120.0) / 42.0
            + rng.uniform(-0.18, 0.35)
        )
        base_daily = clamp(base_daily, 0.25, 8.5)
        reorder_strategy = choose_reorder_strategy(rng)
        reorder_point, reorder_target, reorder_batch, reorder_discipline, review_period_days = (
            reorder_policy_for_strategy(reorder_strategy, opening_units, base_daily, lead_mean, rng)
        )
        states.append(
            SkuState(
                sku_id=sku["skuId"],
                sold_as_product=bool(sku.get("soldAsProduct")),
                current_units=current_units,
                current_cost=float(sku.get("costPerUnit") or 0.0),
                current_price=float(sku["productPrice"]) if sku.get("productPrice") is not None else None,
                lead_mean_days=lead_mean,
                lead_std_days=lead_std,
                service_links=service_links,
                stock=opening_units,
                cost=float(sku.get("costPerUnit") or 0.0),
                price=float(sku["productPrice"]) if sku.get("productPrice") is not None else None,
                base_daily_demand=base_daily,
                reorder_point=reorder_point,
                reorder_target=reorder_target,
                reorder_batch=reorder_batch,
                phase=rng.uniform(0.0, math.tau),
                trend_slope=rng.uniform(-0.0018, 0.0025),
                trend_bias=rng.uniform(-0.18, 0.22),
                reorder_strategy=reorder_strategy,
                reorder_discipline=reorder_discipline,
                review_period_days=review_period_days,
                promo_affinity=rng.uniform(0.7, 1.45),
                recent_lead_days=lead_mean,
            )
        )
    return states


def build_service_states(services: list[dict[str, Any]]) -> list[ServiceState]:
    states: list[ServiceState] = []
    for index, service in enumerate(services):
        rng = random.Random(stable_seed("service", service["serviceId"], index))
        states.append(
            ServiceState(
                service_id=service["serviceId"],
                sku_ids=list(service.get("skuIds", [])),
                price=float(service.get("price") or 0.0),
                base_activity=clamp(1.2 + len(service.get("skuIds", [])) * 0.9 + rng.uniform(-0.2, 0.8), 0.9, 7.0),
                phase=rng.uniform(0.0, math.tau),
                promo_affinity=rng.uniform(0.8, 1.35),
            )
        )
    return states


def generate_reports(
    catalog_skus: list[dict[str, Any]],
    catalog_services: list[dict[str, Any]],
    years: int,
    interval_days: float,
    end_at: datetime,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    total_days = int(round(years * 365.25))
    report_count = max(2, int(total_days / interval_days) + 1)
    start_at = end_at - timedelta(days=interval_days * (report_count - 1))
    rng = random.Random(stable_seed("history", years, interval_days, isoformat_z(end_at)))
    sku_states = build_sku_states(catalog_skus, catalog_services)
    service_states = build_service_states(catalog_services)
    regime_windows = build_regime_windows(report_count, rng)
    retail_sku_ids = [sku["skuId"] for sku in catalog_skus if sku.get("soldAsProduct") and sku.get("productPrice") is not None]
    reports: list[dict[str, Any]] = []

    for report_index in range(report_count):
        report_at = start_at + timedelta(days=report_index * interval_days)
        day_of_year = report_at.timetuple().tm_yday
        scheduled_regime = regime_for_report(report_index, regime_windows)
        macro_wave = 1.0 + 0.08 * math.sin(report_index / 11.0) + 0.05 * math.cos(report_index / 19.0)
        service_demand_scores: dict[str, float] = {}
        retail_demand_scores: dict[str, float] = {}
        service_profiles = {service["serviceId"]: recipe_profiles_for_service(service, report_index, scheduled_regime.regime) for service in catalog_services}

        receipts_by_sku: dict[str, float] = {}
        receipt_timestamps: dict[str, str] = {}
        for state in sku_states:
            arriving = [order for order in state.pending_orders if order.arrival_index == report_index]
            state.pending_orders = [order for order in state.pending_orders if order.arrival_index != report_index]
            if arriving:
                receipts_by_sku[state.sku_id] = round_money(sum(order.quantity for order in arriving))
                receipt_timestamps[state.sku_id] = interval_timestamp(report_at, 16)
                state.stock += receipts_by_sku[state.sku_id]
                state.recent_lead_days = sum(order.lead_time_days for order in arriving) / len(arriving)

        service_demand_by_sku: dict[str, float] = {state.sku_id: 0.0 for state in sku_states}
        for service_index, service in enumerate(service_states):
            service_rng = random.Random(stable_seed("service-report", report_index, service.service_id))
            activity = service.base_activity * (1.0 + 0.16 * math.sin((day_of_year / 365.25) * math.tau + service.phase))
            activity *= macro_wave * scheduled_regime.intensity * regime_multiplier(scheduled_regime.regime)
            if scheduled_regime.regime == "promo":
                activity *= service.promo_affinity
            elif scheduled_regime.regime == "lull":
                activity *= service_rng.uniform(0.72, 0.92)
            elif scheduled_regime.regime == "spike":
                activity *= service_rng.uniform(1.12, 1.32)
            elif scheduled_regime.regime == "correction":
                activity *= service_rng.uniform(0.86, 1.02)
            if (report_index + service_index) % 11 == 0:
                activity *= 1.0 + service_rng.uniform(0.12, 0.28)
            service_count = max(0.0, activity)
            service_demand_scores[service.service_id] = service_count

            for profile in service_profiles.get(service.service_id, []):
                sku_rng = random.Random(stable_seed("recipe-draw", report_index, service_index + len(profile["skuId"])))
                usage_noise = max(0.55, 1.0 + sku_rng.uniform(-profile["variability"], profile["variability"]))
                service_demand_by_sku[profile["skuId"]] += (
                    service_count
                    * profile["usageProbability"]
                    * profile["typicalUnitsPerInstance"]
                    * usage_noise
                )

        sku_observations: list[dict[str, Any]] = []
        low_stock_flags: dict[str, bool] = {}
        lost_demand_by_sku: dict[str, float] = {}
        restock_count = 0
        retail_stockout_count = 0
        adjustment_count = 0

        for sku_index, state in enumerate(sku_states):
            sku_rng = random.Random(stable_seed("report", report_index, state.sku_id))
            seasonality = 1.0 + 0.22 * math.sin((day_of_year / 365.25) * math.tau + state.phase)
            month_wave = 1.0 + 0.06 * math.sin(report_index / 4.5 + state.phase / 2.0)
            long_trend = 1.0 + state.trend_slope * report_index + 0.07 * math.sin(report_index / 28.0 + state.trend_bias)
            retail_draw = 0.0
            if state.sold_as_product and state.price is not None:
                retail_draw = max(
                    0.0,
                    state.base_daily_demand
                    * interval_days
                    * seasonality
                    * month_wave
                    * long_trend
                    * macro_wave
                    * regime_multiplier(scheduled_regime.regime)
                    * (state.promo_affinity if scheduled_regime.regime in {"promo", "spike"} else 1.0)
                    * sku_rng.uniform(0.82, 1.18),
                )
            unconstrained_demand = max(0.0, service_demand_by_sku[state.sku_id] + retail_draw)
            retail_demand_scores[state.sku_id] = retail_draw / max(interval_days, 1.0) if state.sold_as_product else 0.0

            inventory_position_gap = max(0.0, state.reorder_target - (state.stock + sum(order.quantity for order in state.pending_orders)))
            age_days = (report_index - state.last_order_report) * interval_days if state.last_order_report is not None else (report_index + 1) * interval_days
            order_probability = clamp(
                0.1
                + (inventory_position_gap / max(state.reorder_target, 1.0)) * 0.74
                + (age_days / max(state.lead_mean_days, 1.0)) * 0.06
                - sum(order.quantity for order in state.pending_orders) / max(state.reorder_batch, 1.0) * 0.18
                + (0.05 if scheduled_regime.regime in {"promo", "spike"} else 0.0),
                0.02,
                0.92,
            )
            order_quantity: float | None = None
            placement_timestamp: str | None = None
            lead_time_days_hint: float | None = None
            if sku_rng.random() < order_probability:
                lead_time_days = max(
                    1.0,
                    state.lead_mean_days
                    + sku_rng.uniform(-state.lead_std_days, state.lead_std_days * 1.25)
                    + (0.6 if scheduled_regime.regime in {"promo", "spike"} else 0.0),
                )
                order_quantity = round_money(
                    max(
                        6.0,
                        state.reorder_batch
                        * (0.86 + inventory_position_gap / max(state.reorder_target, 1.0) * 0.55)
                        * sku_rng.uniform(0.88, 1.18),
                    )
                )
                placement_timestamp = interval_timestamp(report_at, 12)
                lead_time_days_hint = round(lead_time_days, 2)
                state.pending_orders.append(
                    PendingOrder(
                        arrival_index=report_index + max(1, math.ceil(lead_time_days / max(interval_days, 0.5))),
                        quantity=order_quantity,
                        lead_time_days=lead_time_days,
                        placement_timestamp=placement_timestamp,
                    )
                )
                state.last_order_report = report_index
                restock_count += 1

            adjustment_delta = 0.0
            if scheduled_regime.regime == "correction" and (report_index + sku_index) % 3 == 0:
                adjustment_delta = (-1 if (report_index + sku_index) % 2 == 0 else 1) * round_money(sku_rng.uniform(0.8, 3.3))
            elif sku_rng.random() < 0.035:
                adjustment_delta = -round_money(sku_rng.uniform(0.2, 1.1))
            if adjustment_delta != 0.0:
                adjustment_count += 1

            realized_consumption = min(unconstrained_demand, state.stock)
            retail_units_sold = min(retail_draw, realized_consumption) if state.sold_as_product else 0.0
            lost_demand = max(0.0, unconstrained_demand - realized_consumption)
            lost_demand_by_sku[state.sku_id] = lost_demand
            next_stock = max(0.0, state.stock + adjustment_delta - realized_consumption)

            cost_shift = 1.0 + sku_rng.uniform(-0.008, 0.015)
            if receipts_by_sku.get(state.sku_id, 0.0) > 0:
                cost_shift += 0.012 if scheduled_regime.regime == "promo" else 0.006
            next_cost = round_money(max(0.2, state.cost * cost_shift))

            next_price = state.price
            previous_price = state.price
            if next_price is not None:
                should_reprice = (
                    report_index == 0
                    or order_quantity is not None
                    or scheduled_regime.regime in {"promo", "spike", "correction"}
                    or (report_index + sku_index) % 13 == 0
                )
                if should_reprice:
                    price_shift = sku_rng.uniform(-0.025, 0.05)
                    if scheduled_regime.regime == "promo":
                        price_shift -= sku_rng.uniform(0.03, 0.08)
                    elif scheduled_regime.regime == "stockout_constrained":
                        price_shift += sku_rng.uniform(0.02, 0.05)
                    next_price = round_money(max(next_cost * 1.35, next_price * (1.0 + price_shift)))

            retail_stockout = state.sold_as_product and (
                lost_demand > 0.35 or next_stock <= max(2.0, state.base_daily_demand * 1.8)
            )
            if retail_stockout:
                retail_stockout_count += 1
            low_stock_flags[state.sku_id] = next_stock <= max(6.0, state.reorder_point * 0.5)

            sku_observations.append(
                {
                    "skuId": state.sku_id,
                    "unitsInStock": round_units(next_stock),
                    "costPerUnit": next_cost,
                    "productPrice": next_price,
                    "previousProductPrice": previous_price,
                    "retailUnitsSold": round_units(retail_units_sold),
                    "restockIncluded": receipts_by_sku.get(state.sku_id, 0.0) > 0,
                    "retailStockout": retail_stockout,
                    "adjustmentDelta": adjustment_delta if adjustment_delta != 0.0 else None,
                    "approximateOrderQuantity": order_quantity,
                    "approximateReceiptQuantity": receipts_by_sku.get(state.sku_id),
                    "placementTimestamp": placement_timestamp,
                    "receiptTimestamp": receipt_timestamps.get(state.sku_id),
                    "leadTimeDaysHint": lead_time_days_hint or round(state.recent_lead_days, 2),
                    "notes": "Cycle count adjustment applied." if adjustment_delta != 0.0 else None,
                }
            )

            state.stock = next_stock
            state.cost = next_cost
            state.price = next_price

        final_regime = (
            "stockout_constrained"
            if scheduled_regime.regime in {"normal", "lull"}
            and sum(1 for value in lost_demand_by_sku.values() if value > 0.5) >= 2
            else scheduled_regime.regime
        )

        service_signals: list[dict[str, Any]] = []
        service_price_adjustments: list[dict[str, Any]] = []
        for service_index, service in enumerate(service_states):
            service_rng = random.Random(stable_seed("service-reprice", report_index, service_index))
            linked_pressure = sum(1 for sku_id in service.sku_ids if low_stock_flags.get(sku_id) or lost_demand_by_sku.get(sku_id, 0.0) > 0.35)
            service_demand_scores[service.service_id] += linked_pressure * 0.35

            if report_index == 0 or final_regime in {"promo", "spike", "correction"} or (report_index + service_index) % 12 == 0:
                previous_price = service.price
                price_delta = service_rng.uniform(-0.03, 0.05)
                if final_regime == "promo":
                    price_delta -= service_rng.uniform(0.04, 0.09)
                elif final_regime == "stockout_constrained":
                    price_delta += service_rng.uniform(0.02, 0.05)
                service.price = round_money(max(1.0, service.price * (1.0 + price_delta)))
                service_price_adjustments.append(
                    {
                        "serviceId": service.service_id,
                        "price": service.price,
                        "previousPrice": previous_price,
                    }
                )

            linked_low = linked_pressure > 0
            if linked_low or (report_index + len(service.sku_ids) + service_index) % 23 == 0:
                service_signals.append({"serviceId": service.service_id, "stockout": linked_low})

        top_service_ranking = [
            service_id
            for service_id, _ in sorted(service_demand_scores.items(), key=lambda item: (-item[1], item[0]))[: min(4, len(service_demand_scores))]
        ]
        top_retail_ranking = [
            sku_id
            for sku_id, _ in sorted(
                ((sku_id, score) for sku_id, score in retail_demand_scores.items() if score > 0),
                key=lambda item: (-item[1], item[0]),
            )[: min(4, len(retail_sku_ids))]
        ]

        service_stockout_count = sum(1 for signal in service_signals if signal.get("stockout"))
        notes = build_report_note(final_regime, restock_count, retail_stockout_count, service_stockout_count, adjustment_count)
        if report_index == 0:
            notes = "Synthetic generated history seeded from the current desktop catalog."

        service_sales_snapshot = [
            {
                "serviceId": service_id,
                "unitsSold": round_units(units_sold),
            }
            for service_id, units_sold in sorted(service_demand_scores.items())
            if units_sold > 0
        ]
        retail_sales_snapshot = [
            {
                "skuId": item["skuId"],
                "unitsSold": item["retailUnitsSold"],
            }
            for item in sku_observations
            if item.get("retailUnitsSold", 0) > 0
        ]

        reports.append(
            {
                "reportId": f"report-{report_index + 1:04d}",
                "reportSource": "manual",
                "reportedAt": isoformat_z(report_at),
                "skuObservations": sku_observations,
                "serviceSignals": service_signals,
                "servicePriceAdjustments": service_price_adjustments,
                "serviceSalesSnapshot": service_sales_snapshot,
                "retailSalesSnapshot": retail_sales_snapshot,
                "topServiceRanking": top_service_ranking,
                "topRetailRanking": top_retail_ranking,
                "regimeHint": final_regime,
                "recipeUsageHints": [profile for profiles in service_profiles.values() for profile in profiles],
                "notes": notes,
            }
        )

    latest_skus = []
    latest_prices = {service.service_id: service.price for service in service_states}
    latest_sku_by_id = {item["skuId"]: item for item in reports[-1]["skuObservations"]}
    for sku in catalog_skus:
        latest = latest_sku_by_id[sku["skuId"]]
        updated = dict(sku)
        updated["unitsInStock"] = latest["unitsInStock"]
        updated["costPerUnit"] = latest["costPerUnit"]
        if sku.get("soldAsProduct"):
            updated["productPrice"] = latest["productPrice"]
        latest_skus.append(updated)

    latest_services = []
    for service in catalog_services:
        updated = dict(service)
        updated["price"] = latest_prices[service["serviceId"]]
        latest_services.append(updated)

    return reports, latest_skus, latest_services


def build_sena_catalog(skus: list[dict[str, Any]], services: list[dict[str, Any]]) -> dict[str, Any]:
    bundles = [
        {
            "bundleId": f"bundle-{service['serviceId']}",
            "serviceId": service["serviceId"],
            "name": service["name"],
        }
        for service in services
        if bool(service.get("bundle")) or len(service.get("skuIds", [])) > 1
    ]
    sharing_mask: list[dict[str, Any]] = []
    for service in services:
        for index, sku_id in enumerate(service.get("skuIds", [])):
            sharing_mask.append(
                {
                    "serviceId": service["serviceId"],
                    "skuId": sku_id,
                    "enabled": True,
                    "usageProbability": round(clamp(0.95 - index * 0.15, 0.35, 0.95), 2),
                }
            )
    return {
        "schemaVersion": 1,
        "skus": [
            {
                "skuId": sku["skuId"],
                "name": sku["name"],
                "description": sku["description"],
                "imagePath": sku.get("imagePath"),
                "supplierName": sku.get("supplierName"),
                "costPerUnit": sku["costPerUnit"],
                "archived": bool(sku.get("archived", False)),
                "soldAsProduct": sku["soldAsProduct"],
                "productPrice": sku.get("productPrice"),
                "leadTimeMeanDaysHint": sku.get("leadTimeMeanDays"),
                "leadTimeStdDaysHint": sku.get("leadTimeStdDays"),
            }
            for sku in skus
        ],
        "services": [
            {
                "serviceId": service["serviceId"],
                "name": service["name"],
                "description": service["description"],
                "imagePath": service.get("imagePath"),
                "price": service["price"],
                "archived": bool(service.get("archived", False)),
                "bundle": bool(service.get("bundle")) or len(service.get("skuIds", [])) > 1,
            }
            for service in services
        ],
        "bundles": bundles,
        "sharingMask": sharing_mask,
    }


def build_sena_observations(
    reports: list[dict[str, Any]],
    services: list[dict[str, Any]],
    latest_services: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    service_price_map = {service["serviceId"]: float(service["price"]) for service in latest_services}
    observations: list[dict[str, Any]] = []
    previous_units: dict[str, float] = {}

    for report in reports:
        for adjustment in report.get("servicePriceAdjustments", []):
            service_price_map[adjustment["serviceId"]] = float(adjustment["price"])

        order_signals = []
        commercial_events: list[dict[str, Any]] = []
        for sku_observation in report["skuObservations"]:
            if sku_observation.get("retailUnitsSold", 0) > 0:
                commercial_events.append(
                    {
                        "party": "customer",
                        "entityType": "sku",
                        "entityId": sku_observation["skuId"],
                        "stage": "realized",
                        "quantityDelta": sku_observation["retailUnitsSold"],
                        "flow": "immediate",
                        "reason": "generated_retail_sale",
                    }
                )
            if sku_observation.get("approximateOrderQuantity") is not None:
                commercial_events.append(
                    {
                        "party": "supplier",
                        "entityType": "sku",
                        "entityId": sku_observation["skuId"],
                        "stage": "pending",
                        "quantityDelta": sku_observation["approximateOrderQuantity"],
                        "flow": "scheduled",
                        "reason": "generated_supplier_order",
                    }
                )
            if sku_observation.get("approximateReceiptQuantity") is not None:
                commercial_events.append(
                    {
                        "party": "supplier",
                        "entityType": "sku",
                        "entityId": sku_observation["skuId"],
                        "stage": "realized",
                        "quantityDelta": sku_observation["approximateReceiptQuantity"],
                        "flow": "scheduled",
                        "reason": "generated_supplier_receipt",
                    }
                )
            order_signals.append(
                {
                    "skuId": sku_observation["skuId"],
                    "orderPlaced": sku_observation.get("approximateOrderQuantity") is not None,
                    "receiptArrived": bool(sku_observation.get("restockIncluded")),
                    "approximateOrderQuantity": sku_observation.get("approximateOrderQuantity"),
                    "approximateReceiptQuantity": sku_observation.get("approximateReceiptQuantity"),
                    "placementTimestamp": sku_observation.get("placementTimestamp"),
                    "receiptTimestamp": sku_observation.get("receiptTimestamp"),
                    "leadTimeDaysHint": sku_observation.get("leadTimeDaysHint"),
                }
            )
            previous_units[sku_observation["skuId"]] = float(sku_observation["unitsInStock"])

        lead_time_hints = []
        for sku_observation in report["skuObservations"]:
            lead_mean = sku_observation.get("leadTimeDaysHint")
            lead_std = None
            if lead_mean is not None:
                lead_std = max(0.75, float(lead_mean) * 0.22)
            lead_time_hints.append(
                {
                    "skuId": sku_observation["skuId"],
                    "typicalDays": lead_mean,
                    "lowDays": max(1.0, float(lead_mean) - float(lead_std)) if lead_mean is not None and lead_std is not None else None,
                    "highDays": float(lead_mean) + float(lead_std) if lead_mean is not None and lead_std is not None else None,
                    "variabilityClass": derive_variability_class(float(lead_mean), float(lead_std)) if lead_mean is not None and lead_std is not None else None,
                }
            )

        observations.append(
            {
                "observedAt": report["reportedAt"],
                "stockSnapshot": [
                    {
                        "skuId": item["skuId"],
                        "unitsInStock": item["unitsInStock"],
                        "costPerUnit": item["costPerUnit"],
                        "productPrice": item.get("productPrice"),
                    }
                    for item in report["skuObservations"]
                ],
                "retailSalesSnapshot": report.get("retailSalesSnapshot", []),
                "serviceSalesSnapshot": report.get("serviceSalesSnapshot", []),
                "serviceRankings": report.get("topServiceRanking", []),
                "retailRankings": report.get("topRetailRanking", []),
                "serviceStockouts": [
                    signal["serviceId"]
                    for signal in report.get("serviceSignals", [])
                    if signal.get("stockout")
                ],
                "retailStockouts": [
                    item["skuId"]
                    for item in report["skuObservations"]
                    if item.get("retailStockout")
                ],
                "orderSignals": order_signals,
                "servicePrices": [
                    {"serviceId": service["serviceId"], "price": service_price_map[service["serviceId"]]}
                    for service in services
                ],
                "retailPrices": [
                    {"skuId": item["skuId"], "price": item["productPrice"]}
                    for item in report["skuObservations"]
                    if item.get("productPrice") is not None
                ],
                "leadTimeHints": lead_time_hints,
                "regimeHint": report.get("regimeHint"),
                "adjustmentSignals": [
                    {
                        "skuId": item["skuId"],
                        "quantityDelta": item["adjustmentDelta"],
                        "reason": item.get("notes") or ("cycle_count_write_off" if item["adjustmentDelta"] < 0 else "cycle_count_recount"),
                    }
                    for item in report["skuObservations"]
                    if item.get("adjustmentDelta") not in {None, 0}
                ],
                "commercialEvents": [
                    *commercial_events,
                    *[
                        {
                            "party": "customer",
                            "entityType": "service",
                            "entityId": item["serviceId"],
                            "stage": "realized",
                            "quantityDelta": item["unitsSold"],
                            "flow": "immediate",
                            "reason": "generated_service_sale",
                        }
                        for item in report.get("serviceSalesSnapshot", [])
                        if item.get("unitsSold", 0) > 0
                    ],
                ],
                "recipeUsageHints": report.get("recipeUsageHints", []),
                "notes": report.get("notes"),
            }
        )

    return observations


def enrich_lead_time_hints(observations: list[dict[str, Any]], skus: list[dict[str, Any]]) -> None:
    sku_lookup = {sku["skuId"]: sku for sku in skus}
    for observation in observations:
        hints = []
        for snapshot in observation["stockSnapshot"]:
            sku = sku_lookup[snapshot["skuId"]]
            current_hint = next((hint for hint in observation.get("leadTimeHints", []) if hint["skuId"] == sku["skuId"]), None)
            if current_hint and current_hint.get("typicalDays") is not None:
                hints.append(current_hint)
                continue
            typical = sku.get("leadTimeMeanDays")
            std = sku.get("leadTimeStdDays")
            if typical is None and std is None:
                continue
            if typical is None:
                typical = max(1.0, float(std) * 2.5)
            if std is None:
                std = max(0.75, float(typical) * 0.2)
            low = max(1.0, float(typical) - float(std))
            high = float(typical) + float(std)
            hints.append(
                {
                    "skuId": sku["skuId"],
                    "typicalDays": typical,
                    "lowDays": low,
                    "highDays": high,
                    "variabilityClass": derive_variability_class(float(typical), float(std)),
                }
            )
        observation["leadTimeHints"] = hints


def start_desktop_core(repo_root: Path, db_path: Path) -> subprocess.Popen[str]:
    return subprocess.Popen(
        ["cargo", "run", "--quiet", "--manifest-path", str(repo_root / "apps/desktop-core/Cargo.toml")],
        cwd=repo_root,
        env={**os.environ, "BANJI_DESKTOP_DATA_PATH": str(db_path)},
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


def send_core_command(proc: subprocess.Popen[str], command_id: int, command: str, payload: Any) -> Any:
    envelope = {"id": command_id, "command": command, "payload": payload}
    assert proc.stdin is not None
    assert proc.stdout is not None
    proc.stdin.write(json.dumps(envelope) + "\n")
    proc.stdin.flush()
    line = proc.stdout.readline()
    if not line:
        raise RuntimeError(f"desktop core closed while handling {command}")
    response = json.loads(line)
    if not response.get("ok"):
        raise RuntimeError(f"{command} failed: {response.get('error')}")
    return response.get("payload")


def close_desktop_core(proc: subprocess.Popen[str]) -> None:
    if proc.stdin:
        proc.stdin.close()
    stderr = proc.stderr.read() if proc.stderr else ""
    return_code = proc.wait()
    if return_code != 0:
        raise RuntimeError(f"desktop core exited with {return_code}: {stderr.strip()}")


def bundled_current_sena_catalog() -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "skus": [
            {
                "skuId": "sku-001",
                "name": "Rattan Market Tote",
                "description": "Woven tote with steady tourist demand.",
                "supplierName": "Siem Reap Rattan",
                "costPerUnit": 18.0,
                "archived": False,
                "soldAsProduct": True,
                "productPrice": 42.0,
                "leadTimeMeanDaysHint": 5.0,
                "leadTimeStdDaysHint": 1.0,
            },
            {
                "skuId": "sku-002",
                "name": "Children's Krama Set",
                "description": "Giftable woven set for family bundles.",
                "supplierName": "Mekong Looms",
                "costPerUnit": 12.0,
                "archived": False,
                "soldAsProduct": True,
                "productPrice": 28.0,
                "leadTimeMeanDaysHint": 6.0,
                "leadTimeStdDaysHint": 2.0,
            },
            {
                "skuId": "sku-003",
                "name": "Cotton Scarf",
                "description": "Everyday scarf used across service bundles.",
                "supplierName": "Mekong Looms",
                "costPerUnit": 9.0,
                "archived": False,
                "soldAsProduct": True,
                "productPrice": 21.0,
                "leadTimeMeanDaysHint": 4.0,
                "leadTimeStdDaysHint": 1.0,
            },
            {
                "skuId": "sku-004",
                "name": "Handwoven Belt",
                "description": "Accessory SKU with quick replenishment.",
                "supplierName": None,
                "costPerUnit": 7.0,
                "archived": False,
                "soldAsProduct": True,
                "productPrice": 17.0,
                "leadTimeMeanDaysHint": 3.0,
                "leadTimeStdDaysHint": 1.0,
            },
            {
                "skuId": "sku-005",
                "name": "Wedding Sampot",
                "description": "High-value ceremonial fabric with long lead time.",
                "supplierName": "Phnom Silk Collective",
                "costPerUnit": 26.0,
                "archived": False,
                "soldAsProduct": True,
                "productPrice": 58.0,
                "leadTimeMeanDaysHint": 8.0,
                "leadTimeStdDaysHint": 3.0,
            },
        ],
        "services": [
            {
                "serviceId": "service-001",
                "name": "Market Tote Add-On",
                "description": "Accessory upsell anchored on woven totes.",
                "price": 18.0,
                "archived": False,
                "bundle": False,
            },
            {
                "serviceId": "service-002",
                "name": "Family Krama Bundle",
                "description": "Multi-item family set for holiday promos.",
                "price": 35.0,
                "archived": False,
                "bundle": True,
            },
            {
                "serviceId": "service-003",
                "name": "Tourist Gift Pairing",
                "description": "Giftable pairing for quick checkout.",
                "price": 16.0,
                "archived": False,
                "bundle": False,
            },
            {
                "serviceId": "service-004",
                "name": "Wedding Premium Bundle",
                "description": "Ceremony package built around premium fabric.",
                "price": 72.0,
                "archived": False,
                "bundle": True,
            },
        ],
        "bundles": [
            {"bundleId": "bundle-service-002", "serviceId": "service-002", "name": "Family Krama Bundle"},
            {"bundleId": "bundle-service-004", "serviceId": "service-004", "name": "Wedding Premium Bundle"},
        ],
        "sharingMask": [
            {"serviceId": "service-001", "skuId": "sku-001", "enabled": True, "usageProbability": 1.0},
            {"serviceId": "service-002", "skuId": "sku-002", "enabled": True, "usageProbability": 1.0},
            {"serviceId": "service-002", "skuId": "sku-003", "enabled": True, "usageProbability": 0.8},
            {"serviceId": "service-003", "skuId": "sku-003", "enabled": True, "usageProbability": 1.0},
            {"serviceId": "service-003", "skuId": "sku-004", "enabled": True, "usageProbability": 0.75},
            {"serviceId": "service-004", "skuId": "sku-005", "enabled": True, "usageProbability": 1.0},
        ],
    }


def load_current_sena_catalog(repo_root: Path, db_path: Path) -> dict[str, Any]:
    proc = start_desktop_core(repo_root, db_path)
    try:
        command_id = 1
        catalog = send_core_command(proc, command_id, "sena.getCatalog", None)
        if catalog is None:
            return bundled_current_sena_catalog()
        return catalog
    finally:
        close_desktop_core(proc)


def generation_inputs_from_sena_catalog(catalog: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    enabled_sku_ids_by_service: dict[str, list[str]] = {}
    for entry in catalog.get("sharingMask", []):
        if entry.get("enabled", True):
            enabled_sku_ids_by_service.setdefault(entry["serviceId"], []).append(entry["skuId"])

    skus: list[dict[str, Any]] = []
    for index, sku in enumerate(catalog.get("skus", [])):
        if sku.get("archived"):
            continue
        lead_mean = float(sku.get("leadTimeMeanDaysHint") or 7.0)
        lead_std = float(sku.get("leadTimeStdDaysHint") or max(1.0, lead_mean * 0.25))
        opening_units = 24.0 + (index % 5) * 8.0 + lead_mean * 2.0
        skus.append(
            {
                "skuId": sku["skuId"],
                "name": sku["name"],
                "description": sku.get("description", ""),
                "imagePath": sku.get("imagePath"),
                "supplierName": sku.get("supplierName"),
                "costPerUnit": float(sku.get("costPerUnit") or 0.0),
                "archived": False,
                "soldAsProduct": bool(sku.get("soldAsProduct")),
                "productPrice": sku.get("productPrice"),
                "leadTimeMeanDays": lead_mean,
                "leadTimeStdDays": lead_std,
                "unitsInStock": opening_units,
            }
        )

    services: list[dict[str, Any]] = []
    for service in catalog.get("services", []):
        if service.get("archived"):
            continue
        service_id = service["serviceId"]
        services.append(
            {
                "serviceId": service_id,
                "name": service["name"],
                "description": service.get("description", ""),
                "imagePath": service.get("imagePath"),
                "price": float(service.get("price") or 0.0),
                "archived": False,
                "bundle": bool(service.get("bundle")),
                "skuIds": enabled_sku_ids_by_service.get(service_id, []),
            }
        )

    if not skus:
        raise RuntimeError("current SENA catalog has no active SKUs to generate history for")
    return skus, services


def history_marker_payload(args: argparse.Namespace) -> dict[str, Any]:
    return {
        "version": DEV_HISTORY_VERSION,
        "years": args.years,
        "intervalDays": args.interval_days,
        "startupOnlyReadModel": bool(getattr(args, "startup_only_read_model", False)),
    }


def history_marker_current(path: Path, db_path: Path, args: argparse.Namespace) -> bool:
    if args.force or not db_path.exists() or not path.exists():
        return False
    try:
        return json.loads(path.read_text()) == history_marker_payload(args)
    except json.JSONDecodeError:
        return False


def write_history_marker(path: Path, args: argparse.Namespace) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(history_marker_payload(args), indent=2) + "\n")


def rebuild_sena_workspace(repo_root: Path, db_path: Path, marker_path: Path, catalog: dict[str, Any], observations: list[dict[str, Any]]) -> None:
    if db_path.exists():
        db_path.unlink()
    if marker_path.exists():
        marker_path.unlink()

    proc = start_desktop_core(repo_root, db_path)

    try:
        command_id = 1
        send_core_command(proc, command_id, "sena.upsertCatalog", catalog)
        command_id += 1
        for observation in observations:
            send_core_command(proc, command_id, "sena.ingestObservation", observation)
            command_id += 1
        send_core_command(proc, command_id, "sena.triggerRun", {"algorithmVersion": "sena-analysis-v3"})
    finally:
        close_desktop_core(proc)


def summary_for_startup_fixture(owner: str, catalog: dict[str, Any], observations: list[dict[str, Any]], run_id: str) -> dict[str, Any]:
    latest_observation = observations[-1] if observations else None
    latest_stock = {
        snapshot["skuId"]: snapshot
        for snapshot in (latest_observation or {}).get("stockSnapshot", [])
    }
    sku_summaries = []
    high_risk_ids = []
    for sku in catalog.get("skus", []):
        stock = latest_stock.get(sku["skuId"], {})
        units = float(stock.get("unitsInStock") or 0.0)
        demand = max(0.25, min(8.0, units / 12.0))
        lead_mean = float(sku.get("leadTimeMeanDaysHint") or 7.0)
        lead_std = float(sku.get("leadTimeStdDaysHint") or max(1.0, lead_mean * 0.25))
        reorder_point = demand * (lead_mean + 3.0)
        stockout_risk = clamp((reorder_point - units + 12.0) / max(reorder_point + 12.0, 1.0), 0.0, 1.0)
        if stockout_risk >= 0.55:
            high_risk_ids.append(sku["skuId"])
        sku_summaries.append(
            {
                "skuId": sku["skuId"],
                "latestPosteriorUnits": units,
                "credibleIntervalLow": max(0.0, units - 4.0),
                "credibleIntervalHigh": units + 6.0,
                "demandPerDayMean": demand,
                "stockoutRisk": round(stockout_risk, 4),
                "daysOfCover": round(units / demand, 2) if demand > 0 else None,
                "expectedLeadTimeDemand": round(demand * lead_mean, 4),
                "safetyStock": round(max(2.0, demand * lead_std), 4),
                "reorderPoint": round(reorder_point, 4),
                "reorderTriggerProbability": round(stockout_risk, 4),
                "reorderQuantity": {
                    "recommendedUnits": max(0.0, round(reorder_point * 1.6 - units, 2)),
                    "ungatedRecommendedUnits": max(0.0, round(reorder_point * 1.6 - units, 2)),
                    "likelyRangeLow": max(0.0, round(reorder_point - units, 2)),
                    "likelyRangeHigh": max(0.0, round(reorder_point * 2.0 - units, 2)),
                    "needProbability": round(stockout_risk, 4),
                    "recommendationIssued": stockout_risk >= 0.55,
                    "recommendationQuantile": 0.85,
                    "intervalLowQuantile": 0.1,
                    "intervalHighQuantile": 0.9,
                    "needProbabilityGate": 0.55,
                    "reviewDelayDays": 2.0,
                },
                "leadTimeMeanDays": lead_mean,
                "leadTimeStdDays": lead_std,
                "regimeProbabilities": {"normal": 0.72, "promo": 0.18, "lull": 0.1},
            }
        )
    return {
        "ownerSub": owner,
        "runId": run_id,
        "latestObservedAt": latest_observation.get("observedAt") if latest_observation else None,
        "skuCount": len(catalog.get("skus", [])),
        "serviceCount": len(catalog.get("services", [])),
        "intervalCount": len(observations),
        "pendingReorderCount": len(high_risk_ids),
        "topRegime": "normal",
        "highRiskSkuIds": high_risk_ids[:12],
        "skuSummaries": sku_summaries,
    }


def diagnostics_for_startup_fixture() -> dict[str, Any]:
    return {
        "effectiveSampleSizeMean": 128.0,
        "resamplingCount": 0,
        "smoothingEnabled": True,
        "changePointProbability": 0.12,
        "latestChangePointProbability": 0.12,
        "seasonalityActive": True,
        "posteriorPredictiveErrorMean": 0.08,
        "coverageEstimate": 0.92,
        "regimeHistory": [],
    }


def bootstrap_sena_workspace_schema(repo_root: Path, db_path: Path) -> None:
    proc = start_desktop_core(repo_root, db_path)
    try:
        send_core_command(proc, 1, "sena.getCatalog", None)
    finally:
        close_desktop_core(proc)


def warm_startup_fixture_runtime_state(repo_root: Path, owner: str, db_path: Path) -> None:
    proc = start_desktop_core(repo_root, db_path)
    try:
        command_id = 1
        send_core_command(proc, command_id, "sena.getStartupWorkspace", None)
        command_id += 1
        if owner == DEFAULT_OWNER:
            send_core_command(proc, command_id, "sena.getRecordUpdateContext", None)
    finally:
        close_desktop_core(proc)


def rebuild_startup_fixture_workspace(
    repo_root: Path,
    db_path: Path,
    marker_path: Path,
    catalog: dict[str, Any],
    observations: list[dict[str, Any]],
    owner: str,
) -> None:
    if db_path.exists():
        db_path.unlink()
    if marker_path.exists():
        marker_path.unlink()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    bootstrap_sena_workspace_schema(repo_root, db_path)

    updated_at = isoformat_z(datetime.now(UTC))
    run_id = "benchmark-power-user-run"
    summary = summary_for_startup_fixture(owner, catalog, observations, run_id)
    diagnostics = diagnostics_for_startup_fixture()

    with sqlite3.connect(db_path) as connection:
        connection.execute(
            "INSERT INTO sena_catalog (owner_sub, payload, updated_at) VALUES (?, ?, ?)",
            (owner, json.dumps(catalog), updated_at),
        )
        connection.executemany(
            "INSERT INTO sena_observation (observation_id, owner_sub, observed_at, payload) VALUES (?, ?, ?, ?)",
            [
                (str(uuid.uuid4()), owner, observation["observedAt"], json.dumps(observation))
                for observation in observations
            ],
        )

        connection.execute(
            """
            INSERT INTO sena_run (
              run_id, owner_sub, algorithm_version, status, observation_count, created_at,
              completed_at, summary_json, diagnostics_json, primary_artifact_key, error
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                owner,
                "sena-analysis-v3",
                "succeeded",
                len(observations),
                updated_at,
                updated_at,
                json.dumps(summary),
                json.dumps(diagnostics),
                None,
                None,
            ),
        )
        connection.execute(
            """
            INSERT INTO sena_read_model (
              owner_sub, workspace_summary_json, diagnostics_json, sku_details_json,
              service_details_json, updated_at, run_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (owner, json.dumps(summary), json.dumps(diagnostics), "{}", "{}", updated_at, run_id),
        )
        connection.execute(
            """
            INSERT INTO sena_workspace_summary_hot (
              owner_sub, run_id, latest_observed_at, sku_count, service_count, interval_count,
              pending_reorder_count, top_regime, high_risk_sku_ids_json, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                owner,
                run_id,
                summary["latestObservedAt"],
                summary["skuCount"],
                summary["serviceCount"],
                summary["intervalCount"],
                summary["pendingReorderCount"],
                summary["topRegime"],
                json.dumps(summary["highRiskSkuIds"]),
                updated_at,
            ),
        )
        connection.executemany(
            """
            INSERT INTO sena_sku_summary_hot (
              owner_sub, sku_id, run_id, latest_posterior_units, credible_interval_low,
              credible_interval_high, demand_per_day_mean, stockout_risk, days_of_cover,
              expected_lead_time_demand, safety_stock, reorder_point,
              reorder_trigger_probability, reorder_quantity_json, lead_time_mean_days,
              lead_time_std_days, regime_probabilities_json, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    owner,
                    sku["skuId"],
                    run_id,
                    sku["latestPosteriorUnits"],
                    sku["credibleIntervalLow"],
                    sku["credibleIntervalHigh"],
                    sku["demandPerDayMean"],
                    sku["stockoutRisk"],
                    sku["daysOfCover"],
                    sku["expectedLeadTimeDemand"],
                    sku["safetyStock"],
                    sku["reorderPoint"],
                    sku["reorderTriggerProbability"],
                    json.dumps(sku["reorderQuantity"]),
                    sku["leadTimeMeanDays"],
                    sku["leadTimeStdDays"],
                    json.dumps(sku["regimeProbabilities"]),
                    updated_at,
                )
                for sku in summary["skuSummaries"]
            ],
        )
    warm_startup_fixture_runtime_state(repo_root, owner, db_path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate plausible SENA dev history for the current Banji app schema.")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--owner", default=DEFAULT_OWNER, help="Owner id reported in the summary; desktop-core uses its default owner internally.")
    parser.add_argument("--years", type=int, default=DEFAULT_YEARS)
    parser.add_argument("--interval-days", type=float, default=DEFAULT_INTERVAL_DAYS)
    parser.add_argument(
        "--source-catalog-json",
        type=Path,
        default=None,
        help="Optional current-schema SENA catalog JSON. Defaults to the catalog already stored in the target SENA DB, or a bundled current-schema catalog when the DB is empty.",
    )
    parser.add_argument("--store", type=Path, default=None, help=argparse.SUPPRESS)
    parser.add_argument("--sena-db", type=Path, default=None)
    parser.add_argument("--seed-marker", type=Path, default=None)
    parser.add_argument("--force", action="store_true", help="Regenerate even when the history marker already matches.")
    parser.add_argument(
        "--startup-only-read-model",
        action="store_true",
        help="Bulk-load observations and compact startup read models without running full posterior analysis.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    data_dir = repo_root / ".banji-dev-data"
    sena_db_path = args.sena_db or (data_dir / "desktop-sena-store.sqlite3")
    seed_marker_path = args.seed_marker or (data_dir / "desktop-sena-dev-history.json")

    if history_marker_current(seed_marker_path, sena_db_path, args):
        print(
            json.dumps(
                {
                    "owner": args.owner,
                    "skipped": True,
                    "reason": "history marker is current",
                    "senaDbPath": str(sena_db_path),
                    "seedMarkerPath": str(seed_marker_path),
                },
                indent=2,
            )
        )
        return

    if args.source_catalog_json:
        source_catalog = json.loads(args.source_catalog_json.read_text())
    else:
        source_catalog = load_current_sena_catalog(repo_root, sena_db_path)

    catalog_skus, catalog_services = generation_inputs_from_sena_catalog(source_catalog)
    end_at = datetime.now(UTC).replace(hour=9, minute=0, second=0, microsecond=0)

    reports, latest_skus, latest_services = generate_reports(
        catalog_skus,
        catalog_services,
        years=args.years,
        interval_days=args.interval_days,
        end_at=end_at,
    )

    sena_catalog = build_sena_catalog(latest_skus, latest_services)
    sena_observations = build_sena_observations(reports, latest_services, latest_services)
    enrich_lead_time_hints(sena_observations, latest_skus)
    if args.startup_only_read_model:
        rebuild_startup_fixture_workspace(
            repo_root,
            sena_db_path,
            seed_marker_path,
            sena_catalog,
            sena_observations,
            args.owner,
        )
    else:
        rebuild_sena_workspace(repo_root, sena_db_path, seed_marker_path, sena_catalog, sena_observations)
    write_history_marker(seed_marker_path, args)

    print(
        json.dumps(
            {
                "owner": args.owner,
                "reportCount": len(reports),
                "skuCount": len(latest_skus),
                "serviceCount": len(latest_services),
                "firstReportAt": reports[0]["reportedAt"],
                "lastReportAt": reports[-1]["reportedAt"],
                "senaDbPath": str(sena_db_path),
                "seedMarkerPath": str(seed_marker_path),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
