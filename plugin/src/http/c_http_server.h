#pragma once

#include <string>
#include <thread>
#include <atomic>
#include <expected>
#include <cstdint>

#include <winsock2.h>
#include <ws2tcpip.h>

#include "http/c_http_router.h"

class c_http_server {
public:
    c_http_server() = default;
    ~c_http_server();

    c_http_server(const c_http_server&) = delete;
    c_http_server& operator=(const c_http_server&) = delete;
    c_http_server(c_http_server&&) = delete;
    c_http_server& operator=(c_http_server&&) = delete;

    [[nodiscard]] std::expected<void, std::string> start(
        const std::string& host, uint16_t port, c_http_router* router
    );

    void stop();

    [[nodiscard]] bool is_running() const { return m_running.load(); }
    [[nodiscard]] uint16_t get_port() const { return m_port; }

    // Set before start(). Empty means authentication is disabled.
    void set_auth_token(std::string token) { m_auth_token = std::move(token); }

private:
    static constexpr size_t MAX_REQUEST_SIZE = 1024 * 1024;
    static constexpr int RECV_TIMEOUT_MS = 5000;

    std::atomic<SOCKET> m_listen_socket{INVALID_SOCKET};
    std::atomic<bool> m_running{false};
    std::atomic<int> m_active_connections{0};
    std::thread m_listener_thread;
    c_http_router* m_router = nullptr;
    uint16_t m_port = 0;
    std::string m_auth_token;

    [[nodiscard]] bool is_authorized(const s_http_request& request) const;
    void listener_loop();
    void handle_connection(SOCKET client_socket);

    [[nodiscard]] static size_t parse_content_length(
        const std::string& raw_data, size_t header_end_pos, bool& too_large
    );

    [[nodiscard]] static std::expected<s_http_request, std::string> parse_request(
        const std::string& raw_data
    );

    static void parse_query_string(
        const std::string& query_string,
        std::unordered_map<std::string, std::string>& out
    );

    [[nodiscard]] static std::string url_decode(const std::string& encoded);
};
