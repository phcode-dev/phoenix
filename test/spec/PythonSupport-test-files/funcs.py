"""Fixture with a documented function for hover / jump-to-definition / completion tests."""


def compute_total(prices, tax_rate):
    """Compute the total price of all items including tax."""
    return sum(prices) * (1 + tax_rate)


print(compute_total([1.5, 2.5], 0.2))
