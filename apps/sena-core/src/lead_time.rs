use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

pub const LEAD_TIME_FLOOR_DAYS: f64 = 0.5;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum SenaLeadTimeVariabilityClass {
    VeryTight,
    Tight,
    #[serde(alias = "steady", alias = "moderate")]
    Normal,
    #[serde(alias = "variable")]
    Wide,
    #[serde(alias = "volatile")]
    VeryWide,
}

impl SenaLeadTimeVariabilityClass {
    pub fn ordinal_index(self) -> u8 {
        match self {
            Self::VeryTight => 1,
            Self::Tight => 2,
            Self::Normal => 3,
            Self::Wide => 4,
            Self::VeryWide => 5,
        }
    }

    pub fn center_relative_width(self) -> f64 {
        match self {
            Self::VeryTight => 0.10,
            Self::Tight => 0.30,
            Self::Normal => 0.55,
            Self::Wide => 0.90,
            Self::VeryWide => 1.35,
        }
    }
}

pub fn validate_lead_time_range(low_days: Option<f64>, high_days: Option<f64>) -> Result<()> {
    if let (Some(low), Some(high)) = (low_days, high_days) {
        if high < low {
            return Err(anyhow!("leadTimeHints[].highDays must be >= leadTimeHints[].lowDays"));
        }
    }
    Ok(())
}

pub fn implied_range_from_mean_std(mean_days: f64, std_days: f64) -> Option<(f64, f64)> {
    if !mean_days.is_finite() || !std_days.is_finite() || mean_days < 0.0 || std_days < 0.0 {
        return None;
    }
    let low = (mean_days - std_days).max(LEAD_TIME_FLOOR_DAYS);
    let high = (mean_days + std_days).max(low);
    Some((low, high))
}

pub fn relative_width_from_range(low_days: f64, high_days: f64) -> Option<f64> {
    if !low_days.is_finite() || !high_days.is_finite() || low_days < 0.0 || high_days < low_days {
        return None;
    }
    let midpoint = ((high_days + low_days) / 2.0).max(LEAD_TIME_FLOOR_DAYS);
    Some((high_days - low_days) / midpoint)
}

pub fn classify_relative_width(relative_width: f64) -> Option<SenaLeadTimeVariabilityClass> {
    if !relative_width.is_finite() || relative_width < 0.0 {
        return None;
    }
    Some(if relative_width < 0.20 {
        SenaLeadTimeVariabilityClass::VeryTight
    } else if relative_width < 0.40 {
        SenaLeadTimeVariabilityClass::Tight
    } else if relative_width < 0.70 {
        SenaLeadTimeVariabilityClass::Normal
    } else if relative_width < 1.10 {
        SenaLeadTimeVariabilityClass::Wide
    } else {
        SenaLeadTimeVariabilityClass::VeryWide
    })
}

pub fn derive_variability_class(
    explicit: Option<SenaLeadTimeVariabilityClass>,
    low_days: Option<f64>,
    high_days: Option<f64>,
) -> Option<SenaLeadTimeVariabilityClass> {
    explicit.or_else(|| {
        let relative_width = relative_width_from_range(low_days?, high_days?)?;
        classify_relative_width(relative_width)
    })
}

pub fn derive_relative_width(low_days: Option<f64>, high_days: Option<f64>) -> Option<f64> {
    relative_width_from_range(low_days?, high_days?)
}

pub fn target_std_days(
    mean_days: f64,
    variability_class: SenaLeadTimeVariabilityClass,
) -> f64 {
    let mean_days = mean_days.max(LEAD_TIME_FLOOR_DAYS);
    (variability_class.center_relative_width() * mean_days / 2.0).clamp(0.3, 7.0)
}

#[cfg(test)]
mod tests {
    use super::{
        classify_relative_width, derive_variability_class, implied_range_from_mean_std,
        relative_width_from_range, target_std_days, SenaLeadTimeVariabilityClass,
    };

    #[test]
    fn maps_relative_width_boundaries_to_expected_classes() {
        assert_eq!(
            classify_relative_width(0.19),
            Some(SenaLeadTimeVariabilityClass::VeryTight)
        );
        assert_eq!(
            classify_relative_width(0.20),
            Some(SenaLeadTimeVariabilityClass::Tight)
        );
        assert_eq!(
            classify_relative_width(0.40),
            Some(SenaLeadTimeVariabilityClass::Normal)
        );
        assert_eq!(
            classify_relative_width(0.70),
            Some(SenaLeadTimeVariabilityClass::Wide)
        );
        assert_eq!(
            classify_relative_width(1.10),
            Some(SenaLeadTimeVariabilityClass::VeryWide)
        );
    }

    #[test]
    fn derives_range_and_width_from_mean_and_std() {
        let (low, high) = implied_range_from_mean_std(4.0, 1.0).expect("range should derive");
        assert_eq!((low, high), (3.0, 5.0));
        let width = relative_width_from_range(low, high).expect("width should derive");
        assert!((width - 0.5).abs() < 1e-9);
    }

    #[test]
    fn explicit_class_wins_over_derived_range() {
        let class = derive_variability_class(
            Some(SenaLeadTimeVariabilityClass::Wide),
            Some(3.0),
            Some(3.5),
        );
        assert_eq!(class, Some(SenaLeadTimeVariabilityClass::Wide));
    }

    #[test]
    fn class_targets_produce_monotonic_std_levels() {
        let very_tight = target_std_days(6.0, SenaLeadTimeVariabilityClass::VeryTight);
        let wide = target_std_days(6.0, SenaLeadTimeVariabilityClass::Wide);
        let very_wide = target_std_days(6.0, SenaLeadTimeVariabilityClass::VeryWide);
        assert!(very_tight < wide);
        assert!(wide < very_wide);
    }
}
