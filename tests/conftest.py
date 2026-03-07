from unittest.mock import patch


def _passthrough_decorator(func=None, **kwargs):
    """Replace st.cache_data with a no-op decorator for tests."""
    if func is not None:
        return func
    return lambda f: f


# Patch st.cache_data before any module imports it
patch("streamlit.cache_data", _passthrough_decorator).start()
