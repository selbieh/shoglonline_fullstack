"""Commission/rounding invariant (FR-PAY-6, BR-24): commission + worker_earning == budget
EXACTLY for every budget/rate, with the commission row absorbing the sub-cent remainder."""
from decimal import Decimal

import pytest

from apps.contracts.services import compute_commission, q2

pytestmark = [pytest.mark.unit, pytest.mark.srs("BR-24")]

# budgets chosen to force rounding edges; rates include odd/fractional percentages.
BUDGETS = ["0.01", "0.03", "9.99", "10.00", "99.99", "100.00", "1234.56", "7.77", "33.33"]
RATES = ["0", "7", "10", "12.5", "15", "33.33", "100"]


@pytest.mark.parametrize("budget", BUDGETS)
@pytest.mark.parametrize("pct", RATES)
def test_commission_plus_earning_equals_budget_exactly(budget, pct):
    b, p = Decimal(budget), Decimal(pct)
    commission, earning = compute_commission(b, p)
    # the headline invariant — no cent is ever created or lost
    assert commission + earning == b
    # each leg is a clean 2-dp money value
    assert commission == q2(commission)
    assert earning == q2(earning)
    assert commission >= 0
    assert earning >= 0


def test_commission_row_absorbs_sub_cent_remainder_half_even():
    # 10.00 * 12.5% = 1.25 exactly; 0.03 * 50% = 0.015 -> 0.02 (half-even rounds to even)
    assert compute_commission(Decimal("10.00"), Decimal("12.5")) == (Decimal("1.25"), Decimal("8.75"))
    commission, earning = compute_commission(Decimal("0.03"), Decimal("50"))
    assert commission == Decimal("0.02")
    assert commission + earning == Decimal("0.03")


def test_zero_and_full_rates_are_boundaries():
    assert compute_commission(Decimal("100.00"), Decimal("0")) == (Decimal("0.00"), Decimal("100.00"))
    assert compute_commission(Decimal("100.00"), Decimal("100")) == (Decimal("100.00"), Decimal("0.00"))


def test_q2_uses_bankers_rounding():
    assert q2(Decimal("2.345")) == Decimal("2.34")  # rounds to even
    assert q2(Decimal("2.355")) == Decimal("2.36")  # rounds to even
