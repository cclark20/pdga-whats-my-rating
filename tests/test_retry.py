from unittest.mock import MagicMock, patch

import pytest
import requests
from classes.player import (
    INITIAL_BACKOFF,
    MAX_BACKOFF,
    MAX_RETRIES,
    _request_with_retry,
)


def _make_response(status_code):
    resp = MagicMock(spec=requests.Response)
    resp.status_code = status_code
    if status_code >= 400:
        resp.raise_for_status.side_effect = requests.exceptions.HTTPError(response=resp)
    else:
        resp.raise_for_status.return_value = None
    return resp


@patch("classes.player.time.sleep")
@patch("classes.player.requests.get")
class TestRequestWithRetry:
    def test_success_first_try(self, mock_get, mock_sleep):
        mock_get.return_value = _make_response(200)
        resp = _request_with_retry("https://example.com")
        assert resp.status_code == 200
        mock_sleep.assert_not_called()

    def test_429_then_success(self, mock_get, mock_sleep):
        mock_get.side_effect = [_make_response(429), _make_response(200)]
        resp = _request_with_retry("https://example.com")
        assert resp.status_code == 200
        mock_sleep.assert_called_once_with(INITIAL_BACKOFF)

    def test_multiple_429s_then_success(self, mock_get, mock_sleep):
        mock_get.side_effect = [
            _make_response(429),
            _make_response(429),
            _make_response(429),
            _make_response(200),
        ]
        resp = _request_with_retry("https://example.com")
        assert resp.status_code == 200
        expected_waits = [INITIAL_BACKOFF * 2**i for i in range(3)]
        actual_waits = [call.args[0] for call in mock_sleep.call_args_list]
        assert actual_waits == expected_waits

    def test_all_retries_exhausted(self, mock_get, mock_sleep):
        mock_get.return_value = _make_response(429)
        with pytest.raises(requests.exceptions.HTTPError):
            _request_with_retry("https://example.com")
        assert mock_sleep.call_count == MAX_RETRIES

    def test_backoff_capped_at_max(self, mock_get, mock_sleep):
        mock_get.return_value = _make_response(429)
        with pytest.raises(requests.exceptions.HTTPError):
            _request_with_retry("https://example.com")
        actual_waits = [call.args[0] for call in mock_sleep.call_args_list]
        for wait in actual_waits:
            assert wait <= MAX_BACKOFF

    def test_non_429_error_raises_immediately(self, mock_get, mock_sleep):
        mock_get.return_value = _make_response(500)
        with pytest.raises(requests.exceptions.HTTPError):
            _request_with_retry("https://example.com")
        mock_sleep.assert_not_called()

    def test_on_retry_callback_invoked(self, mock_get, mock_sleep):
        mock_get.side_effect = [_make_response(429), _make_response(200)]
        callback = MagicMock()
        _request_with_retry("https://example.com", on_retry=callback)
        callback.assert_called_once_with(0, INITIAL_BACKOFF)

    def test_on_retry_none_works(self, mock_get, mock_sleep):
        mock_get.side_effect = [_make_response(429), _make_response(200)]
        resp = _request_with_retry("https://example.com", on_retry=None)
        assert resp.status_code == 200
