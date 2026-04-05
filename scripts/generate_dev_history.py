#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import random
import subprocess
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any


DEFAULT_OWNER = "desktop-owner"
DEFAULT_YEARS = 3
DEFAULT_INTERVAL_DAYS = 3.5


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
        ("promo", 1.28),
        ("lull", 0.74),
        ("supply_crunch", 0.92),
        ("festival", 1.42),
        ("correction", 0.84),
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


def build_report_note(regime: str, restock_count: int, retail_stockout_count: int, service_stockout_count: int) -> str | None:
    fragments: list[str] = []
    if regime in {"promo", "festival"}:
        fragments.append("Promo traffic changed the selling mix.")
    elif regime == "lull":
        fragments.append("Demand softened across the floor.")
    elif regime == "supply_crunch":
        fragments.append("Supplier timing looked uneven this cycle.")
    elif regime == "correction":
        fragments.append("Buyers rotated into a different assortment pocket.")

    if restock_count >= 3:
        fragments.append("Several replenishments landed together.")
    if retail_stockout_count >= 2:
        fragments.append("A few retail shelves still ran lean by close.")
    if service_stockout_count >= 2:
        fragments.append("Bundle availability tightened across multiple looks.")

    if not fragments:
        return None
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
        regime_window = regime_for_report(report_index, regime_windows)
        macro_wave = 1.0 + 0.08 * math.sin(report_index / 11.0) + 0.05 * math.cos(report_index / 19.0)
        sku_observations: list[dict[str, Any]] = []
        service_price_adjustments: list[dict[str, Any]] = []
        service_demand_scores: dict[str, float] = {}
        retail_demand_scores: dict[str, float] = {}
        low_stock_flags: dict[str, bool] = {}
        restock_count = 0
        retail_stockout_count = 0

        for sku_index, state in enumerate(sku_states):
            sku_rng = random.Random(stable_seed("report", report_index, state.sku_id))
            seasonality = 1.0 + 0.22 * math.sin((day_of_year / 365.25) * math.tau + state.phase)
            month_wave = 1.0 + 0.06 * math.sin(report_index / 4.5 + state.phase / 2.0)
            long_trend = 1.0 + state.trend_slope * report_index + 0.07 * math.sin(report_index / 28.0 + state.trend_bias)
            regime_multiplier = regime_window.intensity
            if regime_window.regime in {"promo", "festival"}:
                regime_multiplier *= state.promo_affinity
            if regime_window.regime == "lull":
                regime_multiplier *= clamp(1.0 - state.service_links * 0.015, 0.82, 1.0)
            promo_spike = 1.0
            if sku_rng.random() < (0.055 * state.promo_affinity if regime_window.regime in {"promo", "festival"} else 0.018):
                promo_spike += sku_rng.uniform(0.18, 0.55)
            correction_drag = 1.0
            if regime_window.regime == "correction" and sku_rng.random() < 0.2:
                correction_drag -= sku_rng.uniform(0.08, 0.22)
            volatility = sku_rng.uniform(0.86, 1.16)
            draw = max(
                0.5,
                state.base_daily_demand
                * interval_days
                * seasonality
                * month_wave
                * macro_wave
                * long_trend
                * regime_multiplier
                * promo_spike
                * correction_drag
                * volatility,
            )

            low_stock_projection = state.stock - draw
            forced_review = report_index == 0 or (report_index * interval_days) % state.review_period_days < interval_days
            restock_trigger = low_stock_projection <= state.reorder_point
            opportunistic_restock = forced_review and sku_rng.random() < (0.08 + (1.0 - state.reorder_discipline) * 0.32)
            restock_included = restock_trigger or opportunistic_restock
            restock_units = 0.0
            if restock_included:
                restock_multiple = (
                    sku_rng.uniform(0.72, 1.1)
                    if state.reorder_strategy == "lean"
                    else sku_rng.uniform(0.9, 1.55)
                    if state.reorder_strategy == "bulk"
                    else sku_rng.uniform(0.82, 1.3)
                )
                if regime_window.regime == "supply_crunch":
                    restock_multiple *= sku_rng.uniform(0.35, 0.88)
                restock_units = max(6.0, state.reorder_batch * restock_multiple)
                restock_count += 1
            next_stock = max(0.0, state.stock + restock_units - draw)

            cost_shift = 1.0 + sku_rng.uniform(-0.01, 0.012)
            if restock_included:
                cost_shift += sku_rng.uniform(0.004, 0.035)
            if regime_window.regime == "supply_crunch":
                cost_shift += sku_rng.uniform(0.01, 0.045)
            elif regime_window.regime == "lull":
                cost_shift -= sku_rng.uniform(0.0, 0.01)
            next_cost = round_money(max(0.2, state.cost * cost_shift))

            next_price = state.price
            previous_price = state.price
            if next_price is not None:
                should_reprice = (
                    (report_index + sku_index) % 14 == 0
                    or (restock_included and sku_rng.random() < 0.15)
                    or (regime_window.regime in {"promo", "festival"} and sku_rng.random() < 0.12)
                )
                if should_reprice:
                    price_shift = sku_rng.uniform(-0.025, 0.06)
                    if regime_window.regime in {"promo", "festival"} and sku_rng.random() < 0.45:
                        price_shift -= sku_rng.uniform(0.03, 0.09)
                    if regime_window.regime == "supply_crunch":
                        price_shift += sku_rng.uniform(0.02, 0.08)
                    next_price = round_money(max(next_cost * 1.35, next_price * (1.0 + price_shift)))

            retail_stockout = state.sold_as_product and next_stock <= max(3.0, state.base_daily_demand * 2.2)
            if retail_stockout:
                retail_stockout_count += 1
            low_stock_flags[state.sku_id] = next_stock <= max(8.0, state.reorder_point * 0.55)

            retail_demand_scores[state.sku_id] = draw / interval_days if state.sold_as_product else 0.0

            notes: str | None = None
            if restock_included and retail_stockout:
                notes = "Replenishment arrived after a tight selling window."
            elif restock_included:
                notes = "Planned replenishment landed before close."
            elif retail_stockout:
                notes = "Shelf stock ran lean by close."

            sku_observations.append(
                {
                    "skuId": state.sku_id,
                    "unitsInStock": round(next_stock, 4),
                    "costPerUnit": next_cost,
                    "productPrice": next_price,
                    "previousProductPrice": previous_price,
                    "restockIncluded": restock_included,
                    "retailStockout": retail_stockout,
                    "notes": notes,
                }
            )

            state.stock = next_stock
            state.cost = next_cost
            state.price = next_price

        service_signals: list[dict[str, Any]] = []
        for service_index, service in enumerate(service_states):
            service_rng = random.Random(stable_seed("service-report", report_index, service.service_id))
            linked_pressure = sum(1 for sku_id in service.sku_ids if low_stock_flags.get(sku_id))
            activity = service.base_activity * (1.0 + 0.16 * math.sin((day_of_year / 365.25) * math.tau + service.phase))
            activity *= macro_wave * regime_window.intensity
            if regime_window.regime in {"promo", "festival"}:
                activity *= service.promo_affinity
            if regime_window.regime == "lull":
                activity *= service_rng.uniform(0.72, 0.94)
            if (report_index + service_index) % 10 == 0:
                activity *= 1.0 + service_rng.uniform(0.15, 0.35)
            service_demand_scores[service.service_id] = activity + linked_pressure * 0.35

            if (report_index + service_index) % 12 == 0 or (
                regime_window.regime in {"promo", "festival", "supply_crunch"} and service_rng.random() < 0.08
            ):
                previous_price = service.price
                price_delta = service_rng.uniform(-0.03, 0.07)
                if regime_window.regime in {"promo", "festival"} and service_rng.random() < 0.5:
                    price_delta -= service_rng.uniform(0.04, 0.1)
                if regime_window.regime == "supply_crunch":
                    price_delta += service_rng.uniform(0.02, 0.07)
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
                service_signals.append(
                    {
                        "serviceId": service.service_id,
                        "stockout": linked_low,
                    }
                )

        top_service_ranking = [
            service_id
            for service_id, _ in sorted(
                service_demand_scores.items(),
                key=lambda item: (-item[1], item[0]),
            )[: min(4, len(service_demand_scores))]
        ] if report_index % 2 == 0 else []

        top_retail_ranking = [
            sku_id
            for sku_id, _ in sorted(
                ((sku_id, score) for sku_id, score in retail_demand_scores.items() if score > 0),
                key=lambda item: (-item[1], item[0]),
            )[: min(4, len(retail_sku_ids))]
        ] if report_index % 3 == 0 else []

        service_stockout_count = sum(1 for signal in service_signals if signal.get("stockout"))
        notes = build_report_note(regime_window.regime, restock_count, retail_stockout_count, service_stockout_count)
        if report_index == 0:
            notes = "Synthetic historical baseline generated for the current desktop catalog."
        elif report_index % 9 == 0 and notes is None:
            notes = "Synthetic twice-weekly operating snapshot."

        reports.append(
            {
                "reportId": f"report-{report_index + 1:04d}",
                "reportSource": "legacy-baseline" if report_index == 0 else "manual",
                "reportedAt": isoformat_z(report_at),
                "skuObservations": sku_observations,
                "serviceSignals": service_signals,
                "servicePriceAdjustments": service_price_adjustments,
                "topServiceRanking": top_service_ranking,
                "topRetailRanking": top_retail_ranking,
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
                "costPerUnit": sku["costPerUnit"],
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
                "price": service["price"],
                "bundle": True,
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
        for sku_observation in report["skuObservations"]:
            previous = previous_units.get(sku_observation["skuId"], sku_observation["unitsInStock"])
            receipt_qty = None
            if sku_observation.get("restockIncluded"):
                receipt_qty = round(max(8.0, sku_observation["unitsInStock"] - previous + 12.0), 2)
            order_signals.append(
                {
                    "skuId": sku_observation["skuId"],
                    "orderPlaced": bool(sku_observation.get("restockIncluded")),
                    "receiptArrived": bool(sku_observation.get("restockIncluded")),
                    "approximateOrderQuantity": receipt_qty,
                    "approximateReceiptQuantity": receipt_qty,
                }
            )
            previous_units[sku_observation["skuId"]] = float(sku_observation["unitsInStock"])

        lead_time_hints = []
        for sku_observation in report["skuObservations"]:
            lead_mean = None
            lead_std = None
            # The latest catalog already carries the canonical hints by sku id.
            lead_time_hints.append(
                {
                    "skuId": sku_observation["skuId"],
                    "typicalDays": lead_mean,
                    "lowDays": lead_std,
                    "highDays": lead_std,
                    "variabilityClass": None,
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


def rebuild_sena_workspace(repo_root: Path, db_path: Path, marker_path: Path, catalog: dict[str, Any], observations: list[dict[str, Any]]) -> None:
    if db_path.exists():
        db_path.unlink()
    if marker_path.exists():
        marker_path.unlink()

    proc = subprocess.Popen(
        ["cargo", "run", "--quiet", "--manifest-path", str(repo_root / "apps/desktop-core/Cargo.toml")],
        cwd=repo_root,
        env={**os.environ, "BANJI_DESKTOP_DATA_PATH": str(db_path)},
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        command_id = 1
        send_core_command(proc, command_id, "sena.upsertCatalog", catalog)
        command_id += 1
        for observation in observations:
            send_core_command(proc, command_id, "sena.ingestObservation", observation)
            command_id += 1
        send_core_command(proc, command_id, "sena.triggerRun", {"algorithmVersion": "sena-analysis-v2"})
    finally:
        if proc.stdin:
            proc.stdin.close()
        stderr = proc.stderr.read() if proc.stderr else ""
        return_code = proc.wait()
        if return_code != 0:
            raise RuntimeError(f"desktop core exited with {return_code}: {stderr.strip()}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate plausible dev history for the current desktop catalog.")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--owner", default=DEFAULT_OWNER)
    parser.add_argument("--years", type=int, default=DEFAULT_YEARS)
    parser.add_argument("--interval-days", type=float, default=DEFAULT_INTERVAL_DAYS)
    parser.add_argument("--store", type=Path, default=None)
    parser.add_argument("--sena-db", type=Path, default=None)
    parser.add_argument("--seed-marker", type=Path, default=None)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    data_dir = repo_root / ".banji-dev-data"
    store_path = args.store or (data_dir / "desktop-inventory-store.json")
    sena_db_path = args.sena_db or (data_dir / "desktop-sena-store.sqlite3")
    seed_marker_path = args.seed_marker or (data_dir / "desktop-sena-dev-seed.txt")

    store = load_store(store_path)
    owner = store["owners"][args.owner]
    catalog_skus = owner["catalog"]["skus"]
    catalog_services = owner["catalog"]["services"]

    latest_existing_report = owner.get("sist", {}).get("stockReports", [])[-1]["reportedAt"] if owner.get("sist", {}).get("stockReports") else None
    end_at = parse_iso(latest_existing_report) if latest_existing_report else datetime.now(UTC).replace(hour=9, minute=0, second=0, microsecond=0)

    reports, latest_skus, latest_services = generate_reports(
        catalog_skus,
        catalog_services,
        years=args.years,
        interval_days=args.interval_days,
        end_at=end_at,
    )

    owner["catalog"]["skus"] = latest_skus
    owner["catalog"]["services"] = latest_services
    owner["sist"]["stockReports"] = reports
    owner["sist"]["schemaVersion"] = 0
    save_store(store_path, store)

    sena_catalog = build_sena_catalog(latest_skus, latest_services)
    sena_observations = build_sena_observations(reports, latest_services, latest_services)
    enrich_lead_time_hints(sena_observations, latest_skus)
    rebuild_sena_workspace(repo_root, sena_db_path, seed_marker_path, sena_catalog, sena_observations)

    print(
        json.dumps(
            {
                "owner": args.owner,
                "reportCount": len(reports),
                "skuCount": len(latest_skus),
                "serviceCount": len(latest_services),
                "firstReportAt": reports[0]["reportedAt"],
                "lastReportAt": reports[-1]["reportedAt"],
                "storePath": str(store_path),
                "senaDbPath": str(sena_db_path),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
