from unittest.mock import patch


def _passthrough_decorator(func=None, **kwargs):
    """Replace st.cache_data with a no-op decorator for tests."""
    if func is not None:
        return func
    return lambda f: f


_test_secrets = {
    "PDGA_USERNAME": "test_user",
    "PDGA_PASSWORD": "test_password",
    "PDGA_MEMBERS_API_URL": "https://test.pdga.com/api/v1/feat/members",
}

# Patch st.cache_data and st.secrets before any module imports them
patch("streamlit.cache_data", _passthrough_decorator).start()
patch("streamlit.secrets", _test_secrets).start()
