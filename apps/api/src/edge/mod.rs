pub mod backpressure;
pub mod cors;
pub mod identity;
pub mod origin_guard;
pub mod rate_limit;
pub mod request_limits;

#[derive(Clone, Copy, Debug, Default)]
pub struct OriginGuardOutcome {
    pub passed: bool,
}
