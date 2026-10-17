use reqwest::{Client, Proxy};
use std::time::Duration;

/// 通用 HTTP 客户端构建器
pub struct HttpClientBuilder {
    timeout: Duration,
    user_agent: String,
}

impl HttpClientBuilder {
    pub fn new() -> Self {
        Self {
            timeout: Duration::from_secs(30),
            user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36".to_string(),
        }
    }

    pub fn timeout(mut self, duration: Duration) -> Self {
        self.timeout = duration;
        self
    }

    pub fn user_agent(mut self, ua: impl Into<String>) -> Self {
        self.user_agent = ua.into();
        self
    }

    pub fn build(self) -> Result<Client, reqwest::Error> {
        apply_system_proxy(
            Client::builder()
                .user_agent(self.user_agent)
                .timeout(self.timeout),
        )
        .build()
    }
}

impl Default for HttpClientBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// 给任意 ClientBuilder 附加系统代理。
///
/// reqwest 默认只读 `HTTPS_PROXY` 等环境变量，双击启动的桌面进程没有这些
/// 变量，Windows 系统代理形同虚设——直连 GitHub 等被阻断的站点时，
/// 用户开了代理应用也连不上。这里读取系统代理设置并显式应用到客户端。
pub fn apply_system_proxy(builder: reqwest::ClientBuilder) -> reqwest::ClientBuilder {
    if let Some(proxy) = system_proxy() {
        return builder.proxy(proxy);
    }
    builder
}

/// 显式需要附加到 reqwest 客户端的系统代理。
/// 环境变量代理（HTTPS_PROXY 等）仍由 reqwest 默认逻辑处理，此处不覆盖。
pub fn system_proxy() -> Option<Proxy> {
    if std::env::var("HTTPS_PROXY").is_ok()
        || std::env::var("https_proxy").is_ok()
        || std::env::var("ALL_PROXY").is_ok()
        || std::env::var("all_proxy").is_ok()
    {
        return None;
    }

    #[cfg(windows)]
    {
        windows_system_proxy().and_then(|url| match Proxy::all(&url) {
            Ok(proxy) => Some(proxy),
            Err(error) => {
                log::warn!("系统代理 {url} 无法解析，按直连处理: {error}");
                None
            }
        })
    }
    #[cfg(not(windows))]
    {
        None
    }
}

#[cfg(windows)]
fn windows_system_proxy() -> Option<String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let settings = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
        .ok()?;
    let enabled: u32 = settings.get_value("ProxyEnable").ok()?;
    if enabled == 0 {
        return None;
    }
    let server: String = settings.get_value("ProxyServer").ok()?;
    let proxy = parse_proxy_server(&server)?;
    log::info!("使用 Windows 系统代理: {proxy}");
    Some(proxy)
}

/// 解析 Internet Settings 的 ProxyServer 值。
/// 支持两种格式：`127.0.0.1:7890` 和 `http=...;https=...;ftp=...`（按协议分组，
/// 优先取 https，其次 http）。ProxyOverride 的绕过列表对 GitHub 类远端
/// 请求不适用，此处不处理。
fn parse_proxy_server(server: &str) -> Option<String> {
    let server = server.trim();
    if server.is_empty() {
        return None;
    }

    let entry = if server.contains('=') {
        ["https", "http"]
            .iter()
            .find_map(|scheme| {
                server
                    .split(';')
                    .find(|part| {
                        part.trim().to_lowercase().starts_with(&format!("{scheme}="))
                    })
                    .and_then(|part| part.split_once('='))
                    .map(|(_, value)| value.trim().to_string())
            })?
    } else {
        server.to_string()
    };

    if entry.is_empty() {
        return None;
    }
    let lower = entry.to_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("socks") {
        Some(entry)
    } else {
        Some(format!("http://{entry}"))
    }
}

/// 快速创建标准 HTTP 客户端（异步）
pub fn create_default_client() -> Client {
    HttpClientBuilder::new()
        .build()
        .expect("Failed to create HTTP client")
}

/// 快速创建自定义超时的 HTTP 客户端（异步）
pub fn create_client_with_timeout(timeout_secs: u64) -> Client {
    HttpClientBuilder::new()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .expect("Failed to create HTTP client")
}

#[cfg(test)]
mod proxy_tests {
    use super::parse_proxy_server;

    #[test]
    fn plain_host_port_becomes_http_proxy() {
        assert_eq!(
            parse_proxy_server("127.0.0.1:7890").as_deref(),
            Some("http://127.0.0.1:7890")
        );
    }

    #[test]
    fn protocol_grouped_prefers_https_entry() {
        assert_eq!(
            parse_proxy_server("ftp=1.1.1.1:21;http=2.2.2.2:80;https=3.3.3.3:443").as_deref(),
            Some("http://3.3.3.3:443")
        );
        assert_eq!(
            parse_proxy_server("http=2.2.2.2:80;ftp=1.1.1.1:21").as_deref(),
            Some("http://2.2.2.2:80")
        );
    }

    #[test]
    fn explicit_scheme_is_kept() {
        assert_eq!(
            parse_proxy_server("socks5://127.0.0.1:1080").as_deref(),
            Some("socks5://127.0.0.1:1080")
        );
    }

    #[test]
    fn empty_and_garbage_return_none() {
        assert_eq!(parse_proxy_server(""), None);
        assert_eq!(parse_proxy_server("   "), None);
        assert_eq!(parse_proxy_server("ftp=1.1.1.1:21"), None);
        assert_eq!(parse_proxy_server("https="), None);
    }
}
