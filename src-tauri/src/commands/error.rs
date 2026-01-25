use serde::Serialize;
use std::fmt;

/// 统一的错误响应格式
#[derive(Debug, Serialize)]
pub struct CommandError {
    pub message: String,
    pub code: String,
}

impl CommandError {
    pub fn new(message: impl Into<String>, code: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            code: code.into(),
        }
    }
}

impl fmt::Display for CommandError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl From<anyhow::Error> for CommandError {
    fn from(error: anyhow::Error) -> Self {
        CommandError::new(error.to_string(), "INTERNAL_ERROR")
    }
}

impl From<String> for CommandError {
    fn from(error: String) -> Self {
        CommandError::new(error, "ERROR")
    }
}

impl From<rust_xlsxwriter::XlsxError> for CommandError {
    fn from(error: rust_xlsxwriter::XlsxError) -> Self {
        CommandError::new(error.to_string(), "XLSX_ERROR")
    }
}

impl From<std::io::Error> for CommandError {
    fn from(error: std::io::Error) -> Self {
        CommandError::new(error.to_string(), "IO_ERROR")
    }
}
