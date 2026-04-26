def _enc_float(value: object) -> str:
    """Serialize a float to string for encrypted storage."""
    if value is None:
        return '0.0'
    return str(round(float(value), 6))


def _dec_float(value: object) -> float:
    """Deserialize an encrypted string to float."""
    try:
        return round(float(value), 2) if value is not None else 0.0
    except (TypeError, ValueError):
        return 0.0
