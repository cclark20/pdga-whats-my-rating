from unittest.mock import patch


def _passthrough_decorator(func=None, **kwargs):
    """Replace st.cache_data with a no-op decorator for tests."""
    if func is not None:
        return func
    return lambda f: f


_test_secrets = {
    "pdga_api": {
        "profile": "https://example.test/{pdga_no}/profile",
        "rounds": "https://example.test/{pdga_no}/rounds",
        "events": "https://example.test/{pdga_no}/events",
    },
}

# Patch st.cache_data and st.secrets before any module imports them
patch("streamlit.cache_data", _passthrough_decorator).start()
patch("streamlit.secrets", _test_secrets).start()
