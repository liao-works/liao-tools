use std::time::Duration;

use futures_util::StreamExt;
use tokio::sync::watch;

use crate::core::http::HttpClientBuilder;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const TOTAL_TIMEOUT: Duration = Duration::from_secs(180);
pub const TEMPERATURE: f64 = 1.3;

/// 一次流式请求的入参（全 String，便于测试与序列化解耦）
#[derive(Debug, Clone)]
pub struct ChatRequest {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub system_prompt: String,
    pub user_prompt: String,
}

/// 流结束原因
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StreamOutcome {
    /// 正常完成（收到 [DONE] 或连接关闭）
    Completed,
    /// 被取消信号中止
    Cancelled,
}

/// 单行 SSE 数据的解析结果
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SseLine {
    Delta(String),
    Done,
    Ignore,
}

/// 解析一行 SSE。`data:` 帧取 choices[0].delta.content；role 帧、空 content、
/// 注释行、空行均视为 Ignore；坏 JSON 返回 Err。
pub fn parse_sse_line(line: &str) -> Result<SseLine, String> {
    let Some(data) = line.strip_prefix("data:") else {
        return Ok(SseLine::Ignore);
    };
    let data = data.trim();
    if data == "[DONE]" {
        return Ok(SseLine::Done);
    }
    let value: serde_json::Value =
        serde_json::from_str(data).map_err(|e| format!("响应数据解析失败：{e}"))?;
    let text = value
        .pointer("/choices/0/delta/content")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if text.is_empty() {
        Ok(SseLine::Ignore)
    } else {
        Ok(SseLine::Delta(text.to_string()))
    }
}

/// SSE 行缓冲器：字节块 → 完整行。按 b'\n' 切分（UTF-8 续字节 >= 0x80，
/// 不会与换行符混淆），因此多字节字符跨块是安全的。
#[derive(Default)]
pub struct LineBuffer {
    buf: Vec<u8>,
}

impl LineBuffer {
    pub fn push(&mut self, chunk: &[u8]) -> Vec<String> {
        self.buf.extend_from_slice(chunk);
        let mut lines = Vec::new();
        while let Some(pos) = self.buf.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = self.buf.drain(..=pos).collect();
            let line = &line[..line.len() - 1]; // 去掉 \n
            let line = String::from_utf8_lossy(line);
            lines.push(line.trim_end_matches('\r').to_string());
        }
        lines
    }

    /// 流结束时调用：返回没有换行符结尾的残余行
    pub fn finish(&mut self) -> Option<String> {
        if self.buf.is_empty() {
            return None;
        }
        let bytes = std::mem::take(&mut self.buf);
        Some(String::from_utf8_lossy(&bytes).trim_end_matches('\r').to_string())
    }
}

/// 把 HTTP 非 2xx 响应映射为用户可读中文；不透出请求体里可能包含的敏感信息
pub fn map_http_error(status: u16, body: &str) -> String {
    let detail = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| v.pointer("/error/message").and_then(|m| m.as_str()).map(str::to_string));
    match status {
        401 | 403 => "API Key 无效或已过期，请在供应商配置中检查。".to_string(),
        429 => "请求过于频繁或额度不足，请稍后再试。".to_string(),
        500..=599 => format!("供应商服务异常（{status}），请稍后再试。"),
        _ => format!("请求失败（{status}）{}", detail.map(|d| format!("：{d}")).unwrap_or_default()),
    }
}

fn map_reqwest_error(error: reqwest::Error) -> String {
    if error.is_connect() {
        "网络连接失败。Gemini 需要系统代理，请确认代理已开启；DeepSeek 请检查网络。".to_string()
    } else if error.is_timeout() {
        "请求超时，请检查网络或稍后再试。".to_string()
    } else {
        format!("网络请求失败：{error}")
    }
}

/// 发起流式 chat completion。每个增量文本回调 on_delta；
/// cancel 收到 true 时尽快返回 Cancelled。Key 不进任何错误消息。
pub async fn stream_chat(
    request: &ChatRequest,
    mut on_delta: impl FnMut(&str),
    cancel: &mut watch::Receiver<bool>,
) -> Result<StreamOutcome, String> {
    let url = format!("{}/chat/completions", request.base_url.trim_end_matches('/'));
    let client = HttpClientBuilder::new()
        .timeout(TOTAL_TIMEOUT)
        .connect_timeout(CONNECT_TIMEOUT)
        .build()
        .map_err(|e| format!("HTTP 客户端创建失败：{e}"))?;
    let body = serde_json::json!({
        "model": request.model,
        "stream": true,
        "temperature": TEMPERATURE,
        "messages": [
            { "role": "system", "content": request.system_prompt },
            { "role": "user", "content": request.user_prompt },
        ],
    });

    let response = client
        .post(&url)
        .bearer_auth(&request.api_key)
        .json(&body)
        .send()
        .await
        .map_err(map_reqwest_error)?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(map_http_error(status.as_u16(), &text));
    }

    let stream = response.bytes_stream().map(|chunk| match chunk {
        Ok(bytes) => Ok(bytes.to_vec()),
        Err(error) => Err(map_reqwest_error(error)),
    });
    read_stream(Box::pin(stream), on_delta, cancel).await
}

/// 消费已映射好错误的 SSE 字节流：每个增量文本回调 on_delta，
/// 直到 [DONE]、流结束或取消。cancel 的 sender 全部丢弃后视为
/// 不可能再取消，禁用取消分支继续读流直至完成。
async fn read_stream(
    mut stream: impl futures_util::Stream<Item = Result<Vec<u8>, String>> + Unpin,
    mut on_delta: impl FnMut(&str),
    cancel: &mut watch::Receiver<bool>,
) -> Result<StreamOutcome, String> {
    let mut buffer = LineBuffer::default();
    let mut watch_alive = true;
    loop {
        tokio::select! {
            biased;
            changed = cancel.changed(), if watch_alive => {
                match changed {
                    Ok(()) => {
                        if *cancel.borrow() {
                            return Ok(StreamOutcome::Cancelled);
                        }
                    }
                    // sender 全部丢弃时 changed() 每次 select 都立即 Err，
                    // biased 下该分支会永远先就绪、令流分支饥饿自旋。
                    // 此时不可能再取消：置守卫禁用本分支，读完剩余流。
                    Err(_) => watch_alive = false,
                }
            }
            chunk = stream.next() => {
                match chunk {
                    Some(Ok(bytes)) => {
                        for line in buffer.push(&bytes) {
                            match parse_sse_line(&line)? {
                                SseLine::Delta(text) => on_delta(&text),
                                SseLine::Done => return Ok(StreamOutcome::Completed),
                                SseLine::Ignore => {}
                            }
                        }
                    }
                    Some(Err(error)) => return Err(error),
                    None => {
                        if let Some(line) = buffer.finish() {
                            if let SseLine::Delta(text) = parse_sse_line(&line)? {
                                on_delta(&text);
                            }
                        }
                        return Ok(StreamOutcome::Completed);
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_sse_line_deltas_done_and_ignore() {
        assert!(matches!(
            parse_sse_line(r#"data: {"choices":[{"delta":{"content":"Hi"}}]}"#),
            Ok(SseLine::Delta(t)) if t == "Hi"
        ));
        // data: 后无空格的写法
        assert!(matches!(
            parse_sse_line(r#"data:{"choices":[{"delta":{"content":" 你好"}}]}"#),
            Ok(SseLine::Delta(t)) if t == " 你好"
        ));
        assert!(matches!(parse_sse_line("data: [DONE]"), Ok(SseLine::Done)));
        // role 帧 / 空 content / 注释 / 空行 → Ignore
        assert!(matches!(parse_sse_line(r#"data: {"choices":[{"delta":{"role":"assistant"}}]}"#), Ok(SseLine::Ignore)));
        assert!(matches!(parse_sse_line(r#"data: {"choices":[]}"#), Ok(SseLine::Ignore)));
        assert!(matches!(parse_sse_line(": keep-alive"), Ok(SseLine::Ignore)));
        assert!(matches!(parse_sse_line(""), Ok(SseLine::Ignore)));
        // 坏 JSON → Err
        assert!(parse_sse_line("data: {broken").is_err());
    }

    #[test]
    fn line_buffer_basic_and_crlf() {
        let mut buf = LineBuffer::default();
        let lines = buf.push(b"hello\r\nwor");
        assert_eq!(lines, vec!["hello".to_string()]);
        let lines = buf.push(b"ld\n");
        assert_eq!(lines, vec!["world".to_string()]);
        assert_eq!(buf.finish(), None);
    }

    #[test]
    fn line_buffer_finish_returns_tail_without_newline() {
        let mut buf = LineBuffer::default();
        let lines = buf.push(b"data: partial");
        assert!(lines.is_empty());
        assert_eq!(buf.finish().as_deref(), Some("data: partial"));
    }

    #[test]
    fn line_buffer_splits_multibyte_char_across_chunks() {
        // "你好" = e4 bd a0 e5 a5 bd，在第 2 字节后切开
        let mut buf = LineBuffer::default();
        let l1 = buf.push(&b"line:\xe4\xbd"[..]);
        assert!(l1.is_empty(), "不完整的 UTF-8 行不应提前输出");
        let l2 = buf.push(&b"\xa0\xe5\xa5\xbd\n".to_vec());
        assert_eq!(l2, vec![format!("line:你好")]);
    }

    #[test]
    fn map_http_error_is_user_friendly_and_keyless() {
        assert!(map_http_error(401, r#"{"error":{"message":"Invalid API key sk-secret"}}"#).contains("API Key 无效"));
        assert!(!map_http_error(401, r#"{"error":{"message":"Invalid API key sk-secret"}}"#).contains("sk-secret"));
        assert!(map_http_error(429, "{}").contains("频繁"));
        assert!(map_http_error(503, "upstream error").contains("供应商服务异常"));
        assert!(map_http_error(400, r#"{"error":{"message":"model not found"}}"#).contains("model not found"));
    }

    #[tokio::test]
    async fn stream_completes_after_cancel_sender_dropped() {
        // Task 5 swap-out 场景：旧任务状态先丢弃 sender，而旧流仍在跑。
        // 守卫缺失时 changed() 每次 select 立即 Err、biased 下永远先就绪，
        // 流分支被永久饥饿——用真实超时保证回归表现为失败而非挂死。
        let (tx, mut rx) = watch::channel(false);
        drop(tx);
        let chunks: Vec<Result<Vec<u8>, String>> = vec![
            Ok("data: {\"choices\":[{\"delta\":{\"content\":\"你\"}}]}\n\n".as_bytes().to_vec()),
            Ok(b"data: [DONE]\n\n".to_vec()),
        ];
        let mut text = String::new();
        let outcome = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            read_stream(futures_util::stream::iter(chunks), |delta| text.push_str(delta), &mut rx),
        )
        .await
        .expect("sender 丢弃后流应能走完，而不是自旋挂起");
        assert_eq!(outcome.unwrap(), StreamOutcome::Completed);
        assert_eq!(text, "你");
    }
}
