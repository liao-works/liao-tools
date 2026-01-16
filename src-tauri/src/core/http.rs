use reqwest::Client;
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
        Client::builder()
            .user_agent(self.user_agent)
            .timeout(self.timeout)
            .build()
    }
}

impl Default for HttpClientBuilder {
    fn default() -> Self {
        Self::new()
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
